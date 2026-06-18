// Opportunity Engine — Phase R2.5: Debiasing Layer
//
// Scoring weights (objective only — user feedback never modifies ranks):
//   50% Company Score      — UniverseScore.totalScore
//   15% Allocation Gap     — weak signal: guidance, not gospel
//   15% Diversification    — sector underrepresentation in portfolio
//   10% Watchlist Priority — already on watchlist = full conviction signal
//   10% Brain OS Alignment — Buffett/Lynch quality-compounder fit
//
// Separation of concerns:
//   objectiveScore   — AI-only, derived from quality + portfolio fit
//   preferenceScore  — 0-100 from user feedback signals (read-only, never blended)
//   opportunityScore — alias for objectiveScore (backward compat)
//
// Confidence: data completeness only — filing coverage, fundamentals, company score.
//             User feedback is explicitly excluded from confidence.

import { db } from "./db";
import { computePortfolioValue } from "./portfolio-value-engine";

// ─── Output types ─────────────────────────────────────────────────────────────

export interface OpportunityReasoning {
  whyBuy: string;
  whyNow: string;
  portfolioImpact: string;
  positionType: "initiate" | "add" | "hold";
}

export interface SuggestedAllocation {
  starterPct: number;
  starterUsd: number;
  targetPct: number;
  targetUsd: number;
  maxPct: number;
  maxUsd: number;
}

export interface OpportunityEntry {
  ticker: string;
  companyName: string;
  universeTier: string;
  sector: string | null;
  assetType: string;
  inPortfolio: boolean;
  inWatchlist: boolean;

  // Objective scores — never modified by user feedback
  companyScore: number;
  allocationGapScore: number;
  diversificationScore: number;
  watchlistScore: number;
  brainAlignmentScore: number;
  objectiveScore: number;          // pure AI score
  opportunityScore: number;        // = objectiveScore (backward compat alias)

  // User preference — observable, never blended into ranking
  preferenceScore: number;         // 0-100: how aligned user currently is with this pick
  userFeedback: string | null;     // latest feedback type

  // Confidence: data quality only
  confidence: number;
  uncertaintyFactors: string[];

  fundamentals: {
    grossMargin: number | null;
    operatingMargin: number | null;
    revenueGrowth: number | null;
    epsGrowth: number | null;
    freeCashFlow: number | null;
    debtToEquity: number | null;
    roic: number | null;
  } | null;

  allocationTarget: {
    targetPct: number;
    targetUsd: number;
    bucket: string;
    priority: number;
  } | null;

  currentValue: {
    usd: number | null;
    allocationPct: number | null;
  } | null;

  reasoning: OpportunityReasoning;
  suggestedAllocation: SuggestedAllocation;
  supportingFactors: string[];
  contradictingFactors: string[];
}

// ─── Preference profile ────────────────────────────────────────────────────────

export interface PreferenceProfile {
  likedTickers: string[];       // interested or researching
  dislikedTickers: string[];    // disagree or not_interested
  ownedTickers: string[];       // already_owned
  totalSignals: number;
}

// ─── Disagreement / agreement opportunities ───────────────────────────────────

export interface DisagreementOpportunity {
  ticker: string;
  companyName: string;
  sector: string | null;
  objectiveScore: number;
  userFeedback: string;
  whyAILikes: string;
  whyUserMayDisagree: string;
}

export interface AgreementOpportunity {
  ticker: string;
  companyName: string;
  sector: string | null;
  objectiveScore: number;
  userFeedback: string;
  alignment: string;
}

export interface OpportunityResult {
  entries: OpportunityEntry[];
  summary: {
    totalScored: number;
    newPositions: number;
    addCandidates: number;
    onWatchlist: number;
    topOpportunity: string | null;
    totalCapitalUsd: number;
    availableCashUsd: number;
  };
  disagreementOpportunities: DisagreementOpportunity[];
  agreementOpportunities: AgreementOpportunity[];
  preferenceProfile: PreferenceProfile;
  generatedAt: string;
}

