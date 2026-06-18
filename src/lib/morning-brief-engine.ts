// Morning Brief Engine — Phase 9A + Phase 11 upgrade
//
// Phase 11 changes:
//   - computeMarketRegime: adds VIX signal from MarketSnapshot
//   - buildMacroSummary: uses real FRED data from MacroSnapshot
//   - buildGeopoliticalSummary: uses GeoEvent records from DB (FMP news)
//   - generatedFromSources: tracks macro/market/geo data points used
//
// All recommendations include Source, Evidence, and Timestamp.

import { db } from "./db";
import {
  getLatestMacroSnapshots,
  getLatestMarketSnapshots,
  getRecentGeoEvents,
  type LatestMacro,
  type LatestMarket,
  type RecentGeoEvent,
} from "./macro-ingestion";
import {
  interpretCPI,
  interpretFedFunds,
  interpretUnemployment,
  interpretGDPGrowth,
  interpretYieldCurve,
} from "./macro-client";
import { interpretVIX } from "./market-data-client";

// ─── Output types ─────────────────────────────────────────────────────────────

export type MarketRegime = "Risk On" | "Neutral" | "Risk Off";

export interface MacroTopic {
  topic: string;
  signal: "positive" | "neutral" | "negative";
  insight: string;
  value?: string;       // e.g. "3.4%" or "5.33%"
  source?: string;      // e.g. "FRED (Apr 2025)"
  timestamp?: string;   // ISO date of the data point
}

export interface MacroSummary {
  topics: MacroTopic[];
  overallStance: string;
  dataAvailable: boolean; // false if MacroSnapshot table is empty
}

export interface GeopoliticalRisk {
  region: string;
  level: "high" | "medium" | "low";
  portfolioExposure: string;
  insight: string;
  latestEvent?: string;     // headline from GeoEvent
  eventSource?: string;     // e.g. "Reuters (Jun 2025)"
  eventDate?: string;
}

export interface GeopoliticalSummary {
  risks: GeopoliticalRisk[];
  overallStance: string;
}

export interface TechTheme {
  theme: string;
  signal: "positive" | "neutral" | "negative" | "watch";
  holdingRelevance: string[];
  insight: string;
}

export interface TechnologySummary {
  themes: TechTheme[];
  overallStance: string;
}

export interface PositionImpact {
  ticker: string;
  name: string;
  impact: "positive" | "neutral" | "negative";
  reason: string;
  signals: string[];
}

export interface PortfolioImpact {
  positive: PositionImpact[];
  neutral: PositionImpact[];
  negative: PositionImpact[];
  summary: string;
}

export interface RecommendedAction {
  priority: number;
  action: string;
  reason: string;
  urgency: "high" | "medium" | "low";
  ticker: string | null;
}

export interface NewsletterInsight {
  source: string;
  title: string;
  summary: string[];
  portfolioRelevance: "bullish" | "neutral" | "bearish";
  publishedAt: string;
  url?: string;
}

export interface TradeIdea {
  action: "BUY" | "TRIM" | "WATCH";
  ticker: string;
  thesis: string;
  risk: string;
  urgency: "high" | "medium" | "low";
}

export interface MorningBriefData {
  briefingDate: Date;
  marketRegime: MarketRegime;
  marketRegimeEvidence: string[];
  topCall: string;
  tradeIdeas: TradeIdea[];
  macroSummary: MacroSummary;
  geopoliticalSummary: GeopoliticalSummary;
  technologySummary: TechnologySummary;
  portfolioImpact: PortfolioImpact;
  recommendedActions: RecommendedAction[];
  generatedFromSources: {
    positions: number;
    filings: number;
    committee: number;
    thesisImpacts: number;
    earnings: number;
    opportunities: number;
    theses: number;
    macroDataPoints: number;
    marketDataPoints: number;
    geoEvents: number;
    newsletterItems?: number;
  };
  dataSources: {
    macro: string[];
    market: string[];
    geo: string[];
    portfolio: string[];
  };
  institutionalResearch?: NewsletterInsight[];
  newsletterConsensus?: NewsletterInsight[];
  freshnessWarning?: string;
}

// ─── Sector / theme maps ──────────────────────────────────────────────────────

const AI_TICKERS      = new Set(["NVDA", "GOOG", "GOOGL", "MSFT", "META", "AMZN", "TSM", "AMD", "SMCI"]);
const SEMI_TICKERS    = new Set(["NVDA", "TSM", "AMD", "SMCI", "ASML"]);
const CLOUD_TICKERS   = new Set(["AMZN", "GOOG", "GOOGL", "MSFT", "CRM"]);
const ROBOTICS_TICKERS = new Set(["NVDA", "HON", "ABB", "FANUC"]);
const DEFENSE_TICKERS = new Set(["ITA", "LMT", "RTX", "NOC", "GD"]);
const GOLD_TICKERS    = new Set(["GLDM", "GLD", "IAU", "GDX"]);

const CHINA_TAIWAN_TICKERS = new Set(["TSM", "NVDA", "AAPL", "AMZN", "GOOG", "GOOGL", "META"]);
const MIDDLE_EAST_TICKERS  = new Set(["ITA", "LMT", "RTX", "NOC"]);

// ─── Market Regime ────────────────────────────────────────────────────────────

interface RegimeSignal {
  bullish: number;
  bearish: number;
  evidence: string[];
}

