// CIO Copilot Engine — Phase 25
// Routes natural-language questions to the right engine(s) and synthesizes a structured answer.
// Rules-based only — no LLM calls.

import { db } from "./db";
import { generateCioActions, type CIOAction } from "./cio-actions-engine";
import { generateThemeAllocationReview } from "./theme-allocation-engine";
import { buildKnowledgeGraph, getCompanyGraph, computeCentrality } from "./knowledge-graph-engine";
import { computeOpportunities } from "./opportunity-engine";
import {
  THEME_IDS,
  THEME_LABELS,
  TICKER_THEME_MAP,
  type ThemeId,
} from "../config/theme-mapping";

// ─── Types ────────────────────────────────────────────────────────────────────

export type QuestionCategory = "portfolio" | "theme" | "company" | "macro";

export interface RelatedEntity {
  type: "company" | "theme" | "decision" | "regime";
  id: string;
  label: string;
}

export interface CopilotAnswer {
  question: string;
  category: QuestionCategory;
  confidence: number;
  answer: string;
  sources: string[];
  details: Record<string, unknown>;
  recommendedActions: Pick<CIOAction, "category" | "ticker" | "title" | "reason" | "confidence">[];
  relatedEntities: RelatedEntity[];
}

// ─── Routing ──────────────────────────────────────────────────────────────────

const THEME_LABEL_LOWER: Record<ThemeId, string> = {} as Record<ThemeId, string>;
for (const id of THEME_IDS) THEME_LABEL_LOWER[id] = THEME_LABELS[id].toLowerCase();

const THEME_EXTRA_KEYWORDS: Partial<Record<ThemeId, string[]>> = {
  "ai-infrastructure": ["ai", "artificial intelligence", "cloud", "datacenter", "data center", "llm", "machine learning"],
  "semiconductors":    ["semiconductor", "chips", "chip", "fab"],
  "healthcare":        ["health", "biotech", "pharma", "drug", "weight loss", "glp-1"],
  "defense":           ["defense", "defence", "military", "geopolit", "war"],
  "cybersecurity":     ["cyber", "security", "hack", "breach"],
  "consumer":          ["consumer", "retail", "e-commerce", "ecommerce"],
  "financials":        ["financial", "bank", "fintech"],
  "energy":            ["energy", "oil", "gas", "renewable", "solar"],
  "gold":              ["gold", "gldm", "inflation hedge"],
};

const KNOWN_TICKERS = new Set([
  ...Object.keys(TICKER_THEME_MAP),
  "CASH", "GLDM", "GLD", "IAU", "ITA", "IJH", "VTWO", "SHY", "TLT", "BND",
  "SPY", "QQQ", "VTI", "VOO",
]);

function detectTheme(q: string): ThemeId | null {
  const lower = q.toLowerCase();
  for (const id of THEME_IDS) {
    if (lower.includes(THEME_LABEL_LOWER[id])) return id;
    const extras = THEME_EXTRA_KEYWORDS[id] ?? [];
    if (extras.some(kw => lower.includes(kw))) return id;
  }
  return null;
}

function extractTicker(q: string): string | null {
  const words = q.split(/\W+/);
  for (const w of words) {
    const upper = w.toUpperCase();
    if (upper.length >= 2 && upper.length <= 5 && KNOWN_TICKERS.has(upper)) return upper;
  }
  return null;
}

const PORTFOLIO_SIGNALS = [
  /should i (sell|remove|exit|reduce|buy|add)/i,
  /what should i do/i,
  /do next/i,
  /\b(exit|sell|remove|reduce)\b/i,
];

const COMPANY_SIGNALS = [
  /breaks? (my|the) .+ thesis/i,
  /why do i own/i,
  /\bthesis\b/i,
  /risks? (for|of|in)\b/i,
];

