import type { RecommendationAction, Urgency, ThesisScoreBreakdown } from "./index";

// ─── Session ─────────────────────────────────────────────────────────────────

export type TriggerType =
  | "morning_review"
  | "earnings_event"
  | "news_event"
  | "weekly_review"
  | "manual"
  | "idea_generation";

export type AgentRole =
  | "portfolio_manager"
  | "thesis_analyst"
  | "news_analyst"
  | "earnings_analyst"
  | "risk_manager"
  | "idea_generator";

export interface TeamSessionInput {
  triggerType: TriggerType;
  triggerNote?: string;
  tickers?: string[];         // which positions to focus on; empty = full portfolio
  earningsData?: Record<string, EarningsInput>; // ticker → raw earnings, for earnings_event sessions
  newsItems?: RawNewsItem[];   // pre-fetched news items
}

export interface RawNewsItem {
  ticker: string;
  headline: string;
  content?: string;
  source?: string;
  url?: string;
  publishedAt?: string;
}

export interface EarningsInput {
  fiscalPeriod: string;
  reportDate: string;
  epsActual?: number;
  epsEstimate?: number;
  revenueActual?: number;
  revenueEstimate?: number;
  guidanceSummary?: string;
}

// ─── Thesis Analyst ───────────────────────────────────────────────────────────

export interface ThesisAnalystInput {
  sessionId: string;
  ticker: string;
  focusArea?: string; // e.g. "assess after Q3 earnings" — optional context from PM
}

export interface ThesisAnalystReport {
  ticker: string;
  thesisVersion: number;
  scoreBreakdown: ThesisScoreBreakdown;
  assumptionFindings: AssumptionFinding[];
  outcomeFindngs: OutcomeFinding[];
  riskFindings: RiskFinding[];
  keyInsight: string;         // single most important finding in plain English
  recommendation: RecommendationAction;
  confidence: number;         // 0-10
  needsRevision: boolean;     // should the PM request a thesis revision?
  revisionNote?: string;      // if needsRevision, what specifically changed
}

export interface AssumptionFinding {
  assumptionId: string;
  assumptionText: string;
  status: "confirmed" | "holding" | "at_risk" | "violated";
  evidence: string;           // specific facts, not opinion
  score: number;              // 0-10
  trend: "improving" | "stable" | "deteriorating";
}

export interface OutcomeFinding {
  outcomeId: string;
  outcomeText: string;
  status: "on_track" | "ahead" | "behind" | "missed" | "pending" | "exceeded";
  evidence: string;
  score: number;
}

export interface RiskFinding {
  riskId: string;
  riskText: string;
  status: "not_materialized" | "monitoring" | "partially_materialized" | "materialized";
  evidence: string;
  score: number;              // 0-10, inverted: 10 = not materialized
  severityChange?: "elevated" | "reduced" | "unchanged";
}

// ─── News Analyst ─────────────────────────────────────────────────────────────

export interface NewsAnalystInput {
  sessionId: string;
  tickers: string[];
  newsItems: RawNewsItem[];   // raw items to analyze
  focusArea?: string;         // context from PM
}

export interface NewsAnalystReport {
  coverage: TickerNewsSummary[];
  macroSignals: string[];     // macro themes with portfolio implications
  urgentItems: string[];      // items needing immediate attention
  noNewsPositions: string[];  // tickers with no relevant news (all clear)
}

export interface TickerNewsSummary {
  ticker: string;
  itemsAnalyzed: number;
  highRelevanceCount: number;
  topHeadlines: string[];     // top 3, thesis-relevant only
  thesisImpact: "strengthens" | "neutral" | "weakens" | "breaks";
  impactSummary: string;      // 1-2 sentences: HOW does this affect the thesis?
  requiresAttention: boolean;
}

// ─── Earnings Analyst ─────────────────────────────────────────────────────────

export interface EarningsAnalystInput {
  sessionId: string;
  ticker: string;
  earningsData: EarningsInput;
  focusArea?: string;
}

export interface EarningsAnalystReport {
  ticker: string;
  fiscalPeriod: string;
  keyMetrics: Record<string, string>; // {"azure_yoy_growth": "29%", "eps_beat_pct": "+12%"}
  assumptionChecks: AssumptionCheck[];
  killConditionChecks: KillConditionCheck[];
  thesisImpact: "positive" | "negative" | "neutral";
  guidanceImplication: string;        // what guidance means for the thesis
  overallAssessment: string;          // 2-3 sentences
  urgency: "none" | "review" | "action_required";
}

export interface AssumptionCheck {
  assumptionId: string;
  assumptionText: string;
  result: "confirmed" | "neutral" | "contradicted";
  metric?: string;
  actualValue?: string;
  expectedValue?: string;
  detail: string;
}

