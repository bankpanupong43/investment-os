// Decision Engine — Phase 29
//
// Aggregates signals from all existing engines into a single prioritized
// "What should I do next?" action queue. Zero new scoring logic — this
// engine only reads and ranks signals that already exist.
//
// Priority order:
//   1. EXIT      — triggered kill conditions, broken theses
//   2. DEPLOY    — committee Strong Buy / Buy not yet in portfolio
//   3. TRIM      — overweight positions with weakening theses
//   4. REBALANCE — bucket allocation gaps > 5%
//   5. RESEARCH  — high-priority themes not yet studied
//   6. MONITOR   — weakening theses, overdue reviews

import { db } from "./db";
import { generateAllocationReview } from "./allocation-engine";
import { generateResearchQueue } from "./research-queue-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ActionType = "EXIT" | "DEPLOY" | "TRIM" | "REBALANCE" | "RESEARCH" | "MONITOR";
export type Urgency = "critical" | "high" | "medium" | "low";

export interface ActionItem {
  id: string;
  priority: number;
  type: ActionType;
  urgency: Urgency;
  title: string;
  description: string;
  ticker?: string;
  companyName?: string;
  dollarAmount?: number;
  pctGap?: number;
  source: string;
  actionableBy: string;
  bucketTickers?: string[];  // REBALANCE only: tickers in this allocation bucket
}

export interface DecisionQueue {
  actions: ActionItem[];
  totalCount: number;
  criticalCount: number;
  highCount: number;
  regime: string;
  portfolioTotalUsd: number;
  availableCashUsd: number;
  generatedAt: string;
}

// ─── Urgency ordering ─────────────────────────────────────────────────────────

const URGENCY_RANK: Record<Urgency, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const TYPE_RANK: Record<ActionType, number> = {
  EXIT: 0,
  DEPLOY: 1,
  TRIM: 2,
  REBALANCE: 3,
  RESEARCH: 4,
  MONITOR: 5,
};

// ─── Signal gatherers ─────────────────────────────────────────────────────────

async function gatherExitSignals(portfolioTickers: Set<string>): Promise<ActionItem[]> {
  const items: ActionItem[] = [];

  // Triggered kill conditions
  const kills = await db.killCondition.findMany({
    where: { status: "triggered" },
    include: { position: { select: { ticker: true, name: true, currentValueUsd: true, allocationPct: true } } },
    orderBy: { triggeredAt: "desc" },
  });

  for (const kill of kills) {
    const pos = kill.position;
    items.push({
      id: `exit-kill-${kill.id}`,
      priority: 0,
      type: "EXIT",
      urgency: "critical",
      title: `Exit ${pos.ticker} — Kill Condition Triggered`,
      description: kill.triggeredNote ?? kill.description,
      ticker: pos.ticker,
      companyName: pos.name,
      dollarAmount: pos.currentValueUsd ?? undefined,
      source: "KillConditionChecker",
      actionableBy: "Review position immediately. Decide: sell full position or acknowledge and hold with revised thesis.",
    });
  }

  // Broken theses
  const brokenTheses = await db.thesis.findMany({
    where: { healthStatus: "broken" },
    include: { position: { select: { ticker: true, name: true, currentValueUsd: true, status: true } } },
  });

  for (const thesis of brokenTheses) {
    const pos = thesis.position;
    if (pos.status !== "active") continue;
    const alreadyHasKill = items.some(i => i.ticker === pos.ticker);
    if (alreadyHasKill) continue;

    items.push({
      id: `exit-thesis-${thesis.id}`,
      priority: 0,
      type: "EXIT",
      urgency: "critical",
      title: `Exit ${pos.ticker} — Thesis Broken`,
      description: thesis.currentAssessment ?? "Thesis health marked as broken. Original investment case no longer holds.",
      ticker: pos.ticker,
      companyName: pos.name,
      dollarAmount: pos.currentValueUsd ?? undefined,
      source: "ThesisMonitor",
      actionableBy: "Read latest thesis assessment. If thesis is irreparably broken, close position.",
    });
  }

  // Recent kill_criteria_triggered from filings (last 30 days)
  const recentKillFilings = await db.thesisImpactRecord.findMany({
    where: {
      impactLevel: "kill_criteria_triggered",
      createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: "desc" },
  });

  const filingKillTickers = new Set(items.map(i => i.ticker));
  for (const rec of recentKillFilings) {
    if (!portfolioTickers.has(rec.ticker)) continue;
    if (filingKillTickers.has(rec.ticker)) continue;
    filingKillTickers.add(rec.ticker);

    items.push({
      id: `exit-filing-${rec.id}`,
      priority: 0,
      type: "EXIT",
      urgency: "critical",
      title: `Exit ${rec.ticker} — Filing Triggered Kill Criteria`,
      description: rec.reasoning,
      ticker: rec.ticker,
      source: "ThesisImpactEngine",
      actionableBy: "Review the filing impact assessment. Confirm kill criteria breach before exiting.",
    });
  }

  return items;
}

