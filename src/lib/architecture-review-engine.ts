// Portfolio Architecture Review Engine — Phase 16
//
// Monthly deep-dive structural analysis:
//   - Exposure map (sector, geography, theme, size)
//   - Concentration analysis (HHI, single-stock, sector limits)
//   - Hidden correlation clusters (shared risk factors)
//   - Hedge effectiveness audit (gold, cash, broad market ETF)
//   - Scenario stress tests (4 standard regimes)
//   - Architecture score 0–100 (diversification + concentration + hedge + resilience)
//   - Prioritized recommendations (no auto-rebalancing)
//
// Rules-based — no AI API calls. All signals from DB + real-world data.

import fs from "fs";
import path from "path";
import { db } from "./db";
import { resolveBrainOsPath } from "./shared-paths";
import {
  type HedgeEfficiencyResult,
  type ReplacementScenario,
  runFullHedgeEfficiencyAnalysis,
} from "./hedge-efficiency-engine";
import {
  type RegimeHedgeReport,
  generateRegimeHedgeReport,
} from "./regime-hedge-engine";

// ─── Ticker classification ────────────────────────────────────────────────────

const GOLD_TICKERS   = new Set(["GLDM", "GLD", "IAU", "SGOL", "PHYS"]);
const DEFENSE_TICKERS = new Set(["ITA", "XAR", "PPA", "DFEN"]);
const BROAD_ETF_TICKERS = new Set(["SPY", "QQQ", "VOO", "VTI", "IVV", "SCHB", "VT"]);
const BOND_TICKERS    = new Set(["BND", "AGG", "TLT", "SHY", "VGIT", "IEF"]);
const INTL_TICKERS    = new Set(["TSM", "ASML", "NVO", "BABA", "BIDU", "SE", "SAP"]);

const ALL_HEDGE_TICKERS = new Set([
  ...GOLD_TICKERS, ...DEFENSE_TICKERS, ...BROAD_ETF_TICKERS, ...BOND_TICKERS,
]);

const THEME_MAP: Record<string, string> = {
  NVDA: "AI Infrastructure", TSM: "AI Infrastructure", ASML: "AI Infrastructure",
  MU: "AI Infrastructure",   AMD: "AI Infrastructure", SMCI: "AI Infrastructure",
  MSFT: "Platform AI",       GOOGL: "Platform AI",     GOOG: "Platform AI",
  AMZN: "Platform AI",       META: "Platform AI",
  AAPL: "Consumer Technology",
  LLY: "Healthcare / GLP-1", NVO: "Healthcare / GLP-1",
  V: "Payments",             MA: "Payments",
  CELH: "Consumer Brands",
  ITA: "Defense ETF",
  GLDM: "Gold Hedge",        GLD: "Gold Hedge",  IAU: "Gold Hedge",
  CASH: "Cash",
};

// ─── Correlation cluster definitions ─────────────────────────────────────────

interface ClusterDef {
  id: string;
  name: string;
  description: string;
  tickers: string[];
  sharedRiskFactor: string;
  scenarioDownside: string;
}

const CORRELATION_CLUSTERS: ClusterDef[] = [
  {
    id: "ai_infrastructure",
    name: "AI Infrastructure",
    description: "GPU, foundry, and chip equipment — all exposed to AI capex cycle and semiconductor supply chain",
    tickers: ["NVDA", "TSM", "ASML", "MU", "AMD", "SMCI"],
    sharedRiskFactor: "AI capex slowdown or semiconductor oversupply",
    scenarioDownside: "-30% to -50% in AI demand shock",
  },
  {
    id: "platform_ai",
    name: "Platform AI & Cloud",
    description: "Hyperscalers and platforms monetizing AI — vulnerable to AI revenue disappointment or antitrust",
    tickers: ["MSFT", "GOOGL", "GOOG", "AMZN", "META"],
    sharedRiskFactor: "AI revenue disappointment or big-tech antitrust action",
    scenarioDownside: "-20% to -35% in AI disillusionment scenario",
  },
  {
    id: "taiwan_supply_chain",
    name: "Taiwan Supply Chain Risk",
    description: "Companies with critical Taiwan manufacturing or direct operational exposure",
    tickers: ["NVDA", "TSM", "ASML", "AAPL", "MU", "AMD"],
    sharedRiskFactor: "Taiwan conflict or cross-strait tension escalation",
    scenarioDownside: "-15% to -60% depending on position (TSM direct; others indirect)",
  },
  {
    id: "digital_advertising",
    name: "Digital Advertising",
    description: "Ad-revenue dependent platforms — correlated with consumer confidence and CMO budgets",
    tickers: ["META", "GOOGL", "GOOG"],
    sharedRiskFactor: "Ad market downturn in recession or CMO budget cuts",
    scenarioDownside: "-15% to -25% in economic slowdown",
  },
  {
    id: "glp1_pharma",
    name: "GLP-1 Pharma Theme",
    description: "GLP-1 obesity and diabetes drug leaders — correlated with regulatory and clinical pipeline outcomes",
    tickers: ["LLY", "NVO"],
    sharedRiskFactor: "GLP-1 safety finding, coverage restriction, or biosimilar entry",
    scenarioDownside: "-20% to -40% on adverse GLP-1 clinical or regulatory news",
  },
  {
    id: "payments_network",
    name: "Payments Network Duopoly",
    description: "Network-effect payment rails — correlated with consumer spending volume",
    tickers: ["V", "MA"],
    sharedRiskFactor: "BNPL disruption, CBDC adoption, or consumer credit crisis",
    scenarioDownside: "-15% to -25% in severe consumer credit event",
  },
];

// Scenario-level position impact for stress tests
const SCENARIO_POSITION_IMPACT: Record<string, Record<string, { direction: "up" | "down" | "flat"; magnitude: string }>> = {
  "Taiwan Conflict": {
    NVDA: { direction: "down", magnitude: "-20% to -40%" },
    TSM:  { direction: "down", magnitude: "-40% to -60%" },
    ASML: { direction: "down", magnitude: "-20% to -35%" },
    AAPL: { direction: "down", magnitude: "-15% to -25%" },
    MU:   { direction: "down", magnitude: "-15% to -30%" },
    MSFT: { direction: "flat", magnitude: "-5% to +5%"   },
    META: { direction: "flat", magnitude: "-5% to +5%"   },
    GLDM: { direction: "up",   magnitude: "+15% to +30%" },
    GLD:  { direction: "up",   magnitude: "+15% to +30%" },
    ITA:  { direction: "up",   magnitude: "+10% to +25%" },
  },
  "Recession": {
    NVDA:  { direction: "down", magnitude: "-20% to -35%" },
    GOOGL: { direction: "down", magnitude: "-15% to -25%" },
    GOOG:  { direction: "down", magnitude: "-15% to -25%" },
    META:  { direction: "down", magnitude: "-15% to -25%" },
    AAPL:  { direction: "down", magnitude: "-10% to -20%" },
    CELH:  { direction: "down", magnitude: "-20% to -35%" },
    V:     { direction: "down", magnitude: "-10% to -20%" },
    MA:    { direction: "down", magnitude: "-10% to -20%" },
    LLY:   { direction: "down", magnitude: "-10% to -20%" },
    MSFT:  { direction: "flat", magnitude: "-5% to +5%"   },
    AMZN:  { direction: "flat", magnitude: "-5% to -10%"  },
    ITA:   { direction: "flat", magnitude: "-5% to +5%"   },
    GLDM:  { direction: "up",   magnitude: "+10% to +20%" },
    GLD:   { direction: "up",   magnitude: "+10% to +20%" },
  },
  "AI Boom": {
    NVDA:  { direction: "up",   magnitude: "+30% to +60%" },
    TSM:   { direction: "up",   magnitude: "+20% to +40%" },
    ASML:  { direction: "up",   magnitude: "+20% to +35%" },
    MSFT:  { direction: "up",   magnitude: "+15% to +25%" },
    GOOGL: { direction: "up",   magnitude: "+20% to +40%" },
    GOOG:  { direction: "up",   magnitude: "+20% to +40%" },
    AMZN:  { direction: "up",   magnitude: "+15% to +30%" },
    META:  { direction: "up",   magnitude: "+15% to +25%" },
    AAPL:  { direction: "up",   magnitude: "+10% to +20%" },
    ITA:   { direction: "flat", magnitude: "-5% to +10%"  },
    GLDM:  { direction: "down", magnitude: "-5% to -10%"  },
    GLD:   { direction: "down", magnitude: "-5% to -10%"  },
  },
  "Soft Landing": {
    NVDA:  { direction: "up", magnitude: "+10% to +25%" },
    MSFT:  { direction: "up", magnitude: "+8% to +15%"  },
    GOOGL: { direction: "up", magnitude: "+10% to +20%" },
    AAPL:  { direction: "up", magnitude: "+8% to +15%"  },
    ITA:   { direction: "up", magnitude: "+5% to +12%"  },
    TSM:   { direction: "up", magnitude: "+8% to +18%"  },
    GLDM:  { direction: "flat", magnitude: "-5% to +5%" },
    GLD:   { direction: "flat", magnitude: "-5% to +5%" },
  },
};

// Hedge effectiveness per scenario type
const HEDGE_SCENARIO_EFFECTIVENESS: Record<string, Record<string, { effective: boolean; reason: string }>> = {
  "Taiwan Conflict": {
    gold:        { effective: true,  reason: "Safe haven premium on geopolitical uncertainty" },
    cash:        { effective: true,  reason: "Preserves capital for post-crisis deployment" },
    defense_etf: { effective: true,  reason: "Defense spending surge on escalation" },
    broad_etf:   { effective: false, reason: "Correlates with tech sector decline" },
  },
  "Recession": {
    gold:        { effective: true,  reason: "Safe haven demand; rate cuts benefit gold" },
    cash:        { effective: true,  reason: "No drawdown; dry powder for recovery" },
    defense_etf: { effective: true,  reason: "Defense budgets relatively recession-proof" },
    broad_etf:   { effective: false, reason: "Declines with broad market selloff" },
  },
  "AI Boom": {
    gold:        { effective: false, reason: "Risk-on reduces safe haven demand" },
    cash:        { effective: false, reason: "Opportunity cost vs. equity rally" },
    defense_etf: { effective: true,  reason: "AI-enabled defense systems; limited upside" },
    broad_etf:   { effective: true,  reason: "Participates in broad market rally" },
  },
  "Soft Landing": {
    gold:        { effective: false, reason: "Real yields stabilize; limited upside" },
    cash:        { effective: false, reason: "Below-market return in benign environment" },
    defense_etf: { effective: true,  reason: "NATO commitments; steady returns" },
    broad_etf:   { effective: true,  reason: "Participates in broad equity rally" },
  },
};

// ─── Output types ─────────────────────────────────────────────────────────────

export interface ExposureItem {
  label: string;
  pct: number;
  tickers: string[];
  count: number;
}

