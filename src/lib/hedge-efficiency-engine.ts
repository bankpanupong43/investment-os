// Hedge Efficiency Ranking Engine — Phase 16.3
//
// Ranks hedge candidates for the current portfolio using:
//   - Correlation to equity portfolio (30d / 90d / 180d windows)
//   - Drawdown protection vs. equity-only baseline
//   - Return drag vs. equity-only baseline
//
// Composite: 40% correlation + 40% drawdown + 20% return drag

// ─── Internal utilities (no circular import from architecture-review-engine) ──

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
      chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ close?: (number | null)[] }> } }> };
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

function pearsonR(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dX = 0, dY = 0;
  for (let i = 0; i < n; i++) {
    const ex = xs[i] - mx, ey = ys[i] - my;
    num += ex * ey; dX += ex * ex; dY += ey * ey;
  }
  const denom = Math.sqrt(dX * dY);
  return denom === 0 ? 0 : Math.round((num / denom) * 1000) / 1000;
}

function maxDrawdown(returns: number[]): number {
  let peak = 1, value = 1, maxDD = 0;
  for (const r of returns) {
    value *= 1 + r;
    if (value > peak) peak = value;
    const dd = (peak - value) / peak;
    if (dd > maxDD) maxDD = dd;
  }
  return Math.round(maxDD * 10000) / 100;
}

function totalReturn(returns: number[]): number {
  const final = returns.reduce((v, r) => v * (1 + r), 1);
  return Math.round((final - 1) * 10000) / 100;
}

// ─── Candidate universe ────────────────────────────────────────────────────────

const GOLD_SET = new Set(["GLDM", "GLD", "IAU", "SGOL", "PHYS"]);

interface HedgeCandidate {
  ticker: string;
  yahooSymbol: string | null; // null = CASH (modeled as 0% daily return)
  category: string;
}

const HEDGE_CANDIDATES: HedgeCandidate[] = [
  { ticker: "CASH", yahooSymbol: null,   category: "Cash-like"         },
  { ticker: "SGOV", yahooSymbol: "SGOV", category: "Cash-like"         },
  { ticker: "SHY",  yahooSymbol: "SHY",  category: "Cash-like"         },
  { ticker: "GLDM", yahooSymbol: "GLDM", category: "Gold"              },
  { ticker: "GLD",  yahooSymbol: "GLD",  category: "Gold"              },
  { ticker: "IAU",  yahooSymbol: "IAU",  category: "Gold"              },
  { ticker: "ITA",  yahooSymbol: "ITA",  category: "Defense"           },
  { ticker: "TLT",  yahooSymbol: "TLT",  category: "Treasuries"        },
  { ticker: "IEF",  yahooSymbol: "IEF",  category: "Treasuries"        },
  { ticker: "VOO",  yahooSymbol: "VOO",  category: "Broad Diversifier" },
  { ticker: "SPY",  yahooSymbol: "SPY",  category: "Broad Diversifier" },
];

// Replacement scenario targets (non-GLDM alternatives to evaluate)
const REPLACEMENT_TARGETS = ["CASH", "SGOV", "ITA", "NVDA", "AMZN"];

const MIN_ALIGNED_DAYS = 15;

// ─── Public types ─────────────────────────────────────────────────────────────

export interface HedgePosition {
  ticker: string;
  pct: number;     // % of total portfolio
  isCash: boolean;
  isHedge: boolean;
}

export interface HedgeEfficiencyResult {
  ticker: string;
  category: string;
  correlation30d: number;
  correlation90d: number;
  correlation180d: number;
  drawdownBenefit: number;  // pp: positive = reduced drawdown vs equity baseline
  returnDrag: number;       // pp: positive = reduced returns vs equity baseline
  correlationScore: number; // 0–100
  drawdownScore: number;    // 0–100
  returnScore: number;      // 0–100
  hedgeScore: number;       // 0–100 composite
  verdict: "Excellent" | "Good" | "Neutral" | "Poor" | "Avoid";
  reasoning: string;
  dataInsufficient: boolean;
  dataPoints: number;
}

export interface ReplacementScenario {
  fromTicker: string;
  toTicker: string;
  label: string;
  allocationPct: number;
  expectedReturnDelta: number;    // pp over 90d; positive = better returns
  expectedDrawdownDelta: number;  // pp; negative = better (lower drawdown)
  correlationImprovement: number; // pts from rankings; positive = better hedge
  hedgeScoreDelta: number;        // pts from rankings; positive = better hedge
  summary: string;
}

// ─── Scoring functions ────────────────────────────────────────────────────────

