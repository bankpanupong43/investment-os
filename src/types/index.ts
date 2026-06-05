// ─── String Literal Types ───────────────────────────────────────────────────

export type PositionStatus = "active" | "closed" | "trimmed";
export type AssetClass = "equity" | "etf" | "bond" | "crypto" | "reit" | "commodity";
export type ThesisHealth = "intact" | "weakening" | "broken" | "monitoring";
export type UpdateType = "confirmation" | "weakening" | "neutral" | "breaking";
export type TriggeredBy = "earnings" | "news" | "manual" | "macro" | "price_action";
export type KillConditionType = "quantitative" | "qualitative";
export type KillConditionStatus = "active" | "triggered" | "dismissed";
export type Operator = "lt" | "gt" | "eq" | "lte" | "gte" | "drops_below";
export type RecommendationAction = "hold" | "add" | "reduce" | "sell" | "watch";
export type RecommendationStatus = "pending" | "acknowledged" | "acted" | "dismissed";
export type Urgency = "low" | "medium" | "high" | "critical";
export type JournalEntryType =
  | "buy_rationale"
  | "thesis_update"
  | "decision"
  | "observation"
  | "earnings_note"
  | "macro"
  | "evaluation";
export type Sentiment = "positive" | "negative" | "neutral";
export type ThesisRelevance = "high" | "medium" | "low" | "none";
export type ThesisImpact = "positive" | "negative" | "neutral" | "n/a";
export type BriefType = "morning" | "weekly";

// ─── Thesis Component Types (stored as JSON in DB) ───────────────────────────

/** A single key assumption the thesis depends on. */
export interface ThesisKeyAssumption {
  id: string;           // stable slug: "azure-growth-moat"
  text: string;         // full text of the assumption
  category: string;     // "competitive_moat" | "market_dynamics" | "management" | "financials" | "regulatory" | "macro"
  importance: "critical" | "important" | "supporting"; // how central to the thesis
  measurable: boolean;  // can this be checked against data?
  metric?: string;      // what metric tracks this (e.g. "azure_yoy_growth_pct")
}

/** An expected outcome the thesis predicts within a timeframe. */
export interface ExpectedOutcome {
  id: string;           // stable slug
  description: string;  // what you expect to happen
  timeframe: string;    // "12 months" | "2-3 years" | "5 years"
  targetDate?: string;  // ISO date if specific
  measurable: boolean;
  metric?: string;      // what metric tracks this
  target?: string;      // "Azure >35% annual growth" or "$500B market cap"
  importance: "primary" | "secondary";
}

/** A known risk that could invalidate or damage the thesis. */
export interface ThesisRisk {
  id: string;           // stable slug
  description: string;  // what the risk is
  category: string;     // "competitive" | "regulatory" | "execution" | "macro" | "valuation" | "technological"
  severity: "low" | "medium" | "high" | "critical"; // impact if materialized
  probability: "low" | "medium" | "high";           // likelihood
  mitigation: string;   // why you think this risk won't materialize, or how you'd respond
  monitoredBy?: string; // what signal would tell you this risk is materializing
}

// ─── Evaluation Assessment Types (stored as JSON in ThesisEvaluation) ────────

/** AI assessment of a single key assumption. */
export interface AssumptionAssessment {
  assumptionId: string;
  assumptionText: string;
  status: "confirmed" | "holding" | "at_risk" | "violated";
  score: number;        // 0-10: 10 = confirmed with strong evidence
  evidence: string;     // specific facts supporting this assessment
  trend: "improving" | "stable" | "deteriorating";
  lastUpdated: string;  // ISO date
}

/** AI assessment of a single expected outcome. */
export interface OutcomeAssessment {
  outcomeId: string;
  outcomeText: string;
  status: "on_track" | "ahead" | "behind" | "missed" | "pending" | "exceeded";
  score: number;        // 0-10: 10 = exceeded or on track
  evidence: string;     // specific facts supporting this assessment
  progressNote: string; // how far along vs expectation
  lastUpdated: string;
}

/** AI assessment of a single risk. */
export interface RiskAssessment {
  riskId: string;
  riskText: string;
  status: "not_materialized" | "monitoring" | "partially_materialized" | "materialized";
  score: number;        // 0-10: 10 = not materialized, 0 = fully materialized
  evidence: string;     // specific facts supporting this assessment
  severity: "low" | "medium" | "high" | "critical"; // current (may change from original)
  lastUpdated: string;
}

// ─── Scoring Model ────────────────────────────────────────────────────────────

