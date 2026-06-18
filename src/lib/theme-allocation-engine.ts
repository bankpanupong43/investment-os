// Theme Allocation Engine — Phase 22
// Answers: Which themes should receive capital? Why? Which stocks implement those views?

import { db } from "./db";
import { getActivePortfolioPositions } from "./portfolio-value-engine";
import { computeOpportunities } from "./opportunity-engine";
import { REGIME_SCENARIO_NAMES, DRIFT_BAND } from "./allocation-engine";
import {
  THEME_IDS, THEME_LABELS, TICKER_THEME_MAP,
  THEME_BASE_TARGETS, THEME_REGIME_ADJUSTMENTS, THEME_KEYWORDS,
} from "../config/theme-mapping";
import type { ThemeId } from "../config/theme-mapping";

export type { ThemeId };
export { THEME_IDS, THEME_LABELS, TICKER_THEME_MAP };

// ─── Types ────────────────────────────────────────────────────────────────────

export type ThemeDriverSource = "REGIME" | "OPPORTUNITY" | "NEWSLETTER" | "MOMENTUM";

export interface ThemeAllocation {
  themeId: ThemeId;
  label: string;
  currentPct: number;
  tickers: string[];
}

export interface ThemeTarget {
  themeId: ThemeId;
  label: string;
  finalPct: number;
}

export interface ThemeGap {
  themeId: ThemeId;
  label: string;
  currentPct: number;
  targetPct: number;
  gapPct: number;  // positive = underweight, negative = overweight
  direction: "underweight" | "overweight" | "balanced";
  tickers: string[];
}

export interface ThemeRecommendation {
  rank: number;
  themeId: ThemeId;
  label: string;
  action: "ADD" | "REDUCE";
  currentPct: number;
  targetPct: number;
  gapPct: number;
  reason: string;
  implementationTickers: string[];
}

export interface ThemeDriverSummary {
  themeId: ThemeId;
  label: string;
  basePct: number;
  regimeAdjustment: number;
  regimeDescription: string;
  opportunityAdjustment: number;
  opportunityDescription: string;
  newsletterAdjustment: number;
  newsletterDescription: string;
  momentumAdjustment: number;
  momentumDescription: string;
  finalAllocation: number;
}