// Piecewise linear: -0.3→100, 0→70, 0.5→30, ≥0.8→0
function scoreCorrelation(r: number): number {
  if (r <= -0.3) return 100;
  if (r <= 0)    return Math.round(100 - ((r + 0.3) / 0.3) * 30);
  if (r <= 0.5)  return Math.round(70  - (r / 0.5) * 40);
  if (r <  0.8)  return Math.round(30  - ((r - 0.5) / 0.3) * 30);
  return 0;
}

// +5pp benefit = 100, 0 = 50, negative = 0
function scoreDrawdown(benefitPp: number): number {
  if (benefitPp < 0) return 0;
  return Math.round(Math.min(100, 50 + benefitPp * 10));
}

// 0% drag = 100, 2% drag = 0; negative drag (hedge boosted returns) = 100
function scoreReturnDrag(dragPp: number): number {
  return Math.round(Math.max(0, Math.min(100, 100 - dragPp * 50)));
}

function verdictFromScore(score: number): HedgeEfficiencyResult["verdict"] {
  if (score >= 75) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Neutral";
  if (score >= 20) return "Poor";
  return "Avoid";
}

// ─── Reasoning builders ───────────────────────────────────────────────────────

function buildHedgeEfficiencyReasoning(
  ticker: string,
  corr: number,
  ddBenefit: number,
  drag: number,
  verdict: HedgeEfficiencyResult["verdict"],
): string {
  const parts: string[] = [];

  const corrLabel =
    corr <= -0.3 ? "strong negative"
    : corr <= -0.1 ? "moderate negative"
    : corr <= 0.1  ? "near-zero"
    : corr <= 0.3  ? "mild positive"
    : corr <= 0.5  ? "moderate positive"
    : "strong positive";

  parts.push(`${ticker}: ${corrLabel} correlation with equities (${corr.toFixed(3)})`);

  if      (ddBenefit > 2)  parts.push(`reduces drawdown by ${ddBenefit.toFixed(1)}pp`);
  else if (ddBenefit > 0)  parts.push(`marginal drawdown benefit (${ddBenefit.toFixed(1)}pp)`);
  else if (ddBenefit < -2) parts.push(`increases drawdown by ${Math.abs(ddBenefit).toFixed(1)}pp`);

  if      (drag > 1)  parts.push(`${drag.toFixed(1)}pp return drag`);
  else if (drag < -1) parts.push(`${Math.abs(drag).toFixed(1)}pp return boost`);
  else                parts.push("minimal return drag");

  const verdictText: Record<HedgeEfficiencyResult["verdict"], string> = {
    Excellent: "Top hedge candidate.",
    Good:      "Solid defensive choice.",
    Neutral:   "Borderline effectiveness.",
    Poor:      "Weak hedge properties.",
    Avoid:     "Not functioning as a hedge in current conditions.",
  };

  return parts.join("; ") + ". " + verdictText[verdict];
}

function buildReplacementSummary(
  fromTicker: string,
  toTicker: string,
  returnDelta: number,
  drawdownDelta: number,
  hedgeScoreDelta: number,
): string {
  const parts: string[] = [];

  if      (hedgeScoreDelta > 10) parts.push(`Hedge quality +${hedgeScoreDelta.toFixed(0)} pts — ${toTicker} is a stronger defensive position.`);
  else if (hedgeScoreDelta < -10) parts.push(`Hedge quality ${hedgeScoreDelta.toFixed(0)} pts — ${toTicker} is a weaker hedge than ${fromTicker}.`);
  else                            parts.push(`Hedge quality similar (${hedgeScoreDelta > 0 ? "+" : ""}${hedgeScoreDelta.toFixed(0)} pts).`);

  if      (returnDelta > 0.5)  parts.push(`Expected return improves by ${returnDelta.toFixed(1)}pp.`);
  else if (returnDelta < -0.5) parts.push(`Expected return decreases by ${Math.abs(returnDelta).toFixed(1)}pp.`);

  if      (drawdownDelta < -0.5) parts.push(`Drawdown improves by ${Math.abs(drawdownDelta).toFixed(1)}pp.`);
  else if (drawdownDelta > 0.5)  parts.push(`Drawdown worsens by ${drawdownDelta.toFixed(1)}pp.`);

  return parts.join(" ") || `Replacing ${fromTicker} with ${toTicker} has neutral impact over the 90d window.`;
}

// ─── Core calculation ─────────────────────────────────────────────────────────

