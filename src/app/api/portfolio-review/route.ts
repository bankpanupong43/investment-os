import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

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
  };
}

// ─── Review generation ────────────────────────────────────────────────────────

async function generateReview(notes: string | null): Promise<PortfolioReviewRecord> {
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
      detail: triggeredKills[0].description,
      severity: "critical",
    };
  } else if (lowConfidencePositions.length > 0) {
    const worst = lowConfidencePositions[0];
    biggestRisk = {
      ticker: worst.ticker,
      headline: `Low conviction: ${worst.ticker}`,
      detail: `Thesis confidence at ${worst.score}/10. Consider reviewing or reducing.`,
      severity: "high",
    };
  } else if (overdueTheses.length > 0) {
    biggestRisk = {
      ticker: overdueTheses[0].ticker,
      headline: `${overdueTheses.length} thesis review${overdueTheses.length > 1 ? "s" : ""} overdue`,
      detail: `${overdueTheses[0].ticker} is ${overdueTheses[0].daysOverdue ?? 0}d overdue.`,
      severity: "medium",
    };
  } else {
    biggestRisk = {
      ticker: null,
      headline: "No critical risks identified",
      detail: "All positions are within acceptable conviction thresholds.",
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
      detail: `${top.pctFunded.toFixed(0)}% funded — $${top.gapUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })} gap to target.`,
      severity: "info",
    };
  } else {
    biggestOpportunity = {
      ticker: null,
      headline: "Portfolio fully allocated",
      detail: "All allocation targets are met or exceeded.",
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
      detail: `$${top.gapUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })} below target (${top.bucket}).`,
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
    weakestThesis = {
      ticker: weakest.ticker,
      headline: `${weakest.ticker} — ${weakest.confidenceScore}/10 conviction`,
      detail: `"${weakest.title}"${weakest.isDraft ? " — draft, needs human review." : "."}`,
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
  const reviewsDue: ReviewCard[] = overdueTheses.slice(0, 5).map(t => ({
    ticker: t.ticker,
    headline: `${t.ticker} — ${t.daysOverdue ?? 0}d overdue`,
    detail: `"${t.title}"${t.lastReviewedAt
      ? ` — last reviewed ${Math.floor((now.getTime() - t.lastReviewedAt.getTime()) / 86_400_000)}d ago`
      : " — never reviewed"}.`,
    severity: (t.daysOverdue ?? 0) > 30 ? "high" : "medium",
  }));

  if (reviewsDue.length === 0) {
    reviewsDue.push({
      ticker: null,
      headline: "All theses up to date",
      detail: "No overdue thesis reviews.",
      severity: "low",
    });
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
