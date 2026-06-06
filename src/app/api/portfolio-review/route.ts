import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loadBrainContext, type BrainOSContext } from "@/lib/brain-os-context";
import { computeOpportunities, type OpportunityEntry } from "@/lib/opportunity-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReviewSeverity = "info" | "low" | "medium" | "high" | "critical";

export interface ReviewCard {
  ticker: string | null;
  headline: string;
  detail: string;
  severity: ReviewSeverity;
}

export interface PortfolioSummarySection {
  totalPositions: number;
  totalInvestedUsd: number;
  cashUsd: number;
  cashPct: number;
  sectors: { sector: string; valueUsd: number; pct: number }[];
  avgConfidenceScore: number;
}

export interface AllocationAnalysisSection {
  totalTargetUsd: number;
  totalDeployedUsd: number;
  pctFunded: number;
  totalGapUsd: number;
  shortfallUsd: number;
  canFullyFund: boolean;
  topGaps: { ticker: string; name: string; gapUsd: number; pctFunded: number; bucket: string }[];
  overallocated: { ticker: string; name: string; excessUsd: number }[];
}

export interface ThesisCoverageSection {
  total: number;
  active: number;
  watchlist: number;
  published: number;
  drafts: number;
  overdueReviews: number;
  avgConfidence: number;
  weakest: { ticker: string; title: string; score: number }[];
  strongest: { ticker: string; title: string; score: number }[];
}

export interface RiskAnalysisSection {
  overallRiskLevel: "low" | "medium" | "high" | "critical";
  triggeredKills: { ticker: string; description: string }[];
  pendingActions: number;
  lowConfidencePositions: { ticker: string; name: string; score: number }[];
}

export interface CashAllocationSection {
  cashUsd: number;
  cashPct: number;
  totalGapUsd: number;
  canFullyFund: boolean;
  shortfallUsd: number;
  topPriority: { ticker: string; name: string; gapUsd: number }[];
}

export interface WatchlistPrioritizationSection {
  items: {
    ticker: string;
    name: string | null;
    interestReason: string;
    targetEntryPrice: number | null;
    hasThesis: boolean;
    isDraftThesis: boolean;
    score: number;
  }[];
  topCandidate: string | null;
}

export interface FilingReviewCard extends ReviewCard {
  filingType?: string;
  impactLevel?: string;
}