export interface ExposureMap {
  bySector: ExposureItem[];
  byGeography: ExposureItem[];
  byTheme: ExposureItem[];
  bySize: ExposureItem[];
  cashPct: number;
  hedgePct: number;
  equityPct: number;
}

export interface ConcentrationBreach {
  type: "single_stock" | "sector";
  name: string;
  currentPct: number;
  limitPct: number;
  severity: "warning" | "violation";
}

export interface ConcentrationAnalysis {
  sectorHHI: number;
  hhiLevel: "low" | "moderate" | "high" | "extreme";
  topPositions: { ticker: string; name: string; pct: number; sector: string | null }[];
  sectorBreakdown: { sector: string; pct: number; tickers: string[] }[];
  breaches: ConcentrationBreach[];
  maxSingleStockPct: number;
  maxSectorPct: number;
}

export interface CorrelationCluster {
  id: string;
  name: string;
  description: string;
  heldTickers: string[];
  combinedPct: number;
  sharedRiskFactor: string;
  scenarioDownside: string;
  significance: "high" | "medium" | "low";
}

export interface HiddenCorrelationAnalysis {
  clusters: CorrelationCluster[];
  aiTechExposurePct: number;
  taiwanRiskPct: number;
  adRevenueExposurePct: number;
  insights: string[];
}

export interface HedgeAsset {
  ticker: string;
  hedgeType: "gold" | "cash" | "defense_etf" | "broad_etf" | "bond";
  pct: number;
  valueUsd: number;
  present: boolean;
}

export interface HedgeScenarioAdequacy {
  scenario: string;
  adequate: boolean;
  activeHedges: string[];
  reason: string;
}

export interface HedgeEffectiveness {
  assets: HedgeAsset[];
  goldPct: number;
  cashPct: number;
  defenseEtfPct: number;
  broadEtfPct: number;
  totalHedgePct: number;
  missingHedgeTypes: string[];
  hedgeScore: number;
  scenarioAdequacy: HedgeScenarioAdequacy[];
  recommendations: string[];
}

export interface StressTestPosition {
  ticker: string;
  direction: "up" | "down" | "flat";
  estimatedMove: string;
  portfolioWeightPct: number;
}

export interface ArchitectureStressTest {
  scenario: string;
  description: string;
  portfolioImpact: "very_positive" | "positive" | "neutral" | "negative" | "very_negative";
  estimatedPortfolioReturn: string;
  worstPositions: StressTestPosition[];
  bestPositions: StressTestPosition[];
  hedgeCoverage: "sufficient" | "adequate" | "insufficient";
  hedgeOffsetNote: string;
}

export interface ArchitectureScoreBreakdown {
  total: number;
  diversification: number;
  concentration: number;
  hedgeQuality: number;
  regimeResilience: number;
  grade: "A" | "B" | "C" | "D" | "F";
  label: string;
}

export interface ArchitectureRecommendation {
  priority: "critical" | "high" | "medium" | "low";
  category: "concentration" | "diversification" | "hedge" | "correlation" | "regime";
  action: string;
  detail: string;
  ticker: string | null;
}

export interface HedgeCorrelationWindow {
  d30:  number | null;
  d90:  number | null;
  d180: number | null;
}

export interface HedgeAuditResult {
  gldmAllocationPct: number;
  dataPoints: number;       // aligned trading days used for primary (90d) window
  lookbackDays: number;

  // Primary 90d correlations (Pearson r) — used in score computation
  portfolioCorrelation: number;
  spyCorrelation: number;
  qqqCorrelation: number;

  // Multi-window correlations — Phase 16.2
  correlations: {
    gldmVsPortfolio: HedgeCorrelationWindow;
    gldmVsSpy:       HedgeCorrelationWindow;
    gldmVsQqq:       HedgeCorrelationWindow;
  };

  // Drawdown protection
  maxDrawdownActual: number;   // portfolio max drawdown % with gold
  maxDrawdownExGold: number;   // portfolio max drawdown % without gold
  drawdownBenefitPct: number;  // positive = gold reduced drawdown

  // Return drag
  returnActualPct: number;     // portfolio total return over window
  returnExGoldPct: number;     // hypothetical total return without gold
  returnDragPct: number;       // positive = gold hurt returns

  // Component scores (0-100)
  correlationScore: number;
  drawdownProtectionScore: number;
  returnDragScore: number;

  // Composite
  hedgeScore: number;
  verdict: "KEEP" | "REDUCE" | "REPLACE" | "REMOVE";
  reasoning: string;

  // Hedge stack inventory — Phase 16.2
  hedgeStack: {
    gold:         { tickers: string[]; allocationPct: number };
    cash:         { tickers: string[]; allocationPct: number };
    defense:      { tickers: string[]; allocationPct: number };
    broadEtf:     { tickers: string[]; allocationPct: number };
    growthAssets: { tickers: string[]; allocationPct: number };
    totalHedgePct: number;
  };

  portfolioReturnSource: "reconstructed_prices" | "snapshot_nav";

  dataInsufficient: boolean;
  insufficiencyReason?: string;
}

export interface PortfolioArchitectureReviewData {
  reviewDate: Date;
  marketRegime: string;
  exposureMap: ExposureMap;
  concentrationAnalysis: ConcentrationAnalysis;
  hiddenCorrelations: HiddenCorrelationAnalysis;
  hedgeEffectiveness: HedgeEffectiveness;
  stressTests: ArchitectureStressTest[];
  architectureScore: ArchitectureScoreBreakdown;
  recommendations: ArchitectureRecommendation[];
  hedgeAudit: HedgeAuditResult | null;
  hedgeRanking: HedgeEfficiencyResult[] | null;
  replacementScenarios: ReplacementScenario[] | null;
  regimeHedgeReport: RegimeHedgeReport | null;
  generatedFromSources: {
    positions: number;
    theses: number;
    opportunityScores: number;
    morningBriefDate: string | null;
    newsletterItems: number;
  };
}

// ─── Internal position type ───────────────────────────────────────────────────

interface ArchPos {
  ticker: string;
  name: string;
  sector: string | null;
  pct: number;          // normalized % of total portfolio
  valueUsd: number;
  marketCapUsd: number | null;
  country: string | null;
  isHedge: boolean;
  isCash: boolean;
}

// ─── Portfolio data loader ────────────────────────────────────────────────────

async function loadPositions(): Promise<ArchPos[]> {
  const positions = await db.position.findMany({
    where: { status: "active" },
    select: { ticker: true, name: true, sector: true, allocationPct: true, currentValueUsd: true },
  });

  // Resolve allocation % — prefer allocationPct, fallback to currentValueUsd
  let resolved = positions.map(p => ({ ...p, pct: p.allocationPct ?? 0 }));
  const totalPct = resolved.reduce((s, p) => s + p.pct, 0);

  if (totalPct > 20) {
    const factor = 100 / totalPct;
    resolved = resolved.map(p => ({ ...p, pct: p.pct * factor }));
  } else {
    // Fall back to currentValueUsd
    const totalUsd = positions.reduce((s, p) => s + (p.currentValueUsd ?? 0), 0);
    if (totalUsd > 0) {
      resolved = positions.map(p => ({ ...p, pct: ((p.currentValueUsd ?? 0) / totalUsd) * 100 }));
    }
  }

  // Enrich with universe data
  const tickers = resolved.map(p => p.ticker).filter(t => t !== "CASH");
  const universeRows = await db.universe.findMany({
    where: { ticker: { in: tickers } },
    select: { ticker: true, marketCap: true, country: true },
  });
  const uniMap = new Map(universeRows.map(u => [u.ticker, u]));

  return resolved.map(p => {
    const u = uniMap.get(p.ticker);
    return {
      ticker: p.ticker,
      name: p.name,
      sector: p.sector,
      pct: Math.round(p.pct * 100) / 100,
      valueUsd: p.currentValueUsd ?? 0,
      marketCapUsd: u?.marketCap ?? null,
      country: u?.country ?? (INTL_TICKERS.has(p.ticker) ? "Non-US" : "US"),
      isHedge: ALL_HEDGE_TICKERS.has(p.ticker),
      isCash: p.ticker === "CASH",
    };
  });
}

// ─── Exposure map ─────────────────────────────────────────────────────────────

function buildExposureMap(positions: ArchPos[]): ExposureMap {
  const equity = positions.filter(p => !p.isCash && !p.isHedge);
  const cashPct = positions.filter(p => p.isCash).reduce((s, p) => s + p.pct, 0);
  const hedgePct = positions.filter(p => p.isHedge).reduce((s, p) => s + p.pct, 0);
  const equityPct = equity.reduce((s, p) => s + p.pct, 0);

  // By sector
  const sectorMap = new Map<string, ArchPos[]>();
  for (const p of equity) {
    const s = p.sector ?? "Unknown";
    const arr = sectorMap.get(s) ?? [];
    arr.push(p);
    sectorMap.set(s, arr);
  }
  const bySector: ExposureItem[] = [...sectorMap.entries()]
    .map(([label, ps]) => ({
      label,
      pct: Math.round(ps.reduce((s, p) => s + p.pct, 0) * 10) / 10,
      tickers: ps.map(p => p.ticker),
      count: ps.length,
    }))
    .sort((a, b) => b.pct - a.pct);

  // By geography
  const usPositions  = equity.filter(p => p.country === "US" || (!p.country && !INTL_TICKERS.has(p.ticker)));
  const intlPositions = equity.filter(p => p.country !== "US" || INTL_TICKERS.has(p.ticker));
  const byGeography: ExposureItem[] = [
    { label: "United States",   pct: Math.round(usPositions.reduce((s, p)   => s + p.pct, 0) * 10) / 10, tickers: usPositions.map(p => p.ticker),   count: usPositions.length },
    { label: "International",   pct: Math.round(intlPositions.reduce((s, p) => s + p.pct, 0) * 10) / 10, tickers: intlPositions.map(p => p.ticker), count: intlPositions.length },
  ].filter(g => g.count > 0);

  // By theme
  const themeMap = new Map<string, ArchPos[]>();
  for (const p of positions.filter(p => !p.isCash)) {
    const theme = THEME_MAP[p.ticker] ?? p.sector ?? "Other";
    const arr = themeMap.get(theme) ?? [];
    arr.push(p);
    themeMap.set(theme, arr);
  }
  const byTheme: ExposureItem[] = [...themeMap.entries()]
    .map(([label, ps]) => ({
      label,
      pct: Math.round(ps.reduce((s, p) => s + p.pct, 0) * 10) / 10,
      tickers: ps.map(p => p.ticker),
      count: ps.length,
    }))
    .sort((a, b) => b.pct - a.pct);

  // By size (marketCap USD millions: large >10B, mid 2B-10B, small <2B)
  const large = equity.filter(p => (p.marketCapUsd ?? 0) >= 10_000);
  const mid   = equity.filter(p => (p.marketCapUsd ?? 0) >= 2_000 && (p.marketCapUsd ?? 0) < 10_000);
  const small = equity.filter(p => p.marketCapUsd !== null && p.marketCapUsd < 2_000);
  const unknown = equity.filter(p => p.marketCapUsd === null);
  const bySize: ExposureItem[] = [
    { label: "Large Cap (>$10B)",  pct: Math.round(large.reduce((s, p) => s + p.pct, 0) * 10) / 10,   tickers: large.map(p => p.ticker),   count: large.length },
    { label: "Mid Cap ($2B–$10B)", pct: Math.round(mid.reduce((s, p) => s + p.pct, 0) * 10) / 10,     tickers: mid.map(p => p.ticker),     count: mid.length },
    { label: "Small Cap (<$2B)",   pct: Math.round(small.reduce((s, p) => s + p.pct, 0) * 10) / 10,   tickers: small.map(p => p.ticker),   count: small.length },
    { label: "Unknown Size",       pct: Math.round(unknown.reduce((s, p) => s + p.pct, 0) * 10) / 10, tickers: unknown.map(p => p.ticker), count: unknown.length },
  ].filter(s => s.count > 0);

  return {
    bySector,
    byGeography,
    byTheme,
    bySize,
    cashPct: Math.round(cashPct * 10) / 10,
    hedgePct: Math.round(hedgePct * 10) / 10,
    equityPct: Math.round(equityPct * 10) / 10,
  };
}

