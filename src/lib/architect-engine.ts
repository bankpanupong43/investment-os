// Portfolio Architect Engine — Phase 10 + Phase 11 upgrade
//
// Phase 11 changes:
//   - determineRegime: adds VIX from MarketSnapshot to regime signals
//   - buildCapitalAllocation: cash yield narrative uses Fed Funds Rate (FRED)
//   - buildReasoning: includes macro inputs + data sources used
//   - generateBlueprint: loads macro/market data, updates generatedFromSources
//
// Rules-based — no AI API calls. All signals from DB + real-world data feeds.

import { db } from "./db";
import { getLatestMacroSnapshots, getLatestMarketSnapshots, type LatestMacro, type LatestMarket } from "./macro-ingestion";
import { interpretVIX } from "./market-data-client";
import { computePortfolioValue } from "./portfolio-value-engine";

// ─── Output types ─────────────────────────────────────────────────────────────

export type Regime = "Risk On" | "Neutral" | "Risk Off";

export interface BlueprintAllocation {
  growthPct: number;
  valuePct: number;
  largeCap: number;
  midCap: number;
  smallCap: number;
  international: number;
  hedge: number;
  cash: number;
}

export interface ConcentrationRules {
  maxPositions: number;
  maxSingleStockPct: number;
  maxSectorPct: number;
  rationale: string;
}

export interface GapItem {
  dimension: string;
  type: "sector" | "size" | "cash" | "hedge" | "concentration";
  current: number;
  target: number;
  gap: number;
  action: "reduce" | "increase" | "maintain";
  priority: "high" | "medium" | "low";
  reason: string;
}

export interface CapitalSuggestion {
  ticker: string;
  companyName: string;
  action: "buy" | "add";
  suggestedDollarAmount: number;
  targetWeightPct: number;
  maxWeightPct: number;
  committeeConviction: string | null;
  opportunityScore: number | null;
  reason: string;
}

export interface CapitalAllocationPlan {
  availableCashUsd: number;
  availableCashPct: number;
  recommendation: "deploy" | "hold" | "partial_deploy";
  deployAmountUsd: number;
  holdAmountUsd: number;
  deployReason: string;
  holdReason: string;
  suggestions: CapitalSuggestion[];
}

export interface ScenarioMover {
  ticker: string;
  direction: "up" | "down" | "flat";
  magnitude: string;
  reason: string;
}

export interface ScenarioResult {
  scenario: string;
  description: string;
  portfolioImpact: "very_positive" | "positive" | "neutral" | "negative" | "very_negative";
  estimatedReturnRange: string;
  keyMovers: ScenarioMover[];
  recommendation: string;
  hedgeAdequacy: "sufficient" | "adequate" | "insufficient";
  actionItems: string[];
}

export interface CIOAnswers {
  shouldOwnSmallCaps: { answer: "yes" | "no" | "small_position"; pct: number; reason: string };
  shouldOwnMidCaps: { answer: "yes" | "no" | "small_position"; pct: number; reason: string };
  shouldHedge: { answer: "yes" | "no" | "partial"; hedgePct: number; reason: string };
  targetCashPct: { pct: number; usd: number; reason: string };
  targetPositionCount: { min: number; max: number; current: number; reason: string };
}

export interface PortfolioBlueprintData {
  blueprintDate: Date;
  marketRegime: Regime;
  regimeEvidence: string[];
  targetAllocation: BlueprintAllocation;
  concentrationRules: ConcentrationRules;
  gapAnalysis: GapItem[];
  capitalAllocation: CapitalAllocationPlan;
  scenarioAnalysis: ScenarioResult[];
  cioAnswers: CIOAnswers;
  reasoning: string;
  generatedFromSources: {
    positions: number;
    committee: number;
    opportunities: number;
    radar: number;
    theses: number;
    macroDataPoints: number;
    marketDataPoints: number;
  };
  dataSources: {
    macro: string[];
    market: string[];
    portfolio: string[];
  };
  macroInputs: Record<string, string>; // human-readable macro values used as inputs
}

// ─── Ticker metadata ──────────────────────────────────────────────────────────

const HEDGE_TICKERS = new Set(["GLDM", "GLD", "IAU", "SHY", "TLT", "BND"]);
const INTL_TICKERS = new Set(["TSM", "ASML", "SAP", "NVO", "BABA", "BIDU", "SE"]);
const GROWTH_TICKERS = new Set(["NVDA", "GOOG", "GOOGL", "AMZN", "META", "MSFT", "TSLA", "AMD", "SMCI", "CRWD", "NET", "SNOW", "PLTR"]);
const VALUE_TICKERS = new Set(["AAPL", "ITA", "JPM", "BRK", "KO", "JNJ", "PG", "V", "MA"]);

