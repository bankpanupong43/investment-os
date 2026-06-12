// Regime-Based Hedge Engine — Phase 16.4
//
// Detects current market regime from existing Brain OS data and scores
// hedge assets per regime. Rules-based — no AI calls.
//
// 6 Regimes: AI Expansion, Inflation Shock, Recession, Geopolitical Conflict,
//            Liquidity Crisis, Dollar Crisis

import { db } from "./db";
import { type HedgePosition } from "./hedge-efficiency-engine";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface RegimeDetection {
  regime: string;
  confidence: number;               // 0–100
  supportingEvidence: string[];
  conflictingEvidence: string[];
}

export interface RegimeHedgeScore {
  ticker: string;
  score: number;    // 0–100
  verdict: string;  // Strong Keep | Keep | Reduce | Replace | Avoid
  reason: string;
}

export interface RegimeHedgeRanking {
  regime: string;
  rankings: RegimeHedgeScore[];
}

export interface HedgePortfolioAlignment {
  regime: string;
  confidence: number;
  alignmentScore: number;   // 0–100
  status: "aligned" | "over-hedged" | "under-hedged" | "misaligned";
  hedgeBreakdown: { ticker: string; pct: number; regimeScore: number; verdict: string }[];
  totalHedgePct: number;
  optimalHedgePct: string;   // e.g. "15–25%"
  recommendation: string;
}

export interface ScenarioStressTest {
  scenario: string;
  correspondingRegime: string;
  assumptions: string[];
  estimatedPortfolioImpact: string;
  bestHedges: { ticker: string; reason: string }[];
  worstHedges: { ticker: string; reason: string }[];
  positionImpacts: { ticker: string; direction: "up" | "down" | "flat"; magnitude: string; reason: string }[];
}

export interface MultiRegimeVerdict {
  ticker: string;
  currentRegime: string;
  currentVerdict: string;
  currentScore: number;
  allVerdicts: { regime: string; verdict: string; score: number; isCurrent: boolean }[];
  summary: string;
}

export interface RegimeHedgeReport {
  currentRegime: RegimeDetection;
  currentRegimeRanking: RegimeHedgeRanking;
  allRegimeRankings: RegimeHedgeRanking[];
  portfolioAlignment: HedgePortfolioAlignment;
  scenarioStressTests: ScenarioStressTest[];
  multiVerdicts: MultiRegimeVerdict[];
  generatedAt: Date;
}

// ─── Regime hedge score tables (domain knowledge) ─────────────────────────────
// Scores represent how effective each hedge is in each regime (0–100).

const ALL_REGIMES = [
  "AI Expansion",
  "Inflation Shock",
  "Recession",
  "Geopolitical Conflict",
  "Liquidity Crisis",
  "Dollar Crisis",
] as const;

type RegimeName = typeof ALL_REGIMES[number];

interface RegimeEntry { score: number; reason: string }

