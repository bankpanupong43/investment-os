// Allocation Simulator — Phase 23
//
// Simulates portfolio allocation scenarios and computes expected outcomes.
// Answers: "What happens if I follow the recommendations?"
//
// Pure calculation — no AI calls. Reuses allocation-engine for current/target.

import { db } from "./db";
import { generateAllocationReview, ALL_BUCKETS, type BucketId } from "./allocation-engine";
import { THEME_IDS, type ThemeId } from "../config/theme-mapping";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ScenarioInput {
  name: string;
  allocations: Partial<Record<BucketId, number>>;
}

export interface ThemeScenarioInput {
  name: string;
  themeAllocations: Partial<Record<ThemeId, number>>;
}

export interface RegimeScore {
  regime: string;
  score: number;
}

export interface SimulationResult {
  scenarioName: string;
  expectedReturn: number;       // 0–100
  expectedDrawdown: number;     // 0–100 protection score (higher = better protected)
  resilienceScore: number;      // 0–100
  concentrationRisk: number;    // 0–100 (higher = more concentrated = more risk)
  hedgeScore: number;           // 0–100
  regimeScores: RegimeScore[];
  improvements: string[];
  degradations: string[];
  allocations: Partial<Record<BucketId, number>>;
}

export interface ComparisonRow {
  metric: string;
  current: number;
  recommended: number;
  delta: number;
  higherIsBetter: boolean;
}

export interface RegimeMatrixRow {
  regime: string;
  current: number;
  recommended: number;
  delta: number;
}

export interface SimulatorMove {
  action: "ADD" | "REDUCE";
  bucket: BucketId;
  label: string;
  gapPct: number;
  tickers: string[];
}

export interface SimulatorResult {
  current: SimulationResult;
  recommended: SimulationResult;
  comparison: ComparisonRow[];
  regimeMatrix: RegimeMatrixRow[];
  regime: string;
  moves: SimulatorMove[];
}

// ─── Domain knowledge tables ──────────────────────────────────────────────────

export const SIM_REGIMES = [
  "AI Expansion",
  "Geopolitical Conflict",
  "Inflation Shock",
  "Dollar Crisis",
  "Recession",
  "Liquidity Crisis",
] as const;

type SimRegime = typeof SIM_REGIMES[number];

// How well each bucket performs in each regime (0–100)
const BUCKET_REGIME_PERF: Record<BucketId, Record<SimRegime, number>> = {
  growth: {
    "AI Expansion":          85,
    "Geopolitical Conflict": 35,
    "Inflation Shock":       40,
    "Dollar Crisis":         50,
    "Recession":             20,
    "Liquidity Crisis":      25,
  },
  midcap: {
    "AI Expansion":          80,
    "Geopolitical Conflict": 30,
    "Inflation Shock":       30,
    "Dollar Crisis":         45,
    "Recession":             15,
    "Liquidity Crisis":      20,
  },
  emerging: {
    "AI Expansion":          70,
    "Geopolitical Conflict": 35,
    "Inflation Shock":       42,
    "Dollar Crisis":         65,
    "Recession":             25,
    "Liquidity Crisis":      22,
  },
  defense: {
    "AI Expansion":          55,
    "Geopolitical Conflict": 90,
    "Inflation Shock":       62,
    "Dollar Crisis":         62,
    "Recession":             55,
    "Liquidity Crisis":      52,
  },
  gold: {
    "AI Expansion":          18,
    "Geopolitical Conflict": 85,
    "Inflation Shock":       92,
    "Dollar Crisis":         90,
    "Recession":             65,
    "Liquidity Crisis":      72,
  },
  cash: {
    "AI Expansion":          22,
    "Geopolitical Conflict": 72,
    "Inflation Shock":       58,
    "Dollar Crisis":         68,
    "Recession":             92,
    "Liquidity Crisis":      88,
  },
  broad: {
    "AI Expansion":          72,
    "Geopolitical Conflict": 40,
    "Inflation Shock":       35,
    "Dollar Crisis":         45,
    "Recession":             30,
    "Liquidity Crisis":      28,
  },
  other: {
    "AI Expansion":          55,
    "Geopolitical Conflict": 45,
    "Inflation Shock":       45,
    "Dollar Crisis":         50,
    "Recession":             35,
    "Liquidity Crisis":      35,
  },
};

// Base long-run expected return potential per bucket (regime-agnostic)
const BUCKET_RETURN_BASE: Record<BucketId, number> = {
  growth:   92,
  midcap:   80,
  emerging: 75,
  broad:    72,
  defense:  58,
  other:    52,
  gold:     38,
  cash:     18,
};

const THEME_TO_BUCKET: Record<ThemeId, BucketId> = {
  "ai-infrastructure": "growth",
  "semiconductors":    "growth",
  "healthcare":        "other",
  "defense":           "defense",
  "cybersecurity":     "growth",
  "consumer":          "growth",
  "financials":        "growth",
  "energy":            "other",
  "cash":              "cash",
  "gold":              "gold",
  "broad":             "broad",
};