// Scenario impact map — keyed by scenario name, then ticker
const SCENARIO_MAP: Record<string, Record<string, ScenarioMover>> = {
  "Taiwan Conflict": {
    NVDA:  { ticker: "NVDA",  direction: "down", magnitude: "-20% to -40%", reason: "TSMC supply chain dependency" },
    TSM:   { ticker: "TSM",   direction: "down", magnitude: "-40% to -60%", reason: "Direct Taiwan operational risk" },
    AAPL:  { ticker: "AAPL",  direction: "down", magnitude: "-15% to -25%", reason: "Manufacturing concentration in Taiwan/China" },
    GOOG:  { ticker: "GOOG",  direction: "down", magnitude: "-10% to -20%", reason: "Hardware supply chain exposure" },
    GOOGL: { ticker: "GOOGL", direction: "down", magnitude: "-10% to -20%", reason: "Hardware supply chain exposure" },
    AMZN:  { ticker: "AMZN",  direction: "down", magnitude: "-5% to -15%",  reason: "AWS infrastructure component sourcing" },
    MSFT:  { ticker: "MSFT",  direction: "flat", magnitude: "-5% to +5%",   reason: "Primarily software; limited supply chain risk" },
    META:  { ticker: "META",  direction: "flat", magnitude: "-5% to +5%",   reason: "Primarily software; some hardware dependency" },
    ITA:   { ticker: "ITA",   direction: "up",   magnitude: "+10% to +25%", reason: "Defense spending surge on conflict escalation" },
    GLDM:  { ticker: "GLDM",  direction: "up",   magnitude: "+15% to +30%", reason: "Safe haven premium; geopolitical uncertainty" },
    GLD:   { ticker: "GLD",   direction: "up",   magnitude: "+15% to +30%", reason: "Safe haven demand" },
  },
  "Recession": {
    NVDA:  { ticker: "NVDA",  direction: "down", magnitude: "-20% to -35%", reason: "Enterprise capex cuts reduce AI chip demand" },
    AAPL:  { ticker: "AAPL",  direction: "down", magnitude: "-10% to -20%", reason: "Consumer spending contraction; device demand falls" },
    GOOG:  { ticker: "GOOG",  direction: "down", magnitude: "-15% to -25%", reason: "Ad revenue highly cyclical; marketing budgets cut first" },
    GOOGL: { ticker: "GOOGL", direction: "down", magnitude: "-15% to -25%", reason: "Ad revenue highly cyclical" },
    AMZN:  { ticker: "AMZN",  direction: "flat", magnitude: "-5% to -10%",  reason: "AWS recurring revenue offsets consumer slowdown" },
    MSFT:  { ticker: "MSFT",  direction: "flat", magnitude: "-5% to +5%",   reason: "Enterprise contracts provide revenue stability" },
    META:  { ticker: "META",  direction: "down", magnitude: "-15% to -25%", reason: "Ad-dependent revenue; highly economically sensitive" },
    ITA:   { ticker: "ITA",   direction: "flat", magnitude: "-5% to +5%",   reason: "Defense budgets relatively recession-proof" },
    GLDM:  { ticker: "GLDM",  direction: "up",   magnitude: "+10% to +20%", reason: "Safe haven demand; rate cuts benefit gold" },
    GLD:   { ticker: "GLD",   direction: "up",   magnitude: "+10% to +20%", reason: "Safe haven demand; rate cuts benefit gold" },
  },
  "AI Boom": {
    NVDA:  { ticker: "NVDA",  direction: "up",   magnitude: "+30% to +60%", reason: "Primary AI infrastructure beneficiary; GPU demand surge" },
    GOOG:  { ticker: "GOOG",  direction: "up",   magnitude: "+20% to +40%", reason: "Gemini + Google Cloud AI monetization accelerates" },
    GOOGL: { ticker: "GOOGL", direction: "up",   magnitude: "+20% to +40%", reason: "Gemini + Google Cloud AI monetization accelerates" },
    AMZN:  { ticker: "AMZN",  direction: "up",   magnitude: "+15% to +30%", reason: "AWS Bedrock and AI services drive cloud re-acceleration" },
    MSFT:  { ticker: "MSFT",  direction: "up",   magnitude: "+15% to +25%", reason: "Copilot monetization and Azure AI growth" },
    META:  { ticker: "META",  direction: "up",   magnitude: "+15% to +25%", reason: "AI-enhanced ad targeting; Llama ecosystem adoption" },
    AAPL:  { ticker: "AAPL",  direction: "up",   magnitude: "+10% to +20%", reason: "Apple Intelligence drives device upgrade supercycle" },
    TSM:   { ticker: "TSM",   direction: "up",   magnitude: "+20% to +40%", reason: "AI chip fab demand surge; utilization rate peaks" },
    ITA:   { ticker: "ITA",   direction: "flat", magnitude: "-5% to +10%",  reason: "Limited AI exposure; autonomous defense systems long-cycle" },
    GLDM:  { ticker: "GLDM",  direction: "down", magnitude: "-5% to -10%",  reason: "Risk-on environment reduces safe haven demand" },
    GLD:   { ticker: "GLD",   direction: "down", magnitude: "-5% to -10%",  reason: "Risk-on reduces gold premium" },
  },
  "Soft Landing": {
    NVDA:  { ticker: "NVDA",  direction: "up",   magnitude: "+10% to +25%", reason: "AI capex continues; no recession cuts to data center budgets" },
    GOOG:  { ticker: "GOOG",  direction: "up",   magnitude: "+10% to +20%", reason: "Steady ad growth; cloud acceleration" },
    GOOGL: { ticker: "GOOGL", direction: "up",   magnitude: "+10% to +20%", reason: "Steady ad growth; cloud acceleration" },
    AMZN:  { ticker: "AMZN",  direction: "up",   magnitude: "+10% to +20%", reason: "E-commerce recovery + AWS growth in stable environment" },
    MSFT:  { ticker: "MSFT",  direction: "up",   magnitude: "+8% to +15%",  reason: "Enterprise spending steady; Copilot monetization" },
    META:  { ticker: "META",  direction: "up",   magnitude: "+10% to +20%", reason: "Ad market stabilizes; Reels and AI drive engagement" },
    AAPL:  { ticker: "AAPL",  direction: "up",   magnitude: "+8% to +15%",  reason: "Consumer confidence supports device refresh cycle" },
    ITA:   { ticker: "ITA",   direction: "up",   magnitude: "+5% to +12%",  reason: "NATO spending commitments maintained; defense budgets intact" },
    GLDM:  { ticker: "GLDM",  direction: "flat", magnitude: "-5% to +5%",   reason: "Safe haven demand falls; real yields stabilize" },
    GLD:   { ticker: "GLD",   direction: "flat", magnitude: "-5% to +5%",   reason: "Limited upside in benign environment" },
    TSM:   { ticker: "TSM",   direction: "up",   magnitude: "+8% to +18%",  reason: "Stable demand; AI chips sustain fab utilization" },
  },
};

// ─── Current state extraction ─────────────────────────────────────────────────

interface PortfolioPosition {
  id: string;
  ticker: string;
  name: string;
  sector: string | null;
  assetClass: string;
  allocationPct: number | null;
  currentValueUsd: number | null;
  pct: number; // computed normalized allocation %
}

interface PortfolioState {
  positions: PortfolioPosition[];
  totalValueUsd: number;
  cashValueUsd: number;
  cashPct: number;
  hedgePct: number;
  sectorBreakdown: { sector: string; pct: number }[];
  largePct: number;
  midPct: number;
  smallPct: number;
  internationalPct: number;
  growthPct: number;
  valuePct: number;
  positionCount: number;
  largestPosition: { ticker: string; pct: number } | null;
  largestSector: { sector: string; pct: number } | null;
}