/** Calculate efficiency for a single candidate.
 *
 *  All arrays must be pre-aligned to the same dates.
 *  portfolioReturns = full portfolio (including gold and cash).
 *  equityOnlyReturns = equity portion only (non-cash, non-gold positions).
 *  goldReturns = returns of the current gold position (GLDM or equivalent).
 *  candidateReturns = daily returns of the candidate (0 for CASH).
 *  gldmWeight = decimal weight of gold in portfolio (e.g., 0.05 for 5%).
 *
 *  Baseline: portfolio ex-gold with gold weight redistributed proportionally.
 *  Test: portfolio where gold is replaced by candidate at same weight.
 */
export function calculateHedgeEfficiency(
  ticker: string,
  category: string,
  candidateReturns90: number[],
  candidateReturns30: number[],
  candidateReturns180: number[],
  equityOnly90: number[],
  equityOnly30: number[],
  equityOnly180: number[],
  portfolio90: number[],
  gold90: number[],
  gldmWeight: number,
  dataPoints: number,
): HedgeEfficiencyResult {
  if (dataPoints < MIN_ALIGNED_DAYS) {
    return {
      ticker, category,
      correlation30d: 0, correlation90d: 0, correlation180d: 0,
      drawdownBenefit: 0, returnDrag: 0,
      correlationScore: 50, drawdownScore: 50, returnScore: 50,
      hedgeScore: 50,
      verdict: "Neutral",
      reasoning: `${ticker}: insufficient data (${dataPoints} days, minimum ${MIN_ALIGNED_DAYS}).`,
      dataInsufficient: true,
      dataPoints,
    };
  }

  // Correlations against equity-only portfolio (to measure hedge quality against the risk source)
  const corr90  = equityOnly90.length >= MIN_ALIGNED_DAYS
    ? pearsonR(candidateReturns90, equityOnly90) : 0;
  const corr30  = equityOnly30.length >= MIN_ALIGNED_DAYS
    ? pearsonR(candidateReturns30, equityOnly30) : corr90;
  const corr180 = equityOnly180.length >= MIN_ALIGNED_DAYS
    ? pearsonR(candidateReturns180, equityOnly180) : corr90;

  // Ex-gold baseline: redistribute gold weight proportionally (same as buildHedgeAudit)
  const w = gldmWeight;
  const portfolioExGold90 = portfolio90.map((rp, i) =>
    w < 1 ? (rp - w * gold90[i]) / (1 - w) : 0,
  );

  // Candidate portfolio: swap gold for this candidate at same weight
  const portfolioWithCandidate90 = portfolio90.map((rp, i) =>
    rp + w * (candidateReturns90[i] - gold90[i]),
  );

  // Drawdown protection vs equity-scaling baseline
  const ddExGold    = maxDrawdown(portfolioExGold90);
  const ddWithCand  = maxDrawdown(portfolioWithCandidate90);
  const ddBenefit   = Math.round((ddExGold - ddWithCand) * 100) / 100;

  // Return drag vs equity-scaling baseline
  const retExGold   = totalReturn(portfolioExGold90);
  const retWithCand = totalReturn(portfolioWithCandidate90);
  const drag        = Math.round((retExGold - retWithCand) * 100) / 100;

  const corrScore = scoreCorrelation(corr90);
  const ddScore   = scoreDrawdown(ddBenefit);
  const retScore  = scoreReturnDrag(drag);
  const hedgeScore = Math.round(corrScore * 0.40 + ddScore * 0.40 + retScore * 0.20);
  const verdict    = verdictFromScore(hedgeScore);

  return {
    ticker, category,
    correlation30d: corr30,
    correlation90d: corr90,
    correlation180d: corr180,
    drawdownBenefit: ddBenefit,
    returnDrag: drag,
    correlationScore: corrScore,
    drawdownScore: ddScore,
    returnScore: retScore,
    hedgeScore,
    verdict,
    reasoning: buildHedgeEfficiencyReasoning(ticker, corr90, ddBenefit, drag, verdict),
    dataInsufficient: false,
    dataPoints,
  };
}

// ─── Internal orchestrator ────────────────────────────────────────────────────

interface AnalysisInternals {
  rankings: HedgeEfficiencyResult[];
  returnMap: Map<string, Map<string, number>>;  // ticker → date → return
  alignedDates: string[];
  primaryDates90: string[];
  goldTicker: string;
  gldmWeight: number;
  portfolio90: number[];
  gold90: number[];
}