// ─── Concentration analysis ───────────────────────────────────────────────────

function buildConcentrationAnalysis(positions: ArchPos[]): ConcentrationAnalysis {
  const equity = positions.filter(p => !p.isCash);

  // Sector HHI (use sector shares as fractions × 10000)
  const sectorMap = new Map<string, { pct: number; tickers: string[] }>();
  for (const p of equity) {
    const s = p.sector ?? "Unknown";
    const existing = sectorMap.get(s) ?? { pct: 0, tickers: [] };
    sectorMap.set(s, { pct: existing.pct + p.pct, tickers: [...existing.tickers, p.ticker] });
  }
  const sectorBreakdown = [...sectorMap.entries()]
    .map(([sector, d]) => ({ sector, pct: Math.round(d.pct * 10) / 10, tickers: d.tickers }))
    .sort((a, b) => b.pct - a.pct);

  const totalEquityPct = equity.reduce((s, p) => s + p.pct, 0);
  let sectorHHI = 0;
  if (totalEquityPct > 0) {
    for (const [, d] of sectorMap) {
      const share = d.pct / totalEquityPct;
      sectorHHI += share * share * 10_000;
    }
  }
  sectorHHI = Math.round(sectorHHI);

  let hhiLevel: ConcentrationAnalysis["hhiLevel"];
  if      (sectorHHI < 1500) hhiLevel = "low";
  else if (sectorHHI < 2500) hhiLevel = "moderate";
  else if (sectorHHI < 4500) hhiLevel = "high";
  else                       hhiLevel = "extreme";

  const topPositions = [...equity]
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 7)
    .map(p => ({ ticker: p.ticker, name: p.name, pct: Math.round(p.pct * 10) / 10, sector: p.sector }));

  const maxSingleStockPct = topPositions[0]?.pct ?? 0;
  const maxSectorPct = sectorBreakdown[0]?.pct ?? 0;

  const breaches: ConcentrationBreach[] = [];

  for (const p of equity) {
    if (p.pct > 20) {
      breaches.push({ type: "single_stock", name: p.ticker, currentPct: Math.round(p.pct * 10) / 10, limitPct: 20, severity: "violation" });
    } else if (p.pct > 15) {
      breaches.push({ type: "single_stock", name: p.ticker, currentPct: Math.round(p.pct * 10) / 10, limitPct: 15, severity: "warning" });
    }
  }
  for (const { sector, pct } of sectorBreakdown) {
    if (pct > 50) {
      breaches.push({ type: "sector", name: sector, currentPct: pct, limitPct: 50, severity: "violation" });
    } else if (pct > 40) {
      breaches.push({ type: "sector", name: sector, currentPct: pct, limitPct: 40, severity: "warning" });
    }
  }

  return {
    sectorHHI,
    hhiLevel,
    topPositions,
    sectorBreakdown,
    breaches,
    maxSingleStockPct: Math.round(maxSingleStockPct * 10) / 10,
    maxSectorPct: Math.round(maxSectorPct * 10) / 10,
  };
}

// ─── Hidden correlation analysis ──────────────────────────────────────────────

function buildHiddenCorrelations(positions: ArchPos[]): HiddenCorrelationAnalysis {
  const heldTickers = new Map(positions.map(p => [p.ticker, p.pct]));

  const clusters: CorrelationCluster[] = CORRELATION_CLUSTERS
    .map(def => {
      const heldInCluster = def.tickers.filter(t => heldTickers.has(t));
      const combinedPct   = heldInCluster.reduce((s, t) => s + (heldTickers.get(t) ?? 0), 0);
      const significance: CorrelationCluster["significance"] =
        combinedPct >= 30 ? "high" : combinedPct >= 15 ? "medium" : "low";
      return {
        id: def.id,
        name: def.name,
        description: def.description,
        heldTickers: heldInCluster,
        combinedPct: Math.round(combinedPct * 10) / 10,
        sharedRiskFactor: def.sharedRiskFactor,
        scenarioDownside: def.scenarioDownside,
        significance,
      };
    })
    .filter(c => c.heldTickers.length > 0)
    .sort((a, b) => b.combinedPct - a.combinedPct);

  // Macro exposures
  const aiTickers    = new Set(["NVDA", "TSM", "ASML", "MU", "AMD", "MSFT", "GOOGL", "GOOG", "AMZN", "META", "AAPL"]);
  const taiwanTickers = new Set(["NVDA", "TSM", "ASML", "AAPL", "MU", "AMD"]);
  const adTickers    = new Set(["META", "GOOGL", "GOOG"]);

  const aiTechExposurePct   = [...heldTickers.entries()].filter(([t]) => aiTickers.has(t)).reduce((s, [, p]) => s + p, 0);
  const taiwanRiskPct       = [...heldTickers.entries()].filter(([t]) => taiwanTickers.has(t)).reduce((s, [, p]) => s + p, 0);
  const adRevenueExposurePct = [...heldTickers.entries()].filter(([t]) => adTickers.has(t)).reduce((s, [, p]) => s + p, 0);

  const insights: string[] = [];
  const aiCluster = clusters.find(c => c.id === "ai_infrastructure");
  const platformCluster = clusters.find(c => c.id === "platform_ai");

  if (aiCluster && platformCluster) {
    const totalAI = aiCluster.combinedPct + platformCluster.combinedPct;
    if (totalAI > 40) {
      insights.push(`Combined AI exposure (infrastructure + platform) at ${totalAI.toFixed(0)}% — portfolio is highly correlated to the AI investment cycle.`);
    }
  }
  if (taiwanRiskPct > 25) {
    insights.push(`Taiwan supply chain risk at ${taiwanRiskPct.toFixed(0)}% of portfolio — a Taiwan conflict or blockade would trigger simultaneous drawdowns across multiple positions.`);
  }
  if (adRevenueExposurePct > 15) {
    insights.push(`Ad-revenue exposure at ${adRevenueExposurePct.toFixed(0)}% — META and Google positions are correlated to the same macro driver (CMO ad budgets).`);
  }

  const highClusters = clusters.filter(c => c.significance === "high");
  if (highClusters.length >= 2) {
    insights.push(`${highClusters.length} high-significance correlation clusters — broad market or sector ETFs would reduce hidden co-movement risk.`);
  }

  if (insights.length === 0) {
    insights.push("No dominant hidden correlation risks identified — portfolio clusters are within acceptable bounds.");
  }

  return {
    clusters,
    aiTechExposurePct: Math.round(aiTechExposurePct * 10) / 10,
    taiwanRiskPct: Math.round(taiwanRiskPct * 10) / 10,
    adRevenueExposurePct: Math.round(adRevenueExposurePct * 10) / 10,
    insights,
  };
}

// ─── Hedge effectiveness audit ────────────────────────────────────────────────

