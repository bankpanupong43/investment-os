// Discovery Radar Engine — Phase 9B + Phase 11 upgrade
//
// Phase 11 changes:
//   - Market context: VIX level from MarketSnapshot modulates scoring
//   - Source references: every RadarSignal includes its data source
//   - discoveryReason: references actual signal source (e.g. "SEC 10-Q", "FRED GDP")
//
// Sources:
//   1. Opportunity Engine gaps   — high-scoring universe tickers not in portfolio/watchlist
//   2. Sector gaps               — sectors with no portfolio exposure
//   3. Theme momentum            — themes with strongest committee / fundamental signal
//   4. Universe quality screen   — high UniverseScore tickers not yet tracked
//   5. Recent filing signals     — tickers with thesis-strengthening filing impacts
//   6. Earnings surprises        — tickers with positive EPS vs estimate
//   7. Market context            — VIX regime from Yahoo Finance (Phase 11)
//
// Scoring (0–100):
//   25 pts — Growth     (revenueGrowth, epsGrowth) — FMP Fundamentals
//   25 pts — Quality    (grossMargin, roic, debtToEquity) — FMP Fundamentals
//   20 pts — Developments (filing impacts, committee, earnings)
//   15 pts — Diversification benefit (sector absent from portfolio)
//   15 pts — Committee interest (conviction rating)
// Market regime modifier: VIX-based ±5 pts

import { db } from "./db";
import { getLatestMarketSnapshots } from "./macro-ingestion";
import { interpretVIX } from "./market-data-client";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DiscoveryCategory = "small_cap" | "mid_cap" | "large_cap" | "etf" | "special_situation";
export type DiscoveryConfidence = "high" | "medium" | "low";

export interface RadarSignal {
  source: string;                   // which source contributed this signal (e.g. "FMP Fundamentals", "SEC EDGAR")
  label: string;                    // human-readable signal name
  value: string;                    // the signal value / evidence
  weight: number;                   // pts contributed to score
  sourceRef?: string;               // specific source reference with date/value (Phase 11)
}

export interface DiscoveryCandidateData {
  ticker: string;
  companyName: string;
  marketCap: number | null;
  category: DiscoveryCategory;
  discoveryReason: string;
  radarScore: number;
  confidence: DiscoveryConfidence;
  themes: string[];
  signals: RadarSignal[];
  sources: string[];
}

// ─── Discovery Themes ─────────────────────────────────────────────────────────
// Each theme maps to relevant tickers and sectors. Extensible — add themes here.

export const DISCOVERY_THEMES: Record<string, { tickers: string[]; sectors: string[]; industries: string[] }> = {
  "AI Infrastructure": {
    tickers: ["NVDA", "AMD", "MSFT", "GOOG", "GOOGL", "META", "AMZN", "SMCI", "TSM", "ASML"],
    sectors: ["Technology"],
    industries: ["Semiconductors", "Software", "Internet Search", "Cloud Computing"],
  },
  "Semiconductors": {
    tickers: ["NVDA", "TSM", "AMD", "ASML", "SMCI", "AVGO", "MU", "INTC", "QCOM", "AMAT"],
    sectors: ["Technology"],
    industries: ["Semiconductors", "Semiconductor Equipment"],
  },
  "Robotics": {
    tickers: ["NVDA", "HON", "ABB", "FANUC", "IRBT", "ISRG"],
    sectors: ["Industrials", "Technology"],
    industries: ["Industrial Automation", "Robotics", "Medical Devices"],
  },
  "Defense": {
    tickers: ["ITA", "LMT", "RTX", "NOC", "GD", "BA", "L3T", "LDOS"],
    sectors: ["Industrials"],
    industries: ["Aerospace & Defense", "Defense", "Government Services"],
  },
  "Energy": {
    tickers: ["XOM", "CVX", "COP", "VLO", "PSX", "FSLR", "ENPH", "NEE"],
    sectors: ["Energy", "Utilities"],
    industries: ["Oil & Gas", "Renewable Energy", "Electric Utilities"],
  },
  "Healthcare": {
    tickers: ["NVO", "LLY", "JNJ", "UNH", "PFE", "ABBV", "ISRG", "DXCM", "PCVX"],
    sectors: ["Healthcare"],
    industries: ["Pharmaceuticals", "Biotechnology", "Medical Devices", "Health Insurance"],
  },
  "Cybersecurity": {
    tickers: ["CRWD", "PANW", "ZS", "OKTA", "FTNT", "S", "CYBR"],
    sectors: ["Technology"],
    industries: ["Cybersecurity", "Network Security", "Software"],
  },
  "Space": {
    tickers: ["RKLB", "SPCE", "BA", "LMT", "NOC", "MAXR"],
    sectors: ["Industrials"],
    industries: ["Aerospace", "Space Technology"],
  },
  "Industrial Automation": {
    tickers: ["HON", "EMR", "ROK", "PH", "ITW", "ABB", "FANUC"],
    sectors: ["Industrials"],
    industries: ["Industrial Automation", "Factory Automation", "Process Control"],
  },
};