function toSimRegime(allocRegime: string): SimRegime {
  const map: Record<string, SimRegime> = {
    "Risk On":  "AI Expansion",
    "Neutral":  "AI Expansion",
    "Risk Off": "Recession",
  };
  return map[allocRegime] ?? "AI Expansion";
}

// ─── Pure scoring functions ───────────────────────────────────────────────────

function computeHedgeScore(allocs: Partial<Record<BucketId, number>>): number {
  const gold    = allocs.gold    ?? 0;
  const cash    = allocs.cash    ?? 0;
  const defense = allocs.defense ?? 0;
  const broad   = allocs.broad   ?? 0;
  let score = 0;
  if      (gold >= 5) score += 35;
  else if (gold >= 3) score += 25;
  else if (gold >  0) score += 12;
  if      (cash >= 8) score += 35;
  else if (cash >= 5) score += 25;
  else if (cash >= 2) score += 15;
  else if (cash >  0) score += 8;
  if      (defense >= 3 || broad >= 3)   score += 20;
  else if (defense >  0 || broad >  0)   score += 12;
  const types = [gold > 0, cash > 0, defense > 0 || broad > 0].filter(Boolean).length;
  score += types >= 3 ? 10 : types === 2 ? 5 : 0;
  return Math.min(100, score);
}

function computeConcentrationRisk(allocs: Partial<Record<BucketId, number>>): number {
  const vals = ALL_BUCKETS.map(b => (allocs[b] ?? 0) / 100);
  const hhi  = vals.reduce((s, v) => s + v * v, 0);
  return Math.round(hhi * 100);
}

function computeExpectedReturn(
  allocs: Partial<Record<BucketId, number>>,
  simRegime: SimRegime,
): number {
  let score = 0;
  for (const b of ALL_BUCKETS) {
    const pct = allocs[b] ?? 0;
    if (pct === 0) continue;
    const base     = BUCKET_RETURN_BASE[b];
    const regScore = BUCKET_REGIME_PERF[b][simRegime];
    // 65% long-run potential, 35% regime-adjusted performance
    score += (pct / 100) * (base * 0.65 + regScore * 0.35);
  }
  return Math.round(score);
}

function computeDrawdownProtection(allocs: Partial<Record<BucketId, number>>): number {
  const cash    = allocs.cash    ?? 0;
  const gold    = allocs.gold    ?? 0;
  const defense = allocs.defense ?? 0;
  const growth  = allocs.growth  ?? 0;
  const broad   = allocs.broad   ?? 0;

  const protectionPct = cash + gold + defense;
  const riskPct       = growth + broad;
  const hhi           = computeConcentrationRisk(allocs) / 100;

  const protectionBase = Math.min(72, (protectionPct / 100) * 95);
  const divBonus       = Math.min(18, (1 - hhi) * 22);
  const riskPenalty    = Math.max(0, (riskPct - 50) * 0.35);

  return Math.max(5, Math.min(95, Math.round(protectionBase + divBonus - riskPenalty)));
}

function computeRegimeScore(
  allocs: Partial<Record<BucketId, number>>,
  regime: SimRegime,
): number {
  let score = 0;
  for (const b of ALL_BUCKETS) {
    const pct = allocs[b] ?? 0;
    if (pct === 0) continue;
    score += (pct / 100) * BUCKET_REGIME_PERF[b][regime];
  }
  return Math.round(score);
}

function computeResilienceScore(allocs: Partial<Record<BucketId, number>>): number {
  const hedgeScore = computeHedgeScore(allocs);
  const hhi        = computeConcentrationRisk(allocs) / 100;
  const divers     = Math.round((1 - hhi) * 100);
  const avgRegime  = Math.round(
    SIM_REGIMES.reduce((s, r) => s + computeRegimeScore(allocs, r), 0) / SIM_REGIMES.length,
  );
  return Math.round(divers * 0.40 + hedgeScore * 0.35 + avgRegime * 0.25);
}

// ─── Core simulation ──────────────────────────────────────────────────────────

function simulate(
  allocs: Partial<Record<BucketId, number>>,
  scenarioName: string,
  simRegime: SimRegime,
): Omit<SimulationResult, "improvements" | "degradations"> {
  return {
    scenarioName,
    expectedReturn:    computeExpectedReturn(allocs, simRegime),
    expectedDrawdown:  computeDrawdownProtection(allocs),
    resilienceScore:   computeResilienceScore(allocs),
    concentrationRisk: computeConcentrationRisk(allocs),
    hedgeScore:        computeHedgeScore(allocs),
    regimeScores:      SIM_REGIMES.map(r => ({ regime: r, score: computeRegimeScore(allocs, r) })),
    allocations:       allocs,
  };
}