export interface ThesisScoreBreakdown {
  assumptionsScore: number;  // avg of AssumptionAssessment.score — weight 35%
  outcomesScore: number;     // avg of OutcomeAssessment.score    — weight 30%
  riskScore: number;         // avg of RiskAssessment.score       — weight 20%
  integrityScore: number;    // AI holistic judgment              — weight 15%
  overallScore: number;      // weighted composite 0-10
}

/**
 * Score interpretation:
 * 8-10  Thesis intact and strengthening — hold or add
 * 6-7   Thesis intact with minor concerns — hold, monitor closely
 * 4-5   Thesis weakening — review kill conditions, consider reducing
 * 2-3   Thesis significantly impaired — likely reduce or sell
 * 0-1   Thesis broken — sell
 */
export const SCORE_THRESHOLDS = {
  STRONG: 8,
  INTACT: 6,
  WEAKENING: 4,
  IMPAIRED: 2,
} as const;

export function calculateThesisScore(params: {
  assummentAssessments: AssumptionAssessment[];
  outcomeAssessments: OutcomeAssessment[];
  riskAssessments: RiskAssessment[];
  integrityScore: number;
}): ThesisScoreBreakdown {
  const avg = (scores: number[]) =>
    scores.length === 0 ? 5 : scores.reduce((a, b) => a + b, 0) / scores.length;

  const assumptionsScore = avg(params.assummentAssessments.map((a) => a.score));
  const outcomesScore = avg(params.outcomeAssessments.map((o) => o.score));
  const riskScore = avg(params.riskAssessments.map((r) => r.score));

  const overallScore =
    assumptionsScore * 0.35 +
    outcomesScore * 0.30 +
    riskScore * 0.20 +
    params.integrityScore * 0.15;

  return {
    assumptionsScore: Math.round(assumptionsScore * 10) / 10,
    outcomesScore: Math.round(outcomesScore * 10) / 10,
    riskScore: Math.round(riskScore * 10) / 10,
    integrityScore: Math.round(params.integrityScore * 10) / 10,
    overallScore: Math.round(overallScore * 10) / 10,
  };
}

export function scoreToHealthStatus(score: number): ThesisHealth {
  if (score >= SCORE_THRESHOLDS.INTACT) return "intact";
  if (score >= SCORE_THRESHOLDS.WEAKENING) return "weakening";
  if (score >= SCORE_THRESHOLDS.IMPAIRED) return "broken";
  return "broken";
}

export function scoreToRecommendation(score: number): RecommendationAction {
  if (score >= SCORE_THRESHOLDS.STRONG) return "hold";
  if (score >= SCORE_THRESHOLDS.INTACT) return "watch";
  if (score >= SCORE_THRESHOLDS.WEAKENING) return "reduce";
  return "sell";
}

// ─── Domain Types (mirrors Prisma models with parsed JSON fields) ────────────

export interface Position {
  id: string;
  ticker: string;
  name: string;
  sector: string | null;
  industry: string | null;
  assetClass: AssetClass;
  shares: number;
  avgCost: number;
  entryDate: Date;
  status: PositionStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  thesis?: Thesis;
  killConditions?: KillCondition[];
  journalEntries?: JournalEntry[];
  recommendations?: Recommendation[];
}

export interface Thesis {
  id: string;
  positionId: string;
  version: number;
  originalThesis: string;
  currentAssessment: string | null;
  keyAssumptions: ThesisKeyAssumption[];
  expectedOutcomes: ExpectedOutcome[];
  risks: ThesisRisk[];
  holdingPeriod: string | null;
  holdingPeriodMonths: number | null;
  entryConfidence: number;
  healthStatus: ThesisHealth;
  healthScore: number;
  lastReviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  updates?: ThesisUpdate[];
  versions?: ThesisVersion[];
  evaluations?: ThesisEvaluation[];
}

export interface ThesisVersion {
  id: string;
  thesisId: string;
  version: number;
  thesisText: string;
  keyAssumptions: ThesisKeyAssumption[];
  expectedOutcomes: ExpectedOutcome[];
  risks: ThesisRisk[];
  holdingPeriod: string | null;
  entryConfidence: number;
  revisionReason: string;
  revisedBy: string;
  createdAt: Date;
}

export interface ThesisUpdate {
  id: string;
  thesisId: string;
  updateType: UpdateType;
  content: string;
  triggeredBy: TriggeredBy | null;
  sourceUrl: string | null;
  createdAt: Date;
}