// ─── Category classifier ──────────────────────────────────────────────────────

function classifyCategory(ticker: string, sector: string | null, marketCap: number | null, assetType: string): DiscoveryCategory {
  if (assetType === "etf") return "etf";
  if (marketCap == null || marketCap === 0) return "special_situation";
  if (marketCap < 10_000) return "small_cap";   // < $10B (marketCap in USD millions)
  if (marketCap < 100_000) return "mid_cap";    // $10B – $100B
  return "large_cap";
}

// ─── Theme matcher ────────────────────────────────────────────────────────────

function matchThemes(ticker: string, sector: string | null, industry: string | null): string[] {
  const matched: string[] = [];
  for (const [theme, def] of Object.entries(DISCOVERY_THEMES)) {
    const tickerMatch = def.tickers.includes(ticker);
    const sectorMatch = sector != null && def.sectors.some(s => sector.includes(s) || s.includes(sector));
    const industryMatch = industry != null && def.industries.some(i => industry.includes(i) || i.includes(industry));
    if (tickerMatch || (sectorMatch && industryMatch)) {
      matched.push(theme);
    }
  }
  return matched;
}

// ─── Scorer ───────────────────────────────────────────────────────────────────

interface ScoringContext {
  fundamentals: {
    revenueGrowth: number | null;
    epsGrowth: number | null;
    grossMargin: number | null;
    roic: number | null;
    debtToEquity: number | null;
    freeCashFlow: number | null;
  } | null;
  latestScore: number | null;                 // UniverseScore.totalScore
  opportunityScore: number | null;            // OpportunityScore.opportunityScore
  committeeConviction: string | null;         // CommitteeSession.conviction
  hasRecentPositiveImpact: boolean;           // ThesisImpactRecord strengthened in 60d
  hasRecentEarningsBeat: boolean;             // EarningsEvent epsActual > epsEstimate
  isInMissingPortfolioSector: boolean;        // sector not covered by portfolio
  vixLevel: number | null;                    // Phase 11: VIX from Yahoo Finance
}

