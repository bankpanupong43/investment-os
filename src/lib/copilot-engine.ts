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

export type QuestionCategory = "portfolio" | "theme" | "company" | "macro" | "discovery" | "cash" | "theme_scout" | "theme_dossier" | "catalyst" | "mention_intel" | "company_scout" | "private_scout" | "macro_ripple";

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
  /\b(theme scout|theme momentum|theme signal|research queue)\b/i,
  /what should i (research|investigate|look at) (next|this week)/i,
  /what (new |emerging )(theme|sector|trend)/i,
  /under.?owned (theme|sector)/i,
  /themes? (outside|beyond|not in) (my )?(portfolio|allocation)/i,
  /\b(research priority|novelty score|high novelty)\b/i,
  /what (themes?|sectors?) (have i|am i) (not|missing|ignoring|overlooking)/i,
];

const DOSSIER_SIGNALS = [
  /^(tell me about|teach me|explain|why is|what is|give me a dossier on|research)\s+(.+)$/i,
  /(dossier|deep.?dive|overview|analysis) (on|of|for)\s+(.+)/i,
  /what should i know about\s+(.+)/i,
  /investment (case|thesis) (for|on)\s+(.+)/i,
];

const CATALYST_SIGNALS = [
  /\b(upcoming|next)\s+(earnings|report|quarter)\b/i,
  /what (earnings|reports?) (are )?(coming|scheduled|due)/i,
  /\b(earnings calendar|catalyst calendar|event calendar)\b/i,
  /when (is|are|does)\s+\w+ (reporting|earnings|report)/i,
  /\b(catalyst|catalysts)\b/i,
];