async function gatherDeploySignals(
  portfolioTickers: Set<string>,
  availableCashUsd: number,
): Promise<ActionItem[]> {
  if (availableCashUsd < 500) return [];

  // Only include sessions from the last 90 days — older conviction is stale
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  // Latest committee session per ticker, conviction Strong Buy or Buy
  const sessions = await db.committeeSession.findMany({
    where: {
      conviction: { in: ["Strong Buy", "Buy"] },
      createdAt: { gte: ninetyDaysAgo },
    },
    orderBy: { createdAt: "desc" },
  });

  // Dedupe: keep latest session per ticker
  const latestByTicker = new Map<string, typeof sessions[0]>();
  for (const s of sessions) {
    if (!latestByTicker.has(s.ticker)) latestByTicker.set(s.ticker, s);
  }

  const items: ActionItem[] = [];

  for (const [ticker, session] of latestByTicker) {
    if (portfolioTickers.has(ticker)) continue;

    let convictionLevel = 7;
    let suggestedUsd: number | undefined;
    let positionSizeRationale = "";

    try {
      const fd = JSON.parse(session.finalDecision);
      convictionLevel = fd.convictionLevel ?? 7;
      if (fd.suggestedAllocation) {
        suggestedUsd = Math.min(fd.suggestedAllocation.starterUsd ?? 0, availableCashUsd);
        positionSizeRationale = fd.suggestedAllocation.rationale ?? "";
      }
    } catch {}

    const isStrongBuy = session.conviction === "Strong Buy";
    items.push({
      id: `deploy-${session.id}`,
      priority: 0,
      type: "DEPLOY",
      urgency: isStrongBuy ? "high" : "medium",
      title: `Deploy into ${ticker} — Committee ${session.conviction}`,
      description: positionSizeRationale || `${session.conviction} conviction (${convictionLevel}/10). ${session.companyName || ticker} cleared committee review.`,
      ticker,
      companyName: session.companyName || undefined,
      dollarAmount: suggestedUsd,
      source: "CommitteeEngine",
      actionableBy: isStrongBuy
        ? `Initiate position. Suggested starter: $${suggestedUsd ? Math.round(suggestedUsd).toLocaleString() : "size based on allocation target"}.`
        : `Research dossier if not done. Then size per allocation target.`,
    });
  }

  // Sort Strong Buy first, then by conviction level descending
  items.sort((a, b) => {
    if (a.urgency !== b.urgency) return URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
    return 0;
  });

  return items;
}

async function gatherTrimSignals(
  activePositions: { ticker: string; name: string; allocationPct: number | null; currentValueUsd: number | null }[],
): Promise<ActionItem[]> {
  const items: ActionItem[] = [];

  // Weakening theses on active positions
  const weakeningTheses = await db.thesis.findMany({
    where: { healthStatus: "weakening" },
    include: { position: { select: { ticker: true, name: true, currentValueUsd: true, allocationPct: true, status: true } } },
  });

  // Positions with allocationPct > 20% (concentration risk)
  const concentrated = activePositions.filter(p => (p.allocationPct ?? 0) > 20);

  const addedTickers = new Set<string>();

  for (const thesis of weakeningTheses) {
    const pos = thesis.position;
    if (pos.status !== "active") continue;

    const isConcentrated = (pos.allocationPct ?? 0) > 15;
    addedTickers.add(pos.ticker);

    items.push({
      id: `trim-thesis-${thesis.id}`,
      priority: 0,
      type: "TRIM",
      urgency: isConcentrated ? "high" : "medium",
      title: `Trim ${pos.ticker} — Thesis Weakening`,
      description: thesis.currentAssessment ?? `Health score ${thesis.healthScore}/10. Key assumptions under pressure.`,
      ticker: pos.ticker,
      companyName: pos.name,
      dollarAmount: pos.currentValueUsd ? pos.currentValueUsd * 0.25 : undefined, // suggest trimming ~25%
      pctGap: pos.allocationPct ?? undefined,
      source: "ThesisMonitor",
      actionableBy: "Review latest evaluation. If health score < 6, reduce position by 25–50%.",
    });
  }

  for (const pos of concentrated) {
    if (addedTickers.has(pos.ticker)) continue;
    items.push({
      id: `trim-concentration-${pos.ticker}`,
      priority: 0,
      type: "TRIM",
      urgency: "high",
      title: `Trim ${pos.ticker} — Concentration Risk`,
      description: `${pos.allocationPct?.toFixed(1)}% of portfolio exceeds 20% single-position limit.`,
      ticker: pos.ticker,
      companyName: pos.name,
      dollarAmount: pos.currentValueUsd ? pos.currentValueUsd * 0.15 : undefined,
      pctGap: pos.allocationPct ?? undefined,
      source: "AllocationEngine",
      actionableBy: "Reduce position toward 15% max. Reinvest proceeds in underweight buckets.",
    });
  }

  return items;
}