async function computeMarketRegime(
  since30d: Date,
  marketData: Record<string, LatestMarket>,
  geoEvents: RecentGeoEvent[] = [],
): Promise<{ regime: MarketRegime; evidence: string[] }> {
  const signals: RegimeSignal = { bullish: 0, bearish: 0, evidence: [] };

  // ── Geopolitical signal ────────────────────────────────────────────────────
  const critical = geoEvents.filter(e => e.severity === "critical");
  const high     = geoEvents.filter(e => e.severity === "high");

  if (critical.length > 0) {
    const penalty = Math.min(critical.length * 2, 4);
    signals.bearish += penalty;
    const regions = [...new Set(critical.map(e => e.region))].join(", ");
    signals.evidence.push(`${critical.length} critical geopolitical event(s) in ${regions}`);
  } else if (high.length > 0) {
    const penalty = Math.min(high.length, 2);
    signals.bearish += penalty;
    const regions = [...new Set(high.map(e => e.region))].join(", ");
    signals.evidence.push(`${high.length} high-severity geopolitical event(s) in ${regions}`);
  } else {
    // No critical/high events = geopolitical environment constructive
    signals.bullish += 1;
    signals.evidence.push("Geopolitical risk contained — no critical or high-severity events active");
  }

  // ── VIX signal (real market data) ─────────────────────────────────────────
  const vixEntry = marketData["VIX"];
  if (vixEntry) {
    const vixRead = interpretVIX(vixEntry.value);
    if (vixRead.regimePoints > 0) {
      signals.bullish += vixRead.regimePoints;
    } else if (vixRead.regimePoints < 0) {
      signals.bearish += Math.abs(vixRead.regimePoints);
    }
    signals.evidence.push(`${vixRead.label} (Yahoo Finance, ${vixEntry.date.toLocaleDateString()})`);
  }

  // ── Committee conviction signals (last 30 days) ───────────────────────────
  const sessions = await db.committeeSession.findMany({
    where: { createdAt: { gte: since30d } },
    select: { ticker: true, conviction: true },
  });

  const strongBuys = sessions.filter(s => s.conviction === "Strong Buy");
  const buys       = sessions.filter(s => s.conviction === "Buy");
  const passes     = sessions.filter(s => s.conviction === "Pass");

  if (strongBuys.length > 0) {
    const uniqueTickers = [...new Set(strongBuys.map(s => s.ticker))];
    signals.bullish += uniqueTickers.length * 2;
    signals.evidence.push(`${uniqueTickers.length} Strong Buy committee signal${uniqueTickers.length > 1 ? "s" : ""} (${uniqueTickers.join(", ")})`);
  }
  if (buys.length > 0) {
    const uniqueTickers = [...new Set(buys.map(s => s.ticker))];
    signals.bullish += uniqueTickers.length;
    signals.evidence.push(`${uniqueTickers.length} Buy committee signal${uniqueTickers.length > 1 ? "s" : ""} (${uniqueTickers.join(", ")})`);
  }
  if (passes.length > 0) {
    signals.bearish += passes.length;
    signals.evidence.push(`${passes.length} Pass verdict${passes.length > 1 ? "s" : ""} from committee`);
  }

  if (sessions.length === 0) {
    const allSessions = await db.committeeSession.findMany({ select: { conviction: true } });
    const allStrongBuy = allSessions.filter(s => s.conviction === "Strong Buy").length;
    const allBuy       = allSessions.filter(s => s.conviction === "Buy").length;
    if (allStrongBuy + allBuy > 0) {
      signals.bullish += allStrongBuy + allBuy;
      signals.evidence.push(`${allStrongBuy + allBuy} Buy/Strong Buy verdict${allStrongBuy + allBuy > 1 ? "s" : ""} in committee history`);
    }
  }

  // ── Thesis impact signals (last 30 days) ──────────────────────────────────
  const impacts = await db.thesisImpactRecord.findMany({
    where: { createdAt: { gte: since30d } },
    select: { impactLevel: true, ticker: true },
  });

  const strengthened   = impacts.filter(i => i.impactLevel === "strengthened");
  const weakened       = impacts.filter(i => i.impactLevel === "weakened");
  const killTriggered  = impacts.filter(i => i.impactLevel === "kill_criteria_triggered");

  if (strengthened.length > 0) {
    signals.bullish += strengthened.length;
    signals.evidence.push(`${strengthened.length} thesis strengthened by recent filing${strengthened.length > 1 ? "s" : ""}`);
  }
  if (weakened.length > 0) {
    signals.bearish += weakened.length;
    signals.evidence.push(`${weakened.length} thesis weakened by recent filing${weakened.length > 1 ? "s" : ""}`);
  }
  if (killTriggered.length > 0) {
    signals.bearish += killTriggered.length * 2;
    signals.evidence.push(`${killTriggered.length} kill criteria triggered — review required`);
  }

  // ── Portfolio thesis health ────────────────────────────────────────────────
  const theses = await db.investmentThesis.findMany({
    where: { status: "active" },
    select: { ticker: true, confidenceScore: true },
  });
  const highConviction = theses.filter(t => t.confidenceScore >= 7).length;
  const lowConviction  = theses.filter(t => t.confidenceScore < 5).length;

  if (highConviction > 0) signals.bullish += Math.floor(highConviction / 2);
  if (lowConviction > 0) {
    signals.bearish += lowConviction;
    signals.evidence.push(`${lowConviction} position${lowConviction > 1 ? "s" : ""} with low conviction score`);
  }

  const triggeredKills = await db.killCondition.findMany({ where: { status: "triggered" } });
  if (triggeredKills.length > 0) {
    signals.bearish += triggeredKills.length;
    signals.evidence.push(`${triggeredKills.length} kill condition${triggeredKills.length > 1 ? "s" : ""} currently triggered`);
  }

  const score = signals.bullish - signals.bearish;
  let regime: MarketRegime;
  if (score >= 3) {
    regime = "Risk On";
    if (!signals.evidence.some(e => e.includes("bullish") || e.includes("Strong Buy") || e.includes("Buy"))) {
      signals.evidence.unshift("Portfolio signals broadly constructive");
    }
  } else if (score <= -2) {
    regime = "Risk Off";
    signals.evidence.unshift("Multiple bearish signals detected across portfolio and market");
  } else {
    regime = "Neutral";
    signals.evidence.unshift("Mixed signals — no clear directional bias");
  }

  return { regime, evidence: signals.evidence.slice(0, 6) };
}

// ─── Macro Summary ────────────────────────────────────────────────────────────