const MACRO_SIGNALS = [
  /\bregime\b/i,
  /risk.?off/i,
  /risk.?on/i,
  /\bmacro\b/i,
  /current (market |regime |situation)/i,
  /what (is|are) (the )?(current )?(regime|macro)/i,
];

export function routeQuestion(question: string): {
  category: QuestionCategory;
  ticker: string | null;
  themeId: ThemeId | null;
} {
  const ticker  = extractTicker(question);
  const themeId = detectTheme(question);

  if (ticker && COMPANY_SIGNALS.some(p => p.test(question))) {
    return { category: "company", ticker, themeId: null };
  }
  if (PORTFOLIO_SIGNALS.some(p => p.test(question))) {
    return { category: "portfolio", ticker, themeId: null };
  }
  if (MACRO_SIGNALS.some(p => p.test(question))) {
    return { category: "macro", ticker: null, themeId: null };
  }
  if (themeId) {
    return { category: "theme", ticker: ticker ?? null, themeId };
  }
  if (ticker) {
    return { category: "company", ticker, themeId: null };
  }
  return { category: "portfolio", ticker: null, themeId: null };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseJson<T>(s: string | null | undefined, fallback: T): T {
  try { return JSON.parse(s ?? "") as T; } catch { return fallback; }
}

function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }

// ─── Portfolio answer ─────────────────────────────────────────────────────────

async function answerPortfolio(ticker: string | null): Promise<Omit<CopilotAnswer, "question" | "category">> {
  const [cioResult, brief, archRaw] = await Promise.all([
    generateCioActions().catch(() => null),
    db.morningBrief.findFirst({ orderBy: { briefingDate: "desc" } }).catch(() => null),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).portfolioArchitectureReview.findFirst({ orderBy: { reviewDate: "desc" } }).catch(() => null),
  ]);

  const allActions = cioResult?.actions ?? [];
  const regime     = cioResult?.regime ?? brief?.marketRegime ?? "Neutral";

  // Filter actions for mentioned ticker, or show top 5 overall
  const filteredActions = ticker
    ? allActions.filter(a => a.ticker === ticker || !a.ticker).slice(0, 5)
    : allActions.slice(0, 5);
  const topActions = filteredActions.length > 0 ? filteredActions : allActions.slice(0, 5);

  // Hedge audit data
  type HedgeAuditData = { hedgeScore: number; verdict: string; portfolioCorrelation?: number; drawdownBenefitPct?: number };
  const hedgeAudit: HedgeAuditData | null = archRaw?.hedgeAuditDetail
    ? parseJson<HedgeAuditData | null>(archRaw.hedgeAuditDetail, null)
    : null;

  // Decision review for mentioned ticker
  let decisionReview: { verdict: string; thesisStatus: string; confidence: number; evidenceAgainst: string[] } | null = null;
  if (ticker) {
    const dr = await db.decisionReview.findFirst({
      where: { ticker },
      orderBy: { reviewDate: "desc" },
    }).catch(() => null);
    if (dr) {
      decisionReview = {
        verdict: dr.verdict,
        thesisStatus: dr.thesisStatus,
        confidence: dr.confidence,
        evidenceAgainst: parseJson<string[]>(dr.evidenceAgainst, []).slice(0, 3),
      };
    }
  }

  // Build answer text
  const lines: string[] = [];
  lines.push(`Regime: ${regime}`);

  if (ticker && decisionReview) {
    lines.push(`\n${ticker} Decision Review`);
    lines.push(`Verdict: ${decisionReview.verdict} | Thesis: ${decisionReview.thesisStatus} | Confidence: ${decisionReview.confidence}%`);
    if (decisionReview.evidenceAgainst.length > 0) {
      lines.push(`Risks: ${decisionReview.evidenceAgainst.join("; ")}`);
    }
  }

  if (hedgeAudit && ticker && ["GLDM", "GLD", "IAU", "SHY", "TLT", "BND", "ITA"].includes(ticker)) {
    lines.push(`\nHedge Audit`);
    lines.push(`Score: ${hedgeAudit.hedgeScore}/100 | Verdict: ${hedgeAudit.verdict}`);
    if (hedgeAudit.portfolioCorrelation != null) lines.push(`Correlation: ${hedgeAudit.portfolioCorrelation.toFixed(2)}`);
  }

  if (topActions.length > 0) {
    lines.push(`\nTop Actions`);
    for (const a of topActions.slice(0, 3)) {
      lines.push(`[${a.category}] ${a.title} — ${a.reason}`);
    }
  }

  const maxConf = topActions.length > 0 ? topActions[0].confidence : 70;

  const sources = ["CIO Actions"];
  if (decisionReview) sources.push("Decision Review");
  if (hedgeAudit) sources.push("Portfolio Architecture");
  if (regime) sources.push("Regime Engine");

  const relatedEntities: RelatedEntity[] = [];
  if (ticker) relatedEntities.push({ type: "company", id: ticker, label: ticker });
  const themeId = ticker ? TICKER_THEME_MAP[ticker] : undefined;
  if (themeId) relatedEntities.push({ type: "theme", id: themeId, label: THEME_LABELS[themeId as ThemeId] });

  return {
    confidence: clamp(maxConf, 55, 95),
    answer: lines.join("\n"),
    sources,
    details: {
      regime,
      ticker,
      decisionReview,
      hedgeAudit,
      topActions: topActions.slice(0, 5).map(a => ({
        category: a.category, ticker: a.ticker, title: a.title, reason: a.reason, confidence: a.confidence,
      })),
    },
    recommendedActions: topActions.slice(0, 3).map(a => ({
      category: a.category, ticker: a.ticker, title: a.title, reason: a.reason, confidence: a.confidence,
    })),
    relatedEntities,
  };
}