async function gatherRebalanceSignals(portfolioTotalUsd: number): Promise<ActionItem[]> {
  const items: ActionItem[] = [];

  try {
    const review = await generateAllocationReview();
    const significantGaps = review.gapAnalysis.filter(g =>
      g.direction !== "balanced" && Math.abs(g.gapPct) >= 5
    );

    for (const gap of significantGaps.slice(0, 4)) {
      const dollarAmount = Math.abs(gap.gapPct / 100) * portfolioTotalUsd;
      const isLarge = Math.abs(gap.gapPct) >= 10;
      items.push({
        id: `rebalance-${gap.bucket}`,
        priority: 0,
        type: "REBALANCE",
        urgency: isLarge ? "high" : "medium",
        title: `${gap.direction === "underweight" ? "Add" : "Reduce"} ${gap.label} (${gap.gapPct > 0 ? "+" : ""}${gap.gapPct.toFixed(1)}%)`,
        description: `Current ${gap.currentPct.toFixed(1)}% vs target ${gap.targetPct.toFixed(1)}%. Gap: $${Math.round(dollarAmount).toLocaleString()}.`,
        pctGap: gap.gapPct,
        dollarAmount: Math.round(dollarAmount),
        source: "AllocationEngine",
        actionableBy: gap.direction === "underweight"
          ? `Deploy ~$${Math.round(dollarAmount).toLocaleString()} into ${gap.label} holdings: ${gap.tickers.slice(0, 3).join(", ")}.`
          : `Trim ~$${Math.round(dollarAmount).toLocaleString()} from ${gap.label} holdings: ${gap.tickers.slice(0, 3).join(", ")}.`,
        bucketTickers: gap.tickers,
      });
    }
  } catch {}

  return items;
}

async function gatherResearchSignals(): Promise<ActionItem[]> {
  const items: ActionItem[] = [];

  try {
    const queue = await generateResearchQueue();
    for (const target of queue.topResearchTargets.slice(0, 3)) {
      const isHighPriority = target.researchPriority >= 70;
      const topCandidate = target.candidates[0];
      items.push({
        id: `research-${target.theme.replace(/\s+/g, "-").toLowerCase()}`,
        priority: 0,
        type: "RESEARCH",
        urgency: isHighPriority ? "medium" : "low",
        title: `Research ${target.theme} Theme`,
        description: target.whyNow,
        ticker: topCandidate?.ticker,
        source: "ResearchQueueEngine",
        actionableBy: topCandidate
          ? `Start with ${topCandidate.ticker} (radar score ${topCandidate.radarScore}). Generate dossier or run committee session.`
          : `Explore theme candidates. Run ThemeScout refresh for latest signals.`,
      });
    }
  } catch {}

  return items;
}