async function buildMacroSummary(
  positions: ActivePosition[],
  macroData: Record<string, LatestMacro>,
): Promise<MacroSummary> {
  const tickers    = positions.map(p => p.ticker);
  const hasTech    = tickers.some(t => AI_TICKERS.has(t) || SEMI_TICKERS.has(t) || CLOUD_TICKERS.has(t));
  const hasGold    = tickers.some(t => GOLD_TICKERS.has(t));
  const hasDefense = tickers.some(t => DEFENSE_TICKERS.has(t));

  const dataAvailable = Object.keys(macroData).length > 0;

  // ── CPI ───────────────────────────────────────────────────────────────────
  let cpiTopic: MacroTopic;
  const cpiEntry = macroData["CPI"];
  const coreCpiEntry = macroData["Core CPI"];

  if (cpiEntry) {
    const interp = interpretCPI(cpiEntry.value);
    const coreStr = coreCpiEntry ? `, Core CPI ${coreCpiEntry.value.toFixed(1)}%` : "";
    const portInsight = hasTech
      ? "Tech-heavy portfolio is multiple-sensitive — elevated inflation delays rate cuts and compresses P/E ratios on growth names"
      : "Monitor input cost trends and consumer spending impact on portfolio sectors";
    cpiTopic = {
      topic: "Inflation",
      signal: interp.signal,
      insight: `CPI ${cpiEntry.value.toFixed(1)}% YoY${coreStr}. ${interp.label}. ${portInsight}`,
      value: `${cpiEntry.value.toFixed(1)}%`,
      source: `FRED (${cpiEntry.date.toLocaleDateString("en-US", { month: "short", year: "numeric" })})`,
      timestamp: cpiEntry.date.toISOString(),
    };
  } else {
    cpiTopic = {
      topic: "Inflation",
      signal: hasTech ? "negative" : "neutral",
      insight: hasTech
        ? "Inflation data unavailable — run macro_ingestion to fetch live CPI from FRED. Tech portfolio is rate-sensitive."
        : "Inflation data unavailable — run macro_ingestion to fetch live FRED data.",
    };
  }

  // ── Interest Rates ────────────────────────────────────────────────────────
  let ratesTopic: MacroTopic;
  const ffEntry = macroData["Fed Funds Rate"];

  if (ffEntry) {
    const interp = interpretFedFunds(ffEntry.value);
    const portInsight = hasTech
      ? `At ${ffEntry.value.toFixed(2)}%, rates remain restrictive — compresses multiples on high-P/E tech positions. Monitor Fed pivot signals closely`
      : `Fed Funds at ${ffEntry.value.toFixed(2)}% — ${interp.label}`;
    ratesTopic = {
      topic: "Interest Rates",
      signal: interp.signal,
      insight: portInsight,
      value: `${ffEntry.value.toFixed(2)}%`,
      source: `FRED (${ffEntry.date.toLocaleDateString("en-US", { month: "short", year: "numeric" })})`,
      timestamp: ffEntry.date.toISOString(),
    };
  } else {
    ratesTopic = {
      topic: "Interest Rates",
      signal: hasTech ? "negative" : "neutral",
      insight: "Rate data unavailable — run macro_ingestion to fetch Fed Funds Rate from FRED.",
    };
  }

  // ── Treasury Yields ───────────────────────────────────────────────────────
  let yieldsTopic: MacroTopic;
  const y10Entry = macroData["10Y Treasury Yield"];
  const y2Entry  = macroData["2Y Treasury Yield"];

  if (y10Entry) {
    const yieldStr = y2Entry
      ? `10Y at ${y10Entry.value.toFixed(2)}%, 2Y at ${y2Entry.value.toFixed(2)}%`
      : `10Y at ${y10Entry.value.toFixed(2)}%`;

    let curveInsight = "";
    if (y2Entry) {
      const curve = interpretYieldCurve(y10Entry.value, y2Entry.value);
      curveInsight = ` Yield curve: ${curve.label}.`;
    }

    const portInsight = hasGold
      ? `GLDM allocation provides yield hedge. ${yieldStr}.${curveInsight}`
      : `${yieldStr}.${curveInsight} Higher yields pressure growth stock valuations via discount rate.`;

    yieldsTopic = {
      topic: "Treasury Yields",
      signal: hasGold ? "positive" : y10Entry.value > 4.5 ? "negative" : "neutral",
      insight: portInsight,
      value: `${y10Entry.value.toFixed(2)}%`,
      source: `FRED (${y10Entry.date.toLocaleDateString("en-US", { month: "short", year: "numeric" })})`,
      timestamp: y10Entry.date.toISOString(),
    };
  } else {
    yieldsTopic = {
      topic: "Treasury Yields",
      signal: hasGold ? "positive" : "neutral",
      insight: hasGold
        ? "GLDM allocation provides yield-inversion hedge. Yield data unavailable — run macro_ingestion."
        : "Treasury yield data unavailable — run macro_ingestion to fetch from FRED.",
    };
  }

  // ── Employment ────────────────────────────────────────────────────────────
  let employmentTopic: MacroTopic;
  const unrateEntry = macroData["Unemployment"];
  const gdpEntry    = macroData["GDP Growth"];

  if (unrateEntry) {
    const interp = interpretUnemployment(unrateEntry.value);
    const gdpStr = gdpEntry ? ` GDP growth ${gdpEntry.value.toFixed(1)}% annualized.` : "";
    const portInsight = hasTech
      ? `Unemployment at ${unrateEntry.value.toFixed(1)}%. ${interp.label}. Strong labor market supports enterprise AI/cloud spending budgets.${gdpStr}`
      : `Unemployment at ${unrateEntry.value.toFixed(1)}%. ${interp.label}.${gdpStr}`;
    employmentTopic = {
      topic: "Employment & Growth",
      signal: interp.signal,
      insight: portInsight,
      value: `${unrateEntry.value.toFixed(1)}%`,
      source: `FRED (${unrateEntry.date.toLocaleDateString("en-US", { month: "short", year: "numeric" })})`,
      timestamp: unrateEntry.date.toISOString(),
    };
  } else {
    employmentTopic = {
      topic: "Employment & Growth",
      signal: "positive",
      insight: hasTech
        ? "Employment data unavailable — run macro_ingestion. Strong labor market historically supports enterprise tech spending."
        : "Employment data unavailable — run macro_ingestion to fetch UNRATE from FRED.",
    };
  }

  const topics = [cpiTopic, ratesTopic, yieldsTopic, employmentTopic];

  const stanceTokens: string[] = [];
  if (ffEntry && ffEntry.value > 4.5) stanceTokens.push(`Fed Funds ${ffEntry.value.toFixed(2)}% — restrictive`);
  if (cpiEntry && cpiEntry.value > 3) stanceTokens.push(`CPI ${cpiEntry.value.toFixed(1)}% — above target`);
  if (unrateEntry) stanceTokens.push(`unemployment ${unrateEntry.value.toFixed(1)}%`);
  if (gdpEntry) stanceTokens.push(`GDP growth ${gdpEntry.value.toFixed(1)}%`);

  const overallStance = stanceTokens.length > 0
    ? `Macro: ${stanceTokens.join(", ")}. ${hasTech ? "Technology-heavy portfolio is rate-sensitive but AI cycle provides growth offset." : ""}`
    : "Macro data unavailable — trigger macro_ingestion to populate real indicators from FRED.";

  return { topics, overallStance, dataAvailable };
}

// ─── Geopolitical Summary ─────────────────────────────────────────────────────