async function computePortfolioState(): Promise<PortfolioState> {
  const snapshot = await computePortfolioValue();
  const usdthb = snapshot.usdthb ?? 35;

  // Load Position metadata for name, sector, assetClass (thesis-tracking table)
  const posMeta = await db.position.findMany({
    where: { status: "active" },
    select: { id: true, ticker: true, name: true, sector: true, assetClass: true },
  });
  const posMap = new Map(posMeta.map(p => [p.ticker, p]));

  // Load Universe as fallback for tickers without a Position record
  const holdingTickers = snapshot.holdings.map(h => h.ticker);
  const univRows = holdingTickers.length > 0
    ? await db.universe.findMany({
        where: { ticker: { in: holdingTickers } },
        select: { ticker: true, companyName: true, sector: true, marketCap: true, country: true },
      })
    : [];
  const univMap = new Map(univRows.map(u => [u.ticker, u]));

  // Build equity positions from live holdings
  const equityPositions: PortfolioPosition[] = snapshot.holdings.map(h => {
    const pos = posMap.get(h.ticker);
    const univ = univMap.get(h.ticker);
    return {
      id:             pos?.id ?? h.ticker,
      ticker:         h.ticker,
      name:           pos?.name ?? univ?.companyName ?? h.ticker,
      sector:         pos?.sector ?? univ?.sector ?? null,
      assetClass:     pos?.assetClass ?? "equity",
      allocationPct:  h.allocationPct,
      currentValueUsd: h.marketValueUsd,
      pct:            h.allocationPct ?? 0,
    };
  });

  // Cash: aggregate of all CashAccount balances
  const cashValueUsd = snapshot.totalCashThb / usdthb;
  const cashPct = snapshot.totalValueThb > 0 ? (snapshot.totalCashThb / snapshot.totalValueThb) * 100 : 0;
  const cashPos: PortfolioPosition = {
    id: "CASH", ticker: "CASH", name: "Cash Accounts", sector: null,
    assetClass: "cash", allocationPct: cashPct, currentValueUsd: cashValueUsd, pct: cashPct,
  };

  const final = [...equityPositions, ...(cashPct > 0 ? [cashPos] : [])];
  const totalValueUsd = snapshot.totalValueThb / usdthb;

  // Hedge %
  const hedgePct = equityPositions
    .filter(p => HEDGE_TICKERS.has(p.ticker))
    .reduce((s, p) => s + p.pct, 0);

  // Sector breakdown (exclude cash and hedges for sector classification)
  const sectorMap = new Map<string, number>();
  for (const p of equityPositions) {
    const sector = p.sector ?? "Unknown";
    sectorMap.set(sector, (sectorMap.get(sector) ?? 0) + p.pct);
  }
  const sectorBreakdown = [...sectorMap.entries()]
    .map(([sector, pct]) => ({ sector, pct }))
    .sort((a, b) => b.pct - a.pct);

  // Size/style classification
  let largePct = 0, midPct = 0, smallPct = 0, internationalPct = 0, growthPct = 0, valuePct = 0;
  for (const p of equityPositions) {
    if (HEDGE_TICKERS.has(p.ticker)) continue;
    const u = univMap.get(p.ticker);
    const cap = u?.marketCap ?? null;
    if (cap !== null) {
      if (cap >= 10000) largePct += p.pct;
      else if (cap >= 2000) midPct += p.pct;
      else smallPct += p.pct;
    } else {
      largePct += p.pct; // assume large-cap if unknown
    }
    if (u && u.country !== "US") internationalPct += p.pct;
    if (GROWTH_TICKERS.has(p.ticker)) growthPct += p.pct;
    if (VALUE_TICKERS.has(p.ticker)) valuePct += p.pct;
    if (INTL_TICKERS.has(p.ticker)) internationalPct += p.pct;
  }

  const largestPos = equityPositions.reduce<{ ticker: string; pct: number } | null>((max, p) => {
    if (!max || p.pct > max.pct) return { ticker: p.ticker, pct: p.pct };
    return max;
  }, null);

  return {
    positions: final,
    totalValueUsd,
    cashValueUsd,
    cashPct,
    hedgePct,
    sectorBreakdown,
    largePct,
    midPct,
    smallPct,
    internationalPct,
    growthPct,
    valuePct,
    positionCount: equityPositions.length,
    largestPosition: largestPos,
    largestSector: sectorBreakdown[0] ?? null,
  };
}

// ─── Regime Detection ─────────────────────────────────────────────────────────

async function determineRegime(
  since30d: Date,
  marketData: Record<string, LatestMarket>,
): Promise<{ regime: Regime; evidence: string[] }> {
  const [sessions, impacts, theses, kills] = await Promise.all([
    db.committeeSession.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { ticker: true, conviction: true, createdAt: true },
    }),
    db.thesisImpactRecord.findMany({
      where: { createdAt: { gte: since30d } },
      select: { impactLevel: true, ticker: true },
    }),
    db.investmentThesis.findMany({
      where: { status: "active" },
      select: { ticker: true, confidenceScore: true },
    }),
    db.killCondition.findMany({ where: { status: "triggered" } }),
  ]);

  let bullish = 0, bearish = 0;
  const evidence: string[] = [];

  // ── VIX signal (real market data — Phase 11) ──────────────────────────────
  const vixEntry = marketData["VIX"];
  if (vixEntry) {
    const vixRead = interpretVIX(vixEntry.value);
    if (vixRead.regimePoints > 0) {
      bullish += vixRead.regimePoints;
    } else if (vixRead.regimePoints < 0) {
      bearish += Math.abs(vixRead.regimePoints);
    }
    evidence.push(`${vixRead.label} (Yahoo Finance, ${vixEntry.date.toLocaleDateString()})`);
  }

  // ── S&P 500 context (Phase 11) ────────────────────────────────────────────
  const sp500Entry = marketData["SP500"];
  if (sp500Entry) {
    evidence.push(`S&P 500 at ${sp500Entry.value.toLocaleString()} (Yahoo Finance, ${sp500Entry.date.toLocaleDateString()})`);
  }

  // ── Committee conviction signals (portfolio DB) ───────────────────────────
  const latestCommittee = new Map<string, string>();
  for (const s of sessions) {
    if (!latestCommittee.has(s.ticker)) latestCommittee.set(s.ticker, s.conviction);
  }

  const strongBuys = [...latestCommittee.entries()].filter(([, c]) => c === "Strong Buy");
  const buys       = [...latestCommittee.entries()].filter(([, c]) => c === "Buy");
  const passes     = [...latestCommittee.entries()].filter(([, c]) => c === "Pass");

  if (strongBuys.length > 0) {
    bullish += strongBuys.length * 2;
    evidence.push(`${strongBuys.length} Strong Buy verdict${strongBuys.length > 1 ? "s" : ""} (${strongBuys.map(([t]) => t).join(", ")})`);
  }
  if (buys.length > 0) {
    bullish += buys.length;
    evidence.push(`${buys.length} Buy verdict${buys.length > 1 ? "s" : ""} (${buys.map(([t]) => t).join(", ")})`);
  }
  if (passes.length > 0) {
    bearish += passes.length;
    evidence.push(`${passes.length} Pass verdict${passes.length > 1 ? "s" : ""} from committee`);
  }

  const strengthened  = impacts.filter(i => i.impactLevel === "strengthened");
  const weakened      = impacts.filter(i => i.impactLevel === "weakened");
  const killTriggered = impacts.filter(i => i.impactLevel === "kill_criteria_triggered");

  if (strengthened.length > 0)   { bullish += strengthened.length;        evidence.push(`${strengthened.length} thesis strengthened by recent filings`); }
  if (weakened.length > 0)       { bearish += weakened.length;             evidence.push(`${weakened.length} thesis weakened by recent filings`); }
  if (killTriggered.length > 0)  { bearish += killTriggered.length * 2;    evidence.push(`${killTriggered.length} kill criteria triggered — action required`); }

  const highConv = theses.filter(t => t.confidenceScore >= 7).length;
  const lowConv  = theses.filter(t => t.confidenceScore < 5).length;
  if (highConv > 0) bullish += Math.floor(highConv / 2);
  if (lowConv > 0)  { bearish += lowConv; evidence.push(`${lowConv} position${lowConv > 1 ? "s" : ""} with low conviction`); }
  if (kills.length > 0) { bearish += kills.length; evidence.push(`${kills.length} kill condition${kills.length > 1 ? "s" : ""} currently active`); }

  const score = bullish - bearish;
  let regime: Regime;
  if (score >= 3) {
    regime = "Risk On";
    evidence.unshift("Portfolio + market signals broadly constructive");
  } else if (score <= -2) {
    regime = "Risk Off";
    evidence.unshift("Multiple bearish signals (portfolio + market) — defensive positioning warranted");
  } else {
    regime = "Neutral";
    evidence.unshift("Mixed signals — balanced positioning recommended");
  }

  return { regime, evidence: evidence.slice(0, 6) };
}