// ─── Score helpers ─────────────────────────────────────────────────────────────

function r1(v: number): number {
  return Math.round(v * 10) / 10;
}

function clamp(v: number): number {
  return Math.min(100, Math.max(0, v));
}

type FundamentalSnapshot = {
  grossMargin: number | null;
  revenueGrowth: number | null;
  epsGrowth: number | null;
  debtToEquity: number | null;
  roic: number | null;
} | null;

function computeBrainAlignmentScore(f: FundamentalSnapshot, assetType: string): number {
  if (assetType === "etf") return 50;
  if (!f) return 25;

  let score = 0;

  if (f.roic != null) {
    if (f.roic >= 30) score += 35;
    else if (f.roic >= 20) score += 25;
    else if (f.roic >= 10) score += 15;
  }

  if (f.grossMargin != null) {
    if (f.grossMargin >= 60) score += 25;
    else if (f.grossMargin >= 40) score += 15;
    else if (f.grossMargin >= 20) score += 5;
  }

  const bestGrowth = f.epsGrowth ?? f.revenueGrowth;
  if (bestGrowth != null) {
    if (bestGrowth >= 20) score += 25;
    else if (bestGrowth >= 15) score += 20;
    else if (bestGrowth >= 8) score += 12;
    else if (bestGrowth >= 0) score += 5;
  }

  if (f.debtToEquity != null) {
    if (f.debtToEquity < 0.5) score += 15;
    else if (f.debtToEquity < 1.0) score += 10;
    else if (f.debtToEquity < 2.0) score += 3;
  }

  return clamp(score);
}

function computeAllocationGapScore(
  inPortfolio: boolean,
  currentUsd: number | null,
  target: { targetUsd: number } | null
): number {
  if (!target) {
    return inPortfolio ? 0 : 40;
  }

  const targetUsd = target.targetUsd;
  if (targetUsd <= 0) return 50;

  const deployed = inPortfolio ? (currentUsd ?? 0) : 0;
  const gapRatio = (targetUsd - deployed) / targetUsd;

  if (gapRatio >= 1) return 100;
  if (gapRatio <= 0) return 0;

  return clamp(Math.round(gapRatio * 100));
}

function computeDiversificationScore(
  sector: string | null,
  assetType: string,
  sectorExposures: Map<string, number>
): number {
  if (assetType === "etf" || !sector) {
    const maxConcentration = Math.max(...Array.from(sectorExposures.values()), 0);
    return clamp(Math.round(40 + maxConcentration));
  }

  const exposure = sectorExposures.get(sector) ?? 0;
  return clamp(Math.round(100 - exposure * 2));
}

function computeSuggestedAllocation(
  tier: string,
  objectiveScore: number,
  target: { targetPct: number; targetUsd: number } | null,
  totalCapitalUsd: number
): SuggestedAllocation {
  const maxByTier: Record<string, number> = {
    tier1: 15, tier2: 10, tier3: 5, tier4: 15, tier5: 8,
  };
  const maxPct = maxByTier[tier] ?? 10;

  const rawTarget =
    target && target.targetPct > 0
      ? target.targetPct
      : objectiveScore > 80 ? 10
      : objectiveScore > 60 ? 7
      : 5;

  const targetPct = Math.min(rawTarget, maxPct);
  const starterPct = Math.max(1, Math.min(3, targetPct * 0.25));

  return {
    starterPct: r1(starterPct),
    starterUsd: Math.round(totalCapitalUsd * starterPct / 100),
    targetPct: r1(targetPct),
    targetUsd: Math.round(totalCapitalUsd * targetPct / 100),
    maxPct,
    maxUsd: Math.round(totalCapitalUsd * maxPct / 100),
  };
}

// ─── Preference score (read-only — never blended into ranking) ─────────────────

const PREFERENCE_SCORES: Record<string, number> = {
  interested:     90,
  researching:    75,
  already_owned:  60,
  not_interested: 20,
  disagree:        5,
};