const REGIME_HEDGE_SCORES: Record<RegimeName, Record<string, RegimeEntry>> = {
  "AI Expansion": {
    CASH: { score: 85, reason: "No opportunity cost vs AI rally; preserves dry powder" },
    SGOV: { score: 83, reason: "Near risk-free yield with zero equity correlation in growth regime" },
    SHY:  { score: 75, reason: "Short-term treasuries with low rate risk; yield positive" },
    GLDM: { score: 25, reason: "Gold loses appeal in risk-on; no inflation or safe-haven premium" },
    GLD:  { score: 23, reason: "Gold underperforms in AI bull markets — opportunity cost is high" },
    IAU:  { score: 24, reason: "Same as GLD — gold underperforms vs growth in AI expansion" },
    ITA:  { score: 65, reason: "Defense spending stays elevated; AI-in-defense thesis intact" },
    TLT:  { score: 20, reason: "Long-duration bonds suffer in high-rate, risk-on environment" },
    IEF:  { score: 35, reason: "Intermediate bonds better than long; still rate-sensitive" },
    VOO:  { score: 75, reason: "Broad market participates in AI-driven rally — smart exposure, not a hedge" },
    SPY:  { score: 75, reason: "Same as VOO — broad market participation in AI rally" },
  },
  "Inflation Shock": {
    CASH: { score: 55, reason: "Cash preserves nominal value but loses purchasing power to inflation" },
    SGOV: { score: 50, reason: "Short T-bills reprice quickly with rate hikes; partial protection" },
    SHY:  { score: 40, reason: "Short bonds reprice; better than long but still inflation-exposed" },
    GLDM: { score: 88, reason: "Gold is the primary inflation hedge — historically outperforms CPI shock" },
    GLD:  { score: 90, reason: "Gold — the top inflation hedge across cycles" },
    IAU:  { score: 89, reason: "Gold ETF — same inflation protection as GLD" },
    ITA:  { score: 55, reason: "Defense budgets rise with inflation; some protection but equity-linked" },
    TLT:  { score: 8,  reason: "Long-duration bonds are the worst asset in inflation shock — severe duration risk" },
    IEF:  { score: 15, reason: "Intermediate bonds still suffer in rising rate environment" },
    VOO:  { score: 30, reason: "Broad market mixed — value stocks ok but rate-sensitive growth crushed" },
    SPY:  { score: 30, reason: "Same as VOO — uneven inflation performance across sectors" },
  },
  "Recession": {
    CASH: { score: 92, reason: "Cash king in recession — no drawdown, dry powder for cycle-bottom buying" },
    SGOV: { score: 90, reason: "Short-term treasuries safe haven with positive yield; near-cash quality" },
    SHY:  { score: 85, reason: "Short bonds benefit from rate cuts; high quality in risk-off" },
    GLDM: { score: 62, reason: "Gold mixed in recession — safe haven demand offset by deflation risk" },
    GLD:  { score: 62, reason: "Same as GLDM — depends on whether rate cuts are aggressive" },
    IAU:  { score: 62, reason: "Same as GLD in recession" },
    ITA:  { score: 48, reason: "Defense budgets recession-proof but still equity-linked downside" },
    TLT:  { score: 78, reason: "Long bonds surge on rate cuts in recession — flight to quality" },
    IEF:  { score: 75, reason: "Intermediate Treasuries also benefit from recession rate cuts" },
    VOO:  { score: 22, reason: "Broad market takes full brunt of recession earnings downgrades" },
    SPY:  { score: 22, reason: "Same as VOO — avoid in recession" },
  },
  "Geopolitical Conflict": {
    CASH: { score: 78, reason: "Cash preserves capital during geopolitical disruption; deployment optionality" },
    SGOV: { score: 72, reason: "Short T-bills safe in conflict with slight safe-haven premium" },
    SHY:  { score: 65, reason: "Short bonds benefit from flight to safety" },
    GLDM: { score: 92, reason: "Gold is the primary geopolitical hedge — safe-haven premium spikes on conflict" },
    GLD:  { score: 93, reason: "Gold — top geopolitical hedge (Ukraine +15%, Middle East +12% historically)" },
    IAU:  { score: 92, reason: "Same as GLD for geopolitical protection" },
    ITA:  { score: 88, reason: "Defense ETF surges on conflict — ITA +20–35% in Taiwan or major escalation" },
    TLT:  { score: 52, reason: "Long bonds mixed — flight to quality offset by fiscal/supply concerns" },
    IEF:  { score: 58, reason: "Intermediate Treasuries safer than long in geopolitical shock" },
    VOO:  { score: 28, reason: "Broad market suffers in geopolitical shock — supply chain and confidence impact" },
    SPY:  { score: 28, reason: "Same as VOO in geopolitical shock" },
  },
  "Liquidity Crisis": {
    CASH: { score: 100, reason: "Cash is the only truly safe asset in liquidity crisis — all correlations go to 1" },
    SGOV: { score: 95,  reason: "T-bills are near-cash; next best to physical cash in liquidity crisis" },
    SHY:  { score: 88,  reason: "Short treasuries hold value; some liquidity premium over longer duration" },
    GLDM: { score: 42,  reason: "Gold sold in forced deleveraging — 2008 and March 2020 both saw gold dip initially" },
    GLD:  { score: 40,  reason: "Same as GLDM — gold not safe in forced deleveraging" },
    IAU:  { score: 41,  reason: "Same as GLD in liquidity crisis" },
    ITA:  { score: 28,  reason: "Defense ETF sells off with equities in forced deleveraging" },
    TLT:  { score: 62,  reason: "Long treasuries initially safe but forced selling adds downside risk" },
    IEF:  { score: 65,  reason: "Intermediate Treasuries better liquidity than long in crisis" },
    VOO:  { score: 8,   reason: "Broad market takes full hit — correlations go to 1 in liquidity crisis" },
    SPY:  { score: 8,   reason: "Same as VOO — avoid in liquidity crisis" },
  },
  "Dollar Crisis": {
    CASH: { score: 38,  reason: "USD cash loses real value — inflation in dollar terms destroys purchasing power" },
    SGOV: { score: 35,  reason: "Dollar-denominated T-bills also lose purchasing power in dollar crisis" },
    SHY:  { score: 32,  reason: "Same as SGOV — dollar-denominated bonds suffer in dollar crisis" },
    GLDM: { score: 96,  reason: "Gold is the primary dollar crisis hedge — holds real value as USD weakens" },
    GLD:  { score: 97,  reason: "Gold — the ultimate dollar hedge; central banks buy gold in de-dollarization" },
    IAU:  { score: 96,  reason: "Same as GLD for dollar crisis protection" },
    ITA:  { score: 52,  reason: "Defense spending may be inflationary; mixed in dollar crisis" },
    TLT:  { score: 30,  reason: "Long dollar bonds lose value in dollar crisis; foreign holders sell Treasuries" },
    IEF:  { score: 33,  reason: "Same dollar risk as TLT; slightly better on shorter duration" },
    VOO:  { score: 30,  reason: "Dollar equities mixed — multinationals benefit but domestic names hurt" },
    SPY:  { score: 30,  reason: "Same as VOO in dollar crisis" },
  },
};