// ─── Allocation validation ────────────────────────────────────────────────────
// The six asset-allocation dimensions (largeCap + midCap + smallCap +
// international + hedge + cash) must always sum to exactly 100%.
// growthPct and valuePct are style overlays — they are informational and are
// NOT counted in the total.

export function validateAllocation(alloc: BlueprintAllocation): {
  valid: boolean;
  total: number;
  message: string;
} {
  const total = alloc.largeCap + alloc.midCap + alloc.smallCap
              + alloc.international + alloc.hedge + alloc.cash;
  const rounded = Math.round(total * 10) / 10;
  const valid = Math.abs(total - 100) < 0.5;
  return {
    valid,
    total: rounded,
    message: valid
      ? "Allocation sums to 100%"
      : `Allocation sums to ${rounded}% — expected 100%`,
  };
}

// ─── Target Allocation ────────────────────────────────────────────────────────

function buildTargetAllocation(regime: Regime, state: PortfolioState): BlueprintAllocation {
  // Base templates — largeCap + midCap + smallCap + international + hedge + cash must = 100%
  // growthPct / valuePct are style overlays (informational only, not counted in total).
  const base: Record<Regime, BlueprintAllocation> = {
    "Risk On": { growthPct: 65, valuePct: 20, largeCap: 55, midCap: 15, smallCap: 10, international: 10, hedge:  5, cash:  5 },
    "Neutral": { growthPct: 45, valuePct: 35, largeCap: 50, midCap: 10, smallCap:  5, international: 10, hedge: 10, cash: 15 },
    "Risk Off": { growthPct: 20, valuePct: 50, largeCap: 40, midCap:  5, smallCap:  0, international:  5, hedge: 20, cash: 30 },
  };
  // Verify templates at definition time (sums: 100, 100, 100 ✓)

  const alloc = { ...base[regime] };

  // Adjustment: tech sector overweight (>55%) — shift 5% from largeCap to hedge
  const techPct = state.sectorBreakdown.find(s => s.sector === "Technology")?.pct ?? 0;
  if (techPct > 55 && alloc.largeCap >= 5) {
    const shift = Math.min(5, alloc.largeCap, 25 - alloc.hedge);
    alloc.hedge    += shift;
    alloc.largeCap -= shift;
  }

  // Adjustment: no small caps in Risk Off — redistribute to largeCap
  if (alloc.smallCap > 0 && state.smallPct < 2 && regime === "Risk Off") {
    alloc.largeCap += alloc.smallCap;
    alloc.smallCap  = 0;
  }

  return alloc;
}

// ─── Concentration Rules ──────────────────────────────────────────────────────

function buildConcentrationRules(regime: Regime, state: PortfolioState): ConcentrationRules {
  let maxPositions = 20;
  let maxSingleStockPct = 10;
  let maxSectorPct = 35;

  if (regime === "Risk Off") {
    maxPositions = 15;
    maxSingleStockPct = 8;
    maxSectorPct = 30;
  } else if (regime === "Risk On") {
    maxPositions = 20;
    maxSingleStockPct = 12;
    maxSectorPct = 40;
  }

  const reasons: string[] = [];
  if (state.largestPosition && state.largestPosition.pct > maxSingleStockPct) {
    reasons.push(`${state.largestPosition.ticker} at ${state.largestPosition.pct.toFixed(1)}% exceeds ${maxSingleStockPct}% single-stock limit`);
  }
  if (state.largestSector && state.largestSector.pct > maxSectorPct) {
    reasons.push(`${state.largestSector.sector} at ${state.largestSector.pct.toFixed(1)}% exceeds ${maxSectorPct}% sector limit`);
  }

  const rationale = reasons.length > 0
    ? reasons.join("; ")
    : `${regime} regime: standard concentration limits apply`;

  return { maxPositions, maxSingleStockPct, maxSectorPct, rationale };
}

// ─── Gap Analysis ─────────────────────────────────────────────────────────────

function buildGapAnalysis(state: PortfolioState, target: BlueprintAllocation): GapItem[] {
  const gaps: GapItem[] = [];

  // Cash gap
  const cashGap = target.cash - state.cashPct;
  gaps.push({
    dimension: "Cash Reserve",
    type: "cash",
    current: Math.round(state.cashPct * 10) / 10,
    target: target.cash,
    gap: Math.round(cashGap * 10) / 10,
    action: Math.abs(cashGap) < 2 ? "maintain" : cashGap > 0 ? "increase" : "reduce",
    priority: Math.abs(cashGap) > 10 ? "high" : Math.abs(cashGap) > 5 ? "medium" : "low",
    reason: cashGap > 5
      ? `Hold more cash — target ${target.cash}% for deployment flexibility`
      : cashGap < -5
        ? `Deploy excess cash — currently above target reserve`
        : "Cash allocation within target range",
  });

  // Hedge gap
  const hedgeGap = target.hedge - state.hedgePct;
  if (Math.abs(hedgeGap) > 1) {
    gaps.push({
      dimension: "Hedge / Defensive",
      type: "hedge",
      current: Math.round(state.hedgePct * 10) / 10,
      target: target.hedge,
      gap: Math.round(hedgeGap * 10) / 10,
      action: hedgeGap > 0 ? "increase" : "reduce",
      priority: Math.abs(hedgeGap) > 10 ? "high" : "medium",
      reason: hedgeGap > 0
        ? `Increase hedge allocation (gold, defensive ETFs) to ${target.hedge}% — portfolio lacks downside protection`
        : `Reduce hedge weight — risk appetite supports more equity exposure`,
    });
  }

  // Size gaps
  const sizeGaps = [
    { dimension: "Large Cap", current: state.largePct, target: target.largeCap },
    { dimension: "Mid Cap",   current: state.midPct,   target: target.midCap },
    { dimension: "Small Cap", current: state.smallPct, target: target.smallCap },
    { dimension: "International", current: state.internationalPct, target: target.international },
  ];
  for (const sg of sizeGaps) {
    const gap = sg.target - sg.current;
    if (Math.abs(gap) < 2) continue;
    gaps.push({
      dimension: sg.dimension,
      type: "size",
      current: Math.round(sg.current * 10) / 10,
      target: sg.target,
      gap: Math.round(gap * 10) / 10,
      action: gap > 0 ? "increase" : "reduce",
      priority: Math.abs(gap) > 15 ? "high" : Math.abs(gap) > 8 ? "medium" : "low",
      reason: gap > 0
        ? `Add ${sg.dimension.toLowerCase()} exposure — currently underrepresented vs ${sg.target}% target`
        : `${sg.dimension} is overweight vs ${sg.target}% target — consider trimming on strength`,
    });
  }

  // Sector concentration gaps
  for (const s of state.sectorBreakdown) {
    if (s.sector === "Unknown") continue;
    const sectorTarget = s.sector === "Technology" ? 40 : s.sector === "Defense" ? 15 : 20;
    const gap = sectorTarget - s.pct;
    if (s.pct > sectorTarget + 5) {
      gaps.push({
        dimension: `${s.sector} Sector`,
        type: "sector",
        current: Math.round(s.pct * 10) / 10,
        target: sectorTarget,
        gap: Math.round(gap * 10) / 10,
        action: "reduce",
        priority: s.pct > sectorTarget + 20 ? "high" : "medium",
        reason: `${s.sector} sector at ${s.pct.toFixed(1)}% — above ${sectorTarget}% guideline; concentration risk`,
      });
    }
  }

  // Concentration: single stock
  const nonCash = state.positions.filter(p => p.ticker !== "CASH");
  for (const p of nonCash) {
    if (p.pct > 20) {
      gaps.push({
        dimension: `${p.ticker} Position`,
        type: "concentration",
        current: Math.round(p.pct * 10) / 10,
        target: 10,
        gap: Math.round((10 - p.pct) * 10) / 10,
        action: "reduce",
        priority: p.pct > 25 ? "high" : "medium",
        reason: `${p.ticker} at ${p.pct.toFixed(1)}% of portfolio — single-stock concentration above 20% guideline`,
      });
    }
  }

  // Sort: reduce-high first, then by abs(gap) desc
  return gaps.sort((a, b) => {
    if (a.priority !== b.priority) {
      const p = { high: 0, medium: 1, low: 2 };
      return p[a.priority] - p[b.priority];
    }
    return Math.abs(b.gap) - Math.abs(a.gap);
  });
}