function scoreCandidate(ctx: ScoringContext): { score: number; signals: RadarSignal[] } {
  const signals: RadarSignal[] = [];
  let score = 0;

  // ── Growth (0–25 pts) — Source: FMP Fundamentals ──────────────────────────
  if (ctx.fundamentals) {
    const { revenueGrowth, epsGrowth } = ctx.fundamentals;

    if (revenueGrowth != null) {
      const pts = revenueGrowth > 20 ? 15 : revenueGrowth > 10 ? 10 : revenueGrowth > 0 ? 5 : 0;
      if (pts > 0) {
        score += pts;
        signals.push({
          source: "FMP Fundamentals", label: "Revenue Growth",
          value: `${revenueGrowth.toFixed(1)}% YoY`, weight: pts,
          sourceRef: `FMP /stable/income-statement: revenueGrowth=${revenueGrowth.toFixed(1)}%`,
        });
      }
    }
    if (epsGrowth != null) {
      const pts = epsGrowth > 30 ? 10 : epsGrowth > 15 ? 7 : epsGrowth > 0 ? 4 : 0;
      if (pts > 0) {
        score += pts;
        signals.push({
          source: "FMP Fundamentals", label: "EPS Growth",
          value: `${epsGrowth.toFixed(1)}% YoY`, weight: pts,
          sourceRef: `FMP /stable/income-statement: epsGrowth=${epsGrowth.toFixed(1)}%`,
        });
      }
    }
  }

  // ── Quality (0–25 pts) — Source: FMP Fundamentals ─────────────────────────
  if (ctx.fundamentals) {
    const { grossMargin, roic, debtToEquity } = ctx.fundamentals;

    if (grossMargin != null) {
      const pts = grossMargin > 60 ? 10 : grossMargin > 40 ? 6 : grossMargin > 20 ? 3 : 0;
      if (pts > 0) {
        score += pts;
        signals.push({
          source: "FMP Fundamentals", label: "Gross Margin",
          value: `${grossMargin.toFixed(1)}%`, weight: pts,
          sourceRef: `FMP /stable/ratios-ttm: grossProfitMarginTTM=${grossMargin.toFixed(1)}%`,
        });
      }
    }
    if (roic != null) {
      const pts = roic > 20 ? 8 : roic > 10 ? 5 : roic > 0 ? 2 : 0;
      if (pts > 0) {
        score += pts;
        signals.push({
          source: "FMP Fundamentals", label: "ROIC",
          value: `${roic.toFixed(1)}%`, weight: pts,
          sourceRef: `FMP /stable/key-metrics-ttm: returnOnInvestedCapitalTTM=${roic.toFixed(1)}%`,
        });
      }
    }
    if (debtToEquity != null) {
      const pts = debtToEquity < 0.5 ? 7 : debtToEquity < 1 ? 4 : debtToEquity < 2 ? 1 : 0;
      if (pts > 0) {
        score += pts;
        signals.push({
          source: "FMP Fundamentals", label: "Balance Sheet",
          value: `D/E ${debtToEquity.toFixed(2)}`, weight: pts,
          sourceRef: `FMP /stable/ratios-ttm: debtToEquityRatioTTM=${debtToEquity.toFixed(2)}`,
        });
      }
    }
  }

  // Fallback: use UniverseScore if no fundamentals
  if (!ctx.fundamentals && ctx.latestScore != null) {
    const pts = Math.round(ctx.latestScore * 0.5);
    score += pts;
    signals.push({
      source: "Universe Score", label: "Universe Score",
      value: `${ctx.latestScore.toFixed(0)}/100`, weight: pts,
      sourceRef: `DB: UniverseScore.totalScore=${ctx.latestScore.toFixed(0)}`,
    });
  }

  // ── Recent Developments (0–20 pts) — Source: SEC EDGAR / EarningsEvent ────
  if (ctx.hasRecentPositiveImpact) {
    score += 12;
    signals.push({
      source: "SEC EDGAR", label: "Filing strengthened thesis",
      value: "strengthened in last 60d", weight: 12,
      sourceRef: "SEC EDGAR: ThesisImpactRecord.impactLevel=strengthened (last 60d)",
    });
  }
  if (ctx.hasRecentEarningsBeat) {
    score += 8;
    signals.push({
      source: "Earnings Intelligence", label: "Earnings beat",
      value: "EPS actual > estimate", weight: 8,
      sourceRef: "DB: EarningsEvent.epsActual > epsEstimate (last 60d)",
    });
  }

  // ── Diversification benefit (0–15 pts) — Source: Portfolio DB ────────────
  if (ctx.isInMissingPortfolioSector) {
    score += 15;
    signals.push({
      source: "Portfolio Analysis", label: "Sector not in portfolio",
      value: "adds diversification", weight: 15,
      sourceRef: "DB: Position sector coverage gap",
    });
  }

  // ── Committee Interest (0–15 pts) — Source: Investment Committee DB ───────
  if (ctx.committeeConviction) {
    const pts =
      ctx.committeeConviction === "Strong Buy" ? 15 :
      ctx.committeeConviction === "Buy" ? 10 :
      ctx.committeeConviction === "Watch" ? 5 : 0;
    if (pts > 0) {
      score += pts;
      signals.push({
        source: "Investment Committee", label: "Committee verdict",
        value: ctx.committeeConviction, weight: pts,
        sourceRef: `DB: CommitteeSession.conviction=${ctx.committeeConviction}`,
      });
    }
  }

  // ── Market Context modifier (±5 pts) — Source: Yahoo Finance ─────────────
  if (ctx.vixLevel != null) {
    const vixRead = interpretVIX(ctx.vixLevel);
    if (vixRead.regime === "risk_on") {
      score += 5;
      signals.push({
        source: "Yahoo Finance", label: "Market context",
        value: `VIX ${ctx.vixLevel.toFixed(1)} — risk appetite elevated`, weight: 5,
        sourceRef: `Yahoo Finance: ^VIX=${ctx.vixLevel.toFixed(1)} (risk-on)`,
      });
    } else if (vixRead.regime === "risk_off" || vixRead.regime === "crisis") {
      score -= 5;
      signals.push({
        source: "Yahoo Finance", label: "Market context",
        value: `VIX ${ctx.vixLevel.toFixed(1)} — risk-off environment`, weight: -5,
        sourceRef: `Yahoo Finance: ^VIX=${ctx.vixLevel.toFixed(1)} (risk-off)`,
      });
    }
  }

  // Cap at 100, floor at 0
  score = Math.min(100, Math.max(0, Math.round(score)));
  return { score, signals };
}

