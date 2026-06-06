// Opportunity Engine: combines company quality + portfolio context to rank best next buys.
//
// Scoring weights:
//   40% Company Score      — UniverseScore.totalScore (quality/growth/strength)
//   25% Allocation Gap     — distance below target allocation (undeployed = opportunity)
//   15% Diversification    — sector underrepresentation in portfolio
//   10% Watchlist Priority — already on watchlist = full conviction signal
//   10% Brain OS Alignment — Buffett/Lynch quality-compounder fit (ROIC, margins, growth)

import { db } from "./db";

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

  companyScore: number;
  allocationGapScore: number;
  diversificationScore: number;
  watchlistScore: number;
  brainAlignmentScore: number;
  opportunityScore: number;

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
  if (assetType === "etf") return 50; // ETFs are valid but not pure quality compounders
  if (!f) return 25; // No fundamentals = unknown quality

  let score = 0;

  // ROIC: primary signal for Buffett/Lynch capital efficiency
  if (f.roic != null) {
    if (f.roic >= 30) score += 35;
    else if (f.roic >= 20) score += 25;
    else if (f.roic >= 10) score += 15;
    // below 10% = 0 points (fails quality threshold)
  }

  // Gross margin: pricing power / economic moat
  if (f.grossMargin != null) {
    if (f.grossMargin >= 60) score += 25;
    else if (f.grossMargin >= 40) score += 15;
    else if (f.grossMargin >= 20) score += 5;
  }

  // Growth: EPS preferred (earnings quality), fallback to revenue
  const bestGrowth = f.epsGrowth ?? f.revenueGrowth;
  if (bestGrowth != null) {
    if (bestGrowth >= 20) score += 25;
    else if (bestGrowth >= 15) score += 20;
    else if (bestGrowth >= 8) score += 12;
    else if (bestGrowth >= 0) score += 5;
  }

  // Financial strength: D/E < 1 criterion
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
    // No allocation plan: in portfolio = no further target to deploy toward
    return inPortfolio ? 0 : 40;
  }

  const targetUsd = target.targetUsd;
  if (targetUsd <= 0) return 50;

  const deployed = inPortfolio ? (currentUsd ?? 0) : 0;
  const gapRatio = (targetUsd - deployed) / targetUsd;

  if (gapRatio >= 1) return 100; // 100% undeployed
  if (gapRatio <= 0) return 0;   // at or above target

  return clamp(Math.round(gapRatio * 100));
}

function computeDiversificationScore(
  sector: string | null,
  assetType: string,
  sectorExposures: Map<string, number>
): number {
  // ETFs and unknown-sector entries: score how much the portfolio needs diversification
  if (assetType === "etf" || !sector) {
    const maxConcentration = Math.max(...Array.from(sectorExposures.values()), 0);
    return clamp(Math.round(40 + maxConcentration)); // 40–100 based on portfolio concentration
  }

  const exposure = sectorExposures.get(sector) ?? 0;
  // 0% exposure → 100, 50% exposure → 0
  return clamp(Math.round(100 - exposure * 2));
}