// ─── Capital Allocation ───────────────────────────────────────────────────────

async function buildCapitalAllocation(
  state: PortfolioState,
  target: BlueprintAllocation,
  regime: Regime,
): Promise<CapitalAllocationPlan> {
  const availableCashUsd = state.cashValueUsd;
  const availableCashPct = state.cashPct;
  const totalUsd = state.totalValueUsd;

  // How much should we hold as cash?
  const targetCashUsd = totalUsd * (target.cash / 100);
  const deployCash = Math.max(0, availableCashUsd - targetCashUsd);
  const holdCash = Math.min(availableCashUsd, targetCashUsd);

  let recommendation: "deploy" | "hold" | "partial_deploy";
  if (regime === "Risk Off") {
    recommendation = "hold";
  } else if (availableCashPct > target.cash + 5) {
    recommendation = deployCash > targetCashUsd * 0.3 ? "partial_deploy" : "deploy";
  } else {
    recommendation = "hold";
  }

  const deployReason = regime === "Risk Off"
    ? `Risk Off regime — maintain ${target.cash}% cash reserve; deploy only on high-conviction opportunities`
    : availableCashPct > target.cash + 5
      ? `Cash at ${availableCashPct.toFixed(1)}% exceeds ${target.cash}% target; deploy $${deployCash.toFixed(0)} into conviction positions`
      : `Cash within target range; no urgent deployment needed`;

  const holdReason = `Maintain $${holdCash.toFixed(0)} (${target.cash}% target) as dry powder for opportunistic additions`;

  // Find best suggestions from committee + opportunities
  const [committeeLatest, topOpps] = await Promise.all([
    db.committeeSession.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { ticker: true, conviction: true, createdAt: true },
    }),
    db.opportunityScore.findMany({
      orderBy: { opportunityScore: "desc" },
      take: 15,
      select: { ticker: true, opportunityScore: true },
    }),
  ]);

  const portfolioTickers = new Set(state.positions.map(p => p.ticker));

  // Deduplicate committee to latest per ticker
  const committeeMap = new Map<string, string>();
  for (const s of committeeLatest) {
    if (!committeeMap.has(s.ticker)) committeeMap.set(s.ticker, s.conviction);
  }

  // Candidate tickers: Strong Buy + Buy from committee, not in portfolio
  const candidates: { ticker: string; conviction: string; oppScore: number | null }[] = [];
  for (const [ticker, conviction] of committeeMap) {
    if (["Strong Buy", "Buy"].includes(conviction) && !portfolioTickers.has(ticker)) {
      const opp = topOpps.find(o => o.ticker === ticker);
      candidates.push({ ticker, conviction, oppScore: opp?.opportunityScore ?? null });
    }
  }

  // Also add high-opp non-portfolio tickers not yet in committee
  for (const opp of topOpps.slice(0, 5)) {
    if (!portfolioTickers.has(opp.ticker) && !candidates.find(c => c.ticker === opp.ticker)) {
      candidates.push({ ticker: opp.ticker, conviction: null as unknown as string, oppScore: opp.opportunityScore });
    }
  }

  // Sort: Strong Buy first, then by opp score
  candidates.sort((a, b) => {
    const rank = { "Strong Buy": 0, "Buy": 1 };
    const ra = rank[a.conviction as keyof typeof rank] ?? 2;
    const rb = rank[b.conviction as keyof typeof rank] ?? 2;
    if (ra !== rb) return ra - rb;
    return (b.oppScore ?? 0) - (a.oppScore ?? 0);
  });

  // Build universe name lookup
  const candTickers = candidates.slice(0, 5).map(c => c.ticker);
  const universeNames = await db.universe.findMany({
    where: { ticker: { in: candTickers } },
    select: { ticker: true, companyName: true },
  });
  const nameMap = new Map(universeNames.map(u => [u.ticker, u.companyName]));

  const suggestions: CapitalSuggestion[] = candidates.slice(0, 4).map(c => {
    const isStrongBuy = c.conviction === "Strong Buy";
    const targetWeightPct = isStrongBuy ? 8 : 5;
    const maxWeightPct = isStrongBuy ? 12 : 8;
    const suggestedDollarAmount = Math.min(deployCash, totalUsd * (targetWeightPct / 100));
    return {
      ticker: c.ticker,
      companyName: nameMap.get(c.ticker) ?? c.ticker,
      action: "buy" as const,
      suggestedDollarAmount: Math.round(suggestedDollarAmount),
      targetWeightPct,
      maxWeightPct,
      committeeConviction: c.conviction ?? null,
      opportunityScore: c.oppScore,
      reason: c.conviction
        ? `Committee ${c.conviction}; not yet in portfolio${c.oppScore ? `; opportunity score ${c.oppScore.toFixed(0)}` : ""}`
        : `Opportunity score ${c.oppScore?.toFixed(0) ?? "n/a"} — top-ranked universe entry not yet held`,
    };
  });

  return {
    availableCashUsd: Math.round(availableCashUsd),
    availableCashPct: Math.round(availableCashPct * 10) / 10,
    recommendation,
    deployAmountUsd: Math.round(deployCash),
    holdAmountUsd: Math.round(holdCash),
    deployReason,
    holdReason,
    suggestions,
  };
}