function computePreferenceScore(feedbackType: string | null): number {
  if (!feedbackType) return 50; // neutral
  return PREFERENCE_SCORES[feedbackType] ?? 50;
}

// ─── Confidence (data quality only — feedback excluded by design) ──────────────

function computeConfidence(
  f: FundamentalSnapshot,
  companyScore: number,
  assetType: string
): { confidence: number; uncertaintyFactors: string[] } {
  const factors: string[] = [];
  let score = 6;

  if (assetType !== "etf") {
    if (!f) {
      score -= 2;
      factors.push("No fundamental data — quality metrics unverified");
    } else {
      score += 1;
      const nullCount = [f.roic, f.grossMargin, f.epsGrowth, f.revenueGrowth, f.debtToEquity]
        .filter(v => v == null).length;
      if (nullCount >= 3) {
        score -= 1;
        factors.push("Partial fundamental coverage — key metrics missing");
      }
    }
  }

  if (companyScore >= 75) score += 1;
  else if (companyScore < 40) {
    score -= 1;
    factors.push("Below-average company quality score");
  }

  // Note: user feedback intentionally excluded — confidence reflects data, not opinion

  return { confidence: Math.min(10, Math.max(1, score)), uncertaintyFactors: factors };
}

// ─── Feedback signals ──────────────────────────────────────────────────────────

async function loadFeedbackSignals(): Promise<Map<string, string>> {
  const rows = await db.recommendationFeedback.findMany({
    orderBy: { createdAt: "desc" },
  });

  const seen = new Map<string, string>();
  for (const row of rows) {
    if (!seen.has(row.ticker)) {
      seen.set(row.ticker, row.feedbackType);
    }
  }
  return seen;
}

// ─── Reasoning generators ──────────────────────────────────────────────────────

