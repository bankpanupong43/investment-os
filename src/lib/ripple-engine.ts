// Macro Ripple Analyzer — Phase 29A
// Traces how a macro scenario propagates: regime → themes → holdings.
// No LLM. Pure computation over THEME_REGIME_ADJUSTMENTS + portfolio positions.

import { getActivePortfolioPositions } from "./portfolio-value-engine";
import {
  THEME_IDS,
  THEME_LABELS,
  TICKER_THEME_MAP,
  THEME_REGIME_ADJUSTMENTS,
  type ThemeId,
} from "../config/theme-mapping";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MacroScenario {
  id: string;
  name: string;
  description: string;
  category: "fed" | "inflation" | "growth" | "geopolitical" | "sector" | "credit";
  regimeShift: "Risk On" | "Risk Off" | "Neutral";
  regimeStrength: number;                                    // 0–100; scales regime theme adj
  directThemeImpacts: Partial<Record<ThemeId, number>>;     // ±100 added on top of regime
  probability: "high" | "medium" | "low";
  historicalPrecedent?: string;
}

export interface ThemeRipple {
  themeId: ThemeId;
  themeName: string;
  regimeAdj: number;
  directAdj: number;
  totalImpact: number;
  direction: "positive" | "negative" | "neutral";
}

export interface HoldingRipple {
  ticker: string;
  themeId: ThemeId;
  themeName: string;
  allocationPct: number;
  impactScore: number;
  weightedImpact: number;   // impactScore × allocationPct / 100
  direction: "positive" | "negative" | "neutral";
}

export interface RippleAnalysis {
  scenario: MacroScenario;
  generatedAt: string;
  regime: {
    name: "Risk On" | "Risk Off" | "Neutral";
    strength: number;
    description: string;
  };
  themeRipples: ThemeRipple[];
  holdingRipples: HoldingRipple[];
  summary: {
    positiveCount: number;
    negativeCount: number;
    neutralCount: number;
    pctPortfolioPositive: number;
    pctPortfolioNegative: number;
    weightedImpactScore: number;
    topWinners: HoldingRipple[];
    topLosers: HoldingRipple[];
    verdict: string;
  };
}

// ─── Static config ────────────────────────────────────────────────────────────

const REGIME_DESCRIPTIONS: Record<"Risk On" | "Risk Off" | "Neutral", string> = {
  "Risk On":  "Growth assets outperform — rotate into AI, semis, consumer. Reduce defensive.",
  "Risk Off": "Capital preservation mode — defensives, cash, gold outperform. Growth compressed.",
  "Neutral":  "No strong regime signal — sector-specific dynamics dominate.",
};