async function gatherMonitorSignals(portfolioTickers: Set<string>): Promise<ActionItem[]> {
  const items: ActionItem[] = [];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  // Weakened (not broken) theses with recent filing impact
  const weakenedImpacts = await db.thesisImpactRecord.findMany({
    where: {
      impactLevel: "weakened",
      createdAt: { gte: thirtyDaysAgo },
    },
    orderBy: { createdAt: "desc" },
  });

  const monitoredTickers = new Set<string>();
  for (const impact of weakenedImpacts.slice(0, 3)) {
    if (!portfolioTickers.has(impact.ticker)) continue;
    if (monitoredTickers.has(impact.ticker)) continue;
    monitoredTickers.add(impact.ticker);
    items.push({
      id: `monitor-impact-${impact.id}`,
      priority: 0,
      type: "MONITOR",
      urgency: "low",
      title: `Monitor ${impact.ticker} — Thesis Weakened by Filing`,
      description: impact.reasoning.slice(0, 150) + (impact.reasoning.length > 150 ? "…" : ""),
      ticker: impact.ticker,
      source: "ThesisImpactEngine",
      actionableBy: "Read filing impact. Schedule thesis review if 2+ consecutive weakening signals.",
    });
  }

  // Overdue thesis reviews (quarterly = >30d, annual = >90d)
  const theses = await db.thesis.findMany({
    where: { position: { status: "active" } },
    include: { position: { select: { ticker: true, name: true } } },
  });

  for (const thesis of theses) {
    const lastReview = thesis.lastReviewedAt;
    if (!lastReview) continue;
    const isOverdue = lastReview < ninetyDaysAgo;
    if (!isOverdue) continue;
    if (monitoredTickers.has(thesis.position.ticker)) continue;

    const daysSince = Math.round((Date.now() - lastReview.getTime()) / (1000 * 60 * 60 * 24));
    items.push({
      id: `monitor-overdue-${thesis.id}`,
      priority: 0,
      type: "MONITOR",
      urgency: "low",
      title: `Review ${thesis.position.ticker} Thesis — ${daysSince}d Since Last Review`,
      description: `Thesis health: ${thesis.healthStatus} (${thesis.healthScore}/10). Review recommended every 90 days.`,
      ticker: thesis.position.ticker,
      companyName: thesis.position.name,
      source: "ThesisMonitor",
      actionableBy: "Run thesis evaluation agent or manually update assessment.",
    });
  }

  return items.slice(0, 5);
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function generateDecisionQueue(): Promise<DecisionQueue> {
  // Portfolio context
  const [activePositions, cashAccounts, settings, lastBrief] = await Promise.all([
    db.position.findMany({
      where: { status: "active" },
      select: { ticker: true, name: true, allocationPct: true, currentValueUsd: true },
    }),
    db.cashAccount.findMany({ select: { balance: true } }),
    db.portfolioSettings.findFirst({ select: { totalCapitalUsd: true } }),
    db.morningBrief.findFirst({ orderBy: { briefingDate: "desc" }, select: { marketRegime: true } }),
  ]);

  const portfolioTickers = new Set(activePositions.map(p => p.ticker));
  const portfolioTotalUsd = settings?.totalCapitalUsd ?? 0;
  const availableCashUsd = cashAccounts.reduce((sum, c) => sum + (c.balance ?? 0), 0);
  const regime = lastBrief?.marketRegime ?? "Neutral";

  // Gather all signals in parallel
  const [exits, deploys, trims, rebalances, research, monitors] = await Promise.all([
    gatherExitSignals(portfolioTickers),
    gatherDeploySignals(portfolioTickers, availableCashUsd),
    gatherTrimSignals(activePositions),
    gatherRebalanceSignals(portfolioTotalUsd),
    gatherResearchSignals(),
    gatherMonitorSignals(portfolioTickers),
  ]);

  // Suppress underweight REBALANCE items whose bucket is already covered by a DEPLOY signal.
  // Rationale: deploying into a specific ticker IS the act of filling an underweight bucket —
  // showing both creates duplicate noise for the same intended action.
  const deployTickers = new Set(deploys.map(d => d.ticker).filter((t): t is string => !!t));
  const filteredRebalances = rebalances.filter(r => {
    if (!r.bucketTickers?.length) return true;
    if ((r.pctGap ?? 0) <= 0) return true;  // keep overweight reductions — no DEPLOY covers those
    return !r.bucketTickers.some(t => deployTickers.has(t));
  });

  // Merge, deduplicate by ticker (keep highest priority type per ticker)
  const all = [...exits, ...deploys, ...trims, ...filteredRebalances, ...research, ...monitors];

  // Sort: urgency first, then type order
  all.sort((a, b) => {
    const urgencyDiff = URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
    if (urgencyDiff !== 0) return urgencyDiff;
    return TYPE_RANK[a.type] - TYPE_RANK[b.type];
  });

  // Assign final priority ranks
  all.forEach((item, i) => { item.priority = i + 1; });

  return {
    actions: all,
    totalCount: all.length,
    criticalCount: all.filter(a => a.urgency === "critical").length,
    highCount: all.filter(a => a.urgency === "high").length,
    regime,
    portfolioTotalUsd,
    availableCashUsd,
    generatedAt: new Date().toISOString(),
  };
}