// ─── Scenario Analysis ────────────────────────────────────────────────────────

function buildScenarioAnalysis(state: PortfolioState, hedgeTarget: number): ScenarioResult[] {
  const heldTickers = new Set(state.positions.filter(p => p.ticker !== "CASH").map(p => p.ticker));

  const scenarios = [
    {
      name: "Taiwan Conflict",
      description: "Military conflict or blockade of Taiwan triggers global supply chain shock; tech hardware severely disrupted",
      negativeWeight: ["NVDA", "AAPL", "GOOG", "GOOGL", "AMZN", "TSM"],
      positiveWeight: ["ITA", "GLDM", "GLD"],
      baseImpact: -0.6,  // -0.6 = mostly negative
    },
    {
      name: "Recession",
      description: "US recession driven by rate shock or credit event; earnings multiples compress across equity markets",
      negativeWeight: ["NVDA", "AAPL", "GOOG", "GOOGL", "META"],
      positiveWeight: ["GLDM", "GLD", "ITA"],
      baseImpact: -0.4,
    },
    {
      name: "AI Boom",
      description: "AI adoption accelerates beyond consensus expectations; revenue monetization inflects sharply higher",
      negativeWeight: ["GLDM", "GLD"],
      positiveWeight: ["NVDA", "GOOG", "GOOGL", "AMZN", "MSFT", "META", "AAPL", "TSM"],
      baseImpact: 0.7,
    },
    {
      name: "Soft Landing",
      description: "Inflation returns to target without recession; rates ease gradually; broad equity rally follows",
      negativeWeight: [],
      positiveWeight: ["NVDA", "GOOG", "GOOGL", "AMZN", "MSFT", "AAPL", "META", "ITA"],
      baseImpact: 0.5,
    },
  ] as const;

  return scenarios.map(sc => {
    const tickerMap = SCENARIO_MAP[sc.name] ?? {};

    // Key movers from held tickers
    const keyMovers: ScenarioMover[] = [];
    const moversAdded = new Set<string>();
    for (const ticker of [...sc.positiveWeight, ...sc.negativeWeight]) {
      if (heldTickers.has(ticker) && !moversAdded.has(ticker) && tickerMap[ticker]) {
        keyMovers.push(tickerMap[ticker]);
        moversAdded.add(ticker);
      }
    }
    // Also add any held tickers we haven't covered yet
    for (const ticker of heldTickers) {
      if (!moversAdded.has(ticker) && tickerMap[ticker] && keyMovers.length < 5) {
        keyMovers.push(tickerMap[ticker]);
        moversAdded.add(ticker);
      }
    }

    // Portfolio impact: count positive vs negative positions
    const positiveHeld = sc.positiveWeight.filter(t => heldTickers.has(t)).length;
    const negativeHeld = sc.negativeWeight.filter(t => heldTickers.has(t)).length;
    const netBias = sc.baseImpact + (positiveHeld * 0.05) - (negativeHeld * 0.05);

    let portfolioImpact: ScenarioResult["portfolioImpact"];
    if (netBias >= 0.5) portfolioImpact = "very_positive";
    else if (netBias >= 0.2) portfolioImpact = "positive";
    else if (netBias >= -0.2) portfolioImpact = "neutral";
    else if (netBias >= -0.5) portfolioImpact = "negative";
    else portfolioImpact = "very_negative";

    // Estimate return range from portfolio makeup
    const returnRangeMap: Record<ScenarioResult["portfolioImpact"], string> = {
      very_positive: "+20% to +40%",
      positive:      "+5% to +20%",
      neutral:       "-5% to +5%",
      negative:      "-10% to -25%",
      very_negative: "-25% to -45%",
    };

    // Hedge adequacy
    const hasGold = heldTickers.has("GLDM") || heldTickers.has("GLD");
    const hasDefense = heldTickers.has("ITA");
    const currentHedgePct = state.hedgePct;
    let hedgeAdequacy: ScenarioResult["hedgeAdequacy"];
    if (sc.name === "AI Boom" || sc.name === "Soft Landing") {
      hedgeAdequacy = "sufficient"; // hedges are a drag in bull scenarios
    } else if (currentHedgePct >= hedgeTarget) {
      hedgeAdequacy = "sufficient";
    } else if (currentHedgePct >= hedgeTarget * 0.6) {
      hedgeAdequacy = "adequate";
    } else {
      hedgeAdequacy = "insufficient";
    }

    // Recommendation and action items
    const actionItems: string[] = [];
    if (sc.name === "Taiwan Conflict") {
      if (!hasGold) actionItems.push("Consider initiating GLDM position as Taiwan risk hedge");
      if (!hasDefense) actionItems.push("ITA (defense ETF) benefits from escalation — review for portfolio fit");
      if (heldTickers.has("NVDA")) actionItems.push("NVDA: largest Taiwan risk in portfolio — monitor supply chain disclosures");
    } else if (sc.name === "Recession") {
      if (!hasGold) actionItems.push("Add GLDM as recession hedge before slowdown signals intensify");
      if (negativeHeld > 3) actionItems.push("Portfolio tech concentration increases recession sensitivity — consider trimming on strength");
      actionItems.push("AWS and enterprise software revenue more stable than ad/consumer tech — weight accordingly");
    } else if (sc.name === "AI Boom") {
      if (!heldTickers.has("NVDA")) actionItems.push("NVDA is the primary AI boom beneficiary — review for allocation");
      if (heldTickers.has("GLDM")) actionItems.push("GLDM drag increases in AI boom — hold as regime hedge but monitor size");
      actionItems.push("Lean into AI infrastructure positions; Soft Landing and AI Boom are the most likely base cases");
    } else {
      actionItems.push("Soft landing is constructive for current portfolio — maintain positions, deploy available cash");
      if (state.smallPct < 5) actionItems.push("Small caps typically outperform in early soft landing — consider exposure");
    }

    const recommendation = portfolioImpact === "very_negative" || portfolioImpact === "negative"
      ? `Underweight risk — increase hedge allocation and trim most-exposed positions`
      : portfolioImpact === "neutral"
        ? `Balanced outcome expected — no major repositioning required`
        : `Constructive environment — maintain or increase conviction positions`;

    return {
      scenario: sc.name,
      description: sc.description,
      portfolioImpact,
      estimatedReturnRange: returnRangeMap[portfolioImpact],
      keyMovers: keyMovers.slice(0, 5),
      recommendation,
      hedgeAdequacy,
      actionItems,
    };
  });
}

// ─── CIO Answers ──────────────────────────────────────────────────────────────