// ─── Theme answer ─────────────────────────────────────────────────────────────

async function answerTheme(themeId: ThemeId, _ticker: string | null): Promise<Omit<CopilotAnswer, "question" | "category">> {
  const themeReview = await generateThemeAllocationReview().catch(() => null);

  const label = THEME_LABELS[themeId];

  if (!themeReview) {
    return {
      confidence: 50,
      answer: `Unable to retrieve theme allocation data for ${label}.`,
      sources: ["Theme Engine"],
      details: { themeId, label },
      recommendedActions: [],
      relatedEntities: [{ type: "theme", id: themeId, label }],
    };
  }

  const gap      = themeReview.gapAnalysis.find(g => g.themeId === themeId);
  const driver   = themeReview.themeDriverSummaries.find(d => d.themeId === themeId);
  const rec      = themeReview.recommendations.find(r => r.themeId === themeId);

  const lines: string[] = [];
  lines.push(`${label} — ${themeReview.scenario} Regime (${themeReview.regime})`);

  if (gap) {
    lines.push(`\nAllocation`);
    lines.push(`Current: ${gap.currentPct.toFixed(1)}%  |  Target: ${gap.targetPct.toFixed(1)}%  |  Gap: ${gap.gapPct > 0 ? "+" : ""}${gap.gapPct.toFixed(1)}%`);
    lines.push(`Status: ${gap.direction === "balanced" ? "Balanced" : gap.direction === "overweight" ? "Overweight" : "Underweight"}`);
  }

  if (driver) {
    lines.push(`\nDrivers`);
    if (driver.regimeAdjustment !== 0) lines.push(`${driver.regimeAdjustment > 0 ? "+" : ""}${driver.regimeAdjustment}% Regime (${driver.regimeDescription})`);
    if (driver.opportunityAdjustment !== 0) lines.push(`+${driver.opportunityAdjustment}% Opportunities (${driver.opportunityDescription})`);
    if (driver.newsletterAdjustment !== 0) lines.push(`${driver.newsletterAdjustment > 0 ? "+" : ""}${driver.newsletterAdjustment}% Newsletter`);
    if (driver.momentumAdjustment !== 0) lines.push(`${driver.momentumAdjustment > 0 ? "+" : ""}${driver.momentumAdjustment}% Momentum`);
  }

  if (rec && rec.implementationTickers.length > 0) {
    lines.push(`\n${rec.action === "ADD" ? "Implementation" : "Reduce"}`);
    lines.push(rec.implementationTickers.slice(0, 4).join(", "));
  }

  const gapAbs = gap ? Math.abs(gap.gapPct) : 0;
  const confidence = clamp(65 + Math.round(gapAbs * 0.8), 55, 90);

  const themeCompanies: RelatedEntity[] = (gap?.tickers ?? []).slice(0, 4).map(t => ({
    type: "company" as const, id: t, label: t,
  }));

  return {
    confidence,
    answer: lines.join("\n"),
    sources: ["Theme Engine", "Regime Engine", "Newsletter Intelligence"],
    details: {
      themeId,
      label,
      regime: themeReview.regime,
      scenario: themeReview.scenario,
      gap,
      driver,
      recommendation: rec,
      topThemeDriver: themeReview.topThemeDriver,
    },
    recommendedActions: rec ? [{
      category: rec.action === "ADD" ? "ADD" : "REDUCE",
      ticker: rec.implementationTickers[0],
      title: `${rec.action === "ADD" ? "Increase" : "Reduce"} ${label} (${rec.currentPct.toFixed(0)}% → ${rec.targetPct.toFixed(0)}%)`,
      reason: rec.reason,
      confidence,
    }] : [],
    relatedEntities: [
      { type: "theme", id: themeId, label },
      ...themeCompanies,
    ],
  };
}

