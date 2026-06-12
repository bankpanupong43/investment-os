import { db } from "./db";
import { computeOpportunities } from "./opportunity-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BucketId = "growth" | "healthcare" | "defense" | "gold" | "cash" | "broad" | "other";

export type DriverSource = "REGIME" | "OPPORTUNITY" | "HEDGE" | "CONCENTRATION";

export interface AllocationDriver {
  bucket: BucketId;
  source: DriverSource;
  description: string;
  adjustmentPct: number;
  confidence: number;
}

export interface BucketDriverSummary {
  bucket: BucketId;
  label: string;
  baseAllocation: number;
  regimeAdjustment: number;
  regimeDescription: string;
  opportunityAdjustment: number;
  opportunityDescription: string;
  hedgeAdjustment: number;
  hedgeDescription: string;
  concentrationAdjustment: number;
  concentrationDescription: string;
  finalAllocation: number;
}

export interface BucketAllocation {
  bucket: BucketId;
  label: string;
  currentPct: number;
  targetPct: number;
  gapPct: number; // positive = underweight, negative = overweight
  tickers: string[];
}

export interface AllocationGap {
  bucket: BucketId;
  label: string;
  currentPct: number;
  targetPct: number;
  gapPct: number;
  direction: "underweight" | "overweight" | "balanced";
  tickers: string[];
}

export interface ConcentrationMetric {
  topPosition: { ticker: string; pct: number };
  top5Pct: number;
  mag7Pct: number;
  sectorBreakdown: { sector: string; pct: number }[];
}

export interface AllocationRecommendation {
  rank: number;
  bucket: BucketId;
  action: "ADD" | "REDUCE" | "HOLD";
  currentPct: number;
  targetPct: number;
  gapPct: number;
  reason: string;
  implementationTickers: string[];
}

export interface AllocationReview {
  generatedAt: Date;
  regime: string;
  scenario: string;
  buckets: BucketAllocation[];
  allocationGrade: string;
  allocationScore: number;
  alignmentPct: number;
  gapAnalysis: AllocationGap[];
  concentration: ConcentrationMetric;
  recommendations: AllocationRecommendation[];
  largestUnderweight: AllocationGap | null;
  largestOverweight: AllocationGap | null;
  bucketDriverSummaries: BucketDriverSummary[];
  topDriver: string;
}

// ─── Configuration ────────────────────────────────────────────────────────────

export const BUCKET_MAP: Record<string, BucketId> = {
  NVDA: "growth", MSFT: "growth", META: "growth", GOOGL: "growth", GOOG: "growth",
  AMZN: "growth", AAPL: "growth", TSM: "growth", ASML: "growth", SMCI: "growth",
  CRWD: "growth", NET: "growth", AMD: "growth", SHOP: "growth", MELI: "growth",
  QCOM: "growth",
  LLY: "healthcare", NVO: "healthcare", JNJ: "healthcare", UNH: "healthcare",
  ABBV: "healthcare", MRK: "healthcare",
  ITA: "defense", LMT: "defense", RTX: "defense", NOC: "defense", GD: "defense",
  GLDM: "gold", GLD: "gold", IAU: "gold",
  CASH: "cash", SGOV: "cash", SHY: "cash", TLT: "cash", BND: "cash",
  VOO: "broad", SPY: "broad", VTI: "broad", QQQ: "broad", IJH: "broad", VTWO: "broad",
};

export const BUCKET_LABELS: Record<BucketId, string> = {
  growth:     "Growth Equities",
  healthcare: "Healthcare",
  defense:    "Defense",
  gold:       "Gold / Hedges",
  cash:       "Cash & Equivalents",
  broad:      "Broad Market",
  other:      "Other",
};

// Neutral regime allocation — used as the driver baseline
export const NEUTRAL_BASE: Record<BucketId, number> = {
  growth: 40, healthcare: 10, defense: 10, gold: 5, cash: 30, broad: 5, other: 0,
};

// Regime-based target templates
export const REGIME_TARGETS: Record<string, Record<BucketId, number>> = {
  "Risk On":  { growth: 70, healthcare: 10, defense: 5,  gold: 0,  cash: 15, broad: 0, other: 0 },
  "Neutral":  { growth: 40, healthcare: 10, defense: 10, gold: 5,  cash: 30, broad: 5, other: 0 },
  "Risk Off": { growth: 20, healthcare: 15, defense: 10, gold: 10, cash: 45, broad: 0, other: 0 },
};

export const REGIME_SCENARIO_NAMES: Record<string, string> = {
  "Risk On":  "AI Expansion",
  "Neutral":  "Balanced",
  "Risk Off": "Recession",
};

const HEDGE_VERDICT_GOLD_ADJ: Record<string, number> = {
  KEEP: 0, REDUCE: -5, REPLACE: -5, REMOVE: -10,
};