// Optimal hedge range per regime (% of total portfolio)
const REGIME_OPTIMAL_HEDGE: Record<RegimeName, { min: number; max: number }> = {
  "AI Expansion":          { min: 10, max: 20 },
  "Inflation Shock":       { min: 15, max: 30 },
  "Recession":             { min: 20, max: 40 },
  "Geopolitical Conflict": { min: 15, max: 35 },
  "Liquidity Crisis":      { min: 40, max: 70 },
  "Dollar Crisis":         { min: 20, max: 40 },
};

// Scenario definitions (pre-built — maps to a primary regime)
const SCENARIO_DEFINITIONS: Record<string, {
  correspondingRegime: RegimeName;
  assumptions: string[];
  estimatedPortfolioImpact: string;
  bestHedgeTickers: string[];
  worstHedgeTickers: string[];
  positionImpacts: { ticker: string; direction: "up" | "down" | "flat"; magnitude: string; reason: string }[];
}> = {
  "Taiwan Crisis": {
    correspondingRegime: "Geopolitical Conflict",
    assumptions: [
      "Semiconductors down 30–60% (NVDA, AAPL, GOOG supply chain disruption)",
      "Defense stocks up 15–25% (defense spending surge)",
      "Gold up 15–30% (safe-haven premium)",
      "Cash stable (preserves capital for deployment)",
      "Broad market down 15–25% (confidence shock)",
    ],
    estimatedPortfolioImpact: "Significant negative — NVDA, AAPL, GOOG all Taiwan-exposed; ITA and GLDM partial offsets",
    bestHedgeTickers: ["GLDM", "ITA", "CASH"],
    worstHedgeTickers: ["VOO", "SPY", "TLT"],
    positionImpacts: [
      { ticker: "NVDA", direction: "down", magnitude: "-20% to -40%", reason: "Primary Taiwan semiconductor risk — TSMC manufacturing dependency" },
      { ticker: "AAPL", direction: "down", magnitude: "-15% to -25%", reason: "Taiwan supply chain for iPhone and MacBook components" },
      { ticker: "GOOG", direction: "down", magnitude: "-10% to -20%", reason: "Cloud infra hardware; Taiwan TPU supply" },
      { ticker: "AMZN", direction: "down", magnitude: "-8% to -15%",  reason: "AWS hardware dependency; consumer confidence" },
      { ticker: "ITA",  direction: "up",   magnitude: "+15% to +30%", reason: "Defense spending surge on Taiwan escalation" },
      { ticker: "GLDM", direction: "up",   magnitude: "+15% to +30%", reason: "Gold safe-haven premium on geopolitical shock" },
      { ticker: "CASH", direction: "flat", magnitude: "0%",           reason: "Capital preserved; optionality maintained" },
    ],
  },
  "US Recession": {
    correspondingRegime: "Recession",
    assumptions: [
      "GDP contracts 2+ quarters; earnings downgrades 15–25%",
      "Fed cuts rates aggressively; yield curve steepens",
      "Consumer spending falls; ad budgets cut",
      "Credit spreads widen; risk assets sell off",
    ],
    estimatedPortfolioImpact: "Moderate negative — 60% CASH position provides significant buffer; equity positions (NVDA, AAPL, GOOG, AMZN) face 15–30% drawdown",
    bestHedgeTickers: ["CASH", "SGOV", "TLT"],
    worstHedgeTickers: ["VOO", "SPY", "ITA"],
    positionImpacts: [
      { ticker: "NVDA", direction: "down", magnitude: "-20% to -35%", reason: "AI capex cuts in recession; enterprise spending falls" },
      { ticker: "AAPL", direction: "down", magnitude: "-10% to -20%", reason: "Consumer electronics spending is discretionary" },
      { ticker: "GOOG", direction: "down", magnitude: "-15% to -25%", reason: "Ad revenue falls with consumer confidence and CMO budgets" },
      { ticker: "AMZN", direction: "down", magnitude: "-10% to -20%", reason: "E-commerce and AWS both cyclical; margins compress" },
      { ticker: "ITA",  direction: "flat", magnitude: "-5% to +5%",   reason: "Defense budgets recession-proof; limited equity risk" },
      { ticker: "GLDM", direction: "up",   magnitude: "+8% to +20%",  reason: "Safe-haven demand; rate cut tailwind for gold" },
      { ticker: "CASH", direction: "flat", magnitude: "0%",           reason: "Primary safe asset; no drawdown; yield positive" },
    ],
  },
  "Inflation Re-acceleration": {
    correspondingRegime: "Inflation Shock",
    assumptions: [
      "CPI re-accelerates above 4%; Fed forced to hike again",
      "Long-duration assets suffer; real rates rise",
      "Commodities and gold outperform",
      "Rate-sensitive growth tech valuation compresses",
    ],
    estimatedPortfolioImpact: "Mixed — tech positions (NVDA, GOOG, AAPL) face multiple compression; GLDM benefits if held; CASH loses purchasing power",
    bestHedgeTickers: ["GLDM", "GLD", "ITA"],
    worstHedgeTickers: ["TLT", "IEF", "CASH"],
    positionImpacts: [
      { ticker: "NVDA", direction: "down", magnitude: "-10% to -25%", reason: "High P/E multiples compress in higher rate environment" },
      { ticker: "AAPL", direction: "down", magnitude: "-8% to -18%",  reason: "Premium multiple exposed to real rate expansion" },
      { ticker: "GOOG", direction: "down", magnitude: "-10% to -20%", reason: "Advertising cyclical; rate-sensitive multiple" },
      { ticker: "AMZN", direction: "down", magnitude: "-8% to -18%",  reason: "High capex model expensive in high-rate environment" },
      { ticker: "ITA",  direction: "up",   magnitude: "+5% to +15%",  reason: "Defense budgets rise with inflation; military spending cycles" },
      { ticker: "GLDM", direction: "up",   magnitude: "+15% to +30%", reason: "Gold is the primary inflation hedge — core beneficiary" },
      { ticker: "CASH", direction: "down", magnitude: "-3% to -5%",   reason: "Purchasing power erosion; rate may not keep pace with CPI" },
    ],
  },
  "Dollar Crisis": {
    correspondingRegime: "Dollar Crisis",
    assumptions: [
      "USD index falls 15–25%; reserve status concerns",
      "Central banks accelerate gold buying",
      "US Treasuries face foreign selling pressure",
      "Commodity prices surge in dollar terms",
    ],
    estimatedPortfolioImpact: "Negative on dollar-denominated assets; GLDM is a major beneficiary; Cash loses real value",
    bestHedgeTickers: ["GLDM", "GLD", "IAU"],
    worstHedgeTickers: ["CASH", "SGOV", "TLT"],
    positionImpacts: [
      { ticker: "NVDA", direction: "up",   magnitude: "+10% to +20%", reason: "Non-US revenue sources benefit from weak USD; real assets" },
      { ticker: "AAPL", direction: "up",   magnitude: "+5% to +15%",  reason: "Majority of revenue international; USD weakness boosts USD reporting" },
      { ticker: "GOOG", direction: "flat", magnitude: "-5% to +10%",  reason: "Global revenue mix helps; ad market mixed in USD crisis" },
      { ticker: "AMZN", direction: "flat", magnitude: "-5% to +5%",   reason: "Global e-commerce benefits; domestic AWS may face macro pressure" },
      { ticker: "ITA",  direction: "flat", magnitude: "-5% to +10%",  reason: "Defense spending in USD; contractor revenues mixed" },
      { ticker: "GLDM", direction: "up",   magnitude: "+25% to +50%", reason: "Gold is the ultimate dollar crisis hedge — primary beneficiary" },
      { ticker: "CASH", direction: "down", magnitude: "-10% to -20%", reason: "Purchasing power destruction; real value falls with USD" },
    ],
  },
};