export const MACRO_SCENARIOS: MacroScenario[] = [
  {
    id: "fed_hike_50",
    name: "Fed Hikes +50bps",
    description: "Federal Reserve raises rates by 50bps above expectations. Growth multiple compression, dollar strengthens.",
    category: "fed",
    regimeShift: "Risk Off",
    regimeStrength: 70,
    directThemeImpacts: { financials: +8, cash: +5 },
    probability: "medium",
    historicalPrecedent: "Mar–Jul 2022 hiking cycle",
  },
  {
    id: "fed_cut_50",
    name: "Fed Cuts −50bps",
    description: "Federal Reserve cuts rates by 50bps — more aggressive than expected. Liquidity surge, dollar weakens.",
    category: "fed",
    regimeShift: "Risk On",
    regimeStrength: 75,
    directThemeImpacts: { cash: -8, consumer: +5, financials: -4 },
    probability: "medium",
    historicalPrecedent: "Sep 2024 emergency cut start",
  },
  {
    id: "recession_confirmed",
    name: "Recession Confirmed",
    description: "Two consecutive quarters of negative GDP. Risk-off flight to safety, credit tightens across the board.",
    category: "growth",
    regimeShift: "Risk Off",
    regimeStrength: 100,
    directThemeImpacts: { consumer: -10, energy: -8, financials: -8 },
    probability: "low",
    historicalPrecedent: "2008 GFC, 2020 COVID crash",
  },
  {
    id: "inflation_resurgence",
    name: "CPI Resurges >4%",
    description: "Inflation re-accelerates above 4%. Rate path repriced higher — long-duration growth names hurt.",
    category: "inflation",
    regimeShift: "Risk Off",
    regimeStrength: 60,
    directThemeImpacts: { energy: +10, gold: +8, consumer: -8, financials: +4 },
    probability: "medium",
    historicalPrecedent: "2021–2022 CPI surge",
  },
  {
    id: "ai_acceleration",
    name: "AI Breakthrough Wave",
    description: "Major AI capability leap (GPT-5 class). Hyperscaler capex surges. Semis and AI infra re-rate sharply.",
    category: "sector",
    regimeShift: "Risk On",
    regimeStrength: 50,
    directThemeImpacts: { "ai-infrastructure": +20, semiconductors: +12, cybersecurity: +5 },
    probability: "medium",
    historicalPrecedent: "ChatGPT Nov 2022, NVDA re-rate Jan 2023",
  },
  {
    id: "china_taiwan_escalation",
    name: "China–Taiwan Escalation",
    description: "Military tension spikes. Semiconductor supply chain threatened. Defense spending accelerates globally.",
    category: "geopolitical",
    regimeShift: "Risk Off",
    regimeStrength: 80,
    directThemeImpacts: { semiconductors: -15, defense: +15, energy: +5 },
    probability: "low",
    historicalPrecedent: "Aug 2022 Pelosi Taiwan visit shock",
  },
  {
    id: "oil_surge_30pct",
    name: "Oil Surges +30%",
    description: "Supply shock drives crude +30%. Consumer spending compressed. Energy stocks re-rate. No full regime shift.",
    category: "inflation",
    regimeShift: "Neutral",
    regimeStrength: 0,
    directThemeImpacts: { energy: +20, consumer: -12, broad: -5, financials: -4 },
    probability: "medium",
    historicalPrecedent: "2022 Russia–Ukraine oil spike",
  },
  {
    id: "vix_spike_30",
    name: "VIX Spikes Above 30",
    description: "Market panic. Forced de-risking and margin calls. Broad equity selloff with flight to gold and cash.",
    category: "growth",
    regimeShift: "Risk Off",
    regimeStrength: 90,
    directThemeImpacts: { gold: +5, cash: +5 },
    probability: "medium",
    historicalPrecedent: "Aug 2024 VIX spike, Mar 2020",
  },
  {
    id: "soft_landing",
    name: "Soft Landing Confirmed",
    description: "Fed achieves 2% inflation without recession. Goldilocks — broad equity re-rating, consumer confidence surges.",
    category: "growth",
    regimeShift: "Risk On",
    regimeStrength: 80,
    directThemeImpacts: { gold: -5, cash: -5, consumer: +5, financials: +5 },
    probability: "medium",
    historicalPrecedent: "Late 2023 soft landing narrative",
  },
  {
    id: "stagflation",
    name: "Stagflation Risk",
    description: "Slow growth + sticky inflation. Most equities hurt except real assets. Growth and consumer hit hardest.",
    category: "growth",
    regimeShift: "Risk Off",
    regimeStrength: 50,
    directThemeImpacts: { gold: +15, energy: +10, consumer: -12, "ai-infrastructure": -10, financials: -8 },
    probability: "low",
    historicalPrecedent: "1973–74, 2022 partial stagflation scare",
  },
  {
    id: "tech_regulation_shock",
    name: "Big Tech Antitrust",
    description: "Major antitrust ruling targets Mag-7. AI and cloud business models legally threatened.",
    category: "sector",
    regimeShift: "Neutral",
    regimeStrength: 0,
    directThemeImpacts: { "ai-infrastructure": -18, consumer: -8, cybersecurity: -5 },
    probability: "low",
    historicalPrecedent: "2020 Google DOJ suit, 2024 Apple ruling",
  },
  {
    id: "nato_defense_surge",
    name: "NATO Defense Surge",
    description: "NATO members commit to 3%+ GDP defense budgets. Multi-year procurement wave for weapons and AI systems.",
    category: "geopolitical",
    regimeShift: "Neutral",
    regimeStrength: 0,
    directThemeImpacts: { defense: +22, "ai-infrastructure": +5, energy: +4, gold: -3 },
    probability: "medium",
    historicalPrecedent: "Feb 2022 post-Ukraine spending pledges",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function impactDirection(score: number): "positive" | "negative" | "neutral" {
  return score > 3 ? "positive" : score < -3 ? "negative" : "neutral";
}

function buildVerdict(weightedTotal: number, pctNegative: number, pctPositive: number): string {
  if (weightedTotal < -5 && pctNegative > 40) {
    return `Net negative for your portfolio. ${Math.round(pctNegative)}% of holdings are in headwind themes.`;
  }
  if (weightedTotal > 5 && pctPositive > 40) {
    return `Net positive for your portfolio. ${Math.round(pctPositive)}% of holdings benefit from this scenario.`;
  }
  if (Math.abs(weightedTotal) < 2) {
    return `Mixed impact. Portfolio is relatively hedged against this scenario.`;
  }
  return weightedTotal < 0
    ? `Slight headwind. Monitor growth-theme concentration.`
    : `Slight tailwind. Current positioning favors this outcome.`;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export function getScenarios(): MacroScenario[] {
  return MACRO_SCENARIOS;
}

export async function runRippleAnalysis(scenarioId: string): Promise<RippleAnalysis | null> {
  const scenario = MACRO_SCENARIOS.find(s => s.id === scenarioId);
  if (!scenario) return null;

  const positions   = await getActivePortfolioPositions();
  const positionMap = new Map(positions.map(p => [p.ticker, p.allocationPct ?? 0]));
  const regimeAdjs  = THEME_REGIME_ADJUSTMENTS[scenario.regimeShift] ?? {};
  const scale       = scenario.regimeStrength / 100;

  // Theme ripples — all THEME_IDS
  const allThemeRipples: ThemeRipple[] = THEME_IDS.map(themeId => {
    const regimeAdj   = Math.round((regimeAdjs[themeId] ?? 0) * scale * 10) / 10;
    const directAdj   = scenario.directThemeImpacts[themeId] ?? 0;
    const totalImpact = Math.round((regimeAdj + directAdj) * 10) / 10;
    return { themeId, themeName: THEME_LABELS[themeId], regimeAdj, directAdj, totalImpact, direction: impactDirection(totalImpact) };
  });

  const themeRipples   = allThemeRipples.filter(t => t.totalImpact !== 0).sort((a, b) => b.totalImpact - a.totalImpact);
  const themeRippleMap = new Map(allThemeRipples.map(t => [t.themeId, t]));

  // Holding ripples — only owned tickers
  const holdingRipples: HoldingRipple[] = [];
  for (const [ticker, allocationPct] of positionMap) {
    const themeId = TICKER_THEME_MAP[ticker];
    if (!themeId) continue;
    const impactScore = themeRippleMap.get(themeId)?.totalImpact ?? 0;
    holdingRipples.push({
      ticker,
      themeId,
      themeName:      THEME_LABELS[themeId],
      allocationPct:  Math.round(allocationPct * 10) / 10,
      impactScore,
      weightedImpact: Math.round(impactScore * allocationPct / 100 * 10) / 10,
      direction:      impactDirection(impactScore),
    });
  }
  holdingRipples.sort((a, b) => b.impactScore - a.impactScore);

  const positive      = holdingRipples.filter(h => h.direction === "positive");
  const negative      = holdingRipples.filter(h => h.direction === "negative");
  const neutral       = holdingRipples.filter(h => h.direction === "neutral");
  const pctPositive   = positive.reduce((s, h) => s + h.allocationPct, 0);
  const pctNegative   = negative.reduce((s, h) => s + h.allocationPct, 0);
  const weightedTotal = Math.round(holdingRipples.reduce((s, h) => s + h.weightedImpact, 0) * 10) / 10;

  return {
    scenario,
    generatedAt: new Date().toISOString(),
    regime: { name: scenario.regimeShift, strength: scenario.regimeStrength, description: REGIME_DESCRIPTIONS[scenario.regimeShift] },
    themeRipples,
    holdingRipples,
    summary: {
      positiveCount:        positive.length,
      negativeCount:        negative.length,
      neutralCount:         neutral.length,
      pctPortfolioPositive: Math.round(pctPositive * 10) / 10,
      pctPortfolioNegative: Math.round(pctNegative * 10) / 10,
      weightedImpactScore:  weightedTotal,
      topWinners:           positive.slice(0, 3),
      topLosers:            negative.slice(0, 3),
      verdict:              buildVerdict(weightedTotal, pctNegative, pctPositive),
    },
  };
}
