import { db } from "./db";
import { computePortfolioState, type Regime } from "./architect-engine";
import { computeOpportunities, type OpportunityEntry } from "./opportunity-engine";
import { fetchEquityPrices } from "./market-data-client";

// ─── Role-based grouping ────────────────────────────────────────────────────
// Portfolio ROLE, not GICS sector: Large-Cap / Mid-Small-Cap / Defensive / Hedge.
// Cash is tracked as a 5th dimension but is never a purchase target.

export type RoleGroup = "Large-Cap" | "Mid/Small-Cap" | "Defensive" | "Hedge";

const ROLE_ORDER: RoleGroup[] = ["Large-Cap", "Mid/Small-Cap", "Defensive", "Hedge"];

const HEDGE_TICKERS = new Set(["GLDM", "GLD", "IAU", "SHY", "TLT", "BND"]);
const DEFENSIVE_SECTORS = new Set(["Consumer Defensive", "Utilities"]);
const SMALL_CAP_CEILING_USD_M = 10000; // $10B; Universe.marketCap is stored in USD millions

const REGIME_TARGETS: Record<Regime, Record<RoleGroup, number> & { Cash: number }> = {
  "Risk On":  { "Large-Cap": 50, "Mid/Small-Cap": 25, "Defensive": 5,  "Hedge": 5,  Cash: 15 },
  "Neutral":  { "Large-Cap": 45, "Mid/Small-Cap": 15, "Defensive": 10, "Hedge": 10, Cash: 20 },
  "Risk Off": { "Large-Cap": 35, "Mid/Small-Cap": 5,  "Defensive": 15, "Hedge": 20, Cash: 25 },
};

const GAP_THRESHOLD_PCT = 3; // hide groups needing less than this many points of buying
const RECS_PER_GROUP = 3;

function classifyRole(ticker: string, sector: string | null, marketCapUsdM: number | null | undefined): RoleGroup {
  if (HEDGE_TICKERS.has(ticker)) return "Hedge";
  if (sector && DEFENSIVE_SECTORS.has(sector)) return "Defensive";
  if (marketCapUsdM != null && marketCapUsdM < SMALL_CAP_CEILING_USD_M) return "Mid/Small-Cap";
  return "Large-Cap"; // unknown market cap defaults to large, matching architect-engine convention
}

export interface BuyPlanRecommendation {
  ticker: string;
  companyName: string;
  objectiveScore: number;
  price: number | null;
  suggestedShares: number | null;
  suggestedUsd: number;
}

export interface BuyPlanGroup {
  role: RoleGroup;
  currentPct: number;
  targetPct: number;
  gapPct: number;
  gapUsd: number;
  recommendations: BuyPlanRecommendation[];
}

export interface BuyPlanResult {
  regime: Regime;
  totalValueUsd: number;
  cashValueUsd: number;
  cashPct: number;
  cashTargetPct: number;
  groups: BuyPlanGroup[];
  generatedAt: string;
}

export async function computeBuyPlan(): Promise<BuyPlanResult> {
  const [state, latestBrief, oppResult] = await Promise.all([
    computePortfolioState(),
    db.morningBrief.findFirst({ orderBy: { briefingDate: "desc" }, select: { marketRegime: true } }).catch(() => null),
    computeOpportunities(),
  ]);

  const regime: Regime = (latestBrief?.marketRegime as Regime | undefined) ?? "Neutral";
  const targets = REGIME_TARGETS[regime];

  const equityPositions = state.positions.filter(p => p.ticker !== "CASH");

  const univRows = await db.universe.findMany({
    where: { status: "active" },
    select: { ticker: true, marketCap: true, sector: true },
  });
  const univMap = new Map(univRows.map(u => [u.ticker, u]));

  const currentPctByRole: Record<RoleGroup, number> = { "Large-Cap": 0, "Mid/Small-Cap": 0, "Defensive": 0, "Hedge": 0 };
  for (const p of equityPositions) {
    const univ = univMap.get(p.ticker);
    const role = classifyRole(p.ticker, p.sector ?? univ?.sector ?? null, univ?.marketCap);
    currentPctByRole[role] += p.pct;
  }

  const candidatesByRole: Record<RoleGroup, OpportunityEntry[]> = { "Large-Cap": [], "Mid/Small-Cap": [], "Defensive": [], "Hedge": [] };
  for (const entry of oppResult.entries) {
    const univ = univMap.get(entry.ticker);
    const role = classifyRole(entry.ticker, entry.sector ?? univ?.sector ?? null, univ?.marketCap);
    candidatesByRole[role].push(entry);
  }
  for (const role of ROLE_ORDER) {
    candidatesByRole[role].sort((a, b) => b.objectiveScore - a.objectiveScore);
  }

  const shownGroups: { role: RoleGroup; currentPct: number; targetPct: number; gapPct: number; gapUsd: number; picks: OpportunityEntry[] }[] = [];
  for (const role of ROLE_ORDER) {
    const targetPct = targets[role];
    const currentPct = currentPctByRole[role];
    const gapPct = targetPct - currentPct;
    if (targetPct <= 0 || gapPct < GAP_THRESHOLD_PCT) continue;
    const picks = candidatesByRole[role].slice(0, RECS_PER_GROUP);
    if (picks.length === 0) continue;
    const gapUsd = (gapPct / 100) * state.totalValueUsd;
    shownGroups.push({ role, currentPct, targetPct, gapPct, gapUsd, picks });
  }
  shownGroups.sort((a, b) => b.gapPct - a.gapPct);

  const allPickTickers = shownGroups.flatMap(g => g.picks.map(p => p.ticker));
  const priceMap = allPickTickers.length > 0 ? await fetchEquityPrices(allPickTickers) : new Map<string, number>();

  const groups: BuyPlanGroup[] = shownGroups.map(g => {
    const usdPerPick = g.gapUsd / g.picks.length;
    const recommendations: BuyPlanRecommendation[] = g.picks.map(entry => {
      const price = priceMap.get(entry.ticker) ?? null;
      const suggestedShares = price ? Math.floor(usdPerPick / price) : null;
      return {
        ticker: entry.ticker,
        companyName: entry.companyName,
        objectiveScore: entry.objectiveScore,
        price,
        suggestedShares,
        suggestedUsd: usdPerPick,
      };
    });
    return { role: g.role, currentPct: g.currentPct, targetPct: g.targetPct, gapPct: g.gapPct, gapUsd: g.gapUsd, recommendations };
  });

  return {
    regime,
    totalValueUsd: state.totalValueUsd,
    cashValueUsd: state.cashValueUsd,
    cashPct: state.cashPct,
    cashTargetPct: targets.Cash,
    groups,
    generatedAt: new Date().toISOString(),
  };
}