function generateReasoning(
  entry: { ticker: string; companyName: string; sector: string | null; assetType: string },
  scores: {
    companyScore: number;
    allocationGapScore: number;
    diversificationScore: number;
    watchlistScore: number;
    brainAlignmentScore: number;
    objectiveScore: number;
  },
  f: {
    grossMargin: number | null;
    revenueGrowth: number | null;
    epsGrowth: number | null;
    roic: number | null;
    debtToEquity: number | null;
  } | null,
  target: { targetPct: number; targetUsd: number; bucket: string } | null,
  inPortfolio: boolean,
  currentUsd: number | null,
  sectorExposures: Map<string, number>
): OpportunityReasoning {
  const positionType: OpportunityReasoning["positionType"] =
    inPortfolio && target && (currentUsd ?? 0) < target.targetUsd
      ? "add"
      : inPortfolio
      ? "hold"
      : "initiate";

  // Why Buy — tie quality metrics to THIS portfolio's needs
  const whyBuyParts: string[] = [];
  if (entry.assetType === "etf") {
    whyBuyParts.push(`Broad market exposure via ${entry.companyName}`);
  } else {
    const sectorPct = entry.sector ? (sectorExposures.get(entry.sector) ?? 0) : null;

    if (scores.companyScore >= 85) {
      whyBuyParts.push(`Exceptional quality score ${scores.companyScore}/100`);
    } else if (scores.companyScore >= 70) {
      whyBuyParts.push(`High-quality business scoring ${scores.companyScore}/100`);
    } else {
      whyBuyParts.push(`Quality score ${scores.companyScore}/100`);
    }

    if (f?.roic != null && f.roic >= 25) {
      whyBuyParts.push(`${f.roic}% ROIC — high-quality capital allocator`);
    }
    if (sectorPct !== null && sectorPct < 5 && entry.sector) {
      whyBuyParts.push(`fills a concrete gap (${entry.sector} is only ${sectorPct.toFixed(1)}% of portfolio)`);
    }
    if (f?.epsGrowth != null && f.epsGrowth >= 20) {
      whyBuyParts.push(`${f.epsGrowth}% EPS growth`);
    } else if (f?.revenueGrowth != null && f.revenueGrowth >= 15) {
      whyBuyParts.push(`${f.revenueGrowth}% revenue growth`);
    }
    if (f?.debtToEquity != null && f.debtToEquity < 0.3) {
      whyBuyParts.push(`clean balance sheet (${f.debtToEquity} D/E)`);
    }
  }

  const whyBuy = whyBuyParts.join(" · ") + ".";

  // Why Now — reference current portfolio conditions
  let whyNow: string;
  const sectorExposurePct = entry.sector ? (sectorExposures.get(entry.sector) ?? 0) : 0;

  if (scores.watchlistScore === 100) {
    whyNow = "Already on watchlist — converting prior research conviction into a position.";
  } else if (scores.diversificationScore >= 75 && entry.sector && sectorExposurePct < 5) {
    whyNow = `${entry.sector} represents only ${sectorExposurePct.toFixed(1)}% of current holdings — this is the highest-impact sector gap to fill.`;
  } else if (scores.allocationGapScore >= 70 && target) {
    const deployedPct = Math.max(0, 100 - scores.allocationGapScore);
    whyNow = `Only ${Math.round(deployedPct)}% deployed toward ${target.targetPct}% target — executing a pre-decided allocation.`;
  } else if (scores.brainAlignmentScore >= 80) {
    whyNow = "Passes all Buffett/Lynch quality criteria — ROIC, margins, and growth align with core philosophy.";
  } else if (scores.allocationGapScore >= 50 && target) {
    whyNow = `${Math.round(scores.allocationGapScore)}% gap remaining toward ${target.targetPct}% target.`;
  } else {
    whyNow = "Fits long-term quality portfolio construction strategy.";
  }

  // Portfolio Impact
  const impactParts: string[] = [];
  if (positionType === "initiate") {
    if (entry.sector && sectorExposurePct < 5) {
      impactParts.push(`Opens ${entry.sector} exposure (currently ${sectorExposurePct.toFixed(1)}%)`);
    } else {
      impactParts.push(`Opens ${entry.sector ?? entry.assetType} exposure`);
    }
  } else if (positionType === "add" && target) {
    const gapUsd = target.targetUsd - (currentUsd ?? 0);
    impactParts.push(`Closes $${Math.round(gapUsd).toLocaleString()} gap toward ${target.targetPct}% target`);
  }
  if (scores.diversificationScore >= 70 && entry.assetType !== "etf" && entry.sector && sectorExposurePct < 10) {
    impactParts.push("reduces sector concentration risk");
  }
  if (impactParts.length === 0) {
    impactParts.push("Maintains quality tilt of portfolio");
  }

  const portfolioImpact = impactParts.join("; ") + ".";

  return { whyBuy, whyNow, portfolioImpact, positionType };
}

// ─── Supporting / contradicting factors (objective data only) ─────────────────