// ─── Confidence classifier ────────────────────────────────────────────────────

function classifyConfidence(score: number, signalCount: number): DiscoveryConfidence {
  if (score >= 60 && signalCount >= 3) return "high";
  if (score >= 35 && signalCount >= 2) return "medium";
  return "low";
}

// ─── Primary discovery reason ─────────────────────────────────────────────────

function primaryReason(signals: RadarSignal[], sources: string[]): string {
  if (sources.includes("sec_filings") && signals.some(s => s.source === "SEC EDGAR")) {
    return "Recent SEC filing strengthened thesis (SEC EDGAR)";
  }
  if (sources.includes("earnings") && signals.some(s => s.source === "Earnings Intelligence")) {
    return "Earnings beat vs. estimates (EarningsEvent DB)";
  }
  if (sources.includes("committee") && signals.some(s => s.source === "Investment Committee")) {
    const v = signals.find(s => s.source === "Investment Committee")?.value;
    return `Investment committee: ${v} (CommitteeSession DB)`;
  }
  if (sources.includes("opportunity_engine")) {
    return "High opportunity score — quality compounder gap (Opportunity Engine)";
  }
  if (sources.includes("sector_gap")) {
    return "Adds sector not currently in portfolio (Portfolio Analysis)";
  }
  if (sources.includes("theme_momentum")) {
    return "Active theme with strong fundamentals (FMP Fundamentals)";
  }
  if (sources.includes("universe_quality")) {
    return "High-quality universe entry not yet tracked (Universe Score)";
  }
  return "Surfaced by radar screening";
}

// ─── Main generator ───────────────────────────────────────────────────────────