function buildHedgeEffectiveness(positions: ArchPos[]): HedgeEffectiveness {
  const hedgeAssets: HedgeAsset[] = positions
    .filter(p => p.isHedge || p.isCash)
    .map(p => {
      let hedgeType: HedgeAsset["hedgeType"];
      if (p.isCash) hedgeType = "cash";
      else if (GOLD_TICKERS.has(p.ticker)) hedgeType = "gold";
      else if (DEFENSE_TICKERS.has(p.ticker)) hedgeType = "defense_etf";
      else if (BROAD_ETF_TICKERS.has(p.ticker)) hedgeType = "broad_etf";
      else hedgeType = "bond";
      return {
        ticker: p.ticker,
        hedgeType,
        pct: Math.round(p.pct * 10) / 10,
        valueUsd: p.valueUsd,
        present: true,
      };
    });

  const goldPct      = hedgeAssets.filter(h => h.hedgeType === "gold").reduce((s, h) => s + h.pct, 0);
  const cashPct      = hedgeAssets.filter(h => h.hedgeType === "cash").reduce((s, h) => s + h.pct, 0);
  const defenseEtfPct = hedgeAssets.filter(h => h.hedgeType === "defense_etf").reduce((s, h) => s + h.pct, 0);
  const broadEtfPct  = hedgeAssets.filter(h => h.hedgeType === "broad_etf").reduce((s, h) => s + h.pct, 0);
  const totalHedgePct = goldPct + cashPct + defenseEtfPct + broadEtfPct;

  const missingHedgeTypes: string[] = [];
  if (goldPct === 0) missingHedgeTypes.push("Gold (GLDM / GLD / IAU)");
  if (cashPct < 3)  missingHedgeTypes.push("Cash reserve (< 3%)");
  if (defenseEtfPct === 0 && broadEtfPct === 0) missingHedgeTypes.push("Broad market or defense ETF");

  // Hedge score 0–100
  let hedgeScore = 0;
  // Gold (max 35 pts)
  if (goldPct >= 5) hedgeScore += 35;
  else if (goldPct >= 3) hedgeScore += 25;
  else if (goldPct > 0) hedgeScore += 12;
  // Cash (max 35 pts)
  if (cashPct >= 8) hedgeScore += 35;
  else if (cashPct >= 5) hedgeScore += 25;
  else if (cashPct >= 2) hedgeScore += 15;
  else if (cashPct > 0) hedgeScore += 8;
  // ETF (max 20 pts)
  if (defenseEtfPct >= 3 || broadEtfPct >= 3) hedgeScore += 20;
  else if (defenseEtfPct > 0 || broadEtfPct > 0) hedgeScore += 12;
  // Diversified hedges (max 10 pts)
  const hedgeTypeCount = [goldPct > 0, cashPct > 0, defenseEtfPct > 0 || broadEtfPct > 0].filter(Boolean).length;
  if (hedgeTypeCount >= 3) hedgeScore += 10;
  else if (hedgeTypeCount === 2) hedgeScore += 5;

  hedgeScore = Math.min(100, hedgeScore);

  // Scenario adequacy
  const SCENARIOS = ["Taiwan Conflict", "Recession", "AI Boom", "Soft Landing"];
  const scenarioAdequacy: HedgeScenarioAdequacy[] = SCENARIOS.map(scenario => {
    const eff = HEDGE_SCENARIO_EFFECTIVENESS[scenario] ?? {};
    const activeHedges: string[] = [];
    let effectiveHedgePct = 0;

    if (goldPct > 0 && eff.gold?.effective)        { activeHedges.push(`Gold (${goldPct.toFixed(1)}%)`); effectiveHedgePct += goldPct; }
    if (cashPct > 0 && eff.cash?.effective)        { activeHedges.push(`Cash (${cashPct.toFixed(1)}%)`); effectiveHedgePct += cashPct; }
    if (defenseEtfPct > 0 && eff.defense_etf?.effective) { activeHedges.push(`Defense ETF (${defenseEtfPct.toFixed(1)}%)`); effectiveHedgePct += defenseEtfPct; }
    if (broadEtfPct > 0 && eff.broad_etf?.effective)   { activeHedges.push(`Broad ETF (${broadEtfPct.toFixed(1)}%)`); effectiveHedgePct += broadEtfPct; }

    const adequate = effectiveHedgePct >= 5;
    const reason = activeHedges.length > 0
      ? `${activeHedges.join(", ")} effective in this scenario (${effectiveHedgePct.toFixed(1)}% total coverage)`
      : "No effective hedges for this scenario — full equity exposure";

    return { scenario, adequate, activeHedges, reason };
  });

  const recommendations: string[] = [];
  if (goldPct === 0)  recommendations.push("Add GLDM or GLD to establish a gold hedge — effective in both recession and geopolitical risk scenarios.");
  else if (goldPct < 3) recommendations.push(`Increase gold allocation from ${goldPct.toFixed(1)}% to 3–5% — current coverage is below the minimum effective threshold.`);
  if (cashPct < 3)   recommendations.push("Increase cash reserve to at least 3–5% — serves as both a defensive buffer and dry powder for opportunistic deployment.");
  if (defenseEtfPct === 0 && broadEtfPct === 0) recommendations.push("Consider adding a defense ETF (ITA) or broad market ETF to improve hedge coverage across AI boom and soft landing scenarios.");
  if (missingHedgeTypes.length === 0 && hedgeScore >= 70) recommendations.push("Hedge coverage is adequate — maintain current hedge allocation and review sizing quarterly.");

  return {
    assets: hedgeAssets,
    goldPct: Math.round(goldPct * 10) / 10,
    cashPct: Math.round(cashPct * 10) / 10,
    defenseEtfPct: Math.round(defenseEtfPct * 10) / 10,
    broadEtfPct: Math.round(broadEtfPct * 10) / 10,
    totalHedgePct: Math.round(totalHedgePct * 10) / 10,
    missingHedgeTypes,
    hedgeScore,
    scenarioAdequacy,
    recommendations,
  };
}

// ─── Hedge Audit — Phase 16.1 ─────────────────────────────────────────────────

const HEDGE_AUDIT_LOOKBACK      = 90;   // primary scoring window (calendar days)
const HEDGE_AUDIT_LOOKBACK_LONG = 180;  // extended window for multi-window correlations
const HEDGE_AUDIT_MIN_PTS       = 15;   // minimum aligned trading days for statistical validity