function computeFactors(
  inPortfolio: boolean,
  inWatchlist: boolean,
  sector: string | null,
  assetType: string,
  scores: {
    companyScore: number;
    allocationGapScore: number;
    diversificationScore: number;
    brainAlignmentScore: number;
  },
  f: {
    roic: number | null;
    grossMargin: number | null;
    debtToEquity: number | null;
    epsGrowth: number | null;
    freeCashFlow: number | null;
  } | null,
  target: { targetPct: number; targetUsd: number } | null
): { supportingFactors: string[]; contradictingFactors: string[] } {
  const supporting: string[] = [];
  const contradicting: string[] = [];

  if (scores.companyScore >= 80) supporting.push(`Top-tier quality score (${scores.companyScore}/100)`);
  else if (scores.companyScore >= 65) supporting.push(`Strong quality score (${scores.companyScore}/100)`);
  else if (scores.companyScore < 45) contradicting.push(`Below-average quality (${scores.companyScore}/100)`);

  if (scores.allocationGapScore >= 70) supporting.push(`${Math.round(scores.allocationGapScore)}% allocation gap — strong deployment signal`);
  else if (scores.allocationGapScore >= 40) supporting.push("Partially deployed toward allocation target");
  else if (scores.allocationGapScore === 0 && inPortfolio) contradicting.push("At or above allocation target");
  else if (!inPortfolio && !target) contradicting.push("No allocation target defined");

  if (inWatchlist) supporting.push("Pre-researched watchlist conviction");

  if (scores.diversificationScore >= 75 && assetType !== "etf") {
    supporting.push(`${sector ?? "Sector"} underrepresented in portfolio`);
  }

  if (scores.brainAlignmentScore >= 75) supporting.push(`Strong Brain OS alignment (${scores.brainAlignmentScore}/100)`);
  else if (scores.brainAlignmentScore < 40 && assetType !== "etf") contradicting.push(`Weak Brain OS alignment (${scores.brainAlignmentScore}/100)`);

  if (f) {
    if (f.roic != null && f.roic >= 25) supporting.push(`Outstanding ROIC (${f.roic}%)`);
    else if (f.roic != null && f.roic >= 10) supporting.push(`Quality ROIC (${f.roic}%)`);
    else if (f.roic != null && f.roic < 10) contradicting.push(`ROIC below 10% threshold (${f.roic}%)`);

    if (f.grossMargin != null && f.grossMargin >= 60) supporting.push(`High-margin business (${f.grossMargin}% gross margin)`);
    if (f.debtToEquity != null && f.debtToEquity > 1) contradicting.push(`Elevated leverage (${f.debtToEquity}x D/E)`);
    if (f.epsGrowth != null && f.epsGrowth < 0) contradicting.push(`Negative EPS growth (${f.epsGrowth}%)`);
    if (f.freeCashFlow != null && f.freeCashFlow > 5000) {
      supporting.push(`Substantial FCF ($${(f.freeCashFlow / 1000).toFixed(0)}B)`);
    }
  }

  // Note: user feedback intentionally excluded from objective factors

  return { supportingFactors: supporting, contradictingFactors: contradicting };
}

// ─── Disagreement / agreement builders ───────────────────────────────────────

const DISAGREE_REASONS: Record<string, string> = {
  disagree:       "Contradicts current investment view",
  not_interested: "Outside current area of interest",
};

const AGREE_ALIGNMENT: Record<string, string> = {
  interested:  "Marked as interested — aligned with current conviction",
  researching: "Actively researching — high personal engagement",
};

function buildDisagreementOpportunities(
  entries: OpportunityEntry[],
  minScore = 62
): DisagreementOpportunity[] {
  return entries
    .filter(e => e.objectiveScore >= minScore && (e.userFeedback === "disagree" || e.userFeedback === "not_interested"))
    .map(e => ({
      ticker: e.ticker,
      companyName: e.companyName,
      sector: e.sector,
      objectiveScore: e.objectiveScore,
      userFeedback: e.userFeedback!,
      whyAILikes: e.reasoning.whyBuy,
      whyUserMayDisagree: DISAGREE_REASONS[e.userFeedback!] ?? "User expressed low interest",
    }));
}

function buildAgreementOpportunities(
  entries: OpportunityEntry[],
  minScore = 62
): AgreementOpportunity[] {
  return entries
    .filter(e => e.objectiveScore >= minScore && (e.userFeedback === "interested" || e.userFeedback === "researching"))
    .map(e => ({
      ticker: e.ticker,
      companyName: e.companyName,
      sector: e.sector,
      objectiveScore: e.objectiveScore,
      userFeedback: e.userFeedback!,
      alignment: AGREE_ALIGNMENT[e.userFeedback!] ?? "User expressed interest",
    }));
}