// ─── Verdict mapping ──────────────────────────────────────────────────────────

function verdictFromRegimeScore(score: number): string {
  if (score >= 75) return "Strong Keep";
  if (score >= 60) return "Keep";
  if (score >= 40) return "Reduce";
  if (score >= 25) return "Replace";
  return "Avoid";
}

// ─── Regime detection ─────────────────────────────────────────────────────────

export async function detectCurrentRegime(): Promise<RegimeDetection> {
  const [latestBrief, latestBlueprint, recentNewsletters, topOpportunities] = await Promise.all([
    db.morningBrief.findFirst({
      orderBy: { briefingDate: "desc" },
      select: {
        marketRegime:        true,
        marketRegimeEvidence: true,
        macroSummary:        true,
        geopoliticalSummary: true,
        technologySummary:   true,
        newsletterConsensus: true,
        institutionalResearch: true,
      },
    }),
    db.portfolioBlueprint.findFirst({
      orderBy: { blueprintDate: "desc" },
      select: { marketRegime: true },
    }),
    db.newsletterItem.findMany({
      where: { createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
      select: { portfolioRelevance: true, marketImplications: true, geopoliticalImplications: true },
      orderBy: { publishedAt: "desc" },
      take: 30,
    }),
    db.opportunityScore.findMany({
      orderBy: { generatedAt: "desc" },
      distinct: ["ticker"],
      take: 20,
      select: { ticker: true, opportunityScore: true },
    }),
  ]);

  const regimeScores: Record<RegimeName, number> = {
    "AI Expansion":          0,
    "Inflation Shock":       0,
    "Recession":             0,
    "Geopolitical Conflict": 0,
    "Liquidity Crisis":      0,
    "Dollar Crisis":         0,
  };
  const supporting: string[] = [];
  const conflicting: string[] = [];

  // Primary regime signal from morning brief / blueprint
  const primaryRegime = latestBrief?.marketRegime ?? latestBlueprint?.marketRegime ?? "Neutral";

  if (primaryRegime === "Risk On") {
    regimeScores["AI Expansion"] += 35;
    supporting.push(`Market regime is "Risk On" — consistent with AI/growth expansion`);
  } else if (primaryRegime === "Risk Off") {
    regimeScores["Recession"]             += 20;
    regimeScores["Geopolitical Conflict"] += 15;
    regimeScores["Liquidity Crisis"]      += 12;
    supporting.push(`Market regime is "Risk Off" — defensive posture across recession, geopolitical, and liquidity signals`);
  } else {
    regimeScores["AI Expansion"]    += 10;
    regimeScores["Inflation Shock"] += 8;
    supporting.push(`Market regime is "Neutral" — mixed signals; checking secondary indicators`);
  }

  // Morning brief evidence strings
  try {
    const evidence: string[] = JSON.parse(latestBrief?.marketRegimeEvidence ?? "[]");
    for (const e of evidence) {
      const el = e.toLowerCase();
      if (el.includes("tech") || el.includes("ai") || el.includes("semicon")) {
        regimeScores["AI Expansion"] += 8;
      }
      if (el.includes("inflation") || el.includes("cpi") || el.includes("rate")) {
        regimeScores["Inflation Shock"] += 6;
      }
      if (el.includes("reces") || el.includes("contract") || el.includes("slowdown")) {
        regimeScores["Recession"] += 8;
      }
      if (el.includes("geo") || el.includes("conflict") || el.includes("taiwan") || el.includes("war")) {
        regimeScores["Geopolitical Conflict"] += 8;
      }
    }
  } catch { /* ignore parse errors */ }

  // Macro summary signals
  try {
    const macro = JSON.parse(latestBrief?.macroSummary ?? "{}") as Record<string, string>;
    const macroText = Object.values(macro).join(" ").toLowerCase();
    if (macroText.includes("inflation") || macroText.includes("cpi") || macroText.includes("rate hike")) {
      regimeScores["Inflation Shock"] += 12;
      supporting.push("Macro signals: inflation or rate hike indicators present");
    }
    if (macroText.includes("reces") || macroText.includes("contract") || macroText.includes("ism below")) {
      regimeScores["Recession"] += 15;
      supporting.push("Macro signals: recession or contraction indicators present");
    }
    if (macroText.includes("credit stress") || macroText.includes("financial condition")) {
      regimeScores["Liquidity Crisis"] += 10;
    }
    if (macroText.includes("dollar") || macroText.includes("usd weakness") || macroText.includes("de-dollar")) {
      regimeScores["Dollar Crisis"] += 15;
      supporting.push("Macro signals: USD weakness or de-dollarization narrative");
    }
  } catch { /* ignore */ }

  // Geopolitical summary signals
  try {
    const geo = JSON.parse(latestBrief?.geopoliticalSummary ?? "{}") as Record<string, string>;
    const geoText = Object.values(geo).join(" ").toLowerCase();
    if (geoText.includes("taiwan") || geoText.includes("military") || geoText.includes("conflict") || geoText.includes("escalat")) {
      regimeScores["Geopolitical Conflict"] += 20;
      supporting.push("Geopolitical signals: active conflict or escalation narratives detected");
    }
    if (geoText.includes("ukraine") || geoText.includes("middle east") || geoText.includes("iran")) {
      regimeScores["Geopolitical Conflict"] += 10;
    }
  } catch { /* ignore */ }

  // Technology summary signals
  try {
    const tech = JSON.parse(latestBrief?.technologySummary ?? "{}") as Record<string, string>;
    const techText = Object.values(tech).join(" ").toLowerCase();
    if (techText.includes("ai") || techText.includes("semicon") || techText.includes("nvidia") || techText.includes("growth")) {
      regimeScores["AI Expansion"] += 15;
      supporting.push("Technology signals: AI/semiconductor momentum positive");
    }
    if (techText.includes("slowdown") || techText.includes("capex cut") || techText.includes("pullback")) {
      regimeScores["AI Expansion"] -= 10;
      conflicting.push("Technology signals: capex cuts or slowdown narrative detected");
    }
  } catch { /* ignore */ }

  // Newsletter portfolio relevance
  const bullishCount  = recentNewsletters.filter(n => n.portfolioRelevance === "bullish").length;
  const bearishCount  = recentNewsletters.filter(n => n.portfolioRelevance === "bearish").length;
  const neutralCount  = recentNewsletters.filter(n => n.portfolioRelevance === "neutral").length;
  const totalNL       = bullishCount + bearishCount + neutralCount;

  if (totalNL > 0) {
    if (bullishCount > bearishCount && bullishCount / totalNL > 0.5) {
      regimeScores["AI Expansion"] += 12;
      supporting.push(`Newsletter consensus: ${bullishCount} bullish vs ${bearishCount} bearish (${Math.round(bullishCount / totalNL * 100)}% positive)`);
    } else if (bearishCount > bullishCount && bearishCount / totalNL > 0.5) {
      regimeScores["Recession"]    += 10;
      regimeScores["Inflation Shock"] += 5;
      conflicting.push(`Newsletter consensus: ${bearishCount} bearish vs ${bullishCount} bullish — risk-off tilt`);
    }
  }

  // Newsletter market implications — gold/bond signals
  let geoImplicationCount = 0;
  let goldBullishCount    = 0;
  let bondBearishCount    = 0;

  for (const item of recentNewsletters) {
    try {
      const impl = JSON.parse(item.marketImplications) as Record<string, string>;
      const goldText = (impl.gold ?? "").toLowerCase();
      if (goldText.includes("bullish") || goldText.includes("positive") || goldText.includes("upside")) {
        goldBullishCount++;
      }
      const bondText = (impl.bonds ?? "").toLowerCase();
      if (bondText.includes("bearish") || bondText.includes("negative") || bondText.includes("downside")) {
        bondBearishCount++;
      }
    } catch { /* ignore */ }

    try {
      const geoImpl: string[] = JSON.parse(item.geopoliticalImplications);
      if (Array.isArray(geoImpl) && geoImpl.length > 0) geoImplicationCount++;
    } catch { /* ignore */ }
  }

  if (goldBullishCount >= 3) {
    regimeScores["Geopolitical Conflict"] += 8;
    regimeScores["Inflation Shock"]       += 8;
    regimeScores["Dollar Crisis"]         += 6;
    supporting.push(`${goldBullishCount} newsletter items with bullish gold implications`);
  }
  if (bondBearishCount >= 3) {
    regimeScores["Inflation Shock"] += 10;
    supporting.push(`${bondBearishCount} newsletter items with bearish bond implications — rising rate signal`);
  }
  if (geoImplicationCount >= 3) {
    regimeScores["Geopolitical Conflict"] += 12;
    supporting.push(`${geoImplicationCount} newsletter items flagging geopolitical implications`);
  }

  // Top opportunities — tech domination signals AI expansion
  const AI_TECH_TICKERS = new Set(["NVDA", "AAPL", "GOOG", "GOOGL", "MSFT", "AMZN", "META", "TSM", "AMD", "SMCI"]);
  const topTechCount = topOpportunities.filter(o => AI_TECH_TICKERS.has(o.ticker) && o.opportunityScore > 60).length;
  if (topTechCount >= 4) {
    regimeScores["AI Expansion"] += 18;
    supporting.push(`${topTechCount} AI/tech tickers in top-20 opportunity scores — tech dominance signal`);
  } else if (topTechCount >= 2) {
    regimeScores["AI Expansion"] += 8;
  }

  // Clamp all scores to 0+
  for (const r of ALL_REGIMES) {
    regimeScores[r] = Math.max(0, regimeScores[r]);
  }

  // Find winner
  const sorted = (Object.entries(regimeScores) as [RegimeName, number][]).sort(([, a], [, b]) => b - a);
  const winner = sorted[0];
  const runner = sorted[1];
  const total  = sorted.reduce((s, [, v]) => s + v, 0) || 1;

  // Confidence: ratio of winner score to total, normalized to 40–95%
  const rawConfidence = (winner[1] / total) * 100;
  const confidence    = Math.round(Math.max(40, Math.min(95, rawConfidence * 1.8)));

  // If runner is close, flag conflicting evidence
  if (runner[1] > winner[1] * 0.7 && winner[1] > 0) {
    conflicting.push(`Secondary regime "${runner[0]}" is close (score ratio ${Math.round(runner[1] / winner[1] * 100)}%) — signals are mixed`);
  }

  // Add a fallback explanation if no strong signals
  if (supporting.length === 0) {
    supporting.push(`Primary market regime from morning brief: ${primaryRegime}`);
  }

  return {
    regime:             winner[0],
    confidence,
    supportingEvidence: supporting.slice(0, 5),
    conflictingEvidence: conflicting.slice(0, 3),
  };
}

// ─── Hedge scoring by regime ──────────────────────────────────────────────────

export function scoreHedgeByRegime(regime: string): RegimeHedgeRanking {
  const table = REGIME_HEDGE_SCORES[regime as RegimeName] ?? REGIME_HEDGE_SCORES["AI Expansion"];

  const rankings: RegimeHedgeScore[] = Object.entries(table)
    .map(([ticker, { score, reason }]) => ({
      ticker,
      score,
      verdict: verdictFromRegimeScore(score),
      reason,
    }))
    .sort((a, b) => b.score - a.score);

  return { regime, rankings };
}

// ─── Portfolio alignment ──────────────────────────────────────────────────────

const HEDGE_TICKERS_FOR_ALIGNMENT = new Set(["GLDM", "GLD", "IAU", "ITA", "TLT", "IEF", "SGOV", "SHY", "VOO", "SPY"]);
const CASH_TICKER = "CASH";

function calculatePortfolioAlignment(
  positions: HedgePosition[],
  regime: RegimeDetection,
): HedgePortfolioAlignment {
  const table = REGIME_HEDGE_SCORES[regime.regime as RegimeName] ?? REGIME_HEDGE_SCORES["AI Expansion"];

  // Compute breakdown for all hedge + cash positions
  const hedgeBreakdown: HedgePortfolioAlignment["hedgeBreakdown"] = [];
  let weightedScore = 0;
  let totalHedgePct = 0;

  for (const pos of positions) {
    if (!pos.isCash && !HEDGE_TICKERS_FOR_ALIGNMENT.has(pos.ticker)) continue;

    const entry = pos.isCash ? table["CASH"] : table[pos.ticker];
    if (!entry) continue;

    const score   = entry.score;
    const verdict = verdictFromRegimeScore(score);
    hedgeBreakdown.push({ ticker: pos.ticker, pct: pos.pct, regimeScore: score, verdict });
    weightedScore += pos.pct * score;
    totalHedgePct += pos.pct;
  }

  const alignmentScore = totalHedgePct > 0
    ? Math.round(weightedScore / totalHedgePct)
    : 50;

  // Optimal hedge range
  const optimal   = REGIME_OPTIMAL_HEDGE[regime.regime as RegimeName] ?? { min: 10, max: 25 };
  const optimalStr = `${optimal.min}–${optimal.max}%`;

  let status: HedgePortfolioAlignment["status"];
  if (alignmentScore >= 70) {
    status = totalHedgePct > optimal.max ? "over-hedged" : "aligned";
  } else if (totalHedgePct < optimal.min) {
    status = "under-hedged";
  } else {
    status = "misaligned";
  }

  // Recommendation
  const topRegimeHedge = Object.entries(table)
    .sort(([, a], [, b]) => b.score - a.score)[0];

  const currentTopHedge = hedgeBreakdown.sort((a, b) => b.regimeScore - a.regimeScore)[0];
  hedgeBreakdown.sort((a, b) => b.pct - a.pct); // restore sort by pct

  let recommendation = "";
  if (status === "aligned") {
    recommendation = `Current hedge mix is well-aligned for ${regime.regime}. Maintain current positioning.`;
  } else if (status === "misaligned") {
    recommendation = `Hedge mix is misaligned for ${regime.regime} (score ${alignmentScore}/100). Best hedge for this regime: ${topRegimeHedge[0]} (score ${topRegimeHedge[1].score}/100).`;
  } else if (status === "under-hedged") {
    recommendation = `Total hedge at ${totalHedgePct.toFixed(1)}% — below the ${optimalStr} optimal range for ${regime.regime}. Consider increasing ${topRegimeHedge[0]}.`;
  } else {
    recommendation = `Total hedge at ${totalHedgePct.toFixed(1)}% — above the ${optimalStr} optimal range for ${regime.regime}. Current quality score is ${alignmentScore}/100.`;
  }

  return {
    regime:         regime.regime,
    confidence:     regime.confidence,
    alignmentScore,
    status,
    hedgeBreakdown: hedgeBreakdown.sort((a, b) => b.pct - a.pct),
    totalHedgePct:  Math.round(totalHedgePct * 10) / 10,
    optimalHedgePct: optimalStr,
    recommendation,
  };
}

// ─── Scenario stress tests ────────────────────────────────────────────────────

function runScenarioStressTests(positions: HedgePosition[]): ScenarioStressTest[] {
  const heldTickers = new Set(positions.map(p => p.ticker));

  return Object.entries(SCENARIO_DEFINITIONS).map(([scenarioName, def]) => {
    const relevantImpacts = def.positionImpacts.filter(i => heldTickers.has(i.ticker));

    const bestHedges = def.bestHedgeTickers
      .map(t => {
        const entry = REGIME_HEDGE_SCORES[def.correspondingRegime][t];
        return { ticker: t, reason: entry?.reason ?? "Top-ranked hedge for this scenario" };
      })
      .slice(0, 3);

    const worstHedges = def.worstHedgeTickers
      .map(t => {
        const entry = REGIME_HEDGE_SCORES[def.correspondingRegime][t];
        return { ticker: t, reason: entry?.reason ?? "Weakest hedge for this scenario" };
      })
      .slice(0, 2);

    return {
      scenario:                scenarioName,
      correspondingRegime:     def.correspondingRegime,
      assumptions:             def.assumptions,
      estimatedPortfolioImpact: def.estimatedPortfolioImpact,
      bestHedges,
      worstHedges,
      positionImpacts:         relevantImpacts,
    };
  });
}

// ─── Multi-regime verdicts ────────────────────────────────────────────────────

const VERDICT_TICKERS = ["GLDM", "ITA", "CASH", "SGOV", "TLT"];

function generateMultiVerdicts(currentRegime: string): MultiRegimeVerdict[] {
  return VERDICT_TICKERS.map(ticker => {
    const allVerdicts = ALL_REGIMES.map(regime => {
      const entry = REGIME_HEDGE_SCORES[regime][ticker];
      const score  = entry?.score ?? 50;
      return {
        regime,
        verdict:   verdictFromRegimeScore(score),
        score,
        isCurrent: regime === currentRegime,
      };
    });

    const currentEntry = REGIME_HEDGE_SCORES[currentRegime as RegimeName]?.[ticker];
    const currentScore  = currentEntry?.score ?? 50;
    const currentVerdict = verdictFromRegimeScore(currentScore);

    // Summary: highlight when current verdict differs from other regimes
    const strongInOtherRegimes = allVerdicts.filter(v => !v.isCurrent && v.score >= 75);
    let summary = `In ${currentRegime}: ${currentVerdict} (${currentScore}/100).`;
    if (strongInOtherRegimes.length > 0) {
      summary += ` Becomes Strong Keep in: ${strongInOtherRegimes.map(v => v.regime).join(", ")}.`;
    }

    return { ticker, currentRegime, currentVerdict, currentScore, allVerdicts, summary };
  });
}

// ─── Main export ───────────────────────────────────────────────────────────────

export async function generateRegimeHedgeReport(positions: HedgePosition[]): Promise<RegimeHedgeReport> {
  const currentRegime         = await detectCurrentRegime();
  const currentRegimeRanking  = scoreHedgeByRegime(currentRegime.regime);
  const allRegimeRankings     = ALL_REGIMES.map(r => scoreHedgeByRegime(r));
  const portfolioAlignment    = calculatePortfolioAlignment(positions, currentRegime);
  const scenarioStressTests   = runScenarioStressTests(positions);
  const multiVerdicts         = generateMultiVerdicts(currentRegime.regime);

  return {
    currentRegime,
    currentRegimeRanking,
    allRegimeRankings,
    portfolioAlignment,
    scenarioStressTests,
    multiVerdicts,
    generatedAt: new Date(),
  };
}