/** Fetch daily closing prices for a ticker from Yahoo Finance. Returns date→price map. */
async function fetchAssetHistory(symbol: string, days: number): Promise<Map<string, number>> {
  const range = days <= 30 ? "1mo" : days <= 90 ? "3mo" : "6mo";
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}&includePrePost=false`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept":     "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return new Map();

    const data = await res.json() as {
      chart?: {
        result?: Array<{
          timestamp?: number[];
          indicators?: { quote?: Array<{ close?: (number | null)[] }> };
        }>;
      };
    };

    const result = data?.chart?.result?.[0];
    if (!result) return new Map();

    const timestamps = result.timestamp ?? [];
    const closes     = result.indicators?.quote?.[0]?.close ?? [];
    const prices     = new Map<string, number>();

    for (let i = 0; i < timestamps.length; i++) {
      const c = closes[i];
      if (c == null || isNaN(c) || c <= 0) continue;
      prices.set(new Date(timestamps[i] * 1000).toISOString().slice(0, 10), c);
    }
    return prices;
  } catch {
    return new Map();
  }
}

/** Pearson correlation coefficient between two equal-length arrays. */
function pearsonCorrelation(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dX = 0, dY = 0;
  for (let i = 0; i < n; i++) {
    const ex = xs[i] - meanX;
    const ey = ys[i] - meanY;
    num += ex * ey;
    dX  += ex * ex;
    dY  += ey * ey;
  }
  const denom = Math.sqrt(dX * dY);
  return denom === 0 ? 0 : Math.round((num / denom) * 1000) / 1000;
}

/** Maximum peak-to-trough drawdown (as %). Positive = loss. */
function computeMaxDrawdown(returns: number[]): number {
  let peak = 1, value = 1, maxDD = 0;
  for (const r of returns) {
    value *= 1 + r;
    if (value > peak) peak = value;
    const dd = (peak - value) / peak;
    if (dd > maxDD) maxDD = dd;
  }
  return Math.round(maxDD * 10000) / 100;
}

/** Total return over a return series (as %). */
function computeTotalReturn(returns: number[]): number {
  const final = returns.reduce((v, r) => v * (1 + r), 1);
  return Math.round((final - 1) * 10000) / 100;
}

/** Build a deterministic reasoning sentence for the hedge verdict. */
function buildHedgeReasoning(
  corr: number, ddBenefit: number, drag: number,
  score: number, gldmPct: number, verdict: HedgeAuditResult["verdict"],
): string {
  const parts: string[] = [];

  if (corr < -0.2) {
    parts.push(`Negative portfolio correlation (${corr.toFixed(2)}) confirms gold moves against equity drawdowns — hedge functioning as intended.`);
  } else if (corr < 0) {
    parts.push(`Weak negative correlation (${corr.toFixed(2)}) — gold shows marginal inverse movement but effect is small.`);
  } else if (corr < 0.3) {
    parts.push(`Mildly positive correlation (${corr.toFixed(2)}) — gold is not reliably moving against portfolio losses.`);
  } else {
    parts.push(`Positive correlation (${corr.toFixed(2)}) — gold is moving with the portfolio in recent periods, providing no downside offset.`);
  }

  if (ddBenefit > 5) {
    parts.push(`Max drawdown reduced by ${ddBenefit.toFixed(1)}pp with gold in portfolio — meaningful protection confirmed.`);
  } else if (ddBenefit > 0) {
    parts.push(`Marginal drawdown improvement of ${ddBenefit.toFixed(1)}pp — gold provided some buffer but below the 5pp effectiveness threshold.`);
  } else if (ddBenefit < -2) {
    parts.push(`Portfolio drawdown was ${Math.abs(ddBenefit).toFixed(1)}pp larger with gold than without — gold added to downside risk in this window.`);
  }

  if (drag > 2) {
    parts.push(`High return drag of ${drag.toFixed(1)}pp over the lookback window — gold is meaningfully reducing compounding.`);
  } else if (drag > 0.5) {
    parts.push(`Return drag of ${drag.toFixed(1)}pp — within tolerable range for a defensive position.`);
  } else if (drag <= 0) {
    parts.push(`No return drag — gold contributed positively to returns over the lookback window.`);
  }

  const verdictText: Record<HedgeAuditResult["verdict"], string> = {
    KEEP:    `Current ${gldmPct.toFixed(1)}% allocation is justified — hedge is working and cost is within acceptable range.`,
    REDUCE:  `Consider trimming to ${Math.max(2, Math.round(gldmPct - 2))}–${Math.max(3, Math.round(gldmPct - 1))}% — hedge efficiency has declined relative to cost.`,
    REPLACE: `Hedge score suggests ${gldmPct.toFixed(1)}% in gold is underperforming — consult hedge efficiency ranking for a better-ranked alternative.`,
    REMOVE:  `Evidence does not support the gold position — correlation and drawdown data indicate gold is not functioning as a hedge in recent conditions.`,
  };
  parts.push(verdictText[verdict]);

  return parts.join(" ");
}

/** Build the Hedge Audit block from Yahoo Finance price data. Pure calculation — no side effects.
 *
 *  Phase 16.2: Portfolio returns are reconstructed from individual position prices weighted by
 *  current allocation %. SPY and QQQ are fetched directly from Yahoo Finance. This makes the
 *  audit independent of manual PortfolioSnapshot frequency. Limitation: assumes allocation
 *  weights are constant over the lookback window. */
async function buildHedgeAudit(positions: ArchPos[]): Promise<HedgeAuditResult | null> {
  // ── Hedge stack inventory (always computed — no price data needed) ──────────
  const hedgeStack = {
    gold: {
      tickers: positions.filter(p => GOLD_TICKERS.has(p.ticker)).map(p => p.ticker),
      allocationPct: Math.round(positions.filter(p => GOLD_TICKERS.has(p.ticker)).reduce((s, p) => s + p.pct, 0) * 10) / 10,
    },
    cash: {
      tickers: positions.filter(p => p.isCash).map(p => p.ticker),
      allocationPct: Math.round(positions.filter(p => p.isCash).reduce((s, p) => s + p.pct, 0) * 10) / 10,
    },
    defense: {
      tickers: positions.filter(p => DEFENSE_TICKERS.has(p.ticker)).map(p => p.ticker),
      allocationPct: Math.round(positions.filter(p => DEFENSE_TICKERS.has(p.ticker)).reduce((s, p) => s + p.pct, 0) * 10) / 10,
    },
    broadEtf: {
      tickers: positions.filter(p => BROAD_ETF_TICKERS.has(p.ticker)).map(p => p.ticker),
      allocationPct: Math.round(positions.filter(p => BROAD_ETF_TICKERS.has(p.ticker)).reduce((s, p) => s + p.pct, 0) * 10) / 10,
    },
    growthAssets: {
      tickers: positions.filter(p => !p.isCash && !p.isHedge).map(p => p.ticker),
      allocationPct: Math.round(positions.filter(p => !p.isCash && !p.isHedge).reduce((s, p) => s + p.pct, 0) * 10) / 10,
    },
    totalHedgePct: 0,
  };
  hedgeStack.totalHedgePct = Math.round(
    (hedgeStack.gold.allocationPct + hedgeStack.cash.allocationPct +
     hedgeStack.defense.allocationPct + hedgeStack.broadEtf.allocationPct) * 10,
  ) / 10;

  const nullCorrelations = {
    gldmVsPortfolio: { d30: null, d90: null, d180: null },
    gldmVsSpy:       { d30: null, d90: null, d180: null },
    gldmVsQqq:       { d30: null, d90: null, d180: null },
  };

  // ── Find gold position ─────────────────────────────────────────────────────
  const goldPos = positions.find(p => GOLD_TICKERS.has(p.ticker));
  const gldmAllocationPct = goldPos ? Math.round(goldPos.pct * 10) / 10 : 0;

  if (gldmAllocationPct === 0) {
    return {
      gldmAllocationPct: 0, dataPoints: 0, lookbackDays: HEDGE_AUDIT_LOOKBACK,
      portfolioCorrelation: 0, spyCorrelation: 0, qqqCorrelation: 0,
      correlations: nullCorrelations,
      maxDrawdownActual: 0, maxDrawdownExGold: 0, drawdownBenefitPct: 0,
      returnActualPct: 0, returnExGoldPct: 0, returnDragPct: 0,
      correlationScore: 0, drawdownProtectionScore: 0, returnDragScore: 0,
      hedgeScore: 0, verdict: "REMOVE",
      reasoning: "No gold position in portfolio. Add GLDM to establish a hedge before audit is meaningful.",
      hedgeStack, portfolioReturnSource: "reconstructed_prices",
      dataInsufficient: true, insufficiencyReason: "No gold position held",
    };
  }

  // ── Fetch 180d price history for all series in parallel ────────────────────
  // Portfolio NAV is reconstructed from individual equity positions — this avoids
  // relying on manual PortfolioSnapshot entries which are too sparse (monthly).
  const equityPositions = positions.filter(p => !p.isCash && p.pct > 0);

  const fetchResults = await Promise.all([
    fetchAssetHistory(goldPos!.ticker, HEDGE_AUDIT_LOOKBACK_LONG),  // [0] GLDM
    fetchAssetHistory("SPY", HEDGE_AUDIT_LOOKBACK_LONG),             // [1] SPY proxy
    fetchAssetHistory("QQQ", HEDGE_AUDIT_LOOKBACK_LONG),             // [2] QQQ proxy
    ...equityPositions.map(p => fetchAssetHistory(p.ticker, HEDGE_AUDIT_LOOKBACK_LONG)), // [3+]
  ]);

  const gldmPrices = fetchResults[0];
  const spyPrices  = fetchResults[1];
  const qqqPrices  = fetchResults[2];
  const equityPrices = fetchResults.slice(3);

  // ── Convert price maps to daily return maps ────────────────────────────────
  function priceToReturns(prices: Map<string, number>): Map<string, number> {
    const sorted = [...prices.keys()].sort();
    const out    = new Map<string, number>();
    for (let i = 1; i < sorted.length; i++) {
      const p = prices.get(sorted[i - 1])!;
      const c = prices.get(sorted[i])!;
      if (p > 0) out.set(sorted[i], (c - p) / p);
    }
    return out;
  }

  const gldmReturns = priceToReturns(gldmPrices);
  const spyReturns  = priceToReturns(spyPrices);
  const qqqReturns  = priceToReturns(qqqPrices);
  const equityReturnMaps = equityPrices.map(priceToReturns);

  // ── Find dates where ALL series have returns ───────────────────────────────
  const allReturnMaps = [gldmReturns, spyReturns, qqqReturns, ...equityReturnMaps];
  const alignedAll = [...gldmReturns.keys()]
    .filter(d => allReturnMaps.every(m => m.has(d)))
    .sort();

  // ── Reconstruct portfolio daily returns from weighted position returns ──────
  // Assumption: current allocationPct held constant over lookback (approximation).
  // Cash is excluded — contributes 0 return. Equity weights are used as-is (sum to ~40% if
  // 60% is cash; the remaining returns are scaled by allocationPct/100 which correctly
  // produces portfolio-level return contribution including the cash drag).
  const portfolioReturns = new Map<string, number>();
  for (const d of alignedAll) {
    let r = 0;
    for (let i = 0; i < equityPositions.length; i++) {
      r += (equityPositions[i].pct / 100) * equityReturnMaps[i].get(d)!;
    }
    portfolioReturns.set(d, r);
  }

  // ── Slice windows ─────────────────────────────────────────────────────────
  const cutoff90  = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const cutoff30  = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

  const aligned90  = alignedAll.filter(d => d >= cutoff90);
  const aligned30  = alignedAll.filter(d => d >= cutoff30);

  // Primary scoring window
  const primaryDates = aligned90.length >= HEDGE_AUDIT_MIN_PTS ? aligned90 : alignedAll;

  if (primaryDates.length < HEDGE_AUDIT_MIN_PTS) {
    return {
      gldmAllocationPct, dataPoints: primaryDates.length, lookbackDays: HEDGE_AUDIT_LOOKBACK,
      portfolioCorrelation: 0, spyCorrelation: 0, qqqCorrelation: 0,
      correlations: nullCorrelations,
      maxDrawdownActual: 0, maxDrawdownExGold: 0, drawdownBenefitPct: 0,
      returnActualPct: 0, returnExGoldPct: 0, returnDragPct: 0,
      correlationScore: 50, drawdownProtectionScore: 50, returnDragScore: 50,
      hedgeScore: 50, verdict: "KEEP",
      reasoning: `Insufficient aligned data (${primaryDates.length} trading days, minimum ${HEDGE_AUDIT_MIN_PTS}).`,
      hedgeStack, portfolioReturnSource: "reconstructed_prices",
      dataInsufficient: true,
      insufficiencyReason: `${primaryDates.length} aligned trading days — minimum ${HEDGE_AUDIT_MIN_PTS} required`,
    };
  }

  // ── Extract primary arrays ─────────────────────────────────────────────────
  const gldmArr      = primaryDates.map(d => gldmReturns.get(d)!);
  const portfolioArr = primaryDates.map(d => portfolioReturns.get(d)!);
  const spyArr       = primaryDates.map(d => spyReturns.get(d)!);
  const qqqArr       = primaryDates.map(d => qqqReturns.get(d) ?? spyReturns.get(d)!);

  // ── Primary correlations (90d) ─────────────────────────────────────────────
  const portfolioCorrelation = pearsonCorrelation(gldmArr, portfolioArr);
  const spyCorrelation       = pearsonCorrelation(gldmArr, spyArr);
  const qqqCorrelation       = pearsonCorrelation(gldmArr, qqqArr);

  // ── Multi-window correlations ──────────────────────────────────────────────
  function windowCorr(dates: string[], mapA: Map<string, number>, mapB: Map<string, number>): number | null {
    if (dates.length < HEDGE_AUDIT_MIN_PTS) return null;
    const xs = dates.map(d => mapA.get(d)!);
    const ys = dates.map(d => mapB.get(d)!);
    return pearsonCorrelation(xs, ys);
  }

  const correlations = {
    gldmVsPortfolio: {
      d30:  windowCorr(aligned30, gldmReturns, portfolioReturns),
      d90:  windowCorr(aligned90, gldmReturns, portfolioReturns),
      d180: windowCorr(alignedAll, gldmReturns, portfolioReturns),
    },
    gldmVsSpy: {
      d30:  windowCorr(aligned30, gldmReturns, spyReturns),
      d90:  windowCorr(aligned90, gldmReturns, spyReturns),
      d180: windowCorr(alignedAll, gldmReturns, spyReturns),
    },
    gldmVsQqq: {
      d30:  windowCorr(aligned30, gldmReturns, qqqReturns),
      d90:  windowCorr(aligned90, gldmReturns, qqqReturns),
      d180: windowCorr(alignedAll, gldmReturns, qqqReturns),
    },
  };

  // ── Portfolio ex-gold reconstruction ──────────────────────────────────────
  // r_exGold = (r_portfolio - w * r_gldm) / (1 - w)
  const w = gldmAllocationPct / 100;
  const portfolioExGoldArr = portfolioArr.map((rp, i) =>
    w < 1 ? (rp - w * gldmArr[i]) / (1 - w) : 0,
  );

  // ── Drawdown protection ────────────────────────────────────────────────────
  const maxDrawdownActual  = computeMaxDrawdown(portfolioArr);
  const maxDrawdownExGold  = computeMaxDrawdown(portfolioExGoldArr);
  const drawdownBenefitPct = maxDrawdownExGold > 0
    ? Math.round(((maxDrawdownExGold - maxDrawdownActual) / maxDrawdownExGold) * 10000) / 100
    : 0;

  // ── Return drag ───────────────────────────────────────────────────────────
  const returnActualPct  = computeTotalReturn(portfolioArr);
  const returnExGoldPct  = computeTotalReturn(portfolioExGoldArr);
  const returnDragPct    = Math.round((returnExGoldPct - returnActualPct) * 100) / 100;

  // ── Component scores ──────────────────────────────────────────────────────
  // Correlation: maps [-1,+1] to [100,0] linearly (corr=-1 = perfect hedge = 100 pts)
  const correlationScore = Math.round(Math.max(0, Math.min(100, 50 * (1 - portfolioCorrelation))));

  // Drawdown protection: 0pp benefit = 0, 20pp benefit = 100 (clamped)
  const drawdownProtectionScore = drawdownBenefitPct >= 0
    ? Math.round(Math.min(100, (drawdownBenefitPct / 20) * 100))
    : Math.round(Math.max(0, 20 + drawdownBenefitPct * 4));

  // Return drag: 0% drag = 100, 2% drag = 0 (each 1pp costs 50 pts)
  const returnDragScore = Math.round(Math.max(0, Math.min(100, 100 - returnDragPct * 50)));

  // ── Composite hedge score ─────────────────────────────────────────────────
  const hedgeScore = Math.round(correlationScore * 0.35 + drawdownProtectionScore * 0.40 + returnDragScore * 0.25);

  // ── Verdict ───────────────────────────────────────────────────────────────
  const verdict: HedgeAuditResult["verdict"] =
    hedgeScore >= 75 ? "KEEP"    :
    hedgeScore >= 50 ? "REDUCE"  :
    hedgeScore >= 25 ? "REPLACE" : "REMOVE";

  const reasoning = buildHedgeReasoning(portfolioCorrelation, drawdownBenefitPct, returnDragPct, hedgeScore, gldmAllocationPct, verdict);

  return {
    gldmAllocationPct, dataPoints: primaryDates.length, lookbackDays: HEDGE_AUDIT_LOOKBACK,
    portfolioCorrelation, spyCorrelation, qqqCorrelation,
    correlations,
    maxDrawdownActual, maxDrawdownExGold, drawdownBenefitPct,
    returnActualPct, returnExGoldPct, returnDragPct,
    correlationScore, drawdownProtectionScore, returnDragScore,
    hedgeScore, verdict, reasoning,
    hedgeStack, portfolioReturnSource: "reconstructed_prices",
    dataInsufficient: false,
  };
}

// ─── Stress tests ─────────────────────────────────────────────────────────────

function buildStressTests(
  positions: ArchPos[],
  hedgeEffectiveness: HedgeEffectiveness,
  blueprintScenarios: Array<{ scenario: string; description: string; portfolioImpact: string; estimatedReturnRange: string; hedgeAdequacy: string }>,
): ArchitectureStressTest[] {
  const heldTickers = new Map(positions.map(p => [p.ticker, p]));

  const SCENARIO_DESCS: Record<string, string> = {
    "Taiwan Conflict":  "Military conflict or blockade of Taiwan triggers global supply chain shock",
    "Recession":        "US recession driven by rate shock or credit event; earnings multiples compress",
    "AI Boom":          "AI adoption accelerates beyond consensus; revenue monetization inflects sharply",
    "Soft Landing":     "Inflation returns to target without recession; rates ease; broad equity rally follows",
  };

  const RETURN_MAP: Record<string, string> = {
    very_positive: "+20% to +40%",
    positive:      "+5% to +20%",
    neutral:       "-5% to +5%",
    negative:      "-10% to -25%",
    very_negative: "-25% to -45%",
  };

  const SCENARIOS = ["Taiwan Conflict", "Recession", "AI Boom", "Soft Landing"];

  return SCENARIOS.map(scenarioName => {
    const bp = blueprintScenarios.find(s => s.scenario === scenarioName);
    const impactRaw = bp?.portfolioImpact ?? "neutral";
    const portfolioImpact = impactRaw as ArchitectureStressTest["portfolioImpact"];
    const estimatedPortfolioReturn = bp?.estimatedReturnRange ?? RETURN_MAP[impactRaw] ?? "Unknown";

    const scenarioImpacts = SCENARIO_POSITION_IMPACT[scenarioName] ?? {};
    const worsts: StressTestPosition[] = [];
    const bests: StressTestPosition[] = [];

    for (const [ticker, impact] of Object.entries(scenarioImpacts)) {
      if (!heldTickers.has(ticker)) continue;
      const pos = heldTickers.get(ticker)!;
      const item: StressTestPosition = {
        ticker,
        direction: impact.direction,
        estimatedMove: impact.magnitude,
        portfolioWeightPct: Math.round(pos.pct * 10) / 10,
      };
      if (impact.direction === "down") worsts.push(item);
      else if (impact.direction === "up") bests.push(item);
    }

    worsts.sort((a, b) => b.portfolioWeightPct - a.portfolioWeightPct);
    bests.sort((a, b) => b.portfolioWeightPct - a.portfolioWeightPct);

    // Hedge adequacy for this scenario
    const scenAdequacy = hedgeEffectiveness.scenarioAdequacy.find(s => s.scenario === scenarioName);
    let hedgeCoverage: ArchitectureStressTest["hedgeCoverage"];
    const totalEffective = (scenAdequacy?.activeHedges ?? []).length;
    if      (portfolioImpact === "very_positive" || portfolioImpact === "positive") hedgeCoverage = "sufficient";
    else if (totalEffective >= 2 && hedgeEffectiveness.totalHedgePct >= 8)          hedgeCoverage = "sufficient";
    else if (totalEffective >= 1 && hedgeEffectiveness.totalHedgePct >= 4)          hedgeCoverage = "adequate";
    else                                                                              hedgeCoverage = "insufficient";

    const hedgeOffsetNote = scenAdequacy?.reason ?? "No effective hedges for this scenario.";

    return {
      scenario: scenarioName,
      description: SCENARIO_DESCS[scenarioName] ?? scenarioName,
      portfolioImpact,
      estimatedPortfolioReturn,
      worstPositions: worsts.slice(0, 4),
      bestPositions: bests.slice(0, 4),
      hedgeCoverage,
      hedgeOffsetNote,
    };
  });
}

// ─── Architecture score ───────────────────────────────────────────────────────

function computeArchitectureScore(
  concentration: ConcentrationAnalysis,
  hedgeEffectiveness: HedgeEffectiveness,
  stressTests: ArchitectureStressTest[],
): ArchitectureScoreBreakdown {
  // Diversification (0–25): based on sector HHI
  let diversification: number;
  if      (concentration.sectorHHI < 1500) diversification = 25;
  else if (concentration.sectorHHI < 2500) diversification = 18;
  else if (concentration.sectorHHI < 3500) diversification = 12;
  else if (concentration.sectorHHI < 5000) diversification = 6;
  else                                     diversification = 2;

  // Sector count bonus (up to +3 extra if capped at 25)
  const sectorCount = concentration.sectorBreakdown.length;
  if (sectorCount >= 5) diversification = Math.min(25, diversification + 3);
  else if (sectorCount >= 4) diversification = Math.min(25, diversification + 1);

  // Concentration (0–25): start at 25, deduct for breaches
  let concentrationScore = 25;
  for (const b of concentration.breaches) {
    if (b.severity === "violation" && b.type === "single_stock") concentrationScore -= 10;
    else if (b.severity === "warning"   && b.type === "single_stock") concentrationScore -= 5;
    else if (b.severity === "violation" && b.type === "sector")      concentrationScore -= 8;
    else if (b.severity === "warning"   && b.type === "sector")      concentrationScore -= 4;
  }
  concentrationScore = Math.max(0, concentrationScore);

  // Hedge quality (0–25): scaled from hedge score (0–100)
  const hedgeQuality = Math.round((hedgeEffectiveness.hedgeScore / 100) * 25);

  // Regime resilience (0–25): based on stress test outcomes
  const IMPACT_PTS: Record<string, number> = {
    very_positive: 6, positive: 5, neutral: 3, negative: 1, very_negative: 0,
  };
  const rawResilience = stressTests.reduce((s, t) => s + (IMPACT_PTS[t.portfolioImpact] ?? 3), 0);
  const maxResilience = stressTests.length * 6;
  const regimeResilience = maxResilience > 0
    ? Math.round((rawResilience / maxResilience) * 25)
    : 12;

  const total = diversification + concentrationScore + hedgeQuality + regimeResilience;

  let grade: ArchitectureScoreBreakdown["grade"];
  let label: string;
  if      (total >= 90) { grade = "A"; label = "Excellent Architecture"; }
  else if (total >= 75) { grade = "B"; label = "Well-Constructed"; }
  else if (total >= 60) { grade = "C"; label = "Adequate — Minor Gaps"; }
  else if (total >= 45) { grade = "D"; label = "Needs Attention"; }
  else                  { grade = "F"; label = "Critical Weaknesses"; }

  return {
    total,
    diversification,
    concentration: concentrationScore,
    hedgeQuality,
    regimeResilience,
    grade,
    label,
  };
}

// ─── Recommendations ──────────────────────────────────────────────────────────

function buildRecommendations(
  score: ArchitectureScoreBreakdown,
  concentration: ConcentrationAnalysis,
  correlations: HiddenCorrelationAnalysis,
  hedgeEff: HedgeEffectiveness,
  stressTests: ArchitectureStressTest[],
): ArchitectureRecommendation[] {
  const recs: ArchitectureRecommendation[] = [];

  // Concentration violations — critical
  for (const b of concentration.breaches.filter(b => b.severity === "violation")) {
    if (b.type === "single_stock") {
      recs.push({
        priority: "critical",
        category: "concentration",
        action: `Reduce ${b.name} to below ${b.limitPct}%`,
        detail: `${b.name} is at ${b.currentPct}% of portfolio — single-stock concentration above ${b.limitPct}% guideline. Consider trimming on strength or pausing additional purchases until weight normalizes.`,
        ticker: b.name,
      });
    } else {
      recs.push({
        priority: "critical",
        category: "concentration",
        action: `${b.name} sector is overconcentrated`,
        detail: `${b.name} sector at ${b.currentPct}% exceeds the ${b.limitPct}% limit. Add exposure in other sectors or reduce the largest sector position on strength.`,
        ticker: null,
      });
    }
  }

  // Concentration warnings — high
  for (const b of concentration.breaches.filter(b => b.severity === "warning")) {
    if (b.type === "single_stock") {
      recs.push({
        priority: "high",
        category: "concentration",
        action: `Monitor ${b.name} position size`,
        detail: `${b.name} at ${b.currentPct}% is approaching the ${b.limitPct}% warning threshold. Pause further additions; allow growth to dilute if conviction remains high.`,
        ticker: b.name,
      });
    }
  }

  // Missing hedges
  if (hedgeEff.goldPct === 0) {
    recs.push({
      priority: "high",
      category: "hedge",
      action: "Add gold hedge (GLDM or GLD)",
      detail: "No gold position identified. Gold is effective in both Taiwan Conflict and Recession scenarios. A 3–5% allocation would meaningfully improve portfolio resilience.",
      ticker: "GLDM",
    });
  } else if (hedgeEff.goldPct < 3) {
    recs.push({
      priority: "medium",
      category: "hedge",
      action: `Increase gold allocation to 3–5% (currently ${hedgeEff.goldPct.toFixed(1)}%)`,
      detail: "Gold is below the 3% minimum for effective hedge coverage. Incremental additions to GLDM or GLD would improve resilience in risk-off scenarios.",
      ticker: "GLDM",
    });
  }

  if (hedgeEff.cashPct < 3) {
    recs.push({
      priority: "high",
      category: "hedge",
      action: `Build cash reserve to at least 3–5% (currently ${hedgeEff.cashPct.toFixed(1)}%)`,
      detail: "Low cash reserve limits ability to act on dislocations and provides no buffer in a rapid drawdown. Target 3–5% as minimum dry powder.",
      ticker: "CASH",
    });
  }

  if (hedgeEff.defenseEtfPct === 0 && hedgeEff.broadEtfPct === 0) {
    recs.push({
      priority: "medium",
      category: "hedge",
      action: "Add ITA (defense ETF) or a broad market ETF to hedge toolkit",
      detail: "No broad market ETF or defense ETF present. ITA provides coverage in AI Boom and Soft Landing scenarios where gold is a drag. Improves hedge diversity.",
      ticker: "ITA",
    });
  }

  // High-significance correlation clusters
  for (const cluster of correlations.clusters.filter(c => c.significance === "high")) {
    recs.push({
      priority: "medium",
      category: "correlation",
      action: `Manage ${cluster.name} cluster risk (${cluster.combinedPct.toFixed(0)}% combined)`,
      detail: `${cluster.heldTickers.join(", ")} share exposure to "${cluster.sharedRiskFactor}". Combined ${cluster.combinedPct.toFixed(0)}% portfolio weight means a cluster-level shock could be severely impactful. Consider whether sizing is appropriate.`,
      ticker: null,
    });
  }

  // Diversification — low sector count
  if (concentration.sectorBreakdown.length < 4) {
    recs.push({
      priority: "medium",
      category: "diversification",
      action: "Expand sector diversification",
      detail: `Portfolio has only ${concentration.sectorBreakdown.length} distinct sectors. Target 5+ sectors for adequate diversification. Consider adding exposure to Energy, Industrials, or Consumer Staples through ETFs or high-conviction names.`,
      ticker: null,
    });
  }

  // Regime resilience — insufficient for worst scenarios
  const worstScenario = stressTests.sort((a, b) => {
    const rank = { very_negative: 0, negative: 1, neutral: 2, positive: 3, very_positive: 4 };
    return (rank[a.portfolioImpact] ?? 2) - (rank[b.portfolioImpact] ?? 2);
  })[0];

  if (worstScenario?.portfolioImpact === "very_negative" && worstScenario.hedgeCoverage === "insufficient") {
    recs.push({
      priority: "high",
      category: "regime",
      action: `Improve resilience for "${worstScenario.scenario}" scenario`,
      detail: `Portfolio has ${worstScenario.portfolioImpact.replace("_", " ")} exposure to ${worstScenario.scenario} with insufficient hedge coverage. Review the worst-hit positions and consider adding hedges that are effective in this scenario.`,
      ticker: null,
    });
  }

  // Low architecture score
  if (score.total < 45) {
    recs.push({
      priority: "critical",
      category: "diversification",
      action: "Portfolio architecture requires immediate structural attention",
      detail: `Architecture score of ${score.total}/100 indicates critical weaknesses. Priority: address concentration violations first, then build hedge coverage, then improve sector diversification.`,
      ticker: null,
    });
  }

  // Sort: critical → high → medium → low, then by category
  const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return recs.sort((a, b) => (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3));
}

// ─── Wiki writer ─────────────────────────────────────────────────────────────

/** Append a Hedge Audit section to Architecture-Review.md in the shared Brain OS vault. */
export function writeHedgeAuditToWiki(audit: HedgeAuditResult, reviewDate: Date): void {
  const BRAIN_OS_ROOT = process.env.BRAIN_OS_ROOT ?? resolveBrainOsPath() ?? path.join(process.cwd(), "brain-os");
  const filePath = path.join(BRAIN_OS_ROOT, "07 Investment", "Wiki", "Portfolio", "Architecture-Review.md");
  if (!fs.existsSync(filePath)) return;

  const month = reviewDate.toISOString().slice(0, 7);

  const corrLabel = (r: number) =>
    r < -0.2 ? "Strong hedge" : r < 0 ? "Weak hedge" : r < 0.3 ? "Ineffective" : "Counterproductive";

  const fmtCorr = (v: number | null) => v == null ? "—" : v.toFixed(3);
  const sign = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(1);

  const section = [
    "",
    "---",
    "",
    `## Hedge Audit — ${month}`,
    "",
    `**Return source:** Reconstructed from Yahoo Finance prices (current weights as constant)  `,
    `**Data:** ${audit.dataInsufficient
      ? `Insufficient — ${audit.insufficiencyReason ?? "see detail"}`
      : `${audit.dataPoints} trading days (${audit.lookbackDays}d primary window)`}`,
    "",
    "### Hedge Stack",
    "",
    "| Category | Tickers | Allocation |",
    "|---|---|---|",
    `| Gold | ${audit.hedgeStack.gold.tickers.join(", ") || "—"} | ${audit.hedgeStack.gold.allocationPct.toFixed(1)}% |`,
    `| Cash | ${audit.hedgeStack.cash.tickers.join(", ") || "—"} | ${audit.hedgeStack.cash.allocationPct.toFixed(1)}% |`,
    `| Defense ETF | ${audit.hedgeStack.defense.tickers.join(", ") || "—"} | ${audit.hedgeStack.defense.allocationPct.toFixed(1)}% |`,
    `| Broad ETF | ${audit.hedgeStack.broadEtf.tickers.join(", ") || "—"} | ${audit.hedgeStack.broadEtf.allocationPct.toFixed(1)}% |`,
    `| **Total hedge** | | **${audit.hedgeStack.totalHedgePct.toFixed(1)}%** |`,
    `| Growth assets | ${audit.hedgeStack.growthAssets.tickers.join(", ") || "—"} | ${audit.hedgeStack.growthAssets.allocationPct.toFixed(1)}% |`,
    "",
    "### Correlation Regime",
    "",
    "| Pair | 30d | 90d | 180d | Interpretation (90d) |",
    "|---|---|---|---|---|",
    `| GLDM vs Portfolio | ${fmtCorr(audit.correlations.gldmVsPortfolio.d30)} | ${fmtCorr(audit.correlations.gldmVsPortfolio.d90)} | ${fmtCorr(audit.correlations.gldmVsPortfolio.d180)} | ${corrLabel(audit.portfolioCorrelation)} |`,
    `| GLDM vs SPY | ${fmtCorr(audit.correlations.gldmVsSpy.d30)} | ${fmtCorr(audit.correlations.gldmVsSpy.d90)} | ${fmtCorr(audit.correlations.gldmVsSpy.d180)} | ${corrLabel(audit.spyCorrelation)} |`,
    `| GLDM vs QQQ | ${fmtCorr(audit.correlations.gldmVsQqq.d30)} | ${fmtCorr(audit.correlations.gldmVsQqq.d90)} | ${fmtCorr(audit.correlations.gldmVsQqq.d180)} | ${corrLabel(audit.qqqCorrelation)} |`,
    "",
    "### Drawdown Protection",
    "",
    "| Measure | Value |",
    "|---|---|",
    `| Max drawdown — actual portfolio | ${audit.maxDrawdownActual.toFixed(1)}% |`,
    `| Max drawdown — ex-gold (reconstructed) | ${audit.maxDrawdownExGold.toFixed(1)}% |`,
    `| Drawdown benefit | ${sign(audit.drawdownBenefitPct)}pp |`,
    "",
    "### Return Drag",
    "",
    "| Measure | Value |",
    "|---|---|",
    `| Portfolio return — actual | ${sign(audit.returnActualPct)}% |`,
    `| Portfolio return — ex-gold | ${sign(audit.returnExGoldPct)}% |`,
    `| Return drag | ${sign(audit.returnDragPct)}pp |`,
    "",
    "### Hedge Score",
    "",
    "| Component | Score | Weight | Contribution |",
    "|---|---|---|---|",
    `| Correlation | ${audit.correlationScore}/100 | 35% | ${Math.round(audit.correlationScore * 0.35)} |`,
    `| Drawdown Protection | ${audit.drawdownProtectionScore}/100 | 40% | ${Math.round(audit.drawdownProtectionScore * 0.40)} |`,
    `| Return Drag | ${audit.returnDragScore}/100 | 25% | ${Math.round(audit.returnDragScore * 0.25)} |`,
    `| **Total** | **${audit.hedgeScore}/100** | | |`,
    "",
    `### Verdict: ${audit.verdict}`,
    "",
    audit.reasoning,
    "",
  ].join("\n");

  fs.appendFileSync(filePath, section, "utf8");
}