const COMPANY_SCOUT_SIGNALS = [
  /what companies should i (research|look at|investigate|consider)/i,
  /what (hidden gems?|new companies|emerging companies|new names?) (are|is) (emerging|showing up|appearing)/i,
  /what (is |are )?(company scout|scout) (seeing|finding|surfacing)/i,
  /any (companies|stocks) (outside|beyond) (my )?portfolio (gaining|with) momentum/i,
  /what new (opportunities?|companies?|stocks?) (are )?(appearing|emerging|showing)/i,
  /\b(company scout|scout report|scout candidates?)\b/i,
  /companies (i am|i'm|am i) not (paying attention|tracking|watching)/i,
  /what (am i|should i be) missing (in terms of |regarding )?(companies?|stocks?)/i,
];

const MENTION_INTEL_SIGNALS = [
  /what (companies|stocks) (are |is )?(getting|receiving|attracting) (attention|mentions|coverage)/i,
  /what (stocks|companies) (are )?rising in (mentions|attention|coverage)/i,
  /what (are )?(institutions|institutional) (talking|discussing) about/i,
  /\b(cross.?source|multi.?source)\s+(consensus|coverage|attention)\b/i,
  /what('?s| is) (the )?most (discussed|mentioned|talked.about)/i,
  /\b(mention|mentions)\s+(intelligence|trends?|momentum|stats?)\b/i,
  /who (is|are) (being )?(talked about|mentioned|discussed) (most|lately|recently)/i,
  /\b(attention flow|company attention|mention radar)\b/i,
];

const PRIVATE_SCOUT_SIGNALS = [
  /what (private|private-market|pre.?ipo) (companies?|startups?|unicorns?)/i,
  /what startups? should i (watch|track|follow|research|consider)/i,
  /which (private companies?|startups?) (matter|are important|are shaping)/i,
  /what public (stocks?|companies?) benefit from (anthropic|openai|cursor|databricks|anduril|spacex|xai|figure)/i,
  /what public (stocks?|companies?) benefit from (ai|private (market|companies?))/i,
  /if i (can('?t)?|cannot) buy (anthropic|openai|cursor|xai|spacex|anduril|databricks)/i,
  /\b(private scout|private market|pre.?ipo|unicorn|startup radar)\b/i,
  /what startups? are gaining (momentum|traction|attention)/i,
  /private (market )?(exposure|opportunities?|beneficiar)/i,
  /what companies? are shaping the future before (they become|going) public/i,
  /\b(comp.?for|public beneficiar|private.+public)\b/i,
];

const MACRO_RIPPLE_SIGNALS = [
  /what (happens?|would happen|will happen) to (my portfolio|my holdings|portfolio|my positions?) if/i,
  /\b(ripple|ripple effect|ripple analysis|ripple impact)\b/i,
  /\b(scenario analysis|stress test|portfolio impact scenario)\b/i,
  /if (the )?(fed|federal reserve) (hikes?|cuts?|raises?|lowers?)/i,
  /if (there is |we have |we enter )?(a |an )?(recession|crash|stagflation|soft landing)/i,
  /\b(macro ripple|macro shock|macro scenario|portfolio scenario|impact scenario)\b/i,
  /how (does|would|will) (a )?(rate hike|rate cut|recession|inflation spike|oil surge|vix spike) (impact|affect|hit) (my portfolio|portfolio|my holdings)/i,
  /what (is|would be) the (portfolio )?(impact|effect) (of|if)/i,
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
  if (COMPANY_SCOUT_SIGNALS.some(p => p.test(question))) {
    return { category: "company_scout", ticker: null, themeId: null };
  }
  if (MENTION_INTEL_SIGNALS.some(p => p.test(question))) {
    return { category: "mention_intel", ticker: null, themeId: null };
  }
  if (CATALYST_SIGNALS.some(p => p.test(question))) {
    return { category: "catalyst", ticker: null, themeId: null };
  }
  if (DOSSIER_SIGNALS.some(p => p.test(question))) {
    return { category: "theme_dossier", ticker: null, themeId: null };
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
  if (PRIVATE_SCOUT_SIGNALS.some(p => p.test(question))) {
    return { category: "private_scout", ticker: null, themeId: null };
  }
  if (MACRO_RIPPLE_SIGNALS.some(p => p.test(question))) {
    return { category: "macro_ripple", ticker: null, themeId: null };
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
    orderBy: [{ radarScore: "desc" }, { createdAt: "desc" }],
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
    const score = c.radarScore != null ? ` (${c.radarScore.toFixed(0)}/100)` : "";
    const reason = c.discoveryReason ? ` — ${c.discoveryReason}` : "";
    lines.push(`${c.ticker}${score}${reason}`);
  }

  const topTicker = candidates[0];
  if (topTicker) {
    lines.push(`\nTop Pick: ${topTicker.ticker}`);
    const topSignals = parseJson<string[]>(topTicker.signals, []);
    if (topSignals.length > 0) lines.push(`Signals: ${topSignals.slice(0, 3).join(", ")}`);
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
        score: c.radarScore,
        reason: c.discoveryReason,
      })),
    },
    recommendedActions: candidates.slice(0, 2).map(c => ({
      category: "WATCH" as const,
      ticker: c.ticker,
      title: `Research ${c.ticker}`,
      reason: c.discoveryReason ?? "Active radar candidate",
      confidence: clamp(50 + Math.round((c.radarScore ?? 50) * 0.3), 50, 85),
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

  const wantWeakening  = /weak|falling|losing|declining/.test(q);
  const wantMissing    = /missing|should i research|look at next|research (this|next) week/.test(q);
  const wantGaining    = /gaining|rising|accelerating|momentum/.test(q);
  const wantUnderOwned = /under.?owned|outside (my )?(portfolio|allocation)|not in (my )?(portfolio|allocation)/.test(q);

  // For missing/under-owned queries, augment with research queue data
  if (wantMissing || wantUnderOwned) {
    const { generateResearchQueue } = await import("./research-queue-engine");
    const queue = await generateResearchQueue();

    const targets = wantUnderOwned
      ? queue.underOwnedThemes
      : queue.topResearchTargets;

    const top5 = targets.slice(0, 5);
    const headline = wantUnderOwned
      ? "Themes under-owned relative to signal strength"
      : "Research Queue — highest priority this week";

    const themeLines = top5.map((r, i) =>
      `${i + 1}. **${r.theme}** — Priority ${r.researchPriority}/100 · Novelty ${r.noveltyScore}/100 · ${r.momentum}\n   ${r.whyNow}` +
      (r.candidates.length > 0 ? `\n   Companies: ${r.candidates.map(c => c.ticker).join(", ")}` : "")
    );

    const answer = top5.length === 0
      ? "Research queue is empty — run the Theme Scout to generate priorities."
      : `**${headline}** (${new Date(queue.generatedAt).toLocaleDateString()}):\n\n${themeLines.join("\n\n")}\n\n` +
        `${queue.themesNeedingResearch} themes flagged for research across all signals.`;

    return {
      confidence: Math.min(88, 55 + top5.length * 7),
      answer,
      sources: ["Research Queue", "Theme Scout", "Portfolio", "Newsletter Intelligence"],
      details: {
        themesNeedingResearch: queue.themesNeedingResearch,
        highNovelty:           queue.highNoveltyThemes.length,
        underOwned:            queue.underOwnedThemes.length,
        topTargets:            top5.map(r => ({ theme: r.theme, priority: r.researchPriority, novelty: r.noveltyScore })),
      },
      recommendedActions: top5
        .filter(r => r.candidates.length > 0)
        .flatMap(r => r.candidates.slice(0, 2).map(c => ({
          category: "WATCH" as const,
          ticker: c.ticker,
          title: `Research ${c.ticker} — ${r.theme}`,
          reason: r.whyNow,
          confidence: r.researchPriority,
        }))),
      relatedEntities: top5.map(r => ({
        type: "theme" as const,
        id:    r.theme.toLowerCase().replace(/\s+/g, "-"),
        label: r.theme,
      })),
    };
  }

  let focus: typeof report.all;
  let headline: string;

  if (wantWeakening) {
    focus = report.weakening;
    headline = "Themes losing momentum";
  } else if (wantGaining) {
    focus = [...report.accelerating, ...report.emerging.filter(r => r.momentum === "Rising")];
    headline = "Themes gaining momentum";
  } else {
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

// ─── Theme Dossier answer ─────────────────────────────────────────────────────

const SCOUT_THEME_NAMES = [
  "AI Infrastructure", "AI Agents", "Semiconductors", "Defense", "Defense AI",
  "Healthcare & GLP-1", "Nuclear Energy", "Space Economy", "Cybersecurity",
  "Power Grid", "Robotics", "Digital Payments", "Data Centers", "Energy",
];

function extractThemeFromQuestion(q: string): string | null {
  const lower = q.toLowerCase();
  // Exact match first
  for (const t of SCOUT_THEME_NAMES) {
    if (lower.includes(t.toLowerCase())) return t;
  }
  // Fuzzy keyword match
  const keywords: Record<string, string> = {
    "ai agent": "AI Agents", "agentic": "AI Agents",
    "nuclear": "Nuclear Energy", "uranium": "Nuclear Energy", "smr": "Nuclear Energy",
    "space": "Space Economy", "satellite": "Space Economy", "rocket": "Space Economy",
    "robot": "Robotics", "humanoid": "Robotics", "automation": "Robotics",
    "cyber": "Cybersecurity", "zero trust": "Cybersecurity",
    "power grid": "Power Grid", "grid": "Power Grid",
    "payment": "Digital Payments", "fintech": "Digital Payments",
    "data center": "Data Centers", "colocation": "Data Centers",
    "defense ai": "Defense AI", "military ai": "Defense AI",
    "semiconductor": "Semiconductors", "chip": "Semiconductors",
    "glp-1": "Healthcare & GLP-1", "obesity": "Healthcare & GLP-1",
  };
  for (const [kw, theme] of Object.entries(keywords)) {
    if (lower.includes(kw)) return theme;
  }
  return null;
}

async function answerThemeDossier(question: string): Promise<Omit<CopilotAnswer, "question" | "category">> {
  const theme = extractThemeFromQuestion(question);

  if (!theme) {
    return {
      confidence: 20,
      answer: "I couldn't identify a specific theme in your question. Try: \"Tell me about AI Agents\" or \"Teach me Nuclear Energy\".",
      sources: [],
      details: {},
      recommendedActions: [],
      relatedEntities: [],
    };
  }

  const { getThemeDossier, generateThemeDossier, saveThemeDossier } = await import("./research-dossier-engine");

  let dossier = await getThemeDossier(theme);
  if (!dossier) {
    dossier = await generateThemeDossier(theme);
    await saveThemeDossier(dossier);
  }

  const d = dossier;
  const momentum = d.marketOverview.momentum;
  const arrowMap: Record<string, string> = { Rising: "↑", Stable: "→", Falling: "↓" };

  const answer = [
    `## ${d.theme} ${arrowMap[momentum] ?? "→"}`,
    "",
    `**${d.executiveSummary.whatIsThis}**`,
    "",
    `**Why Now:** ${d.executiveSummary.whyNow}`,
    "",
    `**Why It Matters:** ${d.executiveSummary.whyItMatters}`,
    "",
    d.keyDrivers.length > 0
      ? `**Key Drivers:**\n${d.keyDrivers.slice(0, 4).map(dr => `- ${dr}`).join("\n")}`
      : "",
    "",
    d.publicExposure.length > 0
      ? `**Key Names:** ${d.publicExposure.filter(e => e.category === "pure_play").map(e => e.ticker).slice(0, 5).join(", ") || d.publicExposure.slice(0, 5).map(e => e.ticker).join(", ")}`
      : "",
    "",
    `**Bull Case:** ${d.scenarios.bull.split(";")[0]}`,
    "",
    `**Portfolio Gap:** Current ${d.portfolioRelevance.currentExposurePct.toFixed(1)}% → Target ${d.portfolioRelevance.recommendedExposurePct.toFixed(1)}% (${d.portfolioRelevance.gap > 0 ? "+" : ""}${d.portfolioRelevance.gap.toFixed(1)}%)`,
    "",
    d.privateExposure.length > 0
      ? `**Private Market:** ${d.privateExposure.map(p => p.company).slice(0, 3).join(", ")}`
      : "",
  ].filter(line => line !== "").join("\n");

  return {
    confidence: Math.min(90, 40 + d.completenessScore * 0.5),
    answer,
    sources: d.evidenceSources,
    details: {
      theme:             d.theme,
      completenessScore: d.completenessScore,
      maturity:          d.marketOverview.maturity,
      momentum:          d.marketOverview.momentum,
      portfolioGap:      d.portfolioRelevance.gap,
      dossierUrl:        `/research-dossier/${encodeURIComponent(d.theme)}`,
    },
    recommendedActions: [
      ...d.publicExposure
        .filter(e => e.category === "pure_play" && !e.inPortfolio)
        .slice(0, 2)
        .map(e => ({
          category: "WATCH" as const,
          ticker: e.ticker,
          title: `Research ${e.ticker} — ${d.theme} pure play`,
          reason: `${d.theme}: Target ${d.portfolioRelevance.recommendedExposurePct}% vs current ${d.portfolioRelevance.currentExposurePct.toFixed(1)}%`,
          confidence: Math.round(d.marketOverview.themeScore),
        })),
    ],
    relatedEntities: [
      { type: "theme" as const, id: d.theme.toLowerCase().replace(/\s+/g, "-"), label: d.theme },
    ],
  };
}

// ─── Catalyst answer ──────────────────────────────────────────────────────────

async function answerCatalyst(): Promise<Omit<CopilotAnswer, "question" | "category">> {
  const { getCatalystCalendar } = await import("./catalyst-engine");
  const events = await getCatalystCalendar(90).catch(() => []);

  const upcoming = events.filter(e => e.daysAway >= -7);
  if (upcoming.length === 0) {
    return {
      confidence: 50,
      answer: "No upcoming catalyst events found. Add earnings history via the Catalyst page to populate the calendar.",
      sources: ["Catalyst Engine"],
      details: { events: [] },
      recommendedActions: [],
      relatedEntities: [],
    };
  }

  const lines: string[] = [`${upcoming.length} catalyst event${upcoming.length !== 1 ? "s" : ""} in the next 90 days`];
  lines.push("\nUpcoming Earnings");
  for (const e of upcoming.slice(0, 6)) {
    const dayLabel = e.daysAway === 0 ? "today"
      : e.daysAway === 1 ? "tomorrow"
      : e.daysAway < 0 ? `${Math.abs(e.daysAway)}d ago`
      : `in ${e.daysAway}d`;
    lines.push(`${e.ticker} — ${e.title} (${dayLabel}, Impact: ${e.impactRating}${e.isEstimated ? ", est." : ""})`);
  }

  const highImpact = upcoming.filter(e => e.impactRating === "H" && e.daysAway >= 0);
  if (highImpact.length > 0) {
    lines.push(`\nHigh-impact events: ${highImpact.map(e => e.ticker).join(", ")}`);
  }

  return {
    confidence: 75,
    answer: lines.join("\n"),
    sources: ["Catalyst Engine", "Earnings Database"],
    details: { count: upcoming.length, events: upcoming.slice(0, 6) },
    recommendedActions: highImpact.slice(0, 2).map(e => ({
      category: "WATCH" as const,
      ticker: e.ticker,
      title: `Monitor ${e.ticker} earnings`,
      reason: `${e.title} — high impact position`,
      confidence: 70,
    })),
    relatedEntities: upcoming.slice(0, 4).map(e => ({
      type: "company" as const,
      id: e.ticker,
      label: e.ticker,
    })),
  };
}

// ─── Company Scout answer ────────────────────────────────────────────────────

async function answerCompanyScout(): Promise<Omit<CopilotAnswer, "question" | "category">> {
  const { scanCompanies, rankCompanies } = await import("./company-scout-engine");
  const candidates = await scanCompanies().catch(() => []);
  const ranked     = rankCompanies(candidates);

  if (ranked.length === 0) {
    return {
      confidence: 35,
      answer: "Company Scout has no data yet. Run the ticker extraction and discovery intelligence jobs first, then trigger a scout run via POST /api/company-scout.",
      sources: ["Company Scout"],
      details: {},
      recommendedActions: [],
      relatedEntities: [],
    };
  }

  const topNew     = ranked.filter(c => !c.isOwned && !c.inWatchlist).slice(0, 6);
  const hiddenGems = ranked.filter(c => c.scoutCategory === "Hidden Gem").slice(0, 3);
  const emerging   = ranked.filter(c => c.scoutCategory === "Emerging").slice(0, 3);
  const consensus  = ranked.filter(c => c.scoutCategory === "Consensus").slice(0, 3);

  const ownedCount = ranked.filter(c => c.isOwned).length;
  const newCount   = ranked.filter(c => !c.isOwned && !c.inWatchlist).length;

  const lines: string[] = [
    `Scout Coverage: ${ranked.length} companies tracked — ${newCount} outside portfolio`,
  ];

  if (topNew.length > 0) {
    lines.push("\nTop New Opportunities (not in portfolio)");
    for (const c of topNew.slice(0, 5)) {
      const trend = c.trend === "Rising" ? "↑" : c.trend === "Falling" ? "↓" : "→";
      lines.push(`${c.ticker} — Scout ${c.scoutScore}/100 ${trend} | ${c.mentionCount30d} mentions, ${c.sourceDiversity} source${c.sourceDiversity !== 1 ? "s" : ""} | ${c.scoutCategory}`);
    }
  }

  if (hiddenGems.length > 0) {
    lines.push("\nHidden Gems");
    for (const c of hiddenGems) {
      lines.push(`${c.ticker} — ${c.scoutScore}/100 | quality attention before mass coverage`);
    }
  }

  if (emerging.length > 0) {
    lines.push("\nEmerging");
    for (const c of emerging) {
      lines.push(`${c.ticker} — ${c.scoutScore}/100 | new discovery, score ${c.discoveryScore}`);
    }
  }

  if (consensus.length > 0) {
    lines.push("\nCross-Source Consensus");
    for (const c of consensus) {
      lines.push(`${c.ticker} — ${c.scoutScore}/100 | ${c.sourceDiversity} source types agree`);
    }
  }

  const confidence = clamp(55 + newCount * 3, 55, 85);
  const actionCandidates = topNew.filter(c => c.scoutScore >= 55).slice(0, 2);

  return {
    confidence,
    answer: lines.join("\n"),
    sources: ["Company Scout", "Discovery Intelligence", "Ticker Extraction"],
    details: {
      totalTracked: ranked.length,
      ownedCount,
      newCount,
      topNew:     topNew.slice(0, 5).map(c => ({ ticker: c.ticker, scoutScore: c.scoutScore, category: c.scoutCategory, trend: c.trend })),
      hiddenGems: hiddenGems.map(c => ({ ticker: c.ticker, scoutScore: c.scoutScore })),
    },
    recommendedActions: actionCandidates.map(c => ({
      category: "WATCH" as const,
      ticker:   c.ticker,
      title:    `Research ${c.ticker} — ${c.scoutCategory}`,
      reason:   `Scout score ${c.scoutScore}/100 | ${c.mentionCount30d} mentions across ${c.sourceDiversity} source type${c.sourceDiversity !== 1 ? "s" : ""}`,
      confidence: clamp(c.scoutScore, 50, 80),
    })),
    relatedEntities: topNew.slice(0, 4).map(c => ({
      type:  "company" as const,
      id:    c.ticker,
      label: c.ticker,
    })),
  };
}

// ─── Mention Intelligence answer ─────────────────────────────────────────────

async function answerMentionIntel(): Promise<Omit<CopilotAnswer, "question" | "category">> {
  const { getDiscoveryLeaderboard } = await import("./discovery-intelligence-engine");
  const board = await getDiscoveryLeaderboard().catch(() => null);

  if (!board || board.signals.length === 0) {
    return {
      confidence: 35,
      answer: "No mention intelligence yet. Run the Ticker Extraction job to build the database, then run Discovery Intelligence to score candidates.",
      sources: ["Ticker Extraction"],
      details: {},
      recommendedActions: [],
      relatedEntities: [],
    };
  }

  const top         = board.signals.slice(0, 8);
  const rising      = board.signals.filter(s => s.trend === "Rising").slice(0, 3);
  const crossSource = board.signals.filter(s => s.sourceDiversity >= 2).slice(0, 3);

  const lines: string[] = [
    `${board.totalTickers} companies tracked | ${board.signals.reduce((acc, s) => acc + s.mentionCount30d, 0)} total mentions (30d)`,
  ];

  lines.push("\nTop by Discovery Score");
  for (const s of top.slice(0, 5)) {
    const trend = s.trend === "Rising" ? "↑" : s.trend === "Falling" ? "↓" : "→";
    lines.push(`${s.ticker} — ${s.discoveryScore}/100 ${trend} (${s.mentionCount30d} mentions, ${s.sourceDiversity} source${s.sourceDiversity !== 1 ? "s" : ""})`);
  }

  if (rising.length > 0) {
    lines.push("\nFastest Rising");
    for (const s of rising) {
      lines.push(`${s.ticker} — ${s.mentionCount7d} in 7d vs ${s.mentionCount30d} in 30d`);
    }
  }

  if (crossSource.length > 0) {
    lines.push("\nCross-Source Consensus");
    for (const s of crossSource) {
      lines.push(`${s.ticker} — ${s.sourceDiversity} source types: ${Object.keys(s.sourceBreakdown).join(", ")}`);
    }
  }

  const confidence = clamp(55 + board.signals.length * 2, 55, 85);

  return {
    confidence,
    answer: lines.join("\n"),
    sources: ["Ticker Extraction", "Discovery Intelligence"],
    details: {
      totalTickers:      board.totalTickers,
      risingCount:       board.risingCount,
      crossSourceCount:  board.crossSourceCount,
      autoPromotedCount: board.autoPromotedCount,
      leaderboard: top.slice(0, 5).map(s => ({
        ticker:         s.ticker,
        discoveryScore: s.discoveryScore,
        trend:          s.trend,
        mentions30d:    s.mentionCount30d,
      })),
    },
    recommendedActions: top
      .filter(s => !s.isOwned && s.discoveryScore >= 60)
      .slice(0, 2)
      .map(s => ({
        category: "WATCH" as const,
        ticker:   s.ticker,
        title:    `Research ${s.ticker}`,
        reason:   `${s.trend} mention momentum — ${s.sourceDiversity} source type${s.sourceDiversity !== 1 ? "s" : ""}`,
        confidence: clamp(s.discoveryScore, 50, 80),
      })),
    relatedEntities: top.slice(0, 4).map(s => ({
      type:  "company" as const,
      id:    s.ticker,
      label: s.ticker,
    })),
  };
}

// ─── Private Scout answer ─────────────────────────────────────────────────────

async function answerPrivateScout(question: string): Promise<Omit<CopilotAnswer, "question" | "category">> {
  const { getPrivateScoutReport } = await import("./private-scout-engine");
  const report = await getPrivateScoutReport();

  if (!report) {
    return {
      confidence: 30,
      answer: "Private Scout has not run yet. Trigger a scan via POST /api/private-scout or run the nightly scheduler.",
      sources: [],
      details: {},
      recommendedActions: [],
      relatedEntities: [],
    };
  }

  const q = question.toLowerCase();
  const wantBeneficiaries = /benefit|public (stocks?|companies?)|if i (can|cannot)|comp.?for/i.test(q);

  // Try to extract a specific private company name from the question
  const mentionedCompany = report.topCandidates.find(c =>
    q.includes(c.companyName.toLowerCase())
  );

  const lines: string[] = [];

  if (mentionedCompany) {
    // Specific company query
    lines.push(`## ${mentionedCompany.companyName}`);
    lines.push(`Sector: ${mentionedCompany.sector} · Stage: ${mentionedCompany.stage} · Score: ${mentionedCompany.discoveryScore}/100`);
    if (mentionedCompany.estimatedRevenue) lines.push(`Revenue: ${mentionedCompany.estimatedRevenue}`);
    if (mentionedCompany.backers.length > 0) lines.push(`Backers: ${mentionedCompany.backers.slice(0, 4).join(", ")}`);
    if (mentionedCompany.themeLinks.length > 0) lines.push(`Themes: ${mentionedCompany.themeLinks.join(", ")}`);

    if (mentionedCompany.publicBeneficiaries.length > 0) {
      lines.push(`\n**Public Market Beneficiaries (COMP_FOR)**`);
      for (const b of mentionedCompany.publicBeneficiaries) {
        lines.push(`• **${b.ticker}** (${b.confidence}%) — ${b.rationale}`);
      }
    }
  } else if (wantBeneficiaries) {
    // Public beneficiary focus
    lines.push(`**Top Public Market Beneficiaries from Private Company Activity**\n`);
    for (const b of report.topPublicBeneficiaries.slice(0, 8)) {
      lines.push(`**${b.ticker}** — exposed to ${b.linkedCompanies.slice(0, 3).join(", ")} (${b.exposureCount} private link${b.exposureCount !== 1 ? "s" : ""})`);
    }
    lines.push(`\n*You cannot buy these private companies directly, but these public stocks benefit from their growth.*`);
  } else {
    // General private market overview
    lines.push(`**${report.totalScanned} private companies tracked · Private Market Scout**\n`);
    lines.push(`**Top Private Companies Shaping the Future**\n`);
    for (const c of report.topCandidates.slice(0, 6)) {
      const publicSide = c.publicBeneficiaries.slice(0, 2).map(b => b.ticker).join(", ");
      lines.push(`**${c.companyName}** — Score ${c.discoveryScore}/100 | ${c.sector} | ${c.stage}` +
        (publicSide ? ` → **${publicSide}**` : "")
      );
    }

    if (report.topPublicBeneficiaries.length > 0) {
      lines.push(`\n**If you cannot buy them, buy these:**`);
      for (const b of report.topPublicBeneficiaries.slice(0, 5)) {
        lines.push(`${b.ticker} — ${b.exposureCount} private link${b.exposureCount !== 1 ? "s" : ""} (${b.linkedCompanies.slice(0, 2).join(", ")})`);
      }
    }
  }

  const confidence = clamp(55 + report.totalScanned * 2, 60, 85);

  const top3 = report.topCandidates.slice(0, 3);
  const topBeneficiaryTickers = report.topPublicBeneficiaries.slice(0, 3).map(b => b.ticker);

  return {
    confidence,
    answer: lines.join("\n"),
    sources: ["Private Scout", "Hacker News", "VC Blogs", "Theme Scout"],
    details: {
      totalScanned:     report.totalScanned,
      topCandidates:    top3.map(c => ({ company: c.companyName, score: c.discoveryScore, sector: c.sector })),
      topBeneficiaries: report.topPublicBeneficiaries.slice(0, 5),
      mentionedCompany: mentionedCompany?.companyName ?? null,
    },
    recommendedActions: topBeneficiaryTickers.map(ticker => ({
      category: "WATCH" as const,
      ticker,
      title: `Research ${ticker} — Private Market Exposure`,
      reason: `${ticker} benefits from ${report.topPublicBeneficiaries.find(b => b.ticker === ticker)?.linkedCompanies.slice(0, 2).join(", ") ?? "private company activity"}`,
      confidence: clamp(60 + report.topCandidates[0]?.discoveryScore * 0.2, 55, 82),
    })),
    relatedEntities: [
      ...top3.map(c => ({ type: "company" as const, id: c.companyName, label: c.companyName })),
      ...topBeneficiaryTickers.map(t => ({ type: "company" as const, id: t, label: t })),
    ],
  };
}

// ─── Macro Ripple answer ─────────────────────────────────────────────────────

async function answerMacroRipple(question: string): Promise<Omit<CopilotAnswer, "question" | "category">> {
  const { runRippleAnalysis } = await import("./ripple-engine");

  const q = question.toLowerCase();

  const SCENARIO_KEYWORDS: Record<string, string[]> = {
    fed_hike_50:             ["fed hike", "rate hike", "hikes", "raises rates", "tightening"],
    fed_cut_50:              ["fed cut", "rate cut", "cuts rates", "lowers rates", "easing", "dovish"],
    recession_confirmed:     ["recession", "gdp negative", "contraction", "crash"],
    inflation_resurgence:    ["inflation", "cpi", "price spike", "inflationary", "resurge"],
    ai_acceleration:         ["ai breakthrough", "ai acceleration", "gpt", "ai wave", "ai leap"],
    china_taiwan_escalation: ["china", "taiwan", "escalation", "conflict"],
    oil_surge_30pct:         ["oil surge", "oil spike", "crude", "oil price"],
    vix_spike_30:            ["vix", "market panic", "volatility spike", "panic"],
    soft_landing:            ["soft landing", "goldilocks", "no recession", "disinflation"],
    stagflation:             ["stagflation", "slow growth inflation", "stagnation"],
    tech_regulation_shock:   ["antitrust", "big tech regulation", "tech ruling"],
    nato_defense_surge:      ["nato", "defense spending", "military spending", "defense budget"],
  };

  let matchedId = "fed_hike_50";
  let bestScore = 0;
  for (const [id, keywords] of Object.entries(SCENARIO_KEYWORDS)) {
    const score = keywords.filter(kw => q.includes(kw)).length;
    if (score > bestScore) { bestScore = score; matchedId = id; }
  }

  const analysis = await runRippleAnalysis(matchedId);
  if (!analysis) {
    return {
      confidence: 40,
      answer: "Macro Ripple Analyzer could not run. Ensure portfolio holdings are set up.",
      sources: ["Macro Ripple Engine"],
      details: {},
      recommendedActions: [],
      relatedEntities: [],
    };
  }

  const lines: string[] = [
    `**Macro Ripple: ${analysis.scenario.name}**`,
    analysis.scenario.description,
    `\nRegime: **${analysis.regime.name}** (${analysis.regime.strength}% strength)`,
    analysis.regime.description,
  ];

  if (analysis.themeRipples.length > 0) {
    lines.push(`\n**Theme Impact**`);
    for (const t of analysis.themeRipples.slice(0, 6)) {
      const arrow = t.direction === "positive" ? "↑" : t.direction === "negative" ? "↓" : "→";
      lines.push(`${arrow} ${t.themeName}: ${t.totalImpact > 0 ? "+" : ""}${t.totalImpact}`);
    }
  }

  const { topWinners, topLosers, verdict, pctPortfolioPositive, pctPortfolioNegative, weightedImpactScore } = analysis.summary;
  if (topWinners.length > 0) {
    lines.push(`\n**Portfolio Winners:** ${topWinners.map(h => `${h.ticker} (+${h.impactScore})`).join(", ")}`);
  }
  if (topLosers.length > 0) {
    lines.push(`**Portfolio Losers:** ${topLosers.map(h => `${h.ticker} (${h.impactScore})`).join(", ")}`);
  }
  lines.push(`\n**Summary:** ${verdict}`);
  lines.push(`${pctPortfolioPositive}% helped · ${pctPortfolioNegative}% hurt · Score: ${weightedImpactScore >= 0 ? "+" : ""}${weightedImpactScore}`);
  if (analysis.scenario.historicalPrecedent) {
    lines.push(`\n*Historical reference: ${analysis.scenario.historicalPrecedent}*`);
  }

  return {
    confidence: 72,
    answer: lines.join("\n"),
    sources: ["Macro Ripple Engine", "Theme Regime Model", "Portfolio Holdings"],
    details: {
      scenarioId:          analysis.scenario.id,
      scenarioName:        analysis.scenario.name,
      regime:              analysis.regime.name,
      regimeStrength:      analysis.regime.strength,
      weightedImpactScore,
      themeRipples:        analysis.themeRipples.slice(0, 6),
      topWinners,
      topLosers,
    },
    recommendedActions: topLosers.slice(0, 2).map(h => ({
      category:   "WATCH" as const,
      ticker:     h.ticker,
      title:      `Monitor ${h.ticker} under ${analysis.scenario.name}`,
      reason:     `${h.themeName} theme: impact ${h.impactScore} in this scenario`,
      confidence: 62,
    })),
    relatedEntities: [
      { type: "regime" as const, id: analysis.regime.name, label: analysis.regime.name },
      ...topWinners.slice(0, 2).map(h => ({ type: "company" as const, id: h.ticker, label: h.ticker })),
      ...topLosers.slice(0, 2).map(h => ({ type: "company" as const, id: h.ticker, label: h.ticker })),
    ],
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
    case "catalyst":
      partial = await answerCatalyst();
      break;
    case "company_scout":
      partial = await answerCompanyScout();
      break;
    case "mention_intel":
      partial = await answerMentionIntel();
      break;
    case "theme_scout":
      partial = await answerThemeScout(question);
      break;
    case "theme_dossier":
      partial = await answerThemeDossier(question);
      break;
    case "private_scout":
      partial = await answerPrivateScout(question);
      break;
    case "macro_ripple":
      partial = await answerMacroRipple(question);
      break;
    case "macro":
    default:
      partial = await answerMacro();
      break;
  }

  return { question, category, ...partial };
}