export interface KillConditionCheck {
  conditionId: string;
  conditionText: string;
  triggered: boolean;
  currentValue?: string;
  threshold?: string;
  detail: string;
}

// ─── Risk Manager ─────────────────────────────────────────────────────────────

export interface RiskManagerInput {
  sessionId: string;
  tickers: string[];          // full portfolio by default
  focusArea?: string;
}

export interface RiskManagerReport {
  portfolioHeatMap: PositionRiskStatus[];
  criticalAlerts: CriticalAlert[];
  portfolioRisks: string[];   // cross-portfolio risks (concentration, correlation, etc.)
  macroRiskFactors: string[]; // macro-level risks relevant to current portfolio
  summary: string;            // overall portfolio risk posture in 2-3 sentences
}

export interface PositionRiskStatus {
  ticker: string;
  overallRisk: "low" | "medium" | "high" | "critical";
  activeKillConditions: number;
  nearTriggerConditions: NearTriggerCondition[];
  primaryRiskFactor: string;  // the single biggest risk right now
  daysHeld: number;
  holdingPeriodStatus: "within_horizon" | "approaching_horizon" | "past_horizon";
}

export interface NearTriggerCondition {
  conditionId: string;
  description: string;
  proximity: "within_5pct" | "within_10pct" | "monitoring"; // how close to threshold
  currentValue?: string;
  threshold?: string;
}

export interface CriticalAlert {
  ticker: string;
  alertType: "kill_condition_triggered" | "kill_condition_near" | "thesis_broken" | "holding_period_exceeded";
  description: string;
  recommendedAction: RecommendationAction;
  urgency: Urgency;
}

// ─── Idea Generator ───────────────────────────────────────────────────────────

export interface IdeaGeneratorInput {
  sessionId: string;
  currentTickers: string[];   // existing portfolio tickers to avoid duplication
  focusArea?: string;         // "find AI infrastructure plays" or "defensive ideas"
}

export interface IdeaGeneratorReport {
  watchlistFindings: WatchlistCandidate[];
  portfolioGaps: string[];    // themes/sectors not represented
  macroThemes: string[];      // investable macro themes right now
  newIdeas: NewIdea[];
  conviction: "high" | "medium" | "low"; // PM: how much to weight this report
}

export interface WatchlistCandidate {
  ticker: string;
  name: string;
  readiness: "ready_to_research" | "needs_more_data" | "not_ready";
  interestLevel: "high" | "medium" | "low";
  draftThesisSummary: string;
  entryRationale: string;
  risks: string[];
  targetEntryPrice?: string;
}

export interface NewIdea {
  ticker: string;
  company: string;
  sector: string;
  rationale: string;          // why this, why now
  thesisHypothesis: string;   // what would need to be true for this to be a great investment
  keyRisks: string[];
  researchPriority: "high" | "medium" | "low";
}

// ─── Portfolio Manager ────────────────────────────────────────────────────────

export interface PortfolioManagerDecision {
  sessionId: string;
  sessionSummary: string;     // 3-4 sentence overview of what happened this session
  decisions: InvestmentDecision[];
  noActionPositions: NoActionPosition[];
  portfolioOutlook: string;   // forward-looking view based on all agent findings
  nextReviewTriggers: string[]; // specific events that should trigger the next session
}

export interface InvestmentDecision {
  ticker: string;
  action: RecommendationAction;
  conviction: number;         // 0-10
  urgency: Urgency;
  reasoning: string;          // full decision narrative
  evidenceChain: EvidenceLink[];
  thesisReference: string;    // REQUIRED: exact quote from original thesis
  dissent?: string;           // if any agent disagreed, acknowledge it here
}

export interface EvidenceLink {
  sourceAgent: AgentRole;
  finding: string;            // specific finding from that agent's briefing
  weight: "primary" | "supporting" | "context";
}

export interface NoActionPosition {
  ticker: string;
  reason: string;             // why no action was taken
  nextTrigger?: string;       // what would change this to an action
}

// ─── Session Result ───────────────────────────────────────────────────────────

export interface TeamSessionResult {
  sessionId: string;
  triggerType: TriggerType;
  status: "complete" | "failed";
  agentOutputs: {
    thesisAnalyst?: ThesisAnalystReport[];
    newsAnalyst?: NewsAnalystReport;
    earningsAnalyst?: EarningsAnalystReport[];
    riskManager?: RiskManagerReport;
    ideaGenerator?: IdeaGeneratorReport;
  };
  pmDecision?: PortfolioManagerDecision;
  recommendationsCreated: number;
  durationMs: number;
  error?: string;
}