async function buildGeopoliticalSummary(
  positions: ActivePosition[],
  universeTop: string[],
  geoEvents: RecentGeoEvent[],
): Promise<GeopoliticalSummary> {
  const tickers = new Set([...positions.map(p => p.ticker), ...universeTop]);

  const chinaTaiwanExposed = [...tickers].filter(t => CHINA_TAIWAN_TICKERS.has(t));
  const middleEastExposed  = [...tickers].filter(t => MIDDLE_EAST_TICKERS.has(t));

  // Group geo events by region
  const eventsByRegion = new Map<string, RecentGeoEvent[]>();
  for (const ev of geoEvents) {
    const list = eventsByRegion.get(ev.region) ?? [];
    list.push(ev);
    eventsByRegion.set(ev.region, list);
  }

  const getTopEvent = (region: string): RecentGeoEvent | null => {
    const list = eventsByRegion.get(region) ?? [];
    // Sort by severity weight desc, then date desc
    const weight = (s: string) => ({ critical: 4, high: 3, medium: 2, low: 1 }[s] ?? 0);
    return list.sort((a, b) => weight(b.severity) - weight(a.severity) || b.eventDate.getTime() - a.eventDate.getTime())[0] ?? null;
  };

  const topChinaTaiwan = getTopEvent("China/Taiwan");
  const topMiddleEast  = getTopEvent("Middle East");
  const topRussia      = getTopEvent("Russia/Ukraine");

  const mapLevel = (ev: RecentGeoEvent | null, fallbackLevel: "high" | "medium" | "low"): "high" | "medium" | "low" => {
    if (!ev) return fallbackLevel;
    if (ev.severity === "critical" || ev.severity === "high") return "high";
    if (ev.severity === "medium") return "medium";
    return "low";
  };

  const risks: GeopoliticalRisk[] = [
    {
      region: "China/Taiwan",
      level: chinaTaiwanExposed.length > 2
        ? mapLevel(topChinaTaiwan, "high")
        : chinaTaiwanExposed.length > 0
          ? mapLevel(topChinaTaiwan, "medium")
          : mapLevel(topChinaTaiwan, "low"),
      portfolioExposure: chinaTaiwanExposed.length > 0
        ? `Exposed via ${chinaTaiwanExposed.join(", ")} — supply chain and revenue concentration in Asia-Pacific`
        : "No direct holdings with significant Taiwan/China dependency",
      insight: topChinaTaiwan
        ? `Latest: "${topChinaTaiwan.eventTitle.substring(0, 120)}". ${chinaTaiwanExposed.length > 0 ? `Directly impacts ${chinaTaiwanExposed.join(", ")}.` : "Monitor for supply chain implications."}`
        : chinaTaiwanExposed.includes("TSM")
          ? "TSM watchlist carries maximum Taiwan geopolitical risk; monitor escalation signals before initiating position"
          : chinaTaiwanExposed.length > 0
            ? `${chinaTaiwanExposed[0]} has indirect Asia-Pacific exposure; monitor but not primary risk driver`
            : "Current portfolio has limited direct China/Taiwan exposure",
      latestEvent: topChinaTaiwan?.eventTitle,
      eventSource: topChinaTaiwan ? `${topChinaTaiwan.source} (${topChinaTaiwan.eventDate.toLocaleDateString()})` : undefined,
      eventDate: topChinaTaiwan?.eventDate.toISOString(),
    },
    {
      region: "Middle East",
      level: middleEastExposed.length > 0
        ? mapLevel(topMiddleEast, "medium")
        : mapLevel(topMiddleEast, "low"),
      portfolioExposure: middleEastExposed.length > 0
        ? `${middleEastExposed.join(", ")} positioned to benefit from elevated defense spending`
        : "No direct defense or energy exposure; oil price changes are secondary",
      insight: topMiddleEast
        ? `Latest: "${topMiddleEast.eventTitle.substring(0, 120)}". ${middleEastExposed.includes("ITA") ? "ITA provides direct geopolitical premium exposure." : "Secondary impact via energy prices and logistics."}`
        : middleEastExposed.includes("ITA")
          ? "ITA (defense ETF) provides direct exposure to geopolitical premium in defense budgets; elevated tensions are thesis-supportive"
          : "Middle East tensions affect energy prices and logistics costs as secondary portfolio impacts",
      latestEvent: topMiddleEast?.eventTitle,
      eventSource: topMiddleEast ? `${topMiddleEast.source} (${topMiddleEast.eventDate.toLocaleDateString()})` : undefined,
      eventDate: topMiddleEast?.eventDate.toISOString(),
    },
    {
      region: "Russia/Ukraine",
      level: mapLevel(topRussia, "low"),
      portfolioExposure: "No direct Russian/Ukrainian assets; secondary exposure via European energy pricing and defense spending cycles",
      insight: topRussia
        ? `Latest: "${topRussia.eventTitle.substring(0, 120)}". Prolonged conflict supports NATO defense budgets — thesis-supportive for ITA.`
        : "Prolonged conflict supports NATO defense budgets — thesis-supportive for ITA if held. Minimal direct portfolio impact.",
      latestEvent: topRussia?.eventTitle,
      eventSource: topRussia ? `${topRussia.source} (${topRussia.eventDate.toLocaleDateString()})` : undefined,
      eventDate: topRussia?.eventDate.toISOString(),
    },
  ];

  const highRisks = risks.filter(r => r.level === "high").map(r => r.region);
  const hasRealEvents = geoEvents.length > 0;
  const stance = hasRealEvents
    ? highRisks.length > 0
      ? `Elevated geopolitical risk in ${highRisks.join(", ")} — real-time news signals detected. Requires active monitoring.`
      : "Geopolitical exposure manageable per current news signals; defense positioning provides partial hedge."
    : "No recent geopolitical news in DB — run macro_ingestion to fetch live signals from FMP news.";

  return { risks, overallStance: stance };
}

// ─── Technology Summary ────────────────────────────────────────────────────────