export interface PortfolioReviewRecord {
  id: string;
  generatedAt: string;
  notes: string | null;
  portfolioSummary: PortfolioSummarySection;
  allocationAnalysis: AllocationAnalysisSection;
  thesisCoverageAnalysis: ThesisCoverageSection;
  riskAnalysis: RiskAnalysisSection;
  cashAllocationReview: CashAllocationSection;
  watchlistPrioritization: WatchlistPrioritizationSection;
  biggestRisk: ReviewCard;
  biggestOpportunity: ReviewCard;
  mostUnderallocated: ReviewCard;
  weakestThesis: ReviewCard;
  reviewsDue: ReviewCard[];
  brainContextReport: BrainOSContext | null;
  topOpportunities: OpportunityEntry[];
  // Filing intelligence (Phase 5E)
  filingsRequiringReview: FilingReviewCard[];
  thesisAlerts: FilingReviewCard[];
  newRisksDetected: FilingReviewCard[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function freqDays(freq: string): number {
  if (freq === "monthly") return 30;
  if (freq === "quarterly") return 90;
  return 365;
}

function parseReview(r: {
  id: string; generatedAt: Date; notes: string | null;
  portfolioSummary: string; allocationAnalysis: string;
  thesisCoverageAnalysis: string; riskAnalysis: string;
  cashAllocationReview: string; watchlistPrioritization: string;
  biggestRisk: string; biggestOpportunity: string;
  mostUnderallocated: string; weakestThesis: string; reviewsDue: string;
  brainContextReport: string | null;
  topOpportunities: string;
  filingsRequiringReview: string;
  thesisAlerts: string;
  newRisksDetected: string;
}): PortfolioReviewRecord {
  return {
    id: r.id,
    generatedAt: r.generatedAt.toISOString(),
    notes: r.notes,
    portfolioSummary: JSON.parse(r.portfolioSummary),
    allocationAnalysis: JSON.parse(r.allocationAnalysis),
    thesisCoverageAnalysis: JSON.parse(r.thesisCoverageAnalysis),
    riskAnalysis: JSON.parse(r.riskAnalysis),
    cashAllocationReview: JSON.parse(r.cashAllocationReview),
    watchlistPrioritization: JSON.parse(r.watchlistPrioritization),
    biggestRisk: JSON.parse(r.biggestRisk),
    biggestOpportunity: JSON.parse(r.biggestOpportunity),
    mostUnderallocated: JSON.parse(r.mostUnderallocated),
    weakestThesis: JSON.parse(r.weakestThesis),
    reviewsDue: JSON.parse(r.reviewsDue),
    brainContextReport: r.brainContextReport ? JSON.parse(r.brainContextReport) : null,
    topOpportunities: JSON.parse(r.topOpportunities),
    filingsRequiringReview: JSON.parse(r.filingsRequiringReview),
    thesisAlerts: JSON.parse(r.thesisAlerts),
    newRisksDetected: JSON.parse(r.newRisksDetected),
  };
}

// ─── Review generation ────────────────────────────────────────────────────────

function contextNote(ctx: BrainOSContext, section: string): string {
  if (!ctx.loaded) return "";
  const influence = ctx.influences.find(i => i.appliesTo.includes(section));
  if (!influence) return "";
  return ` ${influence.insight}`;
}

async function generateReview(notes: string | null): Promise<PortfolioReviewRecord> {
  const ctx = loadBrainContext();

  const [positions, theses, allocationTargets, settings, watchlistItems] = await Promise.all([
    db.position.findMany({
      where: { status: "active" },
      include: {
        killConditions: true,
        recommendations: { where: { status: "pending" } },
      },
      orderBy: { ticker: "asc" },
    }),
    db.investmentThesis.findMany({
      include: { reviews: { orderBy: { reviewedAt: "desc" }, take: 1 } },
      orderBy: [{ confidenceScore: "asc" }],
    }),
    db.allocationTarget.findMany({ orderBy: { priority: "asc" } }),
    db.portfolioSettings.findFirst(),
    db.watchlist.findMany({ orderBy: { addedAt: "desc" } }),
  ]);

  const totalCapitalUsd = settings?.totalCapitalUsd ?? 0;
  const cashPos = positions.find(p => p.ticker === "CASH");
  const cashUsd = cashPos?.currentValueUsd ?? 0;
  const activePositions = positions.filter(p => p.ticker !== "CASH");
  const now = new Date();

  const thesisMap = new Map(theses.map(t => [t.ticker, t]));
  const posMap = new Map(positions.map(p => [p.ticker, p]));

  // ── Portfolio Summary ──────────────────────────────────────────────────────
  const totalInvestedUsd = activePositions.reduce((s, p) => s + (p.currentValueUsd ?? 0), 0);
  const cashPct = totalCapitalUsd > 0 ? (cashUsd / totalCapitalUsd) * 100 : 0;

  const sectorMap = new Map<string, number>();
  for (const p of activePositions) {
    const sector = p.sector ?? "Unknown";
    sectorMap.set(sector, (sectorMap.get(sector) ?? 0) + (p.currentValueUsd ?? 0));
  }
  const sectors = Array.from(sectorMap.entries())
    .map(([sector, valueUsd]) => ({
      sector,
      valueUsd,
      pct: totalCapitalUsd > 0 ? (valueUsd / totalCapitalUsd) * 100 : 0,
    }))
    .sort((a, b) => b.valueUsd - a.valueUsd);

  const avgConfidenceScore = theses.length
    ? theses.reduce((s, t) => s + t.confidenceScore, 0) / theses.length
    : 0;

  const portfolioSummary: PortfolioSummarySection = {
    totalPositions: activePositions.length,
    totalInvestedUsd,
    cashUsd,
    cashPct,
    sectors,
    avgConfidenceScore,
  };

  // ── Allocation Analysis ───────────────────────────────────────────────────
  const allocationEntries = allocationTargets.map(t => {
    const pos = posMap.get(t.ticker);
    const currentUsd = pos?.currentValueUsd ?? 0;
    const gapUsd = t.targetUsd - currentUsd;
    const pctFunded = t.targetUsd > 0 ? (currentUsd / t.targetUsd) * 100 : 0;
    return { ...t, currentUsd, gapUsd, pctFunded };
  });

  const totalTargetUsd = allocationEntries.reduce((s, t) => s + t.targetUsd, 0);
  const totalDeployedUsd = allocationEntries.reduce((s, t) => s + t.currentUsd, 0);
  const totalGapUsd = Math.max(0, totalTargetUsd - totalDeployedUsd);
  const pctFunded = totalTargetUsd > 0 ? (totalDeployedUsd / totalTargetUsd) * 100 : 0;
  const shortfallUsd = Math.max(0, totalGapUsd - cashUsd);
  const canFullyFund = cashUsd >= totalGapUsd;

  const topGaps = allocationEntries
    .filter(t => t.gapUsd > 0)
    .sort((a, b) => b.gapUsd - a.gapUsd)
    .slice(0, 5)
    .map(t => ({ ticker: t.ticker, name: t.name, gapUsd: t.gapUsd, pctFunded: t.pctFunded, bucket: t.bucket }));

  const overallocated = allocationEntries
    .filter(t => t.gapUsd < 0)
    .map(t => ({ ticker: t.ticker, name: t.name, excessUsd: Math.abs(t.gapUsd) }));

  const allocationAnalysis: AllocationAnalysisSection = {
    totalTargetUsd,
    totalDeployedUsd,
    pctFunded,
    totalGapUsd,
    shortfallUsd,
    canFullyFund,
    topGaps,
    overallocated,
  };

  // ── Thesis Coverage ───────────────────────────────────────────────────────
  const enrichedTheses = theses.map(t => {
    const days = freqDays(t.reviewFrequency);
    let isReviewDue = true;
    let daysOverdue: number | null = null;
    if (t.lastReviewedAt) {
      const due = new Date(t.lastReviewedAt);
      due.setDate(due.getDate() + days);
      isReviewDue = due < now;
      if (isReviewDue) {
        daysOverdue = Math.floor((now.getTime() - due.getTime()) / 86_400_000);
      }
    }
    return { ...t, isReviewDue, daysOverdue };
  });

  const overdueTheses = enrichedTheses.filter(t => t.isReviewDue);
  const sortedByConfAsc = [...theses].sort((a, b) => a.confidenceScore - b.confidenceScore);

  const thesisCoverageAnalysis: ThesisCoverageSection = {
    total: theses.length,
    active: theses.filter(t => t.status === "active").length,
    watchlist: theses.filter(t => t.status === "watchlist").length,
    published: theses.filter(t => !t.isDraft).length,
    drafts: theses.filter(t => t.isDraft).length,
    overdueReviews: overdueTheses.length,
    avgConfidence: avgConfidenceScore,
    weakest: sortedByConfAsc.slice(0, 3).map(t => ({ ticker: t.ticker, title: t.title, score: t.confidenceScore })),
    strongest: sortedByConfAsc.slice(-3).reverse().map(t => ({ ticker: t.ticker, title: t.title, score: t.confidenceScore })),
  };

  // ── Risk Analysis ─────────────────────────────────────────────────────────
  const triggeredKills = positions.flatMap(p =>
    p.killConditions
      .filter(kc => kc.status === "triggered")
      .map(kc => ({ ticker: p.ticker, description: kc.description }))
  );

  const totalPendingActions = positions.reduce((s, p) => s + p.recommendations.length, 0);

  const lowConfidencePositions = theses
    .filter(t => t.confidenceScore < 6 && t.status === "active")
    .map(t => ({ ticker: t.ticker, name: t.title, score: t.confidenceScore }));

  const overallRiskLevel: "low" | "medium" | "high" | "critical" =
    triggeredKills.length > 0 ? "critical" :
    lowConfidencePositions.length > 2 ? "high" :
    lowConfidencePositions.length > 0 || totalPendingActions > 3 ? "medium" : "low";

  const riskAnalysis: RiskAnalysisSection = {
    overallRiskLevel,
    triggeredKills,
    pendingActions: totalPendingActions,
    lowConfidencePositions,
  };

  // ── Cash Allocation ───────────────────────────────────────────────────────
  const cashAllocationReview: CashAllocationSection = {
    cashUsd,
    cashPct,
    totalGapUsd,
    canFullyFund,
    shortfallUsd,
    topPriority: topGaps.slice(0, 3).map(t => ({ ticker: t.ticker, name: t.name, gapUsd: t.gapUsd })),
  };

  // ── Watchlist Prioritization ──────────────────────────────────────────────
  const thesisTickers = new Set(theses.map(t => t.ticker));
  const watchlistWithScore = watchlistItems.map(w => {
    const thesis = thesisMap.get(w.ticker);
    const hasThesis = thesisTickers.has(w.ticker);
    const isDraftThesis = thesis?.isDraft ?? false;
    const score = (hasThesis ? 2 : 0) + (!isDraftThesis && hasThesis ? 1 : 0) + (w.targetEntryPrice ? 1 : 0);
    return {
      ticker: w.ticker,
      name: w.name,
      interestReason: w.interestReason,
      targetEntryPrice: w.targetEntryPrice,
      hasThesis,
      isDraftThesis,
      score,
    };
  }).sort((a, b) => b.score - a.score);

  const watchlistPrioritization: WatchlistPrioritizationSection = {
    items: watchlistWithScore,
    topCandidate: watchlistWithScore[0]?.ticker ?? null,
  };

  // ── AI Review Cards ───────────────────────────────────────────────────────

  // Biggest Risk
  let biggestRisk: ReviewCard;
  if (triggeredKills.length > 0) {
    biggestRisk = {
      ticker: triggeredKills[0].ticker,
      headline: `Kill condition triggered: ${triggeredKills[0].ticker}`,
      detail: `${triggeredKills[0].description}${ctx.loaded ? " Given your scholarship bond constraint, capital loss here delays the exit runway — act immediately." : ""}`,
      severity: "critical",
    };
  } else if (lowConfidencePositions.length > 0) {
    const worst = lowConfidencePositions[0];
    biggestRisk = {
      ticker: worst.ticker,
      headline: `Low conviction: ${worst.ticker}`,
      detail: `Thesis confidence at ${worst.score}/10.${ctx.loaded ? ` At 25 with a long-term horizon, weak conviction that isn't improving warrants a full Buffett/Lynch reassessment before adding capital.` : " Consider reviewing or reducing."}`,
      severity: "high",
    };
  } else if (overdueTheses.length > 0) {
    biggestRisk = {
      ticker: overdueTheses[0].ticker,
      headline: `${overdueTheses.length} thesis review${overdueTheses.length > 1 ? "s" : ""} overdue`,
      detail: `${overdueTheses[0].ticker} is ${overdueTheses[0].daysOverdue ?? 0}d overdue.${ctx.loaded ? " Time-constrained as a military officer — schedule a focused 30-min review session rather than waiting for a perfect window." : ""}`,
      severity: "medium",
    };
  } else {
    biggestRisk = {
      ticker: null,
      headline: "No critical risks identified",
      detail: `All positions are within acceptable conviction thresholds.${ctx.loaded ? " Continue compounding toward financial independence." : ""}`,
      severity: "low",
    };
  }

  // Biggest Opportunity
  let biggestOpportunity: ReviewCard;
  if (topGaps.length > 0) {
    const top = topGaps[0];
    biggestOpportunity = {
      ticker: top.ticker,
      headline: `Add to ${top.ticker}`,
      detail: `${top.pctFunded.toFixed(0)}% funded — $${top.gapUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })} gap to target.${ctx.loaded ? ` Closing this gap compounds directly toward financial independence before 40 — prioritize when cash becomes available.` : ""}`,
      severity: "info",
    };
  } else {
    biggestOpportunity = {
      ticker: null,
      headline: "Portfolio fully allocated",
      detail: `All allocation targets are met or exceeded.${ctx.loaded ? " Consider increasing total capital target or expanding the watchlist to deploy additional capital." : ""}`,
      severity: "info",
    };
  }

  // Most Underallocated
  let mostUnderallocated: ReviewCard;
  if (topGaps.length > 0) {
    const top = topGaps[0];
    mostUnderallocated = {
      ticker: top.ticker,
      headline: `${top.ticker} — ${top.pctFunded.toFixed(0)}% funded`,
      detail: `$${top.gapUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })} below target (${top.bucket}).${ctx.loaded ? ` This is the highest-priority capital deployment for accelerating the scholarship repayment runway.` : ""}`,
      severity: top.pctFunded < 50 ? "high" : "medium",
    };
  } else {
    mostUnderallocated = {
      ticker: null,
      headline: "All positions on target",
      detail: "No significant allocation gaps.",
      severity: "low",
    };
  }

  // Weakest Thesis
  let weakestThesis: ReviewCard;
  if (sortedByConfAsc.length > 0) {
    const weakest = sortedByConfAsc[0];
    const draftNote = weakest.isDraft ? " — draft, needs human review" : "";
    const ctxNote = ctx.loaded
      ? ` Per Buffett/Lynch framework: verify business quality score, competitive moat, and whether this still belongs in a quality-at-reasonable-price portfolio.`
      : "";
    weakestThesis = {
      ticker: weakest.ticker,
      headline: `${weakest.ticker} — ${weakest.confidenceScore}/10 conviction`,
      detail: `"${weakest.title}"${draftNote}.${ctxNote}`,
      severity: weakest.confidenceScore < 5 ? "high" : weakest.confidenceScore < 7 ? "medium" : "low",
    };
  } else {
    weakestThesis = {
      ticker: null,
      headline: "No theses found",
      detail: "Add investment theses to track conviction.",
      severity: "info",
    };
  }

  // Reviews Due
  const reviewsDue: ReviewCard[] = overdueTheses.slice(0, 5).map(t => {
    const daysSince = t.lastReviewedAt
      ? Math.floor((now.getTime() - t.lastReviewedAt.getTime()) / 86_400_000)
      : null;
    const lastSeen = daysSince !== null ? ` — last reviewed ${daysSince}d ago` : " — never reviewed";
    const ctxNote = ctx.loaded ? ` Schedule a focused 30-min session; prioritize active positions over watchlist.` : "";
    return {
      ticker: t.ticker,
      headline: `${t.ticker} — ${t.daysOverdue ?? 0}d overdue`,
      detail: `"${t.title}"${lastSeen}.${ctxNote}`,
      severity: (t.daysOverdue ?? 0) > 30 ? "high" : "medium",
    };
  });

  if (reviewsDue.length === 0) {
    reviewsDue.push({
      ticker: null,
      headline: "All theses up to date",
      detail: `No overdue thesis reviews.${ctx.loaded ? " Good discipline — maintain quarterly review cadence." : ""}`,
      severity: "low",
    });
  }

  // ── Top Opportunities ─────────────────────────────────────────────────────
  let topOpportunities: OpportunityEntry[] = [];
  try {
    const oppResult = await computeOpportunities();
    topOpportunities = oppResult.entries.slice(0, 3);
  } catch {
    // opportunities are non-critical — don't fail the review if engine errors
  }

  // ── Filing Intelligence Cards (Phase 5E) ──────────────────────────────────
  let filingsRequiringReview: FilingReviewCard[] = [];
  let thesisAlerts: FilingReviewCard[] = [];
  let newRisksDetected: FilingReviewCard[] = [];

  try {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);

    const [recentFilings, weakenedImpacts, riskImpacts] = await Promise.all([
      db.filing.findMany({
        where: {
          filingDate: { gte: sevenDaysAgo },
          filingType: { in: ["10-K", "10-Q", "8-K"] },
        },
        orderBy: { filingDate: "desc" },
        take: 10,
        include: { thesisImpacts: { orderBy: { createdAt: "desc" }, take: 1 } },
      }),
      db.thesisImpactRecord.findMany({
        where: {
          impactLevel: { in: ["weakened", "kill_criteria_triggered"] },
          createdAt: { gte: sevenDaysAgo },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { filing: { select: { filingType: true, filingDate: true } } },
      }),
      db.thesisImpactRecord.findMany({
        where: { impactLevel: "weakened", createdAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

    filingsRequiringReview = recentFilings.map(f => ({
      ticker: f.ticker,
      headline: `${f.filingType} — ${f.ticker}`,
      detail: f.summary || `New ${f.filingType} filing from ${f.filingDate.toISOString().slice(0, 10)}. Review for thesis impact.`,
      severity: (f.filingType === "10-K" ? "high" : "medium") as ReviewSeverity,
      filingType: f.filingType,
      impactLevel: f.thesisImpacts[0]?.impactLevel ?? "unknown",
    }));

    if (filingsRequiringReview.length === 0) {
      filingsRequiringReview = [{
        ticker: null,
        headline: "No new filings in last 7 days",
        detail: "Run ingestion to check for new SEC filings.",
        severity: "info",
      }];
    }

    thesisAlerts = weakenedImpacts.map(t => ({
      ticker: t.ticker,
      headline: t.impactLevel === "kill_criteria_triggered"
        ? `Kill criteria triggered: ${t.ticker}`
        : `Thesis weakened: ${t.ticker}`,
      detail: t.reasoning,
      severity: (t.impactLevel === "kill_criteria_triggered" ? "critical" : "high") as ReviewSeverity,
      filingType: t.filing?.filingType,
      impactLevel: t.impactLevel,
    }));

    if (thesisAlerts.length === 0) {
      thesisAlerts = [{
        ticker: null,
        headline: "No thesis alerts",
        detail: "No weakening or kill-criteria signals detected in recent filings.",
        severity: "low",
      }];
    }

    newRisksDetected = riskImpacts.map(t => ({
      ticker: t.ticker,
      headline: `New risk signal: ${t.ticker}`,
      detail: t.reasoning,
      severity: "medium" as ReviewSeverity,
      impactLevel: t.impactLevel,
    }));

    if (newRisksDetected.length === 0) {
      newRisksDetected = [{
        ticker: null,
        headline: "No new risks detected",
        detail: "No new risk signals from SEC filings in the past 30 days.",
        severity: "low",
      }];
    }
  } catch {
    // filing intelligence is non-critical
    filingsRequiringReview = [{ ticker: null, headline: "Filing data unavailable", detail: "Run SEC ingestion to populate.", severity: "info" }];
    thesisAlerts = [{ ticker: null, headline: "No data", detail: "Filing analysis not yet run.", severity: "info" }];
    newRisksDetected = [{ ticker: null, headline: "No data", detail: "Filing analysis not yet run.", severity: "info" }];
  }

  // ── Persist ───────────────────────────────────────────────────────────────
  const saved = await db.portfolioReview.create({
    data: {
      notes,
      portfolioSummary:        JSON.stringify(portfolioSummary),
      allocationAnalysis:      JSON.stringify(allocationAnalysis),
      thesisCoverageAnalysis:  JSON.stringify(thesisCoverageAnalysis),
      riskAnalysis:            JSON.stringify(riskAnalysis),
      cashAllocationReview:    JSON.stringify(cashAllocationReview),
      watchlistPrioritization: JSON.stringify(watchlistPrioritization),
      biggestRisk:             JSON.stringify(biggestRisk),
      biggestOpportunity:      JSON.stringify(biggestOpportunity),
      mostUnderallocated:      JSON.stringify(mostUnderallocated),
      weakestThesis:           JSON.stringify(weakestThesis),
      reviewsDue:              JSON.stringify(reviewsDue),
      brainContextReport:      ctx.loaded ? JSON.stringify(ctx) : null,
      topOpportunities:        JSON.stringify(topOpportunities),
      filingsRequiringReview:  JSON.stringify(filingsRequiringReview),
      thesisAlerts:            JSON.stringify(thesisAlerts),
      newRisksDetected:        JSON.stringify(newRisksDetected),
    },
  });

  return parseReview(saved);
}

// ─── Route handlers ───────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  const rows = await db.portfolioReview.findMany({
    orderBy: { generatedAt: "desc" },
    take: 20,
  });
  return NextResponse.json({ reviews: rows.map(parseReview) });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => ({}));
  const review = await generateReview(body.notes ?? null);
  return NextResponse.json(review, { status: 201 });
}