// ─── Company answer ───────────────────────────────────────────────────────────

async function answerCompany(ticker: string): Promise<Omit<CopilotAnswer, "question" | "category">> {
  const [dr, sessions, thesisImpacts, oppEntries] = await Promise.all([
    db.decisionReview.findFirst({ where: { ticker }, orderBy: { reviewDate: "desc" } }).catch(() => null),
    db.committeeSession.findMany({ where: { ticker }, orderBy: { createdAt: "desc" }, take: 1 }).catch(() => []),
    db.thesisImpactRecord.findMany({ where: { ticker }, orderBy: { createdAt: "desc" }, take: 5 }).catch(() => []),
    computeOpportunities().then(r => r.entries).catch(() => [] as { ticker: string; objectiveScore: number }[]),
  ]);

  const themeId   = TICKER_THEME_MAP[ticker] as ThemeId | undefined;
  const themeLabel = themeId ? THEME_LABELS[themeId] : "Unknown";
  const oppEntry  = oppEntries.find(e => e.ticker === ticker);
  const session   = sessions[0] ?? null;

  // Build knowledge graph for related companies (best-effort)
  let relatedCompanies: string[] = [];
  try {
    const graph   = await buildKnowledgeGraph();
    const centrality = computeCentrality(graph);
    const subgraph = getCompanyGraph(ticker, graph);
    relatedCompanies = subgraph.nodes
      .filter(n => n.type === "COMPANY" && n.name !== ticker)
      .sort((a, b) => (centrality.get(b.id) ?? 0) - (centrality.get(a.id) ?? 0))
      .slice(0, 4)
      .map(n => n.name);
  } catch { /* best effort */ }

  // Risks from filing impacts
  const filingRisks = thesisImpacts
    .filter(ti => ti.impactLevel === "weakened" || ti.impactLevel === "kill_criteria_triggered")
    .map(ti => ti.reasoning)
    .filter(Boolean)
    .slice(0, 3);

  // Risks from decision review
  const reviewRisks = dr ? parseJson<string[]>(dr.evidenceAgainst, []).slice(0, 3) : [];

  const allRisks = [...filingRisks, ...reviewRisks].slice(0, 4);

  const lines: string[] = [];
  lines.push(`${ticker} — ${themeLabel} Theme`);

  if (dr) {
    lines.push(`\nDecision Review`);
    lines.push(`Thesis: ${dr.thesisStatus} | Verdict: ${dr.verdict} | Confidence: ${dr.confidence}%`);
  }

  if (oppEntry) {
    lines.push(`\nOpportunity Score`);
    lines.push(`${oppEntry.objectiveScore.toFixed(0)}/100`);
  }

  const sessionDecision = session ? parseJson<{ verdict?: string }>(session.finalDecision, {}) : null;

  if (session) {
    lines.push(`\nCommittee`);
    lines.push(`${sessionDecision?.verdict ?? session.conviction} — ${session.conviction} conviction`);
  }

  if (allRisks.length > 0) {
    lines.push(`\nTop Risks`);
    allRisks.forEach((r, i) => lines.push(`${i + 1}. ${r}`));
  }

  if (relatedCompanies.length > 0) {
    lines.push(`\nRelated Companies`);
    lines.push(relatedCompanies.join(", "));
  }

  const confidence = clamp(
    (dr?.confidence ?? 70) + (oppEntry ? Math.round(oppEntry.objectiveScore * 0.15) : 0),
    55, 92
  );

  const sources = ["Knowledge Graph"];
  if (dr) sources.push("Decision Review");
  if (oppEntry) sources.push("Opportunity Engine");
  if (session) sources.push("Committee");
  if (thesisImpacts.length > 0) sources.push("Thesis Impact");

  const relatedEntities: RelatedEntity[] = [
    { type: "company", id: ticker, label: ticker },
    ...(themeId ? [{ type: "theme" as const, id: themeId, label: themeLabel }] : []),
    ...relatedCompanies.map(t => ({ type: "company" as const, id: t, label: t })),
  ];

  return {
    confidence,
    answer: lines.join("\n"),
    sources,
    details: {
      ticker,
      themeId,
      themeLabel,
      decisionReview: dr ? { verdict: dr.verdict, thesisStatus: dr.thesisStatus, confidence: dr.confidence } : null,
      opportunityScore: oppEntry?.objectiveScore ?? null,
      committee: session ? { recommendation: sessionDecision?.verdict ?? session.conviction, conviction: session.conviction } : null,
      risks: allRisks,
      relatedCompanies,
    },
    recommendedActions: dr && (dr.verdict === "Exit" || dr.verdict === "Reduce") ? [{
      category: dr.verdict === "Exit" ? "EXIT" : "REDUCE",
      ticker,
      title: `${dr.verdict === "Exit" ? "Exit" : "Reduce"} ${ticker}`,
      reason: dr.lessonLearned || `Thesis ${dr.thesisStatus.toLowerCase()}`,
      confidence: dr.confidence,
    }] : [],
    relatedEntities,
  };
}