// ─── Regime Hedge Wiki writer — Phase 16.4 ───────────────────────────────────

export function writeRegimeHedgeToWiki(report: RegimeHedgeReport, reviewDate: Date): void {
  const BRAIN_OS_ROOT = process.env.BRAIN_OS_ROOT ?? resolveBrainOsPath() ?? path.join(process.cwd(), "brain-os");
  const filePath = path.join(BRAIN_OS_ROOT, "07 Investment", "Wiki", "Portfolio", "Architecture-Review.md");
  if (!fs.existsSync(filePath)) return;

  const month = reviewDate.toISOString().slice(0, 7);
  const r     = report;
  const sign  = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(1);

  // Current regime
  const regimeSection = [
    `## Current Regime — ${month}`,
    "",
    `**Regime:** ${r.currentRegime.regime}  `,
    `**Confidence:** ${r.currentRegime.confidence}%`,
    "",
    "**Supporting Evidence:**",
    ...r.currentRegime.supportingEvidence.map(e => `- ${e}`),
    ...(r.currentRegime.conflictingEvidence.length > 0 ? [
      "",
      "**Conflicting Evidence:**",
      ...r.currentRegime.conflictingEvidence.map(e => `- ${e}`),
    ] : []),
    "",
  ];

  // Hedge alignment
  const alignSection = [
    "### Hedge Alignment",
    "",
    `**Score:** ${r.portfolioAlignment.alignmentScore}/100 — **${r.portfolioAlignment.status.replace("-", " ")}**  `,
    `**Total hedge:** ${r.portfolioAlignment.totalHedgePct}% (optimal: ${r.portfolioAlignment.optimalHedgePct})`,
    "",
    "| Ticker | Allocation | Regime Score | Verdict |",
    "|---|---|---|---|",
    ...r.portfolioAlignment.hedgeBreakdown.map(h =>
      `| ${h.ticker} | ${h.pct.toFixed(1)}% | ${h.regimeScore}/100 | ${h.verdict} |`,
    ),
    "",
    `> ${r.portfolioAlignment.recommendation}`,
    "",
  ];

  // Current regime rankings (top 6)
  const top6 = r.currentRegimeRanking.rankings.slice(0, 6);
  const rankSection = [
    `### Hedge Rankings for ${r.currentRegime.regime}`,
    "",
    "| Rank | Ticker | Score | Verdict |",
    "|---|---|---|---|",
    ...top6.map((h, i) => `| ${i + 1} | ${h.ticker} | ${h.score}/100 | ${h.verdict} |`),
    "",
  ];

  // Scenario matrix
  const scenarioRows = r.scenarioStressTests.flatMap(s => [
    `| **${s.scenario}** | ${s.bestHedges.map(h => h.ticker).join(", ")} | ${s.worstHedges.map(h => h.ticker).join(", ")} | ${s.estimatedPortfolioImpact.slice(0, 80)} |`,
  ]);

  const scenarioSection = [
    "### Scenario Matrix",
    "",
    "| Scenario | Best Hedges | Worst Hedges | Portfolio Impact |",
    "|---|---|---|---|",
    ...scenarioRows,
    "",
  ];

  // Multi-regime verdict for GLDM (most relevant)
  const gldmVerdict = r.multiVerdicts.find(v => v.ticker === "GLDM");
  const verdictSection = gldmVerdict ? [
    "### GLDM Multi-Regime Verdict",
    "",
    "| Regime | Score | Verdict | Current? |",
    "|---|---|---|---|",
    ...gldmVerdict.allVerdicts.map(v =>
      `| ${v.regime} | ${v.score}/100 | ${v.verdict} | ${v.isCurrent ? "✓ Yes" : ""} |`,
    ),
    "",
    `> **Summary:** ${gldmVerdict.summary}`,
    "",
  ] : [];

  const section = [
    "",
    "---",
    "",
    ...regimeSection,
    ...alignSection,
    ...rankSection,
    ...scenarioSection,
    ...verdictSection,
  ].join("\n");

  fs.appendFileSync(filePath, section, "utf8");
}