function buildPreferenceProfile(feedbackSignals: Map<string, string>): PreferenceProfile {
  const liked: string[] = [];
  const disliked: string[] = [];
  const owned: string[] = [];

  for (const [ticker, type] of feedbackSignals.entries()) {
    if (type === "interested" || type === "researching") liked.push(ticker);
    else if (type === "disagree" || type === "not_interested") disliked.push(ticker);
    else if (type === "already_owned") owned.push(ticker);
  }

  return {
    likedTickers: liked,
    dislikedTickers: disliked,
    ownedTickers: owned,
    totalSignals: feedbackSignals.size,
  };
}

// ─── Main engine ──────────────────────────────────────────────────────────────

export async function computeOpportunities(): Promise<OpportunityResult> {
  const [universeEntries, snapshot, watchlistItems, allocationTargets, feedbackSignals] =
    await Promise.all([
      db.universe.findMany({
        where: { status: "active" },
        include: {
          fundamentals: true,
          scores: { orderBy: { scoredAt: "desc" }, take: 1 },
        },
      }),
      computePortfolioValue(),
      db.watchlist.findMany(),
      db.allocationTarget.findMany(),
      loadFeedbackSignals(),
    ]);

  const usdthb           = snapshot.usdthb ?? 35;
  const totalCapitalUsd  = snapshot.totalValueThb / usdthb;
  const availableCashUsd = snapshot.totalCashThb / usdthb;

  // Live holding values keyed by ticker
  const holdingMap = new Map(snapshot.holdings.map(h => [h.ticker, h]));
  const watchlistSet = new Set(watchlistItems.map(w => w.ticker));
  const targetMap = new Map(allocationTargets.map(t => [t.ticker, t]));

  // Sector exposures from live allocation %; use Universe sector as the label source
  const univSectorMap = new Map(universeEntries.map(u => [u.ticker, u.sector]));
  const sectorExposures = new Map<string, number>();
  for (const h of snapshot.holdings) {
    const sector = univSectorMap.get(h.ticker) ?? null;
    if (!sector) continue;
    const pct = h.allocationPct ?? 0;
    if (pct > 0) sectorExposures.set(sector, (sectorExposures.get(sector) ?? 0) + pct);
  }

  const entries: OpportunityEntry[] = [];

  for (const u of universeEntries) {
    const latestScore = u.scores[0] ?? null;
    const companyScore = r1(latestScore?.totalScore ?? 0);
    const f = u.fundamentals;
    const holding = holdingMap.get(u.ticker) ?? null;
    const inPortfolio = holding !== null;
    const inWatchlist = watchlistSet.has(u.ticker);
    const target = targetMap.get(u.ticker) ?? null;
    const userFeedback = feedbackSignals.get(u.ticker) ?? null;

    const allocationGapScore = computeAllocationGapScore(
      inPortfolio, holding?.marketValueUsd ?? null, target
    );
    const diversificationScore = computeDiversificationScore(u.sector, u.assetType, sectorExposures);
    const watchlistScore = inWatchlist ? 100 : 0;
    const brainAlignmentScore = computeBrainAlignmentScore(
      f ? { grossMargin: f.grossMargin, revenueGrowth: f.revenueGrowth, epsGrowth: f.epsGrowth, debtToEquity: f.debtToEquity, roic: f.roic } : null,
      u.assetType
    );

    // Objective score — feedback-free
    const objectiveScore = r1(
      companyScore * 0.50 +
      allocationGapScore * 0.15 +
      diversificationScore * 0.15 +
      watchlistScore * 0.10 +
      brainAlignmentScore * 0.10
    );

    // Preference score — separate read-only signal
    const preferenceScore = computePreferenceScore(userFeedback);

    // Confidence — data quality only, feedback excluded by design
    const { confidence, uncertaintyFactors } = computeConfidence(
      f ? { grossMargin: f.grossMargin, revenueGrowth: f.revenueGrowth, epsGrowth: f.epsGrowth, debtToEquity: f.debtToEquity, roic: f.roic } : null,
      companyScore,
      u.assetType
    );

    const reasoning = generateReasoning(
      { ticker: u.ticker, companyName: u.companyName, sector: u.sector, assetType: u.assetType },
      { companyScore, allocationGapScore, diversificationScore, watchlistScore, brainAlignmentScore, objectiveScore },
      f ? { grossMargin: f.grossMargin, revenueGrowth: f.revenueGrowth, epsGrowth: f.epsGrowth, roic: f.roic, debtToEquity: f.debtToEquity } : null,
      target ? { targetPct: target.targetPct, targetUsd: target.targetUsd, bucket: target.bucket } : null,
      inPortfolio,
      holding?.marketValueUsd ?? null,
      sectorExposures
    );

    const suggestedAllocation = computeSuggestedAllocation(
      u.universeTier,
      objectiveScore,
      target ? { targetPct: target.targetPct, targetUsd: target.targetUsd } : null,
      totalCapitalUsd
    );

    const { supportingFactors, contradictingFactors } = computeFactors(
      inPortfolio, inWatchlist, u.sector, u.assetType,
      { companyScore, allocationGapScore, diversificationScore, brainAlignmentScore },
      f ? { roic: f.roic, grossMargin: f.grossMargin, debtToEquity: f.debtToEquity, epsGrowth: f.epsGrowth, freeCashFlow: f.freeCashFlow } : null,
      target ? { targetPct: target.targetPct, targetUsd: target.targetUsd } : null
    );

    entries.push({
      ticker: u.ticker,
      companyName: u.companyName,
      universeTier: u.universeTier,
      sector: u.sector,
      assetType: u.assetType,
      inPortfolio,
      inWatchlist,
      companyScore,
      allocationGapScore,
      diversificationScore,
      watchlistScore,
      brainAlignmentScore,
      objectiveScore,
      opportunityScore: objectiveScore,   // backward compat alias
      preferenceScore,
      userFeedback,
      confidence,
      uncertaintyFactors,
      fundamentals: f
        ? {
            grossMargin: f.grossMargin,
            operatingMargin: f.operatingMargin,
            revenueGrowth: f.revenueGrowth,
            epsGrowth: f.epsGrowth,
            freeCashFlow: f.freeCashFlow,
            debtToEquity: f.debtToEquity,
            roic: f.roic,
          }
        : null,
      allocationTarget: target
        ? { targetPct: target.targetPct, targetUsd: target.targetUsd, bucket: target.bucket, priority: target.priority }
        : null,
      currentValue: holding
        ? { usd: holding.marketValueUsd, allocationPct: holding.allocationPct }
        : null,
      reasoning,
      suggestedAllocation,
      supportingFactors,
      contradictingFactors,
    });
  }

  // Sort by objectiveScore — preference has no influence on order
  entries.sort((a, b) => b.objectiveScore - a.objectiveScore);

  return {
    entries,
    summary: {
      totalScored: entries.length,
      newPositions: entries.filter(e => !e.inPortfolio).length,
      addCandidates: entries.filter(e => e.inPortfolio && e.reasoning.positionType === "add").length,
      onWatchlist: entries.filter(e => e.inWatchlist).length,
      topOpportunity: entries[0]?.ticker ?? null,
      totalCapitalUsd,
      availableCashUsd,
    },
    disagreementOpportunities: buildDisagreementOpportunities(entries),
    agreementOpportunities: buildAgreementOpportunities(entries),
    preferenceProfile: buildPreferenceProfile(feedbackSignals),
    generatedAt: new Date().toISOString(),
  };
}

export async function saveOpportunityScores(entries: OpportunityEntry[]): Promise<void> {
  await db.opportunityScore.createMany({
    data: entries.map(e => ({
      ticker: e.ticker,
      companyScore: e.companyScore,
      allocationGapScore: e.allocationGapScore,
      diversificationScore: e.diversificationScore,
      watchlistScore: e.watchlistScore,
      brainAlignmentScore: e.brainAlignmentScore,
      opportunityScore: e.objectiveScore,
      reasoning: JSON.stringify(e.reasoning),
    })),
  });
}