export interface ThesisEvaluation {
  id: string;
  thesisId: string;
  positionId: string;
  assumptionsScore: number;
  outcomesScore: number;
  riskScore: number;
  integrityScore: number;
  overallScore: number;
  assumptionAssessments: AssumptionAssessment[];
  outcomeAssessments: OutcomeAssessment[];
  riskAssessments: RiskAssessment[];
  strengths: string;
  concerns: string;
  scoreRationale: string;
  recommendation: RecommendationAction;
  recommendationReason: string;
  thesisReference: string;
  evaluatedBy: string;
  modelUsed: string | null;
  createdAt: Date;
}

export interface KillCondition {
  id: string;
  positionId: string;
  conditionType: KillConditionType;
  description: string;
  metric: string | null;
  operator: Operator | null;
  threshold: number | null;
  status: KillConditionStatus;
  triggeredAt: Date | null;
  triggeredNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface JournalEntry {
  id: string;
  positionId: string | null;
  entryType: JournalEntryType;
  content: string;
  createdAt: Date;
}

export interface Recommendation {
  id: string;
  positionId: string;
  action: RecommendationAction;
  reasoning: string;
  thesisReference: string;
  killConditionId: string | null;
  evaluationId: string | null;
  confidence: number | null;
  urgency: Urgency;
  status: RecommendationStatus;
  acknowledgedAt: Date | null;
  createdAt: Date;
  position?: Pick<Position, "ticker" | "name">;
  killCondition?: KillCondition;
}

export interface NewsItem {
  id: string;
  positionId: string | null;
  ticker: string;
  headline: string;
  content: string | null;
  source: string | null;
  url: string | null;
  sentiment: Sentiment | null;
  thesisRelevance: ThesisRelevance | null;
  relevanceReasoning: string | null;
  publishedAt: Date | null;
  fetchedAt: Date;
}

export interface ThesisAssumptionResult {
  assumption: string;
  result: "met" | "missed" | "n/a";
}

export interface KillConditionCheckResult {
  conditionId: string;
  triggered: boolean;
}

export interface EarningsEvent {
  id: string;
  positionId: string | null;
  ticker: string;
  fiscalPeriod: string | null;
  reportDate: Date | null;
  epsActual: number | null;
  epsEstimate: number | null;
  revenueActual: number | null;
  revenueEstimate: number | null;
  guidanceSummary: string | null;
  thesisImpact: ThesisImpact | null;
  thesisAssumptionsHit: ThesisAssumptionResult[];
  killConditionsChecked: KillConditionCheckResult[];
  createdAt: Date;
}

export interface Watchlist {
  id: string;
  ticker: string;
  name: string | null;
  interestReason: string;
  draftThesis: string | null;
  targetEntryPrice: number | null;
  addedAt: Date;
}

export interface Brief {
  id: string;
  briefType: BriefType;
  content: string;
  deliveredAt: Date | null;
  createdAt: Date;
}

// ─── API Request/Response Types ──────────────────────────────────────────────

export interface CreatePositionInput {
  ticker: string;
  name: string;
  sector?: string;
  industry?: string;
  assetClass?: AssetClass;
  shares: number;
  avgCost: number;
  entryDate: string;
  notes?: string;
  thesis: {
    originalThesis: string;
    keyAssumptions?: ThesisKeyAssumption[];
    expectedOutcomes?: ExpectedOutcome[];
    risks?: ThesisRisk[];
    holdingPeriod?: string;
    holdingPeriodMonths?: number;
    entryConfidence?: number;
  };
  killConditions: Array<{
    conditionType: KillConditionType;
    description: string;
    metric?: string;
    operator?: Operator;
    threshold?: number;
  }>;
}

export interface CreateRecommendationInput {
  positionId: string;
  action: RecommendationAction;
  reasoning: string;
  thesisReference: string;
  killConditionId?: string;
  evaluationId?: string;
  confidence?: number;
  urgency?: Urgency;
}

export interface RunAgentInput {
  agentType:
    | "thesis-monitor"
    | "thesis-evaluator"
    | "kill-condition-checker"
    | "news-analyst"
    | "earnings-analyst"
    | "morning-brief"
    | "weekly-review";
  positionId?: string;
  ticker?: string;
  additionalContext?: string;
}

export interface AgentRunResult {
  success: boolean;
  output: string;
  toolCallCount: number;
  agentType: string;
  error?: string;
}

// ─── Portfolio Summary ────────────────────────────────────────────────────────

export interface PortfolioSummary {
  totalPositions: number;
  activePositions: number;
  thesisHealthBreakdown: Record<ThesisHealth, number>;
  pendingRecommendations: number;
  criticalRecommendations: number;
  triggeredKillConditions: number;
  averageThesisScore: number;
  lastEvaluationAt: Date | null;
}