async function runHedgeAnalysis(positions: HedgePosition[]): Promise<AnalysisInternals> {
  // Find gold position
  const goldPos   = positions.find(p => GOLD_SET.has(p.ticker));
  const goldTicker = goldPos?.ticker ?? "GLDM";
  const gldmWeight = (goldPos?.pct ?? 5) / 100;

  // Positions that contribute to equity returns (non-cash, non-gold)
  const equityPositions = positions.filter(p => !p.isCash && !GOLD_SET.has(p.ticker));

  // All symbols to fetch: candidates + equity positions (for portfolio reconstruction)
  const candidateSymbols = HEDGE_CANDIDATES
    .filter(c => c.yahooSymbol !== null)
    .map(c => c.yahooSymbol!);

  const equitySymbols = equityPositions.map(p => p.ticker);

  // Also need gold ticker (may not be GLDM) and replacement equity tickers (NVDA, AMZN)
  const extraTickers = [goldTicker, "NVDA", "AMZN"].filter(
    t => !candidateSymbols.includes(t) && !equitySymbols.includes(t),
  );

  const allSymbols = [...new Set([...candidateSymbols, ...equitySymbols, ...extraTickers])];

  // Fetch all in parallel
  const fetched = await Promise.all(allSymbols.map(s => fetchAssetHistory(s, 180)));
  const returnMap = new Map<string, Map<string, number>>();
  for (let i = 0; i < allSymbols.length; i++) {
    returnMap.set(allSymbols[i], priceToReturns(fetched[i]));
  }

  // Gold returns (primary series for alignment)
  const goldReturns = returnMap.get(goldTicker) ?? new Map<string, number>();

  // Equity return maps
  const equityReturnMaps = equityPositions.map(p => returnMap.get(p.ticker) ?? new Map<string, number>());

  // Aligned dates: all equity + gold series present
  const requiredMaps = [goldReturns, ...equityReturnMaps.filter(m => m.size > 0)];
  const alignedDates = [...(goldReturns.size > 0 ? goldReturns.keys() : equityReturnMaps.find(m => m.size > 0)?.keys() ?? [])]
    .filter(d => requiredMaps.every(m => m.has(d)))
    .sort();

  // Window slices
  const cutoff90 = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const cutoff30 = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const dates90  = alignedDates.filter(d => d >= cutoff90);
  const dates30  = alignedDates.filter(d => d >= cutoff30);

  const primaryDates90 = dates90.length >= MIN_ALIGNED_DAYS ? dates90 : alignedDates;

  // Build portfolio daily returns (full, including cash=0 and gold)
  function buildPortfolio(dates: string[]): number[] {
    return dates.map(d => {
      let r = 0;
      for (let i = 0; i < equityPositions.length; i++) {
        r += (equityPositions[i].pct / 100) * (equityReturnMaps[i].get(d) ?? 0);
      }
      r += gldmWeight * (goldReturns.get(d) ?? 0);
      // CASH contributes 0 — already excluded
      return r;
    });
  }

  // Build equity-only portfolio returns (for correlation baseline)
  function buildEquityOnly(dates: string[]): number[] {
    return dates.map(d => {
      let r = 0;
      for (let i = 0; i < equityPositions.length; i++) {
        r += (equityPositions[i].pct / 100) * (equityReturnMaps[i].get(d) ?? 0);
      }
      return r;
    });
  }

  const portfolio90  = buildPortfolio(primaryDates90);
  const portfolio30  = buildPortfolio(dates30);
  const portfolio180 = buildPortfolio(alignedDates);
  const equity90     = buildEquityOnly(primaryDates90);
  const equity30     = buildEquityOnly(dates30);
  const equity180    = buildEquityOnly(alignedDates);
  const gold90       = primaryDates90.map(d => goldReturns.get(d) ?? 0);

  // Calculate efficiency for each candidate
  const rankings: HedgeEfficiencyResult[] = HEDGE_CANDIDATES.map(cand => {
    // Build candidate return arrays
    const candMap = cand.yahooSymbol !== null
      ? (returnMap.get(cand.yahooSymbol) ?? new Map<string, number>())
      : new Map<string, number>(); // CASH: stays empty → all zeros below

    const cand90  = primaryDates90.map(d => candMap.get(d) ?? 0);
    const cand30  = dates30.map(d => candMap.get(d) ?? 0);
    const cand180 = alignedDates.map(d => candMap.get(d) ?? 0);

    return calculateHedgeEfficiency(
      cand.ticker, cand.category,
      cand90, cand30, cand180,
      equity90, equity30, equity180,
      portfolio90, gold90,
      gldmWeight,
      primaryDates90.length,
    );
  });

  rankings.sort((a, b) => b.hedgeScore - a.hedgeScore);

  return { rankings, returnMap, alignedDates, primaryDates90, goldTicker, gldmWeight, portfolio90, gold90 };
}