export async function generateRadarCandidates(): Promise<DiscoveryCandidateData[]> {
  const since60d = new Date(Date.now() - 60 * 86400 * 1000);

  // Load current portfolio + watchlist tickers to exclude + market context
  const [positions, watchlistItems, marketData] = await Promise.all([
    db.position.findMany({ where: { status: "active" }, select: { ticker: true, sector: true } }),
    db.watchlist.findMany({ select: { ticker: true } }),
    getLatestMarketSnapshots(),
  ]);
  const vixLevel = marketData["VIX"]?.value ?? null;

  const trackedTickers = new Set([
    ...positions.map(p => p.ticker),
    ...watchlistItems.map(w => w.ticker),
  ]);

  const portfolioSectors = new Set(
    positions.map(p => p.sector).filter(Boolean) as string[]
  );

  // Load universe entries not yet tracked
  const universe = await db.universe.findMany({
    where: { status: "active", ticker: { notIn: [...trackedTickers] } },
    include: {
      fundamentals: true,
      scores: { orderBy: { scoredAt: "desc" }, take: 1 },
    },
  });

  // Load opportunity scores for universe tickers
  const oppScores = await db.opportunityScore.findMany({
    where: { ticker: { in: universe.map(u => u.ticker) } },
    orderBy: { generatedAt: "desc" },
    distinct: ["ticker"],
  });
  const oppMap = new Map(oppScores.map(o => [o.ticker, o.opportunityScore]));

  // Load committee sessions for universe tickers
  const committeeSessions = await db.committeeSession.findMany({
    where: { ticker: { in: universe.map(u => u.ticker) } },
    orderBy: { createdAt: "desc" },
    distinct: ["ticker"],
    select: { ticker: true, conviction: true },
  });
  const committeeMap = new Map(committeeSessions.map(s => [s.ticker, s.conviction]));

  // Load recent positive filing impacts
  const recentPositiveImpacts = await db.thesisImpactRecord.findMany({
    where: {
      ticker: { in: universe.map(u => u.ticker) },
      impactLevel: "strengthened",
      createdAt: { gte: since60d },
    },
    select: { ticker: true },
  });
  const impactTickers = new Set(recentPositiveImpacts.map(i => i.ticker));

  // Load earnings beats
  const recentEarnings = await db.earningsEvent.findMany({
    where: {
      ticker: { in: universe.map(u => u.ticker) },
      createdAt: { gte: since60d },
    },
    select: { ticker: true, epsActual: true, epsEstimate: true },
  });
  const earningsBeatTickers = new Set(
    recentEarnings
      .filter(e => e.epsActual != null && e.epsEstimate != null && e.epsActual > e.epsEstimate)
      .map(e => e.ticker)
  );

  const candidates: DiscoveryCandidateData[] = [];

  for (const entry of universe) {
    const latestScore = entry.scores[0]?.totalScore ?? null;
    const oppScore = oppMap.get(entry.ticker) ?? null;

    // Determine which sources surfaced this ticker
    const sources: string[] = [];
    if (oppScore != null && oppScore > 45) sources.push("opportunity_engine");
    if (latestScore != null && latestScore > 55) sources.push("universe_quality");
    if (impactTickers.has(entry.ticker)) sources.push("sec_filings");
    if (earningsBeatTickers.has(entry.ticker)) sources.push("earnings");
    if (committeeMap.has(entry.ticker)) sources.push("committee");
    if (entry.sector && !portfolioSectors.has(entry.sector)) sources.push("sector_gap");

    // Always include theme_momentum if ticker matches an active theme
    const themes = matchThemes(entry.ticker, entry.sector, entry.industry);
    if (themes.length > 0) sources.push("theme_momentum");

    // Skip if no meaningful signal
    if (sources.length === 0 && themes.length === 0) continue;

    const ctx: ScoringContext = {
      fundamentals: entry.fundamentals ? {
        revenueGrowth: entry.fundamentals.revenueGrowth,
        epsGrowth: entry.fundamentals.epsGrowth,
        grossMargin: entry.fundamentals.grossMargin,
        roic: entry.fundamentals.roic,
        debtToEquity: entry.fundamentals.debtToEquity,
        freeCashFlow: entry.fundamentals.freeCashFlow,
      } : null,
      latestScore,
      opportunityScore: oppScore,
      committeeConviction: committeeMap.get(entry.ticker) ?? null,
      hasRecentPositiveImpact: impactTickers.has(entry.ticker),
      hasRecentEarningsBeat: earningsBeatTickers.has(entry.ticker),
      isInMissingPortfolioSector: entry.sector != null && !portfolioSectors.has(entry.sector),
      vixLevel,
    };

    const { score, signals } = scoreCandidate(ctx);

    // Minimum score threshold — only surface meaningful candidates
    if (score < 10) continue;

    const category = classifyCategory(entry.ticker, entry.sector, entry.marketCap, entry.assetType);
    const confidence = classifyConfidence(score, signals.length);
    const discoveryReason = primaryReason(signals, sources);

    candidates.push({
      ticker: entry.ticker,
      companyName: entry.companyName,
      marketCap: entry.marketCap,
      category,
      discoveryReason,
      radarScore: score,
      confidence,
      themes,
      signals,
      sources: [...new Set(sources)],
    });
  }

  // Sort by radarScore descending
  return candidates.sort((a, b) => b.radarScore - a.radarScore);
}

// ─── Save to DB ───────────────────────────────────────────────────────────────