async function buildTechnologySummary(
  positions: ActivePosition[],
  committeeSessions: CommitteeRow[],
): Promise<TechnologySummary> {
  const tickers = positions.map(p => p.ticker);

  const getConviction = (ticker: string): string | null =>
    committeeSessions.find(c => c.ticker === ticker)?.conviction ?? null;

  const convictionSignal = (conviction: string | null): "positive" | "neutral" | "negative" | "watch" => {
    if (!conviction) return "neutral";
    if (conviction === "Strong Buy" || conviction === "Buy") return "positive";
    if (conviction === "Pass") return "negative";
    if (conviction === "Watch") return "watch";
    return "neutral";
  };

  const aiHoldings      = tickers.filter(t => AI_TICKERS.has(t));
  const semiHoldings    = tickers.filter(t => SEMI_TICKERS.has(t));
  const cloudHoldings   = tickers.filter(t => CLOUD_TICKERS.has(t));
  const roboticsHoldings = tickers.filter(t => ROBOTICS_TICKERS.has(t));

  const aiConvictions  = aiHoldings.map(getConviction).filter(Boolean) as string[];
  const aiPositive     = aiConvictions.filter(c => c === "Strong Buy" || c === "Buy").length;
  const aiSignal       = aiHoldings.length === 0 ? "neutral" : aiPositive > 0 ? "positive" : "watch";

  const semiConvictions = semiHoldings.map(getConviction).filter(Boolean) as string[];
  const semiPositive    = semiConvictions.filter(c => c === "Strong Buy" || c === "Buy").length;
  const semiSignal: "positive" | "neutral" | "negative" | "watch" =
    semiHoldings.length === 0 ? "neutral" : semiPositive > 0 ? "positive" : "neutral";

  const cloudConvictions = cloudHoldings.map(getConviction).filter(Boolean) as string[];
  const cloudPositive    = cloudConvictions.filter(c => c === "Strong Buy" || c === "Buy").length;
  const cloudSignal: "positive" | "neutral" | "negative" | "watch" =
    cloudHoldings.length === 0 ? "neutral" : cloudPositive > 0 ? "positive" : "neutral";

  const themes: TechTheme[] = [
    {
      theme: "AI",
      signal: aiSignal,
      holdingRelevance: aiHoldings,
      insight: aiHoldings.length > 0
        ? `AI-exposed holdings: ${aiHoldings.join(", ")}. ${aiConvictions.length > 0 ? `Committee: ${aiConvictions.join(", ")}.` : "No recent committee review."} AI capex cycle remains the primary growth driver for portfolio tech positions.`
        : "No direct AI holdings; monitor NVDA, GOOG, MSFT universe entries for entry opportunities.",
    },
    {
      theme: "Semiconductors",
      signal: semiSignal,
      holdingRelevance: semiHoldings,
      insight: semiHoldings.length > 0
        ? `Semiconductor exposure via ${semiHoldings.join(", ")}. ${semiConvictions.length > 0 ? `Committee conviction: ${semiConvictions.join(", ")}.` : ""} Chip cycle recovery supports thesis; monitor inventory normalization.`
        : "No semiconductor holdings currently. TSM on watchlist represents vertical integration thesis.",
    },
    {
      theme: "Cloud",
      signal: cloudSignal,
      holdingRelevance: cloudHoldings,
      insight: cloudHoldings.length > 0
        ? `Cloud exposure via ${cloudHoldings.join(", ")}. ${cloudConvictions.length > 0 ? `Committee: ${cloudConvictions.join(", ")}.` : ""} Enterprise cloud adoption continues; pricing power and margin expansion are key thesis assumptions.`
        : "No cloud holdings. AMZN (AWS) and GOOG (GCP) are universe candidates.",
    },
    {
      theme: "Robotics",
      signal: "neutral",
      holdingRelevance: roboticsHoldings,
      insight: roboticsHoldings.length > 0
        ? `Robotics exposure via ${roboticsHoldings.join(", ")}. Monitor manufacturing automation trends.`
        : "No dedicated robotics exposure. Long-cycle theme — monitor for future allocation.",
    },
  ];

  const positiveThemes = themes.filter(t => t.signal === "positive").map(t => t.theme);
  const stance = positiveThemes.length > 0
    ? `Technology signals positive for ${positiveThemes.join(", ")} themes. AI infrastructure cycle remains primary growth narrative.`
    : "Technology themes are mixed; no strong near-term catalysts from current data.";

  return { themes, overallStance: stance };
}

// ─── Portfolio Impact ─────────────────────────────────────────────────────────

async function buildPortfolioImpact(
  positions: ActivePosition[],
  committeeSessions: CommitteeRow[],
): Promise<PortfolioImpact> {
  const since30d = new Date(Date.now() - 30 * 86400 * 1000);
  const recentImpacts = await db.thesisImpactRecord.findMany({
    where: { createdAt: { gte: since30d } },
    select: { ticker: true, impactLevel: true, reasoning: true },
  });

  const theses = await db.investmentThesis.findMany({
    select: { ticker: true, confidenceScore: true, isDraft: true },
  });
  const thesisMap = new Map(theses.map(t => [t.ticker, t]));

  const triggeredKills = await db.killCondition.findMany({
    where: { status: "triggered" },
    select: { positionId: true },
  });
  const triggeredPositionIds = new Set(triggeredKills.map(k => k.positionId));

  const impacts: PositionImpact[] = positions.filter(p => p.ticker !== "CASH").map(pos => {
    const signals: string[] = [];
    let impactScore = 0;

    const thesis = thesisMap.get(pos.ticker);
    if (thesis) {
      if (thesis.confidenceScore >= 8) { signals.push(`thesis confidence ${thesis.confidenceScore}/10`); impactScore += 2; }
      else if (thesis.confidenceScore >= 6) { signals.push(`thesis confidence ${thesis.confidenceScore}/10`); impactScore += 1; }
      else if (thesis.confidenceScore < 5) { signals.push(`low conviction ${thesis.confidenceScore}/10`); impactScore -= 2; }
    }

    const committee = committeeSessions.find(c => c.ticker === pos.ticker);
    if (committee) {
      if (committee.conviction === "Strong Buy") { signals.push("committee: Strong Buy"); impactScore += 3; }
      else if (committee.conviction === "Buy")   { signals.push("committee: Buy");        impactScore += 2; }
      else if (committee.conviction === "Watch") { signals.push("committee: Watch");      impactScore += 0; }
      else if (committee.conviction === "Hold")  { signals.push("committee: Hold");       impactScore -= 1; }
      else if (committee.conviction === "Pass")  { signals.push("committee: Pass");       impactScore -= 2; }
    }

    const impact = recentImpacts.find(i => i.ticker === pos.ticker);
    if (impact) {
      if (impact.impactLevel === "strengthened")          { signals.push("filing strengthened thesis"); impactScore += 2; }
      else if (impact.impactLevel === "weakened")         { signals.push("filing weakened thesis");     impactScore -= 2; }
      else if (impact.impactLevel === "kill_criteria_triggered") { signals.push("kill criteria triggered"); impactScore -= 4; }
      else { signals.push("filing: thesis intact"); impactScore += 1; }
    } else {
      signals.push("no recent filing impact");
    }

    if (triggeredPositionIds.has(pos.id)) {
      signals.push("kill condition active");
      impactScore -= 3;
    }

    const impact_ = impactScore >= 2 ? "positive" : impactScore <= -2 ? "negative" : "neutral";
    const reason = impact_ === "positive"
      ? "Constructive signals from thesis health and committee analysis"
      : impact_ === "negative"
        ? "Bearish signals detected — review recommended"
        : "Mixed or insufficient signals for strong directional read";

    return { ticker: pos.ticker, name: pos.name, impact: impact_, reason, signals };
  });

  const positive = impacts.filter(i => i.impact === "positive");
  const negative = impacts.filter(i => i.impact === "negative");
  const neutral  = impacts.filter(i => i.impact === "neutral");

  return {
    positive, neutral, negative,
    summary: `${positive.length} holding${positive.length !== 1 ? "s" : ""} positive, ${neutral.length} neutral, ${negative.length} ${negative.length !== 1 ? "require" : "requires"} review.`,
  };
}