const MAG7 = new Set(["AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "META", "NVDA"]);
export const ALL_BUCKETS: BucketId[] = ["growth", "healthcare", "defense", "gold", "cash", "broad", "other"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseJson<T>(s: string, fallback: T): T {
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

function gradeFromAlignment(pct: number): string {
  if (pct >= 90) return "A";
  if (pct >= 75) return "B";
  if (pct >= 60) return "C";
  if (pct >= 45) return "D";
  return "F";
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function generateAllocationReview(
  precomputedOpps?: { ticker: string; objectiveScore: number }[]
): Promise<AllocationReview> {
  const now = new Date();

  const [positions, brief, archReview] = await Promise.all([
    db.position.findMany({ where: { status: "active" } }),
    db.morningBrief.findFirst({ orderBy: { briefingDate: "desc" } }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).portfolioArchitectureReview.findFirst({ orderBy: { reviewDate: "desc" } }).catch(() => null),
  ]);

  let oppEntries = precomputedOpps ?? [] as { ticker: string; objectiveScore: number }[];
  if (!precomputedOpps) {
    try {
      const result = await computeOpportunities();
      oppEntries = result.entries;
    } catch { /* best effort */ }
  }

  // ── Current allocation — needed first for concentration drivers ──
  const bucketCurrent: Record<BucketId, { pct: number; tickers: string[] }> = {
    growth: { pct: 0, tickers: [] }, healthcare: { pct: 0, tickers: [] },
    defense: { pct: 0, tickers: [] }, gold: { pct: 0, tickers: [] },
    cash: { pct: 0, tickers: [] }, broad: { pct: 0, tickers: [] }, other: { pct: 0, tickers: [] },
  };
  const totalValue = positions.reduce((s, p) => s + (p.currentValueUsd ?? 0), 0);
  for (const pos of positions) {
    const b = BUCKET_MAP[pos.ticker] ?? "other";
    const pct = pos.allocationPct ?? (totalValue > 0 ? ((pos.currentValueUsd ?? 0) / totalValue) * 100 : 0);
    bucketCurrent[b].pct += pct;
    bucketCurrent[b].tickers.push(pos.ticker);
  }

  // Concentration metrics (needed for concentration driver computation)
  const equityPos = positions
    .filter(p => p.ticker !== "CASH")
    .sort((a, b) => (b.allocationPct ?? 0) - (a.allocationPct ?? 0));
  const top5Pct = equityPos.slice(0, 5).reduce((s, p) => s + (p.allocationPct ?? 0), 0);
  const mag7Pct = positions.filter(p => MAG7.has(p.ticker)).reduce((s, p) => s + (p.allocationPct ?? 0), 0);

  const sectorMap: Record<string, number> = {};
  for (const p of positions) {
    if (p.ticker === "CASH") continue;
    const s = p.sector ?? "Unknown";
    sectorMap[s] = (sectorMap[s] ?? 0) + (p.allocationPct ?? 0);
  }
  const sectorBreakdown = Object.entries(sectorMap)
    .sort((a, b) => b[1] - a[1])
    .map(([sector, pct]) => ({ sector, pct: Math.round(pct * 10) / 10 }));

  const topPos = equityPos[0];
  const concentration: ConcentrationMetric = {
    topPosition: { ticker: topPos?.ticker ?? "—", pct: Math.round((topPos?.allocationPct ?? 0) * 10) / 10 },
    top5Pct: Math.round(top5Pct * 10) / 10,
    mag7Pct: Math.round(mag7Pct * 10) / 10,
    sectorBreakdown,
  };

  // ── Target allocation with tracked adjustments ───────────────
  const regime = brief?.marketRegime ?? "Neutral";
  const scenario = REGIME_SCENARIO_NAMES[regime] ?? "Balanced";
  const regimeTemplate = REGIME_TARGETS[regime] ?? REGIME_TARGETS["Neutral"];

  // Per-bucket adjustment trackers
  const regimeAdj: Record<BucketId, number>    = {} as Record<BucketId, number>;
  const oppAdj: Record<BucketId, number>        = {} as Record<BucketId, number>;
  const hedgeAdj: Record<BucketId, number>      = {} as Record<BucketId, number>;
  const concAdj: Record<BucketId, number>       = {} as Record<BucketId, number>;
  const oppDesc: Record<BucketId, string>       = {} as Record<BucketId, string>;
  const hedgeDesc: Record<BucketId, string>     = {} as Record<BucketId, string>;
  const concDesc: Record<BucketId, string>      = {} as Record<BucketId, string>;

  for (const b of ALL_BUCKETS) {
    regimeAdj[b] = (regimeTemplate[b] ?? 0) - NEUTRAL_BASE[b];
    oppAdj[b] = 0;
    hedgeAdj[b] = 0;
    concAdj[b] = 0;
    oppDesc[b] = "";
    hedgeDesc[b] = "";
    concDesc[b] = "";
  }

  // Build target from regime template (regime adjustment already tracked above)
  const target = { ...regimeTemplate } as Record<BucketId, number>;

  // Opportunity overlay
  const bucketBestScore: Partial<Record<BucketId, number>> = {};
  const bucketTopTickers: Partial<Record<BucketId, string[]>> = {};
  for (const e of oppEntries) {
    const b = BUCKET_MAP[e.ticker];
    if (!b || e.objectiveScore < 70) continue;
    if ((bucketBestScore[b] ?? 0) < e.objectiveScore) bucketBestScore[b] = e.objectiveScore;
    if (!bucketTopTickers[b]) bucketTopTickers[b] = [];
    if ((bucketTopTickers[b]!.length < 3)) bucketTopTickers[b]!.push(`${e.ticker} ${e.objectiveScore.toFixed(0)}`);
  }
  let oppAdjUsed = 0;
  for (const [b, score] of Object.entries(bucketBestScore) as [BucketId, number][]) {
    if ((target[b] ?? 0) === 0) continue;
    const raw = score > 90 ? 5 : score > 80 ? 3 : 1;
    const capped = Math.min(raw, 10 - oppAdjUsed);
    if (capped > 0) {
      target[b] += capped;
      oppAdj[b] = capped;
      oppAdjUsed += capped;
      oppDesc[b] = (bucketTopTickers[b] ?? []).join(", ") || `Score ${score.toFixed(0)}`;
    }
  }

  // Hedge overlay (gold target adjustment)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hedgeAudit = archReview?.hedgeAuditDetail ? parseJson<any>(archReview.hedgeAuditDetail, null) : null;
  if (hedgeAudit?.verdict) {
    const adj = HEDGE_VERDICT_GOLD_ADJ[hedgeAudit.verdict as string] ?? 0;
    if (adj < 0) {
      target.gold = Math.max(0, target.gold + adj);
      hedgeAdj.gold = Math.max(-target.gold - (adj - hedgeAdj.gold), adj); // capped
      hedgeDesc.gold = `Hedge audit: ${hedgeAudit.verdict}`;
    }
  }

  // Concentration overlay (based on current portfolio state)
  if (mag7Pct > 30) {
    const penalty = -5;
    target.growth = Math.max(0, target.growth + penalty);
    concAdj.growth += penalty;
    concDesc.growth = `Mag7 ${mag7Pct.toFixed(0)}% > 30% limit`;
  }
  const topBucket = topPos ? (BUCKET_MAP[topPos.ticker] as BucketId | undefined) : undefined;
  if (topPos && (topPos.allocationPct ?? 0) > 20 && topBucket && topBucket !== "cash") {
    const penalty = -3;
    target[topBucket] = Math.max(0, target[topBucket] + penalty);
    concAdj[topBucket] = (concAdj[topBucket] ?? 0) + penalty;
    concDesc[topBucket] = (concDesc[topBucket] ? concDesc[topBucket] + "; " : "") +
      `${topPos.ticker} ${(topPos.allocationPct ?? 0).toFixed(0)}% > 20% limit`;
  }

  // Normalize to 100%
  const rawTotal = ALL_BUCKETS.reduce((s, b) => s + (target[b] ?? 0), 0);
  const targetPcts = { ...target } as Record<BucketId, number>;
  if (rawTotal > 0 && Math.abs(rawTotal - 100) > 0.5) {
    for (const b of ALL_BUCKETS) targetPcts[b] = (targetPcts[b] / rawTotal) * 100;
  }

  // ── Driver summaries ─────────────────────────────────────────
  const regimeDesc = regime !== "Neutral" ? `${scenario} regime` : "";
  const bucketDriverSummaries: BucketDriverSummary[] = ALL_BUCKETS
    .filter(b => bucketCurrent[b].pct > 0 || targetPcts[b] > 0)
    .map(b => ({
      bucket: b,
      label: BUCKET_LABELS[b],
      baseAllocation: NEUTRAL_BASE[b],
      regimeAdjustment: Math.round(regimeAdj[b] * 10) / 10,
      regimeDescription: regimeAdj[b] !== 0 ? regimeDesc : "",
      opportunityAdjustment: Math.round(oppAdj[b] * 10) / 10,
      opportunityDescription: oppDesc[b] ?? "",
      hedgeAdjustment: Math.round(hedgeAdj[b] * 10) / 10,
      hedgeDescription: hedgeDesc[b] ?? "",
      concentrationAdjustment: Math.round(concAdj[b] * 10) / 10,
      concentrationDescription: concDesc[b] ?? "",
      finalAllocation: Math.round(targetPcts[b] * 10) / 10,
    }));

  // Top driver = single largest absolute adjustment across all buckets
  let topDriver = "Neutral allocation — no active drivers";
  let maxAbsAdj = 0;
  for (const d of bucketDriverSummaries) {
    const entries: { adj: number; desc: string; label: string }[] = [
      { adj: d.regimeAdjustment,      desc: d.regimeDescription,       label: d.label },
      { adj: d.opportunityAdjustment, desc: d.opportunityDescription,  label: d.label },
      { adj: d.hedgeAdjustment,       desc: d.hedgeDescription,        label: d.label },
      { adj: d.concentrationAdjustment, desc: d.concentrationDescription, label: d.label },
    ];
    for (const e of entries) {
      if (e.desc && Math.abs(e.adj) > maxAbsAdj) {
        maxAbsAdj = Math.abs(e.adj);
        topDriver = `${e.desc} (${e.adj > 0 ? "+" : ""}${e.adj.toFixed(0)}% ${e.label})`;
      }
    }
  }

  // ── Gap analysis ─────────────────────────────────────────────
  const gapAnalysis: AllocationGap[] = ALL_BUCKETS.map(b => {
    const curr = Math.round(bucketCurrent[b].pct * 10) / 10;
    const tgt  = Math.round(targetPcts[b] * 10) / 10;
    const gap  = Math.round((tgt - curr) * 10) / 10;
    return {
      bucket: b, label: BUCKET_LABELS[b],
      currentPct: curr, targetPct: tgt, gapPct: gap,
      direction: (Math.abs(gap) < 2 ? "balanced" : gap > 0 ? "underweight" : "overweight") as AllocationGap["direction"],
      tickers: bucketCurrent[b].tickers,
    };
  }).filter(g => g.currentPct > 0 || g.targetPct > 0);

  const sumAbsGap = gapAnalysis.reduce((s, g) => s + Math.abs(g.gapPct), 0);
  const alignmentPct = Math.max(0, Math.round(100 - sumAbsGap / 2));
  const allocationGrade = gradeFromAlignment(alignmentPct);

  // ── Recommendations ──────────────────────────────────────────
  const significantGaps = [...gapAnalysis]
    .filter(g => Math.abs(g.gapPct) >= 3)
    .sort((a, b) => Math.abs(b.gapPct) - Math.abs(a.gapPct));

  const recommendations: AllocationRecommendation[] = significantGaps.slice(0, 5).map((gap, i) => {
    const action: "ADD" | "REDUCE" = gap.gapPct > 0 ? "ADD" : "REDUCE";
    const fallbackTickers =
      gap.bucket === "growth" ? ["NVDA", "AMZN"] :
      gap.bucket === "gold" ? ["GLDM"] :
      gap.bucket === "defense" ? ["ITA"] :
      gap.bucket === "cash" ? ["CASH"] : [];
    return {
      rank: i + 1, bucket: gap.bucket, action,
      currentPct: gap.currentPct, targetPct: gap.targetPct,
      gapPct: Math.abs(gap.gapPct),
      reason: action === "ADD"
        ? `${gap.label} is underweight by ${Math.abs(gap.gapPct).toFixed(1)}%. ${regime} regime target: ${gap.targetPct.toFixed(0)}%.`
        : `${gap.label} is overweight by ${Math.abs(gap.gapPct).toFixed(1)}%. ${regime} regime target: ${gap.targetPct.toFixed(0)}%.`,
      implementationTickers: gap.tickers.length > 0 ? gap.tickers : fallbackTickers,
    };
  });

  const buckets: BucketAllocation[] = ALL_BUCKETS
    .filter(b => bucketCurrent[b].pct > 0 || targetPcts[b] > 0)
    .map(b => ({
      bucket: b, label: BUCKET_LABELS[b],
      currentPct: Math.round(bucketCurrent[b].pct * 10) / 10,
      targetPct: Math.round(targetPcts[b] * 10) / 10,
      gapPct: Math.round((targetPcts[b] - bucketCurrent[b].pct) * 10) / 10,
      tickers: bucketCurrent[b].tickers,
    }));

  const underweightGaps = gapAnalysis.filter(g => g.direction === "underweight").sort((a, b) => b.gapPct - a.gapPct);
  const overweightGaps  = gapAnalysis.filter(g => g.direction === "overweight").sort((a, b) => a.gapPct - b.gapPct);

  return {
    generatedAt: now, regime, scenario,
    buckets, allocationGrade, allocationScore: alignmentPct,
    alignmentPct, gapAnalysis, concentration, recommendations,
    largestUnderweight: underweightGaps[0] ?? null,
    largestOverweight:  overweightGaps[0] ?? null,
    bucketDriverSummaries, topDriver,
  };
}
