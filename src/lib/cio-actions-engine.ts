import { db } from "./db";
import { getActivePortfolioPositions } from "./portfolio-value-engine";
import { generateAllocationReview, BUCKET_MAP } from "./allocation-engine";
import { generateThemeAllocationReview } from "./theme-allocation-engine";
import type { BucketId } from "./allocation-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CIOActionCategory = "BUY" | "ADD" | "HOLD" | "REDUCE" | "EXIT" | "WATCH";

export interface CIOAction {
  priority: number;
  category: CIOActionCategory;
  ticker?: string;
  bucket?: string;  // for bucket-level allocation actions
  themeId?: string; // for theme-level allocation actions
  title: string;
  reason: string;
  confidence: number;
  evidence: string[];
  sourceSystems: string[];
}

export interface CIOActionsResult {
  generatedAt: Date;
  actions: CIOAction[];
  regime: string;
  dataHealth: { opportunities: number; decisionReviews: number; committeeSessions: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const GROWTH_TICKERS = new Set(["NVDA", "GOOG", "GOOGL", "AMZN", "META", "MSFT", "TSLA", "AMD", "TSM", "ASML", "SMCI", "CRWD", "NET"]);
const HEDGE_TICKERS  = new Set(["GLDM", "GLD", "IAU", "SHY", "TLT", "BND", "ITA"]);

function parseJson<T>(s: string, fallback: T): T {
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }

// ─── Main function ────────────────────────────────────────────────────────────

export async function generateCioActions(): Promise<CIOActionsResult> {
  const now = new Date();

  // ── Load data in parallel ──────────────────────────────────────
  const [positions, decisionReviewsRaw, archReview, brief, sessionsRaw] = await Promise.all([
    getActivePortfolioPositions(),
    db.decisionReview.findMany({ orderBy: { reviewDate: "desc" } }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).portfolioArchitectureReview.findFirst({ orderBy: { reviewDate: "desc" } }).catch(() => null),
    db.morningBrief.findFirst({ orderBy: { briefingDate: "desc" } }),
    db.committeeSession.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
  ]);

  // Opportunity scores — read from cached table (no live recompute)
  let oppEntries: { ticker: string; objectiveScore: number; companyName: string; inPortfolio: boolean }[] = [];
  try {
    const portfolioSet = new Set(positions.map(p => p.ticker));
    const [oppRows, universeRows] = await Promise.all([
      db.opportunityScore.findMany({ orderBy: { opportunityScore: "desc" } }),
      db.universe.findMany({ where: { status: "active" }, select: { ticker: true, companyName: true } }),
    ]);
    const nameMap = new Map(universeRows.map(u => [u.ticker, u.companyName]));
    // Deduplicate to best score per ticker
    const seen = new Set<string>();
    for (const row of oppRows) {
      if (seen.has(row.ticker)) continue;
      seen.add(row.ticker);
      oppEntries.push({
        ticker: row.ticker,
        objectiveScore: row.opportunityScore,
        companyName: nameMap.get(row.ticker) ?? row.ticker,
        inPortfolio: portfolioSet.has(row.ticker),
      });
    }
  } catch { /* engine unavailable */ }

  // Allocation review — best effort (pass pre-computed opps to avoid double DB call)
  let allocReview: Awaited<ReturnType<typeof generateAllocationReview>> | null = null;
  try {
    allocReview = await generateAllocationReview(oppEntries);
  } catch { /* engine unavailable */ }

  // Theme allocation review — best effort
  let themeReview: Awaited<ReturnType<typeof generateThemeAllocationReview>> | null = null;
  try {
    themeReview = await generateThemeAllocationReview(oppEntries);
  } catch { /* engine unavailable */ }

  // ── Deduplicate to latest per ticker ──────────────────────────
  const latestDecision = new Map<string, typeof decisionReviewsRaw[0]>();
  for (const r of decisionReviewsRaw) {
    if (!latestDecision.has(r.ticker)) latestDecision.set(r.ticker, r);
  }

  const latestCommittee = new Map<string, typeof sessionsRaw[0]>();
  for (const s of sessionsRaw) {
    if (!latestCommittee.has(s.ticker)) latestCommittee.set(s.ticker, s);
  }

  const ownedTickers = new Set(positions.map(p => p.ticker));
  const oppByTicker = new Map(oppEntries.map(e => [e.ticker, e]));

  // ── Regime + newsletter signals ────────────────────────────────
  const regime = brief?.marketRegime ?? "Neutral";
  const newsletterConsensus = brief?.newsletterConsensus
    ? parseJson<{ portfolioRelevance: string }[]>(brief.newsletterConsensus, [])
    : [];
  const bullishNL = newsletterConsensus.filter(n => n.portfolioRelevance === "bullish").length;
  const bearishNL = newsletterConsensus.filter(n => n.portfolioRelevance === "bearish").length;

  // ── Parse architecture data ────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hedgeAudit = archReview?.hedgeAuditDetail ? parseJson<any>(archReview.hedgeAuditDetail, null) : null;

  const actions: CIOAction[] = [];

  // ── Theme-level actions (P3) — precede individual ticker decisions ──────
  const themeHandledAddTickers    = new Set<string>();
  const themeHandledReduceTickers = new Set<string>();

  if (themeReview) {
    for (const gap of themeReview.gapAnalysis) {
      if (Math.abs(gap.gapPct) < 5) continue;

      const implTickers = gap.tickers.filter(t => ownedTickers.has(t));

      // Driver lines from theme driver summary
      const driverSummary = themeReview.themeDriverSummaries.find(d => d.themeId === gap.themeId);
      const driverLines: string[] = [];
      if (driverSummary) {
        if (driverSummary.regimeAdjustment !== 0)
          driverLines.push(`${driverSummary.regimeAdjustment > 0 ? "+" : ""}${driverSummary.regimeAdjustment.toFixed(0)}% Regime (${driverSummary.regimeDescription})`);
        if (driverSummary.opportunityAdjustment !== 0)
          driverLines.push(`+${driverSummary.opportunityAdjustment.toFixed(0)}% Opportunities (${driverSummary.opportunityDescription})`);
        if (driverSummary.newsletterAdjustment !== 0)
          driverLines.push(`${driverSummary.newsletterAdjustment > 0 ? "+" : ""}${driverSummary.newsletterAdjustment.toFixed(0)}% Newsletter`);
        if (driverSummary.momentumAdjustment !== 0)
          driverLines.push(`${driverSummary.momentumAdjustment > 0 ? "+" : ""}${driverSummary.momentumAdjustment.toFixed(0)}% Momentum`);
      }

      // Get implementation tickers from recommendations
      const rec = themeReview.recommendations.find(r => r.themeId === gap.themeId);
      const recTickers = rec?.implementationTickers ?? implTickers;

      if (gap.direction === "overweight") {
        const category: CIOActionCategory = "REDUCE";
        actions.push({
          priority: 3,
          category,
          themeId: gap.themeId,
          title: `Reduce ${gap.label} Theme (${gap.currentPct.toFixed(0)}% → ${gap.targetPct.toFixed(0)}%)`,
          reason: `${gap.label} theme overweight by ${Math.abs(gap.gapPct).toFixed(1)}%. ${themeReview.scenario} regime target: ${gap.targetPct.toFixed(0)}%.`,
          confidence: clamp(70 + Math.round(Math.abs(gap.gapPct) * 0.5), 65, 90),
          evidence: [
            `Current: ${gap.currentPct.toFixed(0)}%  Target: ${gap.targetPct.toFixed(0)}%`,
            ...driverLines,
            ...(recTickers.length > 0 ? [`Implementation: reduce ${recTickers.slice(0, 3).join(", ")}`] : []),
          ],
          sourceSystems: ["Theme Engine"],
        });
        for (const t of recTickers) themeHandledReduceTickers.add(t);

      } else if (gap.direction === "underweight") {
        const ownedInTheme    = gap.tickers.filter(t => ownedTickers.has(t));
        const category: CIOActionCategory = ownedInTheme.length > 0 ? "ADD" : "BUY";
        actions.push({
          priority: 3,
          category,
          themeId: gap.themeId,
          title: `${category === "ADD" ? "Increase" : "Build"} ${gap.label} Theme (${gap.currentPct.toFixed(0)}% → ${gap.targetPct.toFixed(0)}%)`,
          reason: `${gap.label} theme underweight by ${gap.gapPct.toFixed(1)}%. ${themeReview.scenario} regime target: ${gap.targetPct.toFixed(0)}%.`,
          confidence: clamp(60 + Math.round(gap.gapPct * 0.5), 55, 88),
          evidence: [
            `Current: ${gap.currentPct.toFixed(0)}%  Target: ${gap.targetPct.toFixed(0)}%`,
            ...driverLines,
            ...(recTickers.length > 0 ? [`Implementation: ${recTickers.slice(0, 3).join(", ")}`] : []),
          ],
          sourceSystems: ["Theme Engine"],
        });
        for (const t of recTickers) themeHandledAddTickers.add(t);
      }
    }
  }

  // ── Allocation-level actions — deduplicates ticker-level reduce/add ──────
  const allocHandledReduceBuckets = new Set<BucketId>();
  const allocHandledAddBuckets    = new Set<BucketId>();

  if (allocReview) {
    // Build a lookup for driver summaries (for enriched evidence)
    const driverByBucket = new Map(
      (allocReview.bucketDriverSummaries ?? []).map(d => [d.bucket, d])
    );

    for (const gap of allocReview.gapAnalysis) {
      const driverSummary = driverByBucket.get(gap.bucket);

      // Build driver lines: +10% Regime (AI Expansion), +3% Opportunities (NVDA 95)
      const driverLines: string[] = [];
      if (driverSummary) {
        if (driverSummary.regimeAdjustment !== 0)
          driverLines.push(`${driverSummary.regimeAdjustment > 0 ? "+" : ""}${driverSummary.regimeAdjustment.toFixed(0)}% Regime (${driverSummary.regimeDescription})`);
        if (driverSummary.opportunityAdjustment !== 0)
          driverLines.push(`${driverSummary.opportunityAdjustment > 0 ? "+" : ""}${driverSummary.opportunityAdjustment.toFixed(0)}% Opportunities (${driverSummary.opportunityDescription})`);
        if (driverSummary.hedgeAdjustment !== 0)
          driverLines.push(`${driverSummary.hedgeAdjustment > 0 ? "+" : ""}${driverSummary.hedgeAdjustment.toFixed(0)}% Hedge (${driverSummary.hedgeDescription})`);
        if (driverSummary.concentrationAdjustment !== 0)
          driverLines.push(`${driverSummary.concentrationAdjustment > 0 ? "+" : ""}${driverSummary.concentrationAdjustment.toFixed(0)}% Concentration (${driverSummary.concentrationDescription})`);
      }

      if (gap.direction === "overweight" && Math.abs(gap.gapPct) >= 5) {
        const implTickers = gap.tickers.filter(t => ownedTickers.has(t));
        actions.push({
          priority: 2,
          category: "REDUCE",
          bucket: gap.bucket,
          title: `Reduce ${gap.label} (${gap.currentPct.toFixed(0)}% → ${gap.targetPct.toFixed(0)}%)`,
          reason: `${gap.label} overweight by ${Math.abs(gap.gapPct).toFixed(1)}%. ${allocReview.regime} regime target: ${gap.targetPct.toFixed(0)}%.`,
          confidence: clamp(75 + Math.round(Math.abs(gap.gapPct) * 0.5), 65, 90),
          evidence: [
            `Current: ${gap.currentPct.toFixed(0)}%  Target: ${gap.targetPct.toFixed(0)}%`,
            ...driverLines,
            ...(implTickers.length > 0 ? [`Implementation: reduce ${implTickers.join(", ")}`] : []),
          ],
          sourceSystems: ["Allocation Engine"],
        });
        allocHandledReduceBuckets.add(gap.bucket);
      } else if (gap.direction === "underweight" && gap.gapPct >= 10) {
        const ownedInBucket    = gap.tickers.filter(t => ownedTickers.has(t));
        const notOwnedInBucket = gap.tickers.filter(t => !ownedTickers.has(t));
        const category: CIOActionCategory = ownedInBucket.length > 0 ? "ADD" : "BUY";
        actions.push({
          priority: category === "ADD" ? 3 : 4,
          category,
          bucket: gap.bucket,
          title: `${category === "ADD" ? "Increase" : "Build"} ${gap.label} (${gap.currentPct.toFixed(0)}% → ${gap.targetPct.toFixed(0)}%)`,
          reason: `${gap.label} underweight by ${gap.gapPct.toFixed(1)}%. ${allocReview.regime} regime target: ${gap.targetPct.toFixed(0)}%.`,
          confidence: clamp(65 + Math.round(gap.gapPct * 0.5), 55, 88),
          evidence: [
            `Current: ${gap.currentPct.toFixed(0)}%  Target: ${gap.targetPct.toFixed(0)}%`,
            ...driverLines,
            ...(ownedInBucket.length > 0    ? [`Add to: ${ownedInBucket.join(", ")}`]           : []),
            ...(notOwnedInBucket.length > 0 ? [`Consider buying: ${notOwnedInBucket.join(", ")}`] : []),
          ],
          sourceSystems: ["Allocation Engine"],
        });
        if (category === "ADD") allocHandledAddBuckets.add(gap.bucket);
      }
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Priority 1: EXIT
  // ──────────────────────────────────────────────────────────────
  for (const [ticker, review] of latestDecision.entries()) {
    if (review.verdict !== "Exit") continue;
    if (!ownedTickers.has(ticker)) continue;

    const against = parseJson<string[]>(review.evidenceAgainst, []).slice(0, 2);
    actions.push({
      priority: 1,
      category: "EXIT",
      ticker,
      title: `Exit ${ticker}`,
      reason: review.lessonLearned || `Thesis is ${review.thesisStatus.toLowerCase()}. Exit recommended.`,
      confidence: clamp(review.confidence + 5, 70, 97),
      evidence: [
        `Thesis status: ${review.thesisStatus}`,
        `Decision verdict: Exit`,
        ...against,
      ],
      sourceSystems: ["Decision Review"],
    });
  }

  // ──────────────────────────────────────────────────────────────
  // Priority 2: REDUCE
  // ──────────────────────────────────────────────────────────────
  for (const [ticker, review] of latestDecision.entries()) {
    if (review.verdict !== "Reduce") continue;
    if (!ownedTickers.has(ticker)) continue;
    if (actions.find(a => a.ticker === ticker)) continue;
    // Skip if allocation engine already generated a bucket-level reduce for this ticker's bucket
    const tickerBucket = BUCKET_MAP[ticker] as BucketId | undefined;
    if (tickerBucket && allocHandledReduceBuckets.has(tickerBucket)) continue;

    const against = parseJson<string[]>(review.evidenceAgainst, []).slice(0, 2);
    actions.push({
      priority: 2,
      category: "REDUCE",
      ticker,
      title: `Reduce ${ticker}`,
      reason: review.lessonLearned || `Thesis weakening. Reduce exposure.`,
      confidence: clamp(review.confidence, 60, 92),
      evidence: [
        `Thesis status: ${review.thesisStatus}`,
        `Decision verdict: Reduce`,
        ...against,
      ],
      sourceSystems: ["Decision Review"],
    });
  }

  // Hedge audit REMOVE / REPLACE
  if (hedgeAudit && (hedgeAudit.verdict === "REMOVE" || hedgeAudit.verdict === "REPLACE")) {
    const hedgeTickers: string[] = [
      ...(hedgeAudit.hedgeStack?.gold?.tickers ?? []),
      ...(hedgeAudit.hedgeStack?.defense?.tickers ?? []),
    ].filter((t: string) => t !== "CASH" && ownedTickers.has(t));

    for (const ticker of hedgeTickers) {
      if (actions.find(a => a.ticker === ticker)) continue;
      const evidence = [
        `Hedge verdict: ${hedgeAudit.verdict}`,
        `Hedge score: ${hedgeAudit.hedgeScore}/100`,
      ];
      if (hedgeAudit.portfolioCorrelation != null) {
        evidence.push(`Portfolio correlation: ${(hedgeAudit.portfolioCorrelation as number).toFixed(2)}`);
      }
      if (hedgeAudit.drawdownBenefitPct != null) {
        evidence.push(`Drawdown benefit: ${(hedgeAudit.drawdownBenefitPct as number).toFixed(1)}pp`);
      }
      actions.push({
        priority: 2,
        category: "REDUCE",
        ticker,
        title: `Reduce ${ticker} — hedge inefficient`,
        reason: `Hedge audit verdict: ${hedgeAudit.verdict}. Score ${hedgeAudit.hedgeScore}/100. Hedge not providing adequate portfolio protection.`,
        confidence: 80,
        evidence,
        sourceSystems: ["Portfolio Architecture", "Hedge Audit"],
      });
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Priority 3: ADD (owned, thesis Strengthen, opp >= 70)
  // ──────────────────────────────────────────────────────────────
  for (const [ticker, review] of latestDecision.entries()) {
    if (review.verdict !== "Strengthen") continue;
    if (!ownedTickers.has(ticker)) continue;

    const opp = oppByTicker.get(ticker);
    if (!opp || opp.objectiveScore < 70) continue;
    if (actions.find(a => a.ticker === ticker)) continue;
    // Skip if theme engine already generated a theme-level add for this ticker
    if (themeHandledAddTickers.has(ticker)) continue;
    // Skip if allocation engine already generated a bucket-level add for this ticker's bucket
    const tickerBucketAdd = BUCKET_MAP[ticker] as BucketId | undefined;
    if (tickerBucketAdd && allocHandledAddBuckets.has(tickerBucketAdd)) continue;

    const committee = latestCommittee.get(ticker);
    const sources = ["Decision Review", "Opportunity Engine"];
    if (committee) sources.push("Committee");

    const forEvidence = parseJson<string[]>(review.evidenceFor, []).slice(0, 2);
    const evidence = [
      `Thesis: ${review.thesisStatus}`,
      `Opportunity score: ${opp.objectiveScore.toFixed(0)}/100`,
      ...forEvidence,
    ];
    if (committee) evidence.push(`Committee: ${committee.conviction}`);

    let confidence = clamp(review.confidence, 65, 93);
    if (regime === "Risk On" && !HEDGE_TICKERS.has(ticker)) confidence = clamp(confidence + 5, 65, 97);
    if (bullishNL > bearishNL) confidence = clamp(confidence + 3, 65, 97);

    actions.push({
      priority: 3,
      category: "ADD",
      ticker,
      title: `Add to ${ticker}`,
      reason: `Thesis confirmed. Opportunity score ${opp.objectiveScore.toFixed(0)}/100.${regime === "Risk On" ? " Risk On regime provides tailwind." : ""}`.trim(),
      confidence,
      evidence,
      sourceSystems: sources,
    });
  }

  // ──────────────────────────────────────────────────────────────
  // Priority 4: BUY (not owned, opp >= 80)
  // ──────────────────────────────────────────────────────────────
  for (const entry of oppEntries) {
    if (ownedTickers.has(entry.ticker)) continue;
    if (entry.objectiveScore < 80) continue;
    if (actions.find(a => a.ticker === entry.ticker)) continue;
    // Skip if theme engine is already handling this theme
    if (themeHandledAddTickers.has(entry.ticker)) continue;

    const committee = latestCommittee.get(entry.ticker);
    const sources = ["Opportunity Engine"];
    if (committee) sources.push("Committee");

    const evidence: string[] = [`Opportunity score: ${entry.objectiveScore.toFixed(0)}/100`];
    if (committee) evidence.push(`Committee: ${committee.conviction}`);

    const isGrowth = GROWTH_TICKERS.has(entry.ticker);
    if (regime === "Risk On" && isGrowth) {
      evidence.push(`Regime: ${regime} — growth tailwind`);
      sources.push("Regime Engine");
    } else if (regime === "Risk Off" && HEDGE_TICKERS.has(entry.ticker)) {
      evidence.push(`Regime: ${regime} — defensive tailwind`);
      sources.push("Regime Engine");
    }

    let confidence = clamp(Math.round(50 + entry.objectiveScore * 0.4), 50, 88);
    if (bullishNL > bearishNL) confidence = clamp(confidence + 3, 50, 90);
    if (bearishNL > bullishNL) confidence = clamp(confidence - 3, 45, 90);

    actions.push({
      priority: 4,
      category: "BUY",
      ticker: entry.ticker,
      title: `Buy ${entry.ticker}`,
      reason: `Not in portfolio. Opportunity score ${entry.objectiveScore.toFixed(0)}/100 exceeds buy threshold of 80.`,
      confidence,
      evidence,
      sourceSystems: sources,
    });
  }

  // ──────────────────────────────────────────────────────────────
  // Priority 5: WATCH (not owned, opp 70–79)
  // ──────────────────────────────────────────────────────────────
  for (const entry of oppEntries) {
    if (ownedTickers.has(entry.ticker)) continue;
    if (entry.objectiveScore < 70 || entry.objectiveScore >= 80) continue;
    if (actions.find(a => a.ticker === entry.ticker)) continue;

    const committee = latestCommittee.get(entry.ticker);
    const sources = ["Opportunity Engine"];
    if (committee) sources.push("Committee");

    actions.push({
      priority: 5,
      category: "WATCH",
      ticker: entry.ticker,
      title: `Watch ${entry.ticker}`,
      reason: `Opportunity score ${entry.objectiveScore.toFixed(0)}/100. Approaching buy threshold — monitor for entry.`,
      confidence: clamp(Math.round(40 + entry.objectiveScore * 0.35), 40, 78),
      evidence: [
        `Opportunity score: ${entry.objectiveScore.toFixed(0)}/100`,
        ...(committee ? [`Committee: ${committee.conviction}`] : []),
      ],
      sourceSystems: sources,
    });
  }

  // Sort: priority ASC, then confidence DESC within same priority
  actions.sort((a, b) =>
    a.priority !== b.priority ? a.priority - b.priority : b.confidence - a.confidence
  );

  return {
    generatedAt: now,
    actions,
    regime,
    dataHealth: {
      opportunities: oppEntries.length,
      decisionReviews: latestDecision.size,
      committeeSessions: latestCommittee.size,
    },
  };
}