// ─── Hedge Ranking Wiki writer — Phase 16.3 ──────────────────────────────────

export function writeHedgeRankingToWiki(
  rankings: HedgeEfficiencyResult[],
  scenarios: ReplacementScenario[],
  reviewDate: Date,
): void {
  const BRAIN_OS_ROOT = process.env.BRAIN_OS_ROOT ?? resolveBrainOsPath() ?? path.join(process.cwd(), "brain-os");
  const filePath = path.join(BRAIN_OS_ROOT, "07 Investment", "Wiki", "Portfolio", "Architecture-Review.md");
  if (!fs.existsSync(filePath)) return;

  const month = reviewDate.toISOString().slice(0, 7);
  const sign = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(1);

  const rankRows = rankings.map((r, i) =>
    `| ${i + 1} | ${r.ticker} | ${r.category} | ${r.correlation90d.toFixed(3)} | ${sign(r.drawdownBenefit)}pp | ${sign(r.returnDrag)}pp | **${r.hedgeScore}** | ${r.verdict} |`,
  );

  const scenarioRows = scenarios.map(s =>
    `| ${s.label} | ${s.allocationPct.toFixed(1)}% | ${sign(s.expectedReturnDelta)}pp | ${sign(s.expectedDrawdownDelta)}pp | ${sign(s.hedgeScoreDelta)} pts |`,
  );

  const winner = rankings[0];
  const winnerReason = winner
    ? `**${winner.ticker}** ranks #1 (score ${winner.hedgeScore}/100, ${winner.verdict}). ${winner.reasoning}`
    : "No data available.";

  const section = [
    "",
    "---",
    "",
    `## Hedge Efficiency Ranking — ${month}`,
    "",
    "### Rankings",
    "",
    "| Rank | Ticker | Category | Corr 90d | DD Benefit | Return Drag | Score | Verdict |",
    "|---|---|---|---|---|---|---|---|",
    ...rankRows,
    "",
    "### Replacement Scenarios",
    "",
    `Current gold position (${rankings.find(r => r.ticker === "GLDM")?.ticker ?? "GLDM"}) evaluated against alternatives:`,
    "",
    "| Scenario | Allocation | Return Δ | Drawdown Δ | Hedge Score Δ |",
    "|---|---|---|---|---|",
    ...scenarioRows,
    "",
    "### Current Hedge Winner",
    "",
    winnerReason,
    "",
  ].join("\n");

  fs.appendFileSync(filePath, section, "utf8");
}