function buildDiffs(
  rec:      Omit<SimulationResult, "improvements" | "degradations">,
  baseline: Omit<SimulationResult, "improvements" | "degradations">,
): { improvements: string[]; degradations: string[] } {
  const improvements: string[] = [];
  const degradations: string[] = [];

  const checks: { label: string; delta: number; higherBetter: boolean; threshold: number }[] = [
    { label: "Expected Return",     delta: rec.expectedReturn    - baseline.expectedReturn,    higherBetter: true,  threshold: 2 },
    { label: "Drawdown Protection", delta: rec.expectedDrawdown  - baseline.expectedDrawdown,  higherBetter: true,  threshold: 2 },
    { label: "Resilience",          delta: rec.resilienceScore   - baseline.resilienceScore,   higherBetter: true,  threshold: 2 },
    { label: "Hedge Score",         delta: rec.hedgeScore        - baseline.hedgeScore,        higherBetter: true,  threshold: 5 },
    { label: "Concentration Risk",  delta: rec.concentrationRisk - baseline.concentrationRisk, higherBetter: false, threshold: 3 },
  ];

  for (const c of checks) {
    if (Math.abs(c.delta) < c.threshold) continue;
    const isImprovement = c.higherBetter ? c.delta > 0 : c.delta < 0;
    const sign = c.delta > 0 ? "+" : "";
    const str  = `${c.label}: ${sign}${Math.round(c.delta)}`;
    if (isImprovement) improvements.push(str);
    else               degradations.push(str);
  }
  return { improvements, degradations };
}

// ─── Public exports ───────────────────────────────────────────────────────────

export function simulateAllocationScenario(
  input: ScenarioInput,
  regime: string,
): SimulationResult {
  const simRegime = toSimRegime(regime);
  const base = simulate(input.allocations, input.name, simRegime);
  return { ...base, improvements: [], degradations: [] };
}

export function simulateThemeScenario(
  input: ThemeScenarioInput,
  regime: string,
): SimulationResult {
  const bucketAllocs: Partial<Record<BucketId, number>> = {};
  for (const themeId of THEME_IDS) {
    const pct = input.themeAllocations[themeId] ?? 0;
    if (pct === 0) continue;
    const bucket = THEME_TO_BUCKET[themeId];
    bucketAllocs[bucket] = (bucketAllocs[bucket] ?? 0) + pct;
  }
  const simRegime = toSimRegime(regime);
  const base = simulate(bucketAllocs, input.name, simRegime);
  return { ...base, improvements: [], degradations: [] };
}

export async function compareScenarios(): Promise<SimulatorResult> {
  const brief = await db.morningBrief.findFirst({ orderBy: { briefingDate: "desc" } });
  const allocRegime = brief?.marketRegime ?? "Neutral";
  const simRegime   = toSimRegime(allocRegime);

  const review = await generateAllocationReview();

  const currentAllocs: Partial<Record<BucketId, number>> = {};
  const recommendedAllocs: Partial<Record<BucketId, number>> = {};
  for (const b of review.buckets) {
    if (b.currentPct > 0)  currentAllocs[b.bucket]     = b.currentPct;
    if (b.targetPct  > 0)  recommendedAllocs[b.bucket] = b.targetPct;
  }

  const currentBase     = simulate(currentAllocs,     "Current Portfolio", simRegime);
  const recommendedBase = simulate(recommendedAllocs, "Recommended",       simRegime);

  const { improvements, degradations } = buildDiffs(recommendedBase, currentBase);

  const current:     SimulationResult = { ...currentBase,     improvements: [], degradations: [] };
  const recommended: SimulationResult = { ...recommendedBase, improvements,      degradations   };

  const comparison: ComparisonRow[] = [
    { metric: "Expected Return",     current: current.expectedReturn,    recommended: recommended.expectedReturn,    delta: recommended.expectedReturn    - current.expectedReturn,    higherIsBetter: true  },
    { metric: "Drawdown Protection", current: current.expectedDrawdown,  recommended: recommended.expectedDrawdown,  delta: recommended.expectedDrawdown  - current.expectedDrawdown,  higherIsBetter: true  },
    { metric: "Resilience",          current: current.resilienceScore,   recommended: recommended.resilienceScore,   delta: recommended.resilienceScore   - current.resilienceScore,   higherIsBetter: true  },
    { metric: "Hedge Score",         current: current.hedgeScore,        recommended: recommended.hedgeScore,        delta: recommended.hedgeScore        - current.hedgeScore,        higherIsBetter: true  },
    { metric: "Concentration Risk",  current: current.concentrationRisk, recommended: recommended.concentrationRisk, delta: recommended.concentrationRisk - current.concentrationRisk, higherIsBetter: false },
  ];

  const regimeMatrix: RegimeMatrixRow[] = SIM_REGIMES.map(r => {
    const currScore = current.regimeScores.find(s => s.regime === r)?.score ?? 0;
    const recScore  = recommended.regimeScores.find(s => s.regime === r)?.score ?? 0;
    return { regime: r, current: currScore, recommended: recScore, delta: recScore - currScore };
  });

  const moves: SimulatorMove[] = review.recommendations
    .filter((rec): rec is typeof rec & { action: "ADD" | "REDUCE" } => rec.action !== "HOLD")
    .slice(0, 6)
    .map(rec => ({
      action:  rec.action,
      bucket:  rec.bucket,
      label:   rec.bucket,
      gapPct:  rec.gapPct,
      tickers: rec.implementationTickers,
    }));

  return { current, recommended, comparison, regimeMatrix, regime: allocRegime, moves };
}