// ─── Macro answer ─────────────────────────────────────────────────────────────

async function answerMacro(): Promise<Omit<CopilotAnswer, "question" | "category">> {
  const brief = await db.morningBrief.findFirst({ orderBy: { briefingDate: "desc" } }).catch(() => null);

  if (!brief) {
    return {
      confidence: 50,
      answer: "No morning brief available. Run the nightly scheduler to generate macro intelligence.",
      sources: ["Morning Brief"],
      details: {},
      recommendedActions: [],
      relatedEntities: [],
    };
  }

  const regime   = brief.marketRegime ?? "Neutral";
  const evidence = parseJson<string[]>(brief.marketRegimeEvidence, []);
  const macroRaw = brief.macroSummary ? parseJson<{ topics?: { topic: string; signal: string; insight: string }[]; overallStance?: string }>(brief.macroSummary, {}) : {};
  const geoRaw   = brief.geopoliticalSummary ? parseJson<{ risks?: { region: string; level: string; insight: string }[]; overallStance?: string }>(brief.geopoliticalSummary, {}) : {};
  const impactsRaw = brief.portfolioImpact ? parseJson<{ ticker: string; impact: string; reason: string }[]>(brief.portfolioImpact, []) : [];
  const nlConsensus = brief.newsletterConsensus ? parseJson<{ source: string; portfolioRelevance: string; title?: string }[]>(brief.newsletterConsensus, []) : [];

  const winners = impactsRaw.filter(p => p.impact === "positive").map(p => p.ticker);
  const losers  = impactsRaw.filter(p => p.impact === "negative").map(p => p.ticker);

  const lines: string[] = [];
  lines.push(`Current Regime: ${regime}`);

  if (evidence.length > 0) {
    lines.push(`\nEvidence`);
    evidence.slice(0, 3).forEach(e => lines.push(`• ${e}`));
  }

  if (macroRaw.overallStance) {
    lines.push(`\nMacro Stance: ${macroRaw.overallStance}`);
  }

  const macroTopics = (macroRaw.topics ?? []).slice(0, 3);
  if (macroTopics.length > 0) {
    lines.push(`\nMacro Signals`);
    macroTopics.forEach(t => lines.push(`${t.topic}: ${t.insight}`));
  }

  const geoRisks = (geoRaw.risks ?? []).filter(r => r.level === "high").slice(0, 2);
  if (geoRisks.length > 0) {
    lines.push(`\nGeopolitical Risks`);
    geoRisks.forEach(r => lines.push(`${r.region}: ${r.insight}`));
  }

  if (winners.length > 0) lines.push(`\nPortfolio Winners: ${winners.join(", ")}`);
  if (losers.length > 0)  lines.push(`Portfolio Losers: ${losers.join(", ")}`);

  const bullish = nlConsensus.filter(n => n.portfolioRelevance === "bullish").length;
  const bearish = nlConsensus.filter(n => n.portfolioRelevance === "bearish").length;
  if (bullish > 0 || bearish > 0) {
    lines.push(`\nNewsletter Consensus: ${bullish} bullish / ${bearish} bearish`);
  }

  // Regime confidence: rough estimate based on evidence count + NL consensus
  const baseConf   = { "Risk On": 70, "Neutral": 60, "Risk Off": 75 }[regime] ?? 60;
  const nlBoost    = bullish > bearish ? 5 : bearish > bullish ? -5 : 0;
  const evBoost    = Math.min(evidence.length * 3, 12);
  const confidence = clamp(baseConf + nlBoost + evBoost, 50, 90);

  const sources = ["Morning Brief", "Regime Engine"];
  if (nlConsensus.length > 0) sources.push("Newsletter Intelligence");
  if ((geoRaw.risks ?? []).length > 0) sources.push("Geopolitical Intelligence");

  const relatedEntities: RelatedEntity[] = [
    { type: "regime", id: regime, label: regime },
    ...winners.slice(0, 2).map(t => ({ type: "company" as const, id: t, label: t })),
  ];

  return {
    confidence,
    answer: lines.join("\n"),
    sources,
    details: {
      regime,
      regimeConfidence: confidence,
      evidence,
      macroStance: macroRaw.overallStance ?? "",
      macroTopics,
      geoRisks: geoRaw.risks ?? [],
      portfolioWinners: winners,
      portfolioLosers: losers,
      newsletterConsensus: { bullish, bearish },
    },
    recommendedActions: [],
    relatedEntities,
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function answerQuestion(question: string): Promise<CopilotAnswer> {
  const { category, ticker, themeId } = routeQuestion(question);

  let partial: Omit<CopilotAnswer, "question" | "category">;

  switch (category) {
    case "portfolio":
      partial = await answerPortfolio(ticker);
      break;
    case "theme":
      partial = await answerTheme(themeId!, ticker);
      break;
    case "company":
      partial = await answerCompany(ticker!);
      break;
    case "macro":
    default:
      partial = await answerMacro();
      break;
  }

  return { question, category, ...partial };
}
