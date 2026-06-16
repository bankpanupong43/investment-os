// CIO Copilot Engine — Phase 25
// Routes natural-language questions to the right engine(s) and synthesizes a structured answer.
// Rules-based only — no LLM calls.

import { db } from "./db";
import { computePortfolioValue } from "./portfolio-value-engine";
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

export type QuestionCategory = "portfolio" | "theme" | "company" | "macro" | "discovery" | "cash" | "theme_scout";

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

const CASH_SIGNALS = [
  /how much cash/i,
  /\bcash (balance|available|on hand|position)\b/i,
  /buying power/i,
  /\busd exposure\b/i,
  /\bthb (value|total|equivalent)\b/i,
  /portfolio (value|size|total)/i,
  /what('?s| is) (my )?(largest|biggest) (position|holding)/i,
  /how (big|large) is my (portfolio|total)/i,
];

const DISCOVERY_SIGNALS = [
  /\b(discover|radar|pipeline|watch list|new idea|find me|what('?s| is) new)\b/i,
  /\b(scouting|new opportunity|new candidate|new pick)\b/i,
  /\bupcoming (ticker|stock|company)\b/i,
];

const THEME_SCOUT_SIGNALS = [
  /what (themes?|sectors?) (are |is )?(emerging|accelerating|gaining|rising|weakening|falling|losing)/i,
  /what (am i|should i be) (missing|researching|watching)/i,
  /(which|what) theme (is|are) (gaining|losing|weakening|rising|accelerating|falling)/i,
  /what('?s| is) gaining (momentum|strength)/i,
  /what('?s| is) losing (momentum|steam)/i,
  /\b(theme scout|theme momentum|theme signal)\b/i,
  /what should i (research|investigate|look at) next/i,
  /what (new |emerging )(theme|sector|trend)/i,
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

  if (CASH_SIGNALS.some(p => p.test(question))) {
    return { category: "cash", ticker: null, themeId: null };
  }
  if (THEME_SCOUT_SIGNALS.some(p => p.test(question))) {
    return { category: "theme_scout", ticker: null, themeId: null };
  }
  if (DISCOVERY_SIGNALS.some(p => p.test(question))) {
    return { category: "discovery", ticker: null, themeId: null };
  }
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
  const [cioResult, brief, archRaw, blueprintRaw] = await Promise.all([
    generateCioActions().catch(() => null),
    db.morningBrief.findFirst({ orderBy: { briefingDate: "desc" } }).catch(() => null),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).portfolioArchitectureReview.findFirst({ orderBy: { reviewDate: "desc" } }).catch(() => null),
    db.portfolioBlueprint.findFirst({ orderBy: { blueprintDate: "desc" } }).catch(() => null),
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

  // Portfolio blueprint
  type CIOAnswers = {
    shouldHedge: { answer: string; hedgePct: number; reason: string };
    targetCashPct: { pct: number; reason: string };
    targetPositionCount: { min: number; max: number; current: number };
  };
  type CapitalPlan = { recommendation: string; deployAmountUsd: number; deployReason: string; holdReason: string };
  type ScenarioResult = { scenario: string; estimatedReturnRange: string; recommendation: string };
  const blueprintCioAnswers: CIOAnswers | null = blueprintRaw?.cioAnswers
    ? parseJson<CIOAnswers | null>(blueprintRaw.cioAnswers, null)
    : null;
  const blueprintCapital: CapitalPlan | null = blueprintRaw?.capitalAllocation
    ? parseJson<CapitalPlan | null>(blueprintRaw.capitalAllocation, null)
    : null;
  const blueprintScenarios: ScenarioResult[] = blueprintRaw?.scenarioAnalysis
    ? parseJson<ScenarioResult[]>(blueprintRaw.scenarioAnalysis, [])
    : [];

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

  if (blueprintCapital) {
    lines.push(`\nCapital Deployment`);
    lines.push(`Recommendation: ${blueprintCapital.recommendation.replace("_", " ")} — $${(blueprintCapital.deployAmountUsd / 1000).toFixed(0)}K`);
    lines.push(blueprintCapital.deployReason || blueprintCapital.holdReason);
  }

  if (blueprintCioAnswers) {
    lines.push(`\nBlueprint CIO`);
    lines.push(`Hedge: ${blueprintCioAnswers.shouldHedge.answer} (${blueprintCioAnswers.shouldHedge.hedgePct}%) — ${blueprintCioAnswers.shouldHedge.reason}`);
    lines.push(`Cash target: ${blueprintCioAnswers.targetCashPct.pct.toFixed(1)}% — ${blueprintCioAnswers.targetCashPct.reason}`);
    lines.push(`Positions: ${blueprintCioAnswers.targetPositionCount.current} (target ${blueprintCioAnswers.targetPositionCount.min}–${blueprintCioAnswers.targetPositionCount.max})`);
  }

  if (blueprintScenarios.length > 0) {
    lines.push(`\nScenarios`);
    for (const s of blueprintScenarios.slice(0, 3)) {
      lines.push(`${s.scenario}: ${s.estimatedReturnRange} — ${s.recommendation}`);
    }
  }

  const maxConf = topActions.length > 0 ? topActions[0].confidence : 70;

  const sources = ["CIO Actions"];
  if (decisionReview) sources.push("Decision Review");
  if (hedgeAudit) sources.push("Portfolio Architecture");
  if (blueprintRaw) sources.push("Portfolio Blueprint");
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
      blueprintCapital,
      blueprintCioAnswers,
      blueprintScenarios: blueprintScenarios.slice(0, 3),
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

// ─── Cash / portfolio value answer ───────────────────────────────────────────

async function answerCash(): Promise<Omit<CopilotAnswer, "question" | "category">> {
  let snapshot: Awaited<ReturnType<typeof computePortfolioValue>> | null = null;
  try { snapshot = await computePortfolioValue(); } catch { /* engine unavailable */ }

  if (!snapshot || snapshot.totalValueThb === 0) {
    return {
      confidence: 50,
      answer: "No holdings data. Add positions and cash accounts on the Portfolio page.",
      sources: ["Portfolio Value Engine"],
      details: {},
      recommendedActions: [],
      relatedEntities: [],
    };
  }

  const fmtThb = (n: number) => "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const fmtUsd = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const totalCashUsd = snapshot.cashAccounts.reduce(
    (s, c) => s + (c.currency === "USD" ? c.balance : c.balanceThb / snapshot!.usdthb), 0
  );
  const totalUsdExposure = snapshot.totalUsdExposure;
  const largest = snapshot.largestPosition;

  const lines: string[] = [
    `Total Portfolio: ${fmtThb(snapshot.totalValueThb)} (${fmtUsd(snapshot.totalValueUsd)})`,
    `USDTHB: ${snapshot.usdthb.toFixed(2)}`,
    `\nCash Accounts`,
    ...snapshot.cashAccounts.map(c =>
      `${c.accountName}: ${c.currency === "THB" ? fmtThb(c.balance) : fmtUsd(c.balance)}` +
      (c.currency !== "THB" ? ` (${fmtThb(c.balanceThb)})` : "") +
      (c.allocationPct != null ? ` — ${c.allocationPct.toFixed(1)}%` : "")
    ),
    `\nTotal Cash: ${fmtThb(snapshot.totalCashThb)}`,
    `Total USD Exposure: ${fmtUsd(totalUsdExposure)}`,
  ];

  if (largest) {
    lines.push(`\nLargest Position: ${largest.ticker} (${largest.allocationPct.toFixed(1)}%)`);
  }

  if (snapshot.holdings.length > 0) {
    lines.push(`\nEquity: ${fmtUsd(snapshot.totalEquityUsd)} (${fmtThb(snapshot.totalEquityThb)})`);
    const top3 = snapshot.holdings
      .filter(h => h.allocationPct != null)
      .sort((a, b) => (b.allocationPct ?? 0) - (a.allocationPct ?? 0))
      .slice(0, 3);
    if (top3.length > 0) {
      lines.push("Top positions: " + top3.map(h => `${h.ticker} ${h.allocationPct!.toFixed(1)}%`).join(", "));
    }
  }

  return {
    confidence: 85,
    answer: lines.join("\n"),
    sources: ["Portfolio Value Engine"],
    details: {
      totalValueThb: snapshot.totalValueThb,
      totalValueUsd: snapshot.totalValueUsd,
      usdthb: snapshot.usdthb,
      totalCashThb: snapshot.totalCashThb,
      totalCashUsd: Math.round(totalCashUsd * 100) / 100,
      totalUsdExposure,
      largestPosition: largest,
      cashAccounts: snapshot.cashAccounts,
    },
    recommendedActions: [],
    relatedEntities: [],
  };
}

// ─── Discovery answer ─────────────────────────────────────────────────────────

async function answerDiscovery(): Promise<Omit<CopilotAnswer, "question" | "category">> {
  const candidates = await db.discoveryCandidate.findMany({
    where: { status: "active" },
    orderBy: [{ score: "desc" }, { createdAt: "desc" }],
    take: 8,
  }).catch(() => []);

  if (candidates.length === 0) {
    return {
      confidence: 50,
      answer: "No discovery candidates in the radar pipeline. Run the nightly radar scan to populate.",
      sources: ["Radar Engine"],
      details: { candidates: [] },
      recommendedActions: [],
      relatedEntities: [],
    };
  }

  const lines: string[] = [`${candidates.length} active discovery candidate${candidates.length !== 1 ? "s" : ""} in radar`];

  lines.push(`\nTop Candidates`);
  for (const c of candidates.slice(0, 5)) {
    const score = c.score != null ? ` (${c.score.toFixed(0)}/100)` : "";
    const reason = c.reason ? ` — ${c.reason}` : "";
    lines.push(`${c.ticker}${score}${reason}`);
  }

  const topTicker = candidates[0];
  if (topTicker) {
    lines.push(`\nTop Pick: ${topTicker.ticker}`);
    if (topTicker.catalysts) {
      const catalysts = typeof topTicker.catalysts === "string"
        ? parseJson<string[]>(topTicker.catalysts, [])
        : (topTicker.catalysts as string[]);
      if (catalysts.length > 0) lines.push(`Catalysts: ${catalysts.slice(0, 3).join(", ")}`);
    }
  }

  const confidence = clamp(55 + Math.min(candidates.length * 4, 25), 55, 85);

  return {
    confidence,
    answer: lines.join("\n"),
    sources: ["Radar Engine", "Discovery Pipeline"],
    details: {
      count: candidates.length,
      candidates: candidates.slice(0, 5).map(c => ({
        ticker: c.ticker,
        score: c.score,
        reason: c.reason,
      })),
    },
    recommendedActions: candidates.slice(0, 2).map(c => ({
      category: "WATCH" as const,
      ticker: c.ticker,
      title: `Research ${c.ticker}`,
      reason: c.reason ?? "Active radar candidate",
      confidence: clamp(50 + Math.round((c.score ?? 50) * 0.3), 50, 85),
    })),
    relatedEntities: candidates.slice(0, 4).map(c => ({
      type: "company" as const,
      id: c.ticker,
      label: c.ticker,
    })),
  };
}

// ─── Theme Scout answer ───────────────────────────────────────────────────────

async function answerThemeScout(question: string): Promise<Omit<CopilotAnswer, "question" | "category">> {
  const { getThemeScoutReport } = await import("./theme-scout-engine");
  const report = await getThemeScoutReport();

  if (!report) {
    return {
      confidence: 20,
      answer: "Theme Scout has not run yet. Trigger a scan via POST /api/theme-scout or run the nightly scheduler.",
      sources: [],
      details: {},
      recommendedActions: [],
      relatedEntities: [],
    };
  }

  const q = question.toLowerCase();

  // Determine which sub-question to answer
  const wantWeakening = /weak|falling|losing|declining/.test(q);
  const wantMissing   = /missing|should i research|look at next/.test(q);
  const wantGaining   = /gaining|rising|accelerating|momentum/.test(q);

  let focus: typeof report.all;
  let headline: string;

  if (wantWeakening) {
    focus = report.weakening;
    headline = "Themes losing momentum";
  } else if (wantGaining) {
    focus = [...report.accelerating, ...report.emerging.filter(r => r.momentum === "Rising")];
    headline = "Themes gaining momentum";
  } else if (wantMissing) {
    // Themes with high score but not currently in portfolio allocation
    focus = [...report.emerging, ...report.accelerating].filter(r => r.isExtended);
    headline = "Emerging themes not yet in your allocation";
  } else {
    // Default: emerging
    focus = report.emerging.length > 0 ? report.emerging : report.accelerating;
    headline = "Emerging themes";
  }

  const top5 = focus.slice(0, 5);

  const themeLines = top5.map((r, i) =>
    `${i + 1}. **${r.theme}** — Score ${r.score} · ${r.momentum} · ${r.status}\n   Signals: ${r.drivers.slice(0, 2).join("; ")}` +
    (r.candidates.length > 0 ? `\n   Watch: ${r.candidates.map(c => c.ticker).join(", ")}` : "")
  );

  const answer = top5.length === 0
    ? `No themes currently match "${wantWeakening ? "weakening" : wantGaining ? "gaining" : "emerging"}". Run Theme Scout to refresh data.`
    : `**${headline}** (${new Date(report.generatedAt).toLocaleDateString()}):\n\n${themeLines.join("\n\n")}`;

  return {
    confidence: Math.min(90, 50 + top5.length * 8),
    answer,
    sources: ["Theme Scout", "Newsletter Intelligence", "Discovery Radar", "Opportunity Engine"],
    details: {
      emerging:     report.emerging.length,
      accelerating: report.accelerating.length,
      weakening:    report.weakening.length,
      topThemes:    top5.map(r => ({ theme: r.theme, score: r.score, status: r.status, momentum: r.momentum })),
    },
    recommendedActions: top5
      .filter(r => r.score >= 75 && r.candidates.length > 0)
      .flatMap(r => r.candidates.slice(0, 2).map(c => ({
        category: "WATCH" as const,
        ticker: c.ticker,
        title: `Research ${c.ticker} — ${r.theme}`,
        reason: `${r.theme} scoring ${r.score}/100 (${r.momentum})`,
        confidence: r.score,
      }))),
    relatedEntities: top5.map(r => ({
      type: "theme" as const,
      id:    r.theme.toLowerCase().replace(/\s+/g, "-"),
      label: r.theme,
    })),
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
    case "cash":
      partial = await answerCash();
      break;
    case "discovery":
      partial = await answerDiscovery();
      break;
    case "theme_scout":
      partial = await answerThemeScout(question);
      break;
    case "macro":
    default:
      partial = await answerMacro();
      break;
  }

  return { question, category, ...partial };
}