// ─── Replacement scenarios ────────────────────────────────────────────────────

function computeReplacement(
  toTicker: string,
  label: string,
  allocationPct: number,
  gldmWeight: number,
  portfolio90: number[],
  gold90: number[],
  candidate90: number[],
  rankingMap: Map<string, HedgeEfficiencyResult>,
): ReplacementScenario {
  // r_withX = r_portfolio + w_gldm × (r_x − r_gldm)
  const withX = portfolio90.map((rp, i) => rp + gldmWeight * (candidate90[i] - gold90[i]));

  const retPortfolio = totalReturn(portfolio90);
  const retWithX     = totalReturn(withX);
  const ddPortfolio  = maxDrawdown(portfolio90);
  const ddWithX      = maxDrawdown(withX);

  const returnDelta   = Math.round((retWithX - retPortfolio) * 100) / 100;
  const drawdownDelta = Math.round((ddWithX  - ddPortfolio ) * 100) / 100;

  const gldmRanking = rankingMap.get("GLDM");
  const toRanking   = rankingMap.get(toTicker);
  const corrImprove = toRanking && gldmRanking
    ? Math.round(toRanking.correlationScore - gldmRanking.correlationScore)
    : 0;
  const scoreDelta  = toRanking && gldmRanking
    ? Math.round(toRanking.hedgeScore - gldmRanking.hedgeScore)
    : 0;

  return {
    fromTicker:             "GLDM",
    toTicker,
    label,
    allocationPct,
    expectedReturnDelta:    returnDelta,
    expectedDrawdownDelta:  drawdownDelta,
    correlationImprovement: corrImprove,
    hedgeScoreDelta:        scoreDelta,
    summary: buildReplacementSummary("GLDM", toTicker, returnDelta, drawdownDelta, scoreDelta),
  };
}

export async function calculateReplacementScenarios(
  positions: HedgePosition[],
  rankings: HedgeEfficiencyResult[],
): Promise<ReplacementScenario[]> {
  const internals = await runHedgeAnalysis(positions);
  return buildReplacementScenarioList(positions, rankings, internals);
}

function buildReplacementScenarioList(
  positions: HedgePosition[],
  rankings: HedgeEfficiencyResult[],
  internals: AnalysisInternals,
): ReplacementScenario[] {
  const { returnMap, primaryDates90, goldTicker, gldmWeight, portfolio90, gold90 } = internals;

  const goldPos    = positions.find(p => GOLD_SET.has(p.ticker));
  const allocPct   = goldPos?.pct ?? 5;
  const rankingMap = new Map(rankings.map(r => [r.ticker, r]));

  const getReturns = (ticker: string): number[] => {
    if (ticker === "CASH") return primaryDates90.map(() => 0);
    const m = returnMap.get(ticker) ?? new Map<string, number>();
    return primaryDates90.map(d => m.get(d) ?? 0);
  };

  const bestHedge  = rankings.find(r => r.ticker !== goldTicker && r.ticker !== "CASH")
    ?? rankings[0];

  const targets: Array<{ ticker: string; label: string }> = [
    { ticker: "CASH",                label: "Scenario A — GLDM → CASH"            },
    { ticker: "SGOV",                label: "Scenario B — GLDM → SGOV"            },
    { ticker: "ITA",                 label: "Scenario C — GLDM → ITA"             },
    { ticker: "NVDA",                label: "Scenario D — GLDM → NVDA"            },
    { ticker: "AMZN",                label: "Scenario E — GLDM → AMZN"            },
    { ticker: bestHedge?.ticker ?? "SGOV", label: `Scenario F — GLDM → ${bestHedge?.ticker ?? "SGOV"} (best-ranked hedge)` },
  ];

  return targets.map(t =>
    computeReplacement(t.ticker, t.label, allocPct, gldmWeight, portfolio90, gold90, getReturns(t.ticker), rankingMap),
  );
}

// ─── Public exports ────────────────────────────────────────────────────────────

export async function rankHedges(positions: HedgePosition[]): Promise<HedgeEfficiencyResult[]> {
  const result = await runHedgeAnalysis(positions);
  return result.rankings;
}

export async function runFullHedgeEfficiencyAnalysis(positions: HedgePosition[]): Promise<{
  rankings: HedgeEfficiencyResult[];
  replacementScenarios: ReplacementScenario[];
}> {
  const internals = await runHedgeAnalysis(positions);
  const scenarios = buildReplacementScenarioList(positions, internals.rankings, internals);
  return { rankings: internals.rankings, replacementScenarios: scenarios };
}