function buildCIOAnswers(
  regime: Regime,
  target: BlueprintAllocation,
  state: PortfolioState,
  totalUsd: number,
): CIOAnswers {
  // Small caps
  const smallCapAnswer: CIOAnswers["shouldOwnSmallCaps"] =
    regime === "Risk Off"
      ? { answer: "no", pct: 0, reason: "Risk Off regime — small caps underperform; prioritize large cap quality" }
      : regime === "Neutral"
        ? { answer: "small_position", pct: target.smallCap, reason: `Neutral regime — small allocation (${target.smallCap}%) acceptable for diversification; selectivity is key` }
        : { answer: "yes", pct: target.smallCap, reason: `Risk On — allocate up to ${target.smallCap}% to small caps; focus on profitable growers with strong balance sheets` };

  // Mid caps
  const midCapAnswer: CIOAnswers["shouldOwnMidCaps"] =
    regime === "Risk Off"
      ? { answer: "small_position", pct: target.midCap, reason: `Risk Off — keep mid cap modest at ${target.midCap}%; favor large cap defensives` }
      : { answer: "yes", pct: target.midCap, reason: `${regime} — mid caps offer growth at reasonable valuations; target ${target.midCap}% allocation` };

  // Hedge
  const hedgeAnswer: CIOAnswers["shouldHedge"] =
    regime === "Risk Off"
      ? { answer: "yes", hedgePct: target.hedge, reason: `Risk Off — hold ${target.hedge}% in gold/defensives; protection outweighs opportunity cost` }
      : regime === "Neutral"
        ? { answer: "partial", hedgePct: target.hedge, reason: `Neutral — ${target.hedge}% hedge adequate; GLDM provides regime-agnostic protection` }
        : { answer: "partial", hedgePct: target.hedge, reason: `Risk On — minimal hedge (${target.hedge}%) as insurance; don't over-hedge a constructive environment` };

  // Cash
  const targetCashUsd = Math.round(totalUsd * (target.cash / 100));
  const cashAnswer: CIOAnswers["targetCashPct"] = {
    pct: target.cash,
    usd: targetCashUsd,
    reason: regime === "Risk Off"
      ? `Hold ${target.cash}% cash ($${targetCashUsd.toLocaleString()}) — preserve capital; dry powder for post-correction deployment`
      : regime === "Neutral"
        ? `${target.cash}% cash ($${targetCashUsd.toLocaleString()}) — balanced; deploy selectively into high-conviction committee decisions`
        : `Minimize cash drag; hold only ${target.cash}% ($${targetCashUsd.toLocaleString()}) — deploy into conviction positions`,
  };

  // Position count
  const current = state.positionCount;
  const min = regime === "Risk Off" ? 8 : 10;
  const max = regime === "Risk Off" ? 15 : 20;
  const posCountAnswer: CIOAnswers["targetPositionCount"] = {
    min,
    max,
    current,
    reason: current < min
      ? `Concentrated below ${min}-position minimum — add diversification; ${max - current} more positions available before limit`
      : current > max
        ? `Overextended at ${current} positions — trim weakest convictions; target ${min}–${max} positions`
        : `Position count (${current}) within ${min}–${max} guideline — manageable conviction level`,
  };

  return {
    shouldOwnSmallCaps: smallCapAnswer,
    shouldOwnMidCaps: midCapAnswer,
    shouldHedge: hedgeAnswer,
    targetCashPct: cashAnswer,
    targetPositionCount: posCountAnswer,
  };
}

// ─── CIO Reasoning ────────────────────────────────────────────────────────────

function buildReasoning(
  regime: Regime,
  state: PortfolioState,
  target: BlueprintAllocation,
  gaps: GapItem[],
  macroData: Record<string, LatestMacro>,
  marketData: Record<string, LatestMarket>,
): string {
  const topGap = gaps.find(g => g.priority === "high");
  const techPct = state.sectorBreakdown.find(s => s.sector === "Technology")?.pct ?? 0;
  const lines: string[] = [];

  // ── Data inputs summary (Phase 11 transparency) ───────────────────────────
  const inputParts: string[] = [];
  const vix = marketData["VIX"];
  const ff  = macroData["Fed Funds Rate"];
  const cpi = macroData["CPI"];
  const sp  = marketData["SP500"];
  if (vix) inputParts.push(`VIX ${vix.value.toFixed(1)} (Yahoo Finance)`);
  if (sp)  inputParts.push(`S&P 500 ${sp.value.toLocaleString()} (Yahoo Finance)`);
  if (cpi) inputParts.push(`CPI ${cpi.value.toFixed(1)}% YoY (FRED)`);
  if (ff)  inputParts.push(`Fed Funds ${ff.value.toFixed(2)}% (FRED)`);
  if (inputParts.length > 0) {
    lines.push(`Data inputs: ${inputParts.join(", ")}.`);
  }

  lines.push(`Market regime is ${regime}. ${
    regime === "Risk On" ? "Constructive environment supports equity overweight; focus on quality growth compounders." :
    regime === "Risk Off" ? "Defensive positioning warranted; preserve capital, increase cash and hedge." :
    "Balanced approach — maintain diversified allocation, selectively deploy cash into high-conviction names."
  }`);

  // ── Macro context ─────────────────────────────────────────────────────────
  if (ff && ff.value > 4.5) {
    lines.push(`Fed Funds at ${ff.value.toFixed(2)}% — restrictive monetary policy compresses growth multiples; cash earns meaningful yield (money market alternative to idle deployment).`);
  }
  if (cpi && cpi.value > 3.5) {
    lines.push(`CPI at ${cpi.value.toFixed(1)}% — above Fed target; inflation risk limits easing pace and keeps real returns negative for fixed income.`);
  }

  if (techPct > 50) {
    lines.push(`Technology concentration at ${techPct.toFixed(0)}% creates correlated downside risk — ${regime === "Risk Off" ? "reduce on strength" : "maintain but hedge with gold/defensives"}.`);
  }

  if (state.smallPct < 3 && regime === "Risk On") {
    lines.push(`No small cap exposure — consider ${target.smallCap}% allocation to capture size premium; ETF or high-quality small cap growers preferred.`);
  }

  if (state.midPct < 5) {
    lines.push(`Mid cap gap (${state.midPct.toFixed(0)}% vs ${target.midCap}% target) — mid caps often best risk-adjusted performers mid-cycle.`);
  }

  if (topGap) {
    lines.push(`Highest priority: ${topGap.dimension} at ${topGap.current}% vs ${topGap.target}% target (gap: ${topGap.gap > 0 ? "+" : ""}${topGap.gap.toFixed(0)}%) — ${topGap.reason}.`);
  }

  if (state.hedgePct < target.hedge * 0.7) {
    lines.push(`Hedge allocation below target — consider adding GLDM or equivalent to reach ${target.hedge}% protective position.`);
  }

  return lines.join(" ");
}

// ─── Main generator ───────────────────────────────────────────────────────────