function computeSuggestedAllocation(
  tier: string,
  opportunityScore: number,
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
      : opportunityScore > 80 ? 10
      : opportunityScore > 60 ? 7
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

function generateReasoning(
  entry: { ticker: string; companyName: string; sector: string | null; assetType: string },
  scores: {
    companyScore: number;
    allocationGapScore: number;
    diversificationScore: number;
    watchlistScore: number;
    brainAlignmentScore: number;
    opportunityScore: number;
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
  currentUsd: number | null
): OpportunityReasoning {
  const positionType: OpportunityReasoning["positionType"] =
    inPortfolio && target && (currentUsd ?? 0) < target.targetUsd
      ? "add"
      : inPortfolio
      ? "hold"
      : "initiate";

  // Why Buy
  const whyBuyParts: string[] = [];
  if (entry.assetType === "etf") {
    whyBuyParts.push(`Broad market exposure via ${entry.companyName}`);
  } else {
    if (scores.companyScore >= 85) {
      whyBuyParts.push(`Exceptional quality score ${scores.companyScore}/100`);
    } else if (scores.companyScore >= 70) {
      whyBuyParts.push(`High-quality business scoring ${scores.companyScore}/100`);
    } else {
      whyBuyParts.push(`Quality score ${scores.companyScore}/100`);
    }
    if (f?.roic != null && f.roic >= 25) {
      whyBuyParts.push(`outstanding capital efficiency (${f.roic}% ROIC)`);
    }
    if (f?.grossMargin != null && f.grossMargin >= 60) {
      whyBuyParts.push(`strong pricing power (${f.grossMargin}% gross margin)`);
    }
    if (f?.epsGrowth != null && f.epsGrowth >= 20) {
      whyBuyParts.push(`${f.epsGrowth}% EPS growth`);
    } else if (f?.revenueGrowth != null && f.revenueGrowth >= 15) {
      whyBuyParts.push(`${f.revenueGrowth}% revenue growth`);
    }
    if (f?.debtToEquity != null && f.debtToEquity < 0.3) {
      whyBuyParts.push(`fortress balance sheet (${f.debtToEquity} D/E)`);
    }
  }

  const whyBuy = whyBuyParts.join(" · ") + ".";

  // Why Now
  let whyNow: string;
  if (scores.allocationGapScore >= 80 && target) {
    const deployedPct = Math.max(0, 100 - scores.allocationGapScore);
    whyNow = `Only ${deployedPct}% deployed toward ${target.targetPct}% target — highest capital deployment priority.`;
  } else if (scores.watchlistScore === 100) {
    whyNow = "Already on watchlist — converting research conviction into position.";
  } else if (scores.diversificationScore >= 75 && entry.sector) {
    whyNow = `Portfolio has limited ${entry.sector} exposure — adds meaningful diversification.`;
  } else if (scores.allocationGapScore >= 50 && target) {
    whyNow = `${Math.round(scores.allocationGapScore)}% gap remaining to ${target.targetPct}% allocation target.`;
  } else if (scores.brainAlignmentScore >= 80) {
    whyNow = "Strongly aligns with quality-compounder philosophy — passes ROIC, margin, and growth criteria.";
  } else {
    whyNow = "Fits long-term quality portfolio construction strategy.";
  }

  // Portfolio Impact
  const impactParts: string[] = [];
  if (positionType === "initiate") {
    impactParts.push(`Opens ${entry.sector ?? entry.assetType} exposure`);
  } else if (positionType === "add" && target) {
    const gapUsd = target.targetUsd - (currentUsd ?? 0);
    impactParts.push(`Closes $${Math.round(gapUsd).toLocaleString()} gap toward ${target.targetPct}% target`);
  }
  if (scores.diversificationScore >= 70 && entry.assetType !== "etf") {
    impactParts.push("reduces sector concentration");
  }
  if (impactParts.length === 0) {
    impactParts.push("Maintains quality tilt of portfolio");
  }

  const portfolioImpact = impactParts.join("; ") + ".";

  return { whyBuy, whyNow, portfolioImpact, positionType };
}

// ─── Supporting / contradicting factors ───────────────────────────────────────

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

  if (scores.allocationGapScore >= 80) supporting.push(`${Math.round(scores.allocationGapScore)}% allocation gap — strong deployment priority`);
  else if (scores.allocationGapScore >= 50) supporting.push("Partially deployed toward allocation target");
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

  return { supportingFactors: supporting, contradictingFactors: contradicting };
}

// ─── Main engine ──────────────────────────────────────────────────────────────

export async function computeOpportunities(): Promise<OpportunityResult> {
  const [universeEntries, positions, watchlistItems, allocationTargets, settings] =
    await Promise.all([
      db.universe.findMany({
        where: { status: "active" },
        include: {
          fundamentals: true,
          scores: { orderBy: { scoredAt: "desc" }, take: 1 },
        },
      }),
      db.position.findMany({ where: { status: "active" } }),
      db.watchlist.findMany(),
      db.allocationTarget.findMany(),
      db.portfolioSettings.findFirst(),
    ]);

  const totalCapitalUsd = settings?.totalCapitalUsd ?? 0;
  const cashPos = positions.find(p => p.ticker === "CASH");
  const availableCashUsd = cashPos?.currentValueUsd ?? 0;

  const posMap = new Map(positions.map(p => [p.ticker, p]));
  const watchlistSet = new Set(watchlistItems.map(w => w.ticker));
  const targetMap = new Map(allocationTargets.map(t => [t.ticker, t]));

  // Compute portfolio sector exposures from active non-CASH equity positions
  const sectorExposures = new Map<string, number>();
  for (const p of positions) {
    if (p.ticker === "CASH" || !p.sector) continue;
    const pct = p.allocationPct ?? 0;
    if (pct > 0) {
      sectorExposures.set(p.sector, (sectorExposures.get(p.sector) ?? 0) + pct);
    }
  }

  const entries: OpportunityEntry[] = [];

  for (const u of universeEntries) {
    const latestScore = u.scores[0] ?? null;
    const companyScore = r1(latestScore?.totalScore ?? 0);
    const f = u.fundamentals;
    const position = posMap.get(u.ticker) ?? null;
    const inPortfolio = position !== null;
    const inWatchlist = watchlistSet.has(u.ticker);
    const target = targetMap.get(u.ticker) ?? null;

    const allocationGapScore = computeAllocationGapScore(
      inPortfolio,
      position?.currentValueUsd ?? null,
      target
    );

    const diversificationScore = computeDiversificationScore(
      u.sector,
      u.assetType,
      sectorExposures
    );

    const watchlistScore = inWatchlist ? 100 : 0;

    const brainAlignmentScore = computeBrainAlignmentScore(
      f
        ? {
            grossMargin: f.grossMargin,
            revenueGrowth: f.revenueGrowth,
            epsGrowth: f.epsGrowth,
            debtToEquity: f.debtToEquity,
            roic: f.roic,
          }
        : null,
      u.assetType
    );

    const opportunityScore = r1(
      companyScore * 0.40 +
      allocationGapScore * 0.25 +
      diversificationScore * 0.15 +
      watchlistScore * 0.10 +
      brainAlignmentScore * 0.10
    );

    const reasoning = generateReasoning(
      { ticker: u.ticker, companyName: u.companyName, sector: u.sector, assetType: u.assetType },
      { companyScore, allocationGapScore, diversificationScore, watchlistScore, brainAlignmentScore, opportunityScore },
      f
        ? {
            grossMargin: f.grossMargin,
            revenueGrowth: f.revenueGrowth,
            epsGrowth: f.epsGrowth,
            roic: f.roic,
            debtToEquity: f.debtToEquity,
          }
        : null,
      target ? { targetPct: target.targetPct, targetUsd: target.targetUsd, bucket: target.bucket } : null,
      inPortfolio,
      position?.currentValueUsd ?? null
    );

    const suggestedAllocation = computeSuggestedAllocation(
      u.universeTier,
      opportunityScore,
      target ? { targetPct: target.targetPct, targetUsd: target.targetUsd } : null,
      totalCapitalUsd
    );

    const { supportingFactors, contradictingFactors } = computeFactors(
      inPortfolio,
      inWatchlist,
      u.sector,
      u.assetType,
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
      opportunityScore,
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
      currentValue: position
        ? { usd: position.currentValueUsd, allocationPct: position.allocationPct }
        : null,
      reasoning,
      suggestedAllocation,
      supportingFactors,
      contradictingFactors,
    });
  }

  entries.sort((a, b) => b.opportunityScore - a.opportunityScore);

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
      opportunityScore: e.opportunityScore,
      reasoning: JSON.stringify(e.reasoning),
    })),
  });
}