export interface ThemeAllocationReview {
  generatedAt: Date;
  regime: string;
  scenario: string;
  currentThemes: ThemeAllocation[];
  targetThemes: ThemeTarget[];
  gapAnalysis: ThemeGap[];
  recommendations: ThemeRecommendation[];
  themeDriverSummaries: ThemeDriverSummary[];
  largestThemeGap: ThemeGap | null;
  largestThemeOverweight: ThemeGap | null;
  topThemeDriver: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseJson<T>(s: string, fallback: T): T {
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }

function tickerTheme(ticker: string): ThemeId {
  return TICKER_THEME_MAP[ticker] ?? "broad";
}

// Score each theme for opportunity overlay
function computeOpportunityAdjustment(
  themeId: ThemeId,
  oppByTheme: Map<ThemeId, { ticker: string; score: number }[]>
): { adj: number; desc: string } {
  const entries = oppByTheme.get(themeId) ?? [];
  if (entries.length === 0) return { adj: 0, desc: "" };

  const strong   = entries.filter(e => e.score >= 85).length;
  const moderate = entries.filter(e => e.score >= 75 && e.score < 85).length;
  const raw = strong * 3 + moderate * 1;
  if (raw === 0) return { adj: 0, desc: "" };

  const adj = clamp(raw, 0, 8);
  const topTickers = entries.slice(0, 2).map(e => `${e.ticker} ${e.score.toFixed(0)}`).join(", ");
  return { adj, desc: topTickers };
}

// Newsletter sentiment overlay via keyword matching
function computeNewsletterAdjustment(
  themeId: ThemeId,
  newsletters: { title: string; keyPoints: string[]; portfolioRelevance: string }[]
): { adj: number; desc: string } {
  const keywords = THEME_KEYWORDS[themeId] ?? [];
  if (keywords.length === 0 || newsletters.length === 0) return { adj: 0, desc: "" };

  let score = 0;
  const sources: string[] = [];

  for (const nl of newsletters) {
    const searchText = (nl.title + " " + nl.keyPoints.join(" ")).toLowerCase();
    const matched = keywords.some(kw => searchText.includes(kw.toLowerCase()));
    if (!matched) continue;

    if (nl.portfolioRelevance === "bullish") {
      score += 1.5;
      sources.push(nl.title.slice(0, 30));
    } else if (nl.portfolioRelevance === "bearish") {
      score -= 1.5;
      sources.push(nl.title.slice(0, 30));
    }
  }

  const adj = clamp(Math.round(score), -3, 3);
  if (adj === 0) return { adj: 0, desc: "" };
  const sentiment = adj > 0 ? "bullish" : "bearish";
  return { adj, desc: `${sentiment} signals (${sources.slice(0, 1).join(", ")})` };
}

// Momentum overlay from recent score trends
function computeMomentumAdjustment(
  themeId: ThemeId,
  momentumByTicker: Map<string, { latest: number; previous: number }>
): { adj: number; desc: string } {
  let rising = 0, falling = 0;

  for (const [ticker, trend] of momentumByTicker.entries()) {
    if (tickerTheme(ticker) !== themeId) continue;
    const delta = trend.latest - trend.previous;
    if (delta > 3)       rising++;
    else if (delta < -3) falling++;
  }

  if (rising === 0 && falling === 0) return { adj: 0, desc: "" };
  if (rising > falling) return { adj: 2, desc: `rising scores (${rising} tickers)` };
  if (falling > rising) return { adj: -2, desc: `falling scores (${falling} tickers)` };
  return { adj: 0, desc: "" };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function generateThemeAllocationReview(
  precomputedOpps?: { ticker: string; objectiveScore: number }[]
): Promise<ThemeAllocationReview> {
  const now = new Date();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400 * 1000);
  const sixtyDaysAgo    = new Date(now.getTime() - 60 * 86400 * 1000);

  // ── Load data ───────────────────────────────────────────────────
  const [positions, brief, newsletterItems] = await Promise.all([
    getActivePortfolioPositions(),
    db.morningBrief.findFirst({ orderBy: { briefingDate: "desc" } }),
    db.newsletterItem.findMany({
      where: { publishedAt: { gte: fourteenDaysAgo } },
      select: { title: true, keyPoints: true, portfolioRelevance: true },
      orderBy: { publishedAt: "desc" },
      take: 100,
    }),
  ]);

  // Opportunity entries
  let oppEntries: { ticker: string; objectiveScore: number }[] = precomputedOpps ?? [];
  if (!precomputedOpps) {
    try {
      const result = await computeOpportunities();
      oppEntries = result.entries;
    } catch { /* best effort */ }
  }

  // Momentum: last 2 scores per universe ticker
  let momentumByTicker = new Map<string, { latest: number; previous: number }>();
  try {
    const allTickers = positions.map(p => p.ticker).concat(oppEntries.map(e => e.ticker));
    const universes = await db.universe.findMany({
      where: { ticker: { in: allTickers }, status: "active" },
      include: {
        scores: { orderBy: { scoredAt: "desc" }, take: 2 },
      },
    });
    for (const u of universes) {
      if (u.scores.length >= 2) {
        momentumByTicker.set(u.ticker, {
          latest:   u.scores[0].totalScore,
          previous: u.scores[1].totalScore,
        });
      }
    }
  } catch { /* best effort */ }

  // ── Regime ──────────────────────────────────────────────────────
  const regime   = brief?.marketRegime ?? "Neutral";
  const scenario = REGIME_SCENARIO_NAMES[regime] ?? "Balanced";

  // ── Current theme allocation ─────────────────────────────────────
  const themeCurrent = new Map<ThemeId, { pct: number; tickers: string[] }>();
  for (const id of THEME_IDS) themeCurrent.set(id, { pct: 0, tickers: [] });

  for (const pos of positions) {
    const tid = tickerTheme(pos.ticker);
    const entry = themeCurrent.get(tid)!;
    entry.pct += pos.allocationPct;
    entry.tickers.push(pos.ticker);
  }

  // ── Opportunity map by theme ────────────────────────────────────
  const oppByTheme = new Map<ThemeId, { ticker: string; score: number }[]>();
  for (const id of THEME_IDS) oppByTheme.set(id, []);
  for (const opp of oppEntries) {
    const tid = tickerTheme(opp.ticker);
    oppByTheme.get(tid)!.push({ ticker: opp.ticker, score: opp.objectiveScore });
  }
  for (const [, arr] of oppByTheme) {
    arr.sort((a, b) => b.score - a.score);
  }

  // ── Newsletter items (parsed keyPoints) ─────────────────────────
  const parsedNewsletters = newsletterItems.map(nl => ({
    title: nl.title,
    keyPoints: parseJson<string[]>(nl.keyPoints, []),
    portfolioRelevance: nl.portfolioRelevance,
  }));

  // ── Compute raw targets with driver tracking ──────────────────
  const rawTargets = new Map<ThemeId, number>();
  const driverSummaries: ThemeDriverSummary[] = [];

  const regimeAdjs = THEME_REGIME_ADJUSTMENTS[regime] ?? {};

  for (const id of THEME_IDS) {
    const base      = THEME_BASE_TARGETS[id];
    const regAdj    = regimeAdjs[id] ?? 0;
    const { adj: oppAdj, desc: oppDesc }   = computeOpportunityAdjustment(id, oppByTheme);
    const { adj: nlAdj, desc: nlDesc }     = computeNewsletterAdjustment(id, parsedNewsletters);
    const { adj: momAdj, desc: momDesc }   = computeMomentumAdjustment(id, momentumByTicker);

    const raw = base + regAdj + oppAdj + nlAdj + momAdj;
    rawTargets.set(id, Math.max(0, raw));

    driverSummaries.push({
      themeId: id,
      label: THEME_LABELS[id],
      basePct: base,
      regimeAdjustment: regAdj,
      regimeDescription: regAdj !== 0 ? scenario : "",
      opportunityAdjustment: oppAdj,
      opportunityDescription: oppDesc,
      newsletterAdjustment: nlAdj,
      newsletterDescription: nlDesc,
      momentumAdjustment: momAdj,
      momentumDescription: momDesc,
      finalAllocation: 0, // filled in after normalization
    });
  }

  // ── Normalize targets to sum 100 ────────────────────────────────
  const rawSum = [...rawTargets.values()].reduce((s, v) => s + v, 0);
  const scale  = rawSum > 0 ? 100 / rawSum : 1;
  const finalTargets = new Map<ThemeId, number>();
  for (const [id, raw] of rawTargets) {
    finalTargets.set(id, parseFloat((raw * scale).toFixed(1)));
  }

  // Back-fill finalAllocation on driver summaries
  for (const d of driverSummaries) {
    d.finalAllocation = finalTargets.get(d.themeId) ?? 0;
  }

  // ── Build output arrays ─────────────────────────────────────────
  const currentThemes: ThemeAllocation[] = THEME_IDS.map(id => ({
    themeId: id,
    label: THEME_LABELS[id],
    currentPct: parseFloat((themeCurrent.get(id)?.pct ?? 0).toFixed(1)),
    tickers: themeCurrent.get(id)?.tickers ?? [],
  }));

  const targetThemes: ThemeTarget[] = THEME_IDS.map(id => ({
    themeId: id,
    label: THEME_LABELS[id],
    finalPct: finalTargets.get(id) ?? 0,
  }));

  // ── Gap analysis ────────────────────────────────────────────────
  const gapAnalysis: ThemeGap[] = THEME_IDS.map(id => {
    const currentPct = parseFloat((themeCurrent.get(id)?.pct ?? 0).toFixed(1));
    const targetPct  = finalTargets.get(id) ?? 0;
    const gapPct     = parseFloat((targetPct - currentPct).toFixed(1));
    return {
      themeId: id,
      label: THEME_LABELS[id],
      currentPct,
      targetPct,
      gapPct,
      direction: (gapPct > DRIFT_BAND ? "underweight" : gapPct < -DRIFT_BAND ? "overweight" : "balanced") as ThemeGap["direction"],
      tickers: themeCurrent.get(id)?.tickers ?? [],
    };
  }).filter(g => g.currentPct > 0 || g.targetPct > 0);

  // Sort by absolute gap descending
  gapAnalysis.sort((a, b) => Math.abs(b.gapPct) - Math.abs(a.gapPct));

  // ── Recommendations ─────────────────────────────────────────────
  const ownedTickers = new Set(positions.map(p => p.ticker));
  const recommendations: ThemeRecommendation[] = [];
  let rank = 1;

  for (const gap of gapAnalysis) {
    if (Math.abs(gap.gapPct) < 3) continue;

    const topOpps = (oppByTheme.get(gap.themeId) ?? [])
      .filter(e => e.score >= 70)
      .slice(0, 3)
      .map(e => e.ticker);

    if (gap.direction === "underweight") {
      const ownedInTheme    = gap.tickers.filter(t => ownedTickers.has(t));
      const notOwnedInTheme = topOpps.filter(t => !ownedTickers.has(t) && !gap.tickers.includes(t));
      const implTickers = [...ownedInTheme, ...notOwnedInTheme].slice(0, 4);
      recommendations.push({
        rank: rank++,
        themeId: gap.themeId,
        label: gap.label,
        action: "ADD",
        currentPct: gap.currentPct,
        targetPct: gap.targetPct,
        gapPct: gap.gapPct,
        reason: `${gap.label} underweight by ${gap.gapPct.toFixed(1)}%. ${scenario} regime target: ${gap.targetPct.toFixed(0)}%.`,
        implementationTickers: implTickers,
      });
    } else if (gap.direction === "overweight") {
      const ownedInTheme = gap.tickers.filter(t => ownedTickers.has(t));
      recommendations.push({
        rank: rank++,
        themeId: gap.themeId,
        label: gap.label,
        action: "REDUCE",
        currentPct: gap.currentPct,
        targetPct: gap.targetPct,
        gapPct: gap.gapPct,
        reason: `${gap.label} overweight by ${Math.abs(gap.gapPct).toFixed(1)}%. ${scenario} regime target: ${gap.targetPct.toFixed(0)}%.`,
        implementationTickers: ownedInTheme.slice(0, 4),
      });
    }
  }

  // ── Largest gap / overweight ─────────────────────────────────────
  const underweights  = gapAnalysis.filter(g => g.direction === "underweight");
  const overweights   = gapAnalysis.filter(g => g.direction === "overweight");
  const largestThemeGap = underweights.length > 0
    ? underweights.reduce((best, g) => g.gapPct > best.gapPct ? g : best, underweights[0])
    : null;
  const largestThemeOverweight = overweights.length > 0
    ? overweights.reduce((best, g) => g.gapPct < best.gapPct ? g : best, overweights[0])
    : null;

  // ── Top driver ──────────────────────────────────────────────────
  let maxAbsAdj = 0;
  let topThemeDriver = "Neutral allocation — no active theme drivers";
  for (const d of driverSummaries) {
    const candidates: [number, string][] = [
      [Math.abs(d.regimeAdjustment),     `${d.regimeAdjustment > 0 ? "+" : ""}${d.regimeAdjustment}% ${d.label} (${d.regimeDescription})`],
      [Math.abs(d.opportunityAdjustment), `+${d.opportunityAdjustment}% ${d.label} Opportunities (${d.opportunityDescription})`],
      [Math.abs(d.newsletterAdjustment),  `${d.newsletterAdjustment > 0 ? "+" : ""}${d.newsletterAdjustment}% ${d.label} Newsletter`],
      [Math.abs(d.momentumAdjustment),    `${d.momentumAdjustment > 0 ? "+" : ""}${d.momentumAdjustment}% ${d.label} Momentum`],
    ];
    for (const [absAdj, desc] of candidates) {
      if (absAdj > maxAbsAdj && absAdj > 0) {
        maxAbsAdj = absAdj;
        topThemeDriver = desc;
      }
    }
  }

  return {
    generatedAt: now,
    regime,
    scenario,
    currentThemes,
    targetThemes,
    gapAnalysis,
    recommendations,
    themeDriverSummaries: driverSummaries,
    largestThemeGap,
    largestThemeOverweight,
    topThemeDriver,
  };
}