export async function generateBlueprint(): Promise<PortfolioBlueprintData> {
  const since30d = new Date(Date.now() - 30 * 86400 * 1000);

  // Load portfolio state + real-world data in parallel (Phase 11)
  const [state, macroData, marketData, latestBrief] = await Promise.all([
    computePortfolioState(),
    getLatestMacroSnapshots(),
    getLatestMarketSnapshots(),
    db.morningBrief.findFirst({ orderBy: { briefingDate: "desc" }, select: { marketRegime: true, marketRegimeEvidence: true } }).catch(() => null),
  ]);

  // Prefer the cached morning brief regime — it is authoritative and avoids duplicate computation
  let regimeResult: { regime: Regime; evidence: string[] };
  if (latestBrief?.marketRegime) {
    let evidence: string[] = [];
    try { evidence = JSON.parse(latestBrief.marketRegimeEvidence ?? "[]"); } catch { /* ignore */ }
    regimeResult = { regime: latestBrief.marketRegime as Regime, evidence };
  } else {
    regimeResult = await determineRegime(since30d, marketData);
  }

  const [committeeCount, oppCount, radarCount, thesisCount] = await Promise.all([
    db.committeeSession.count(),
    db.opportunityScore.count(),
    db.discoveryCandidate.count({ where: { status: "active" } }),
    db.investmentThesis.count(),
  ]);

  const target = buildTargetAllocation(regimeResult.regime, state);
  const rules = buildConcentrationRules(regimeResult.regime, state);
  const gaps = buildGapAnalysis(state, target);
  const capital = await buildCapitalAllocation(state, target, regimeResult.regime);
  const scenarios = buildScenarioAnalysis(state, target.hedge);
  const answers = buildCIOAnswers(regimeResult.regime, target, state, state.totalValueUsd);
  const reasoning = buildReasoning(regimeResult.regime, state, target, gaps, macroData, marketData);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Build human-readable macro inputs for transparency (Phase 11)
  const macroInputs: Record<string, string> = {};
  for (const [key, m] of Object.entries(macroData)) {
    macroInputs[key] = `${m.value.toFixed(2)} (${m.source}, ${m.date.toLocaleDateString("en-US", { month: "short", year: "numeric" })})`;
  }
  for (const [key, m] of Object.entries(marketData)) {
    macroInputs[key] = `${m.value.toFixed(2)} (${m.source}, ${m.date.toLocaleDateString()})`;
  }

  return {
    blueprintDate: today,
    marketRegime: regimeResult.regime,
    regimeEvidence: regimeResult.evidence,
    targetAllocation: target,
    concentrationRules: rules,
    gapAnalysis: gaps,
    capitalAllocation: capital,
    scenarioAnalysis: scenarios,
    cioAnswers: answers,
    reasoning,
    generatedFromSources: {
      positions: state.positionCount,
      committee: committeeCount,
      opportunities: oppCount,
      radar: radarCount,
      theses: thesisCount,
      macroDataPoints: Object.keys(macroData).length,
      marketDataPoints: Object.keys(marketData).length,
    },
    dataSources: {
      macro: Object.keys(macroData).map(m => `FRED/${m}`),
      market: Object.keys(marketData).map(m => `Yahoo Finance/${m}`),
      portfolio: ["DB/Positions", "DB/CommitteeSessions", "DB/OpportunityScores", "DB/InvestmentTheses"],
    },
    macroInputs,
  };
}

// ─── Save to DB ───────────────────────────────────────────────────────────────

export async function saveBlueprint(data: PortfolioBlueprintData) {
  const fields = {
    marketRegime: data.marketRegime,
    regimeEvidence: JSON.stringify(data.regimeEvidence),
    growthAllocation: data.targetAllocation.growthPct,
    valueAllocation: data.targetAllocation.valuePct,
    largeCap: data.targetAllocation.largeCap,
    midCap: data.targetAllocation.midCap,
    smallCap: data.targetAllocation.smallCap,
    international: data.targetAllocation.international,
    hedgeAllocation: data.targetAllocation.hedge,
    cashAllocation: data.targetAllocation.cash,
    maxPositions: data.concentrationRules.maxPositions,
    maxSingleStockPct: data.concentrationRules.maxSingleStockPct,
    maxSectorPct: data.concentrationRules.maxSectorPct,
    gapAnalysis: JSON.stringify(data.gapAnalysis),
    capitalAllocation: JSON.stringify(data.capitalAllocation),
    scenarioAnalysis: JSON.stringify(data.scenarioAnalysis),
    cioAnswers: JSON.stringify(data.cioAnswers),
    reasoning: data.reasoning,
    generatedFromSources: JSON.stringify({
      ...data.generatedFromSources,
      dataSources: data.dataSources,
      macroInputs: data.macroInputs,
    }),
  };
  return db.portfolioBlueprint.upsert({
    where: { blueprintDate: data.blueprintDate },
    create: { blueprintDate: data.blueprintDate, ...fields },
    update: fields,
  });
}

// ─── Deserialize from DB ──────────────────────────────────────────────────────

export function deserializeBlueprint(record: {
  id: string;
  blueprintDate: Date;
  marketRegime: string;
  regimeEvidence: string;
  growthAllocation: number;
  valueAllocation: number;
  largeCap: number;
  midCap: number;
  smallCap: number;
  international: number;
  hedgeAllocation: number;
  cashAllocation: number;
  maxPositions: number;
  maxSingleStockPct: number;
  maxSectorPct: number;
  gapAnalysis: string;
  capitalAllocation: string;
  scenarioAnalysis: string;
  cioAnswers: string;
  reasoning: string;
  generatedFromSources: string;
  createdAt: Date;
}): PortfolioBlueprintData & { id: string; createdAt: Date } {
  return {
    id: record.id,
    blueprintDate: record.blueprintDate,
    createdAt: record.createdAt,
    marketRegime: record.marketRegime as Regime,
    regimeEvidence: JSON.parse(record.regimeEvidence),
    targetAllocation: {
      growthPct: record.growthAllocation,
      valuePct: record.valueAllocation,
      largeCap: record.largeCap,
      midCap: record.midCap,
      smallCap: record.smallCap,
      international: record.international,
      hedge: record.hedgeAllocation,
      cash: record.cashAllocation,
    },
    dataSources: { macro: [], market: [], portfolio: [] },
    macroInputs: {},
    concentrationRules: {
      maxPositions: record.maxPositions,
      maxSingleStockPct: record.maxSingleStockPct,
      maxSectorPct: record.maxSectorPct,
      rationale: "",
    },
    gapAnalysis: JSON.parse(record.gapAnalysis),
    capitalAllocation: JSON.parse(record.capitalAllocation),
    scenarioAnalysis: JSON.parse(record.scenarioAnalysis),
    cioAnswers: JSON.parse(record.cioAnswers),
    reasoning: record.reasoning,
    generatedFromSources: JSON.parse(record.generatedFromSources),
  };
}
