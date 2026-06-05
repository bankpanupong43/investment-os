export const POSITION_STATUS = {
  ACTIVE: "active",
  CLOSED: "closed",
  TRIMMED: "trimmed",
} as const;

export const THESIS_HEALTH = {
  INTACT: "intact",
  WEAKENING: "weakening",
  BROKEN: "broken",
  MONITORING: "monitoring",
} as const;

export const UPDATE_TYPE = {
  CONFIRMATION: "confirmation",
  WEAKENING: "weakening",
  NEUTRAL: "neutral",
  BREAKING: "breaking",
} as const;

export const TRIGGERED_BY = {
  EARNINGS: "earnings",
  NEWS: "news",
  MANUAL: "manual",
  MACRO: "macro",
  PRICE_ACTION: "price_action",
} as const;

export const KILL_CONDITION_TYPE = {
  QUANTITATIVE: "quantitative",
  QUALITATIVE: "qualitative",
} as const;

export const KILL_CONDITION_STATUS = {
  ACTIVE: "active",
  TRIGGERED: "triggered",
  DISMISSED: "dismissed",
} as const;

export const OPERATOR = {
  LT: "lt",
  GT: "gt",
  EQ: "eq",
  LTE: "lte",
  GTE: "gte",
  DROPS_BELOW: "drops_below",
} as const;

export const RECOMMENDATION_ACTION = {
  HOLD: "hold",
  ADD: "add",
  REDUCE: "reduce",
  SELL: "sell",
  WATCH: "watch",
} as const;

export const RECOMMENDATION_STATUS = {
  PENDING: "pending",
  ACKNOWLEDGED: "acknowledged",
  ACTED: "acted",
  DISMISSED: "dismissed",
} as const;

export const URGENCY = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
} as const;

export const JOURNAL_ENTRY_TYPE = {
  BUY_RATIONALE: "buy_rationale",
  THESIS_UPDATE: "thesis_update",
  DECISION: "decision",
  OBSERVATION: "observation",
  EARNINGS_NOTE: "earnings_note",
  MACRO: "macro",
} as const;

export const SENTIMENT = {
  POSITIVE: "positive",
  NEGATIVE: "negative",
  NEUTRAL: "neutral",
} as const;

export const THESIS_RELEVANCE = {
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
  NONE: "none",
} as const;

export const THESIS_IMPACT = {
  POSITIVE: "positive",
  NEGATIVE: "negative",
  NEUTRAL: "neutral",
  NA: "n/a",
} as const;

export const BRIEF_TYPE = {
  MORNING: "morning",
  WEEKLY: "weekly",
} as const;

export const ASSET_CLASS = {
  EQUITY: "equity",
  ETF: "etf",
  BOND: "bond",
  CRYPTO: "crypto",
  REIT: "reit",
  COMMODITY: "commodity",
} as const;

export const ASSUMPTION_CATEGORY = {
  COMPETITIVE_MOAT: "competitive_moat",
  MARKET_DYNAMICS: "market_dynamics",
  MANAGEMENT: "management",
  FINANCIALS: "financials",
  REGULATORY: "regulatory",
  MACRO: "macro",
} as const;

export const ASSUMPTION_IMPORTANCE = {
  CRITICAL: "critical",
  IMPORTANT: "important",
  SUPPORTING: "supporting",
} as const;

export const OUTCOME_IMPORTANCE = {
  PRIMARY: "primary",
  SECONDARY: "secondary",
} as const;

export const RISK_CATEGORY = {
  COMPETITIVE: "competitive",
  REGULATORY: "regulatory",
  EXECUTION: "execution",
  MACRO: "macro",
  VALUATION: "valuation",
  TECHNOLOGICAL: "technological",
} as const;

export const RISK_SEVERITY = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
} as const;

export const RISK_PROBABILITY = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
} as const;

export const ASSUMPTION_STATUS = {
  CONFIRMED: "confirmed",
  HOLDING: "holding",
  AT_RISK: "at_risk",
  VIOLATED: "violated",
} as const;

export const OUTCOME_STATUS = {
  ON_TRACK: "on_track",
  AHEAD: "ahead",
  BEHIND: "behind",
  MISSED: "missed",
  PENDING: "pending",
  EXCEEDED: "exceeded",
} as const;

export const RISK_STATUS = {
  NOT_MATERIALIZED: "not_materialized",
  MONITORING: "monitoring",
  PARTIALLY_MATERIALIZED: "partially_materialized",
  MATERIALIZED: "materialized",
} as const;

export const SCORE_WEIGHTS = {
  ASSUMPTIONS: 0.35,
  OUTCOMES: 0.30,
  RISKS: 0.20,
  INTEGRITY: 0.15,
} as const;

export const DEFAULT_MODEL = "claude-opus-4-8";
export const MAX_AGENT_ITERATIONS = 15;