export async function saveRadarCandidates(candidates: DiscoveryCandidateData[]) {
  const now = new Date();
  const results: string[] = [];

  for (const c of candidates) {
    await db.discoveryCandidate.upsert({
      where: { ticker: c.ticker },
      create: {
        ticker: c.ticker,
        companyName: c.companyName,
        marketCap: c.marketCap,
        category: c.category,
        discoveryReason: c.discoveryReason,
        radarScore: c.radarScore,
        confidence: c.confidence,
        themes: JSON.stringify(c.themes),
        signals: JSON.stringify(c.signals),
        sources: JSON.stringify(c.sources),
        status: "active",
        lastRefreshedAt: now,
      },
      update: {
        companyName: c.companyName,
        marketCap: c.marketCap,
        category: c.category,
        discoveryReason: c.discoveryReason,
        radarScore: c.radarScore,
        confidence: c.confidence,
        themes: JSON.stringify(c.themes),
        signals: JSON.stringify(c.signals),
        sources: JSON.stringify(c.sources),
        lastRefreshedAt: now,
      },
    });
    results.push(c.ticker);
  }

  // Mark tickers no longer in radar as stale (keep DB clean)
  const activeTickers = new Set(results);
  await db.discoveryCandidate.updateMany({
    where: { status: "active", ticker: { notIn: [...activeTickers] } },
    data: { status: "stale" },
  });

  return results;
}

// ─── Deserialize from DB ──────────────────────────────────────────────────────

export function deserializeCandidate(r: {
  id: string; ticker: string; companyName: string; marketCap: number | null;
  category: string; discoveryReason: string; radarScore: number; confidence: string;
  themes: string; signals: string; sources: string; status: string;
  promotedAt: Date | null; lastRefreshedAt: Date; createdAt: Date;
}): DiscoveryCandidateData & { id: string; status: string; promotedAt: string | null; lastRefreshedAt: string; createdAt: string } {
  return {
    id: r.id,
    ticker: r.ticker,
    companyName: r.companyName,
    marketCap: r.marketCap,
    category: r.category as DiscoveryCategory,
    discoveryReason: r.discoveryReason,
    radarScore: r.radarScore,
    confidence: r.confidence as DiscoveryConfidence,
    themes: JSON.parse(r.themes),
    signals: JSON.parse(r.signals),
    sources: JSON.parse(r.sources),
    status: r.status,
    promotedAt: r.promotedAt?.toISOString() ?? null,
    lastRefreshedAt: r.lastRefreshedAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
  };
}

// ─── Theme summary (for Emerging Themes tab) ──────────────────────────────────

export interface ThemeSummary {
  theme: string;
  candidateCount: number;
  avgScore: number;
  topTickers: string[];
  description: string;
}

export async function buildThemeSummaries(): Promise<ThemeSummary[]> {
  const active = await db.discoveryCandidate.findMany({
    where: { status: "active" },
    select: { ticker: true, radarScore: true, themes: true },
  });

  const themeMap = new Map<string, { tickers: string[]; scores: number[] }>();

  for (const c of active) {
    const themes: string[] = JSON.parse(c.themes);
    for (const theme of themes) {
      if (!themeMap.has(theme)) themeMap.set(theme, { tickers: [], scores: [] });
      const entry = themeMap.get(theme)!;
      entry.tickers.push(c.ticker);
      entry.scores.push(c.radarScore);
    }
  }

  const THEME_DESCRIPTIONS: Record<string, string> = {
    "AI Infrastructure": "Data centers, GPUs, and compute stack powering the AI buildout",
    "Semiconductors": "Chip design and fabrication enabling the next compute era",
    "Robotics": "Physical automation across factory floors and healthcare",
    "Defense": "Elevated global defense budgets across NATO and Indo-Pacific",
    "Energy": "Transition and traditional energy amid geopolitical supply shifts",
    "Healthcare": "GLP-1 revolution, medical devices, and biotech pipeline",
    "Cybersecurity": "Zero-trust architecture adoption across enterprise and government",
    "Space": "Commercial launch, satellite constellations, and space economy",
    "Industrial Automation": "Factory of the future: precision, repeatability, AI-driven ops",
  };

  return [...themeMap.entries()]
    .map(([theme, data]) => ({
      theme,
      candidateCount: data.tickers.length,
      avgScore: data.scores.length > 0 ? data.scores.reduce((a, b) => a + b, 0) / data.scores.length : 0,
      topTickers: data.tickers.slice(0, 4),
      description: THEME_DESCRIPTIONS[theme] ?? theme,
    }))
    .sort((a, b) => b.avgScore - a.avgScore);
}