// ─── Main generator ───────────────────────────────────────────────────────────

export async function generateArchitectureReview(): Promise<PortfolioArchitectureReviewData> {
  const [positions, theses, opportunityScores, latestBrief, latestBlueprint, recentNewsletters] = await Promise.all([
    loadPositions(),
    db.investmentThesis.findMany({ select: { ticker: true, confidenceScore: true, status: true } }),
    db.opportunityScore.findMany({
      orderBy: { generatedAt: "desc" },
      distinct: ["ticker"],
      select: { ticker: true, opportunityScore: true },
    }),
    db.morningBrief.findFirst({ orderBy: { briefingDate: "desc" }, select: { briefingDate: true, marketRegime: true } }),
    db.portfolioBlueprint.findFirst({
      orderBy: { blueprintDate: "desc" },
      select: { marketRegime: true, scenarioAnalysis: true },
    }),
    db.newsletterItem.count({ where: { createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } }),
  ]);

  const marketRegime = latestBrief?.marketRegime ?? latestBlueprint?.marketRegime ?? "Neutral";
  const blueprintScenarios: Array<{ scenario: string; description: string; portfolioImpact: string; estimatedReturnRange: string; hedgeAdequacy: string }> =
    latestBlueprint?.scenarioAnalysis ? JSON.parse(latestBlueprint.scenarioAnalysis) : [];

  const exposureMap          = buildExposureMap(positions);
  const concentrationAnalysis = buildConcentrationAnalysis(positions);
  const hiddenCorrelations   = buildHiddenCorrelations(positions);
  const hedgeEffectiveness   = buildHedgeEffectiveness(positions);
  const stressTests          = buildStressTests(positions, hedgeEffectiveness, blueprintScenarios);
  const architectureScore    = computeArchitectureScore(concentrationAnalysis, hedgeEffectiveness, stressTests);
  const recommendations      = buildRecommendations(architectureScore, concentrationAnalysis, hiddenCorrelations, hedgeEffectiveness, stressTests);
  const hedgeAudit = await buildHedgeAudit(positions);

  // Phase 16.3 — Hedge efficiency ranking (best-effort; null if all data insufficient)
  let hedgeRanking: HedgeEfficiencyResult[] | null = null;
  let replacementScenarios: ReplacementScenario[] | null = null;
  try {
    const hedgeAnalysis = await runFullHedgeEfficiencyAnalysis(positions);
    hedgeRanking         = hedgeAnalysis.rankings;
    replacementScenarios = hedgeAnalysis.replacementScenarios;
  } catch {
    // Non-fatal — price fetch failure; ranking stays null
  }

  // Phase 16.4 — Regime-based hedge analysis (best-effort)
  let regimeHedgeReport: RegimeHedgeReport | null = null;
  try {
    regimeHedgeReport = await generateRegimeHedgeReport(positions);
  } catch {
    // Non-fatal — DB or config failure; report stays null
  }

  const today = new Date();
  today.setDate(1); // reviewDate is always the first of the current month
  today.setHours(0, 0, 0, 0);

  return {
    reviewDate: today,
    marketRegime,
    exposureMap,
    concentrationAnalysis,
    hiddenCorrelations,
    hedgeEffectiveness,
    stressTests,
    architectureScore,
    recommendations,
    hedgeAudit,
    hedgeRanking,
    replacementScenarios,
    regimeHedgeReport,
    generatedFromSources: {
      positions: positions.filter(p => !p.isCash).length,
      theses: theses.length,
      opportunityScores: opportunityScores.length,
      morningBriefDate: latestBrief?.briefingDate.toISOString().slice(0, 10) ?? null,
      newsletterItems: recentNewsletters,
    },
  };
}

// ─── Save to DB ───────────────────────────────────────────────────────────────

export async function saveArchitectureReview(data: PortfolioArchitectureReviewData) {
  const a = data.hedgeAudit;
  const fields = {
    architectureScore:     data.architectureScore.total,
    diversificationScore:  data.architectureScore.diversification,
    concentrationScore:    data.architectureScore.concentration,
    hedgeQualityScore:     data.architectureScore.hedgeQuality,
    regimeResilienceScore: data.architectureScore.regimeResilience,
    scoreGrade:            data.architectureScore.grade,
    scoreLabel:            data.architectureScore.label,
    exposureMap:           JSON.stringify(data.exposureMap),
    concentrationAnalysis: JSON.stringify(data.concentrationAnalysis),
    hiddenCorrelations:    JSON.stringify(data.hiddenCorrelations),
    hedgeEffectiveness:    JSON.stringify(data.hedgeEffectiveness),
    stressTests:           JSON.stringify(data.stressTests),
    recommendations:       JSON.stringify(data.recommendations),
    marketRegime:          data.marketRegime,
    generatedFromSources:  JSON.stringify(data.generatedFromSources),
    // Hedge Audit — Phase 16.1
    hedgeScore:        a?.hedgeScore           ?? null,
    hedgeVerdict:      a?.verdict              ?? null,
    hedgeCorrelation:  a?.portfolioCorrelation  ?? null,
    drawdownBenefit:   a?.drawdownBenefitPct    ?? null,
    returnDrag:        a?.returnDragPct         ?? null,
    hedgeAuditDetail:  a ? JSON.stringify(a)    : null,
    // Hedge Efficiency Ranking — Phase 16.3
    hedgeRankingDetail:      data.hedgeRanking         ? JSON.stringify(data.hedgeRanking)         : null,
    replacementScenariosDetail: data.replacementScenarios ? JSON.stringify(data.replacementScenarios) : null,
    // Regime Hedge Report — Phase 16.4
    regimeHedgeReportDetail: data.regimeHedgeReport    ? JSON.stringify(data.regimeHedgeReport)    : null,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (db.portfolioArchitectureReview as any).upsert({
    where:  { reviewDate: data.reviewDate },
    create: { reviewDate: data.reviewDate, ...fields },
    update: fields,
  });
}

// ─── Deserialize from DB ──────────────────────────────────────────────────────

export function deserializeArchitectureReview(record: {
  id: string;
  reviewDate: Date;
  architectureScore: number;
  diversificationScore: number;
  concentrationScore: number;
  hedgeQualityScore: number;
  regimeResilienceScore: number;
  scoreGrade: string;
  scoreLabel: string;
  exposureMap: string;
  concentrationAnalysis: string;
  hiddenCorrelations: string;
  hedgeEffectiveness: string;
  stressTests: string;
  recommendations: string;
  marketRegime: string;
  generatedFromSources: string;
  createdAt: Date;
  // Phase 16.1 hedge audit fields (nullable)
  hedgeScore?:       number | null;
  hedgeVerdict?:     string | null;
  hedgeCorrelation?: number | null;
  drawdownBenefit?:  number | null;
  returnDrag?:       number | null;
  hedgeAuditDetail?: string | null;
  // Phase 16.3 hedge efficiency fields (nullable)
  hedgeRankingDetail?:         string | null;
  replacementScenariosDetail?: string | null;
  // Phase 16.4 regime hedge report (nullable)
  regimeHedgeReportDetail?:    string | null;
}): PortfolioArchitectureReviewData & { id: string; createdAt: Date } {
  const hedgeAudit: HedgeAuditResult | null =
    record.hedgeAuditDetail ? (JSON.parse(record.hedgeAuditDetail) as HedgeAuditResult) : null;
  const hedgeRanking: HedgeEfficiencyResult[] | null =
    record.hedgeRankingDetail ? (JSON.parse(record.hedgeRankingDetail) as HedgeEfficiencyResult[]) : null;
  const replacementScenarios: ReplacementScenario[] | null =
    record.replacementScenariosDetail ? (JSON.parse(record.replacementScenariosDetail) as ReplacementScenario[]) : null;
  const regimeHedgeReport: RegimeHedgeReport | null =
    record.regimeHedgeReportDetail ? (JSON.parse(record.regimeHedgeReportDetail) as RegimeHedgeReport) : null;

  return {
    id: record.id,
    createdAt: record.createdAt,
    reviewDate: record.reviewDate,
    marketRegime: record.marketRegime,
    architectureScore: {
      total: record.architectureScore,
      diversification: record.diversificationScore,
      concentration: record.concentrationScore,
      hedgeQuality: record.hedgeQualityScore,
      regimeResilience: record.regimeResilienceScore,
      grade: record.scoreGrade as ArchitectureScoreBreakdown["grade"],
      label: record.scoreLabel,
    },
    exposureMap:           JSON.parse(record.exposureMap),
    concentrationAnalysis: JSON.parse(record.concentrationAnalysis),
    hiddenCorrelations:    JSON.parse(record.hiddenCorrelations),
    hedgeEffectiveness:    JSON.parse(record.hedgeEffectiveness),
    stressTests:           JSON.parse(record.stressTests),
    recommendations:       JSON.parse(record.recommendations),
    generatedFromSources:  JSON.parse(record.generatedFromSources),
    hedgeAudit,
    hedgeRanking,
    replacementScenarios,
    regimeHedgeReport,
  };
}