// ─── Recommended Actions ──────────────────────────────────────────────────────

async function buildRecommendedActions(
  positions: ActivePosition[],
  committeeSessions: CommitteeRow[],
): Promise<RecommendedAction[]> {
  const actions: RecommendedAction[] = [];
  let priority = 1;
  const actionedTickers = new Set<string>();

  const triggeredKills = await db.killCondition.findMany({
    where: { status: "triggered" },
    include: { position: { select: { ticker: true } } },
  });
  for (const kill of triggeredKills) {
    if (actionedTickers.has(kill.position.ticker) || actionedTickers.size >= 2) continue;
    actionedTickers.add(kill.position.ticker);
    actions.push({
      priority: priority++,
      action: `Review ${kill.position.ticker} — kill condition triggered`,
      reason: kill.description,
      urgency: "high",
      ticker: kill.position.ticker,
    });
  }

  const since30d = new Date(Date.now() - 30 * 86400 * 1000);
  const weakened = await db.thesisImpactRecord.findMany({
    where: { createdAt: { gte: since30d }, impactLevel: { in: ["weakened", "kill_criteria_triggered"] } },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  for (const w of weakened) {
    if (actionedTickers.has(w.ticker)) continue;
    actionedTickers.add(w.ticker);
    actions.push({
      priority: priority++,
      action: `Review ${w.ticker} thesis — ${w.impactLevel === "kill_criteria_triggered" ? "kill criteria triggered" : "thesis weakened by recent filing"}`,
      reason: w.reasoning.slice(0, 120),
      urgency: w.impactLevel === "kill_criteria_triggered" ? "high" : "medium",
      ticker: w.ticker,
    });
    if (actionedTickers.size >= 3) break;
  }

  const alreadyFlagged = new Set([...actionedTickers, "CASH"]);
  const overdueTheses = await db.investmentThesis.findMany({
    where: {
      status: "active",
      ticker: { notIn: [...alreadyFlagged] },
      OR: [
        { lastReviewedAt: null },
        { reviewFrequency: "monthly",   lastReviewedAt: { lt: new Date(Date.now() - 30 * 86400 * 1000) } },
        { reviewFrequency: "quarterly", lastReviewedAt: { lt: new Date(Date.now() - 90 * 86400 * 1000) } },
      ],
    },
    orderBy: { confidenceScore: "asc" },
    take: 2,
    select: { ticker: true, title: true, confidenceScore: true, lastReviewedAt: true },
  });
  for (const t of overdueTheses) {
    if (actionedTickers.has(t.ticker)) continue;
    actionedTickers.add(t.ticker);
    actions.push({
      priority: priority++,
      action: `Review ${t.ticker} thesis — overdue`,
      reason: `Last reviewed: ${t.lastReviewedAt ? t.lastReviewedAt.toLocaleDateString() : "never"}. Confidence: ${t.confidenceScore}/10`,
      urgency: t.lastReviewedAt === null ? "medium" : "low",
      ticker: t.ticker,
    });
  }

  const positionTickers = new Set(positions.map(p => p.ticker));
  const strongCommittee = committeeSessions
    .filter(s => !positionTickers.has(s.ticker) && (s.conviction === "Strong Buy" || s.conviction === "Buy"))
    .slice(0, 2);
  for (const s of strongCommittee) {
    if (actionedTickers.has(s.ticker)) continue;
    actionedTickers.add(s.ticker);
    actions.push({
      priority: priority++,
      action: `Consider ${s.ticker} — committee ${s.conviction}`,
      reason: `Investment committee returned ${s.conviction} verdict; not currently in portfolio`,
      urgency: s.conviction === "Strong Buy" ? "medium" : "low",
      ticker: s.ticker,
    });
  }

  const recentFilings = await db.filing.findMany({
    where: { ticker: { in: positions.map(p => p.ticker) }, filingDate: { gte: since30d } },
    orderBy: { filingDate: "desc" },
    take: 3,
    select: { ticker: true, filingType: true, filingDate: true },
  });
  for (const f of recentFilings) {
    if (actionedTickers.has(f.ticker)) continue;
    actionedTickers.add(f.ticker);
    actions.push({
      priority: priority++,
      action: `Read latest ${f.ticker} ${f.filingType} filing`,
      reason: `Filed ${f.filingDate.toLocaleDateString()} — review for thesis-relevant disclosures`,
      urgency: "low",
      ticker: f.ticker,
    });
  }

  const topOpp = await db.opportunityScore.findMany({
    orderBy: { opportunityScore: "desc" },
    take: 10,
    select: { ticker: true, opportunityScore: true },
  });
  const newOpp = topOpp.find(o => !positionTickers.has(o.ticker) && !actionedTickers.has(o.ticker));
  if (newOpp) {
    actions.push({
      priority: priority++,
      action: `Research ${newOpp.ticker} — top opportunity`,
      reason: `Opportunity score ${newOpp.opportunityScore.toFixed(0)}/100 and not in portfolio`,
      urgency: "low",
      ticker: newOpp.ticker,
    });
  }

  return actions.slice(0, 6);
}

// ─── Top Call ─────────────────────────────────────────────────────────────────

function buildTopCall(
  regime: MarketRegime,
  evidence: string[],
  actions: RecommendedAction[],
  impact: PortfolioImpact,
): string {
  const highUrgency = actions.find(a => a.urgency === "high");
  if (highUrgency) {
    return `${highUrgency.action} — ${highUrgency.reason.slice(0, 120)}.`;
  }
  if (regime === "Risk Off" && evidence.length > 0) {
    return `Risk Off regime active (${evidence[0]}) — reduce growth exposure and protect capital.`;
  }
  const topNeg = impact.negative[0];
  if (topNeg) {
    return `Watch ${topNeg.ticker} — ${topNeg.reason.slice(0, 110)}.`;
  }
  const mediumUrgency = actions.find(a => a.urgency === "medium");
  if (mediumUrgency) {
    return `${mediumUrgency.action} — ${mediumUrgency.reason.slice(0, 120)}.`;
  }
  const topPos = impact.positive[0];
  if (topPos && regime === "Risk On") {
    return `${regime} regime — ${topPos.ticker} thesis intact. Maintain or add to growth exposure.`;
  }
  return "Nothing material overnight — maintain current positioning.";
}

// ─── Trade Ideas ──────────────────────────────────────────────────────────────

async function buildTradeIdeas(
  positions: ActivePosition[],
  committeeRows: CommitteeRow[],
  recommendedActions: RecommendedAction[],
): Promise<TradeIdea[]> {
  const ideas: TradeIdea[] = [];
  const held = new Set(positions.map(p => p.ticker));

  // 1. Committee Strong Buy not held → BUY
  const strongBuys = committeeRows.filter(s => !held.has(s.ticker) && s.conviction === "Strong Buy").slice(0, 2);
  for (const s of strongBuys) {
    const session = await db.committeeSession.findFirst({
      where: { ticker: s.ticker },
      orderBy: { createdAt: "desc" },
      select: { summary: true },
    }).catch(() => null);
    ideas.push({
      action: "BUY",
      ticker: s.ticker,
      thesis: (session?.summary ?? `Committee Strong Buy on ${s.ticker}.`).slice(0, 130),
      risk: "No position yet — entry before thesis validated in portfolio context.",
      urgency: "medium",
    });
  }

  // 2. High urgency action with ticker → TRIM
  const highAction = recommendedActions.find(a => a.urgency === "high" && a.ticker && held.has(a.ticker));
  if (highAction?.ticker && !ideas.some(i => i.ticker === highAction.ticker)) {
    ideas.push({
      action: "TRIM",
      ticker: highAction.ticker,
      thesis: highAction.reason.slice(0, 130),
      risk: "Thesis may recover — early exit risks missing upside if conditions reverse.",
      urgency: "high",
    });
  }

  // 3. Top opportunity not held → WATCH
  if (ideas.length < 3) {
    const topOpps = await db.opportunityScore.findMany({
      orderBy: { opportunityScore: "desc" },
      take: 10,
      select: { ticker: true, opportunityScore: true },
    }).catch(() => []);
    const newOpp = topOpps.find(o => !held.has(o.ticker) && !ideas.some(i => i.ticker === o.ticker));
    if (newOpp) {
      ideas.push({
        action: "WATCH",
        ticker: newOpp.ticker,
        thesis: `Opportunity score ${newOpp.opportunityScore.toFixed(0)}/100 — top-ranked name not yet in portfolio.`,
        risk: "Score may reflect stale fundamentals — verify with a fresh dossier before entry.",
        urgency: "low",
      });
    }
  }

  return ideas.slice(0, 3);
}

// ─── Internal query helpers ───────────────────────────────────────────────────

interface ActivePosition {
  id: string;
  ticker: string;
  name: string;
  sector: string | null;
  assetClass: string;
}

interface CommitteeRow {
  ticker: string;
  conviction: string;
  createdAt: Date;
}

// ─── Main generator ───────────────────────────────────────────────────────────

export async function generateMorningBrief(): Promise<MorningBriefData> {
  const since30d = new Date(Date.now() - 30 * 86400 * 1000);

  const since7d = new Date(Date.now() - 7 * 86400 * 1000);

  // Load portfolio + meta counts in parallel with real-world data
  const [
    positions, committeeSessions,
    filingCount, impactCount, earningsCount, oppCount, thesisCount,
    macroData, marketData, geoEvents, recentNewsletters,
  ] = await Promise.all([
    db.position.findMany({
      where: { status: "active" },
      select: { id: true, ticker: true, name: true, sector: true, assetClass: true },
    }),
    db.committeeSession.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { ticker: true, conviction: true, createdAt: true },
    }),
    db.filing.count({ where: { createdAt: { gte: since30d } } }),
    db.thesisImpactRecord.count({ where: { createdAt: { gte: since30d } } }),
    db.earningsEvent.count({ where: { createdAt: { gte: since30d } } }),
    db.opportunityScore.count(),
    db.investmentThesis.count(),
    getLatestMacroSnapshots(),
    getLatestMarketSnapshots(),
    getRecentGeoEvents(7),
    // Phase 14: newsletter items from the last 7 days
    db.newsletterItem.findMany({
      where: { publishedAt: { gte: since7d } },
      orderBy: { publishedAt: "desc" },
      take: 30,
    }).catch(() => [] as Awaited<ReturnType<typeof db.newsletterItem.findMany>>),
  ]);

  const latestCommittee = committeeSessions.reduce((acc, s) => {
    if (!acc.has(s.ticker)) acc.set(s.ticker, s);
    return acc;
  }, new Map<string, CommitteeRow>());
  const committeeRows = [...latestCommittee.values()];

  const topUniverse = await db.universe.findMany({
    where: { status: "active", universeTier: { in: ["tier1", "tier2"] } },
    select: { ticker: true },
    take: 20,
  });
  const universeTop = topUniverse.map(u => u.ticker);

  const [regimeResult, macroSummary, geopoliticalSummary, technologySummary, portfolioImpact, recommendedActions] =
    await Promise.all([
      computeMarketRegime(since30d, marketData, geoEvents),
      buildMacroSummary(positions, macroData),
      buildGeopoliticalSummary(positions, universeTop, geoEvents),
      buildTechnologySummary(positions, committeeRows),
      buildPortfolioImpact(positions, committeeRows),
      buildRecommendedActions(positions, committeeRows),
    ]);

  const topCall    = buildTopCall(regimeResult.regime, regimeResult.evidence, recommendedActions, portfolioImpact);
  const tradeIdeas = await buildTradeIdeas(positions, committeeRows, recommendedActions);

  // Phase 25.1: newsletter freshness gate
  const latestNewsletter = await db.newsletterItem.findFirst({
    orderBy: { publishedAt: "desc" },
    select: { publishedAt: true },
  }).catch(() => null);

  let freshnessWarning: string | undefined;
  if (!latestNewsletter) {
    freshnessWarning = "Newsletter feed empty — run Refresh Newsletters before generating this brief.";
  } else {
    const ageHours = (Date.now() - latestNewsletter.publishedAt.getTime()) / 3600000;
    if (ageHours > 27) {
      freshnessWarning = `Newsletter feed stale — last email processed ${Math.round(ageHours)} hours ago. Run Refresh Newsletters for current intelligence.`;
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Build source transparency lists
  const macroSources = Object.keys(macroData).map(m => `FRED/${m}`);
  const marketSources = Object.keys(marketData).map(m => `Yahoo Finance/${m}`);
  const geoSources = geoEvents.length > 0
    ? [...new Set(geoEvents.map(e => `FMP News/${e.region}`))]
    : [];
  const portfolioSources = [
    "DB/Positions", "DB/CommitteeSessions", "DB/Filings",
    "DB/ThesisImpacts", "DB/EarningsEvents", "DB/InvestmentTheses",
  ];

  // Phase 14: build institutional research + newsletter consensus sections
  const { institutional, newsletters } = buildNewsletterSections(recentNewsletters);

  return {
    briefingDate: today,
    marketRegime: regimeResult.regime,
    marketRegimeEvidence: regimeResult.evidence,
    topCall,
    tradeIdeas,
    macroSummary,
    geopoliticalSummary,
    technologySummary,
    portfolioImpact,
    recommendedActions,
    generatedFromSources: {
      positions: positions.length,
      filings: filingCount,
      committee: committeeRows.length,
      thesisImpacts: impactCount,
      earnings: earningsCount,
      opportunities: oppCount,
      theses: thesisCount,
      macroDataPoints: Object.keys(macroData).length,
      marketDataPoints: Object.keys(marketData).length,
      geoEvents: geoEvents.length,
      newsletterItems: recentNewsletters.length,
    },
    dataSources: {
      macro: macroSources,
      market: marketSources,
      geo: geoSources,
      portfolio: portfolioSources,
    },
    institutionalResearch: institutional,
    newsletterConsensus: newsletters,
    freshnessWarning,
  };
}

// ─── Newsletter section builder ───────────────────────────────────────────────

const INSTITUTIONAL_SOURCES = new Set(["blackrock", "morgan_stanley", "jpmorgan"]);
const NEWSLETTER_SOURCES    = new Set(["bloomberg_money_stuff", "daily_upside", "axios_markets", "sherwood_news"]);

const SOURCE_LABELS: Record<string, string> = {
  bloomberg_money_stuff: "Bloomberg Money Stuff",
  daily_upside:          "The Daily Upside",
  axios_markets:         "Axios Markets",
  sherwood_news:         "Sherwood News",
  blackrock:             "BlackRock Investment Institute",
  morgan_stanley:        "Morgan Stanley",
  jpmorgan:              "J.P. Morgan",
};

function buildNewsletterSections(items: {
  source: string; title: string; summary: string; portfolioRelevance: string;
  publishedAt: Date; url: string | null;
}[]): { institutional: NewsletterInsight[]; newsletters: NewsletterInsight[] } {
  // Keep most recent entry per source
  const bySource = new Map<string, typeof items[0]>();
  for (const item of items) {
    if (!bySource.has(item.source)) bySource.set(item.source, item);
  }

  const toInsight = (item: typeof items[0]): NewsletterInsight => ({
    source:             SOURCE_LABELS[item.source] ?? item.source,
    title:              item.title,
    summary:            (() => { try { return JSON.parse(item.summary) as string[]; } catch { return [item.summary]; } })(),
    portfolioRelevance: item.portfolioRelevance as "bullish" | "neutral" | "bearish",
    publishedAt:        item.publishedAt.toISOString().slice(0, 10),
    url:                item.url ?? undefined,
  });

  const deduped = [...bySource.values()];
  return {
    institutional: deduped.filter(i => INSTITUTIONAL_SOURCES.has(i.source)).map(toInsight),
    newsletters:   deduped.filter(i => NEWSLETTER_SOURCES.has(i.source)).map(toInsight),
  };
}

// ─── Save to DB ───────────────────────────────────────────────────────────────

export async function saveMorningBrief(data: MorningBriefData) {
  const payload = {
    marketRegime:         data.marketRegime,
    marketRegimeEvidence: JSON.stringify(data.marketRegimeEvidence),
    macroSummary:         JSON.stringify(data.macroSummary),
    geopoliticalSummary:  JSON.stringify(data.geopoliticalSummary),
    technologySummary:    JSON.stringify(data.technologySummary),
    portfolioImpact:      JSON.stringify(data.portfolioImpact),
    recommendedActions:   JSON.stringify(data.recommendedActions),
    generatedFromSources: JSON.stringify({
      ...data.generatedFromSources,
      dataSources: data.dataSources,
      freshnessWarning: data.freshnessWarning,
      topCall: data.topCall,
      tradeIdeas: data.tradeIdeas,
    }),
    institutionalResearch: JSON.stringify(data.institutionalResearch ?? []),
    newsletterConsensus:   JSON.stringify(data.newsletterConsensus ?? []),
  };

  return db.morningBrief.upsert({
    where:  { briefingDate: data.briefingDate },
    create: { briefingDate: data.briefingDate, ...payload },
    update: payload,
  });
}

// ─── Deserialize from DB ──────────────────────────────────────────────────────

export function deserializeBrief(record: {
  id: string;
  briefingDate: Date;
  marketRegime: string;
  marketRegimeEvidence: string;
  macroSummary: string;
  geopoliticalSummary: string;
  technologySummary: string;
  portfolioImpact: string;
  recommendedActions: string;
  generatedFromSources: string;
  institutionalResearch?: string;
  newsletterConsensus?: string;
  createdAt: Date;
}): MorningBriefData & { id: string; createdAt: Date } {
  const sources = JSON.parse(record.generatedFromSources);
  const { dataSources, freshnessWarning, topCall, tradeIdeas, ...counts } = sources;
  return {
    id: record.id,
    briefingDate: record.briefingDate,
    createdAt: record.createdAt,
    marketRegime: record.marketRegime as MarketRegime,
    marketRegimeEvidence: JSON.parse(record.marketRegimeEvidence),
    topCall: (topCall as string | undefined) ?? "Nothing material overnight — maintain current positioning.",
    tradeIdeas: (tradeIdeas as TradeIdea[] | undefined) ?? [],
    macroSummary: JSON.parse(record.macroSummary),
    geopoliticalSummary: JSON.parse(record.geopoliticalSummary),
    technologySummary: JSON.parse(record.technologySummary),
    portfolioImpact: JSON.parse(record.portfolioImpact),
    recommendedActions: JSON.parse(record.recommendedActions),
    generatedFromSources: counts,
    dataSources: dataSources ?? { macro: [], market: [], geo: [], portfolio: [] },
    institutionalResearch: record.institutionalResearch
      ? (JSON.parse(record.institutionalResearch) as NewsletterInsight[])
      : [],
    newsletterConsensus: record.newsletterConsensus
      ? (JSON.parse(record.newsletterConsensus) as NewsletterInsight[])
      : [],
    freshnessWarning: (freshnessWarning as string | undefined) ?? undefined,
  };
}
