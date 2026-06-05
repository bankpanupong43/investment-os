// ─── Evidence Inputs ──────────────────────────────────────────────────────────

export type EvidenceSource =
  | "news"
  | "earnings"
  | "financial_metrics"
  | "management_commentary";

export interface NewsEvidenceItem {
  headline: string;
  content?: string;
  source?: string;
  publishedAt?: string;
}

export interface EarningsEvidenceBlock {
  fiscalPeriod: string;
  reportDate?: string;
  epsActual?: number;
  epsEstimate?: number;
  revenueActual?: number;
  revenueEstimate?: number;
  segmentData?: Record<string, string | number>; // {"azure_growth": "29%", "cloud_revenue_bn": 35.1}
  guidanceSummary?: string;
  guidanceMetrics?: Record<string, string | number>;
  rawTranscriptExcerpts?: string[]; // key lines from earnings call
}

export interface ManagementCommentaryItem {
  speaker: string; // "CEO", "CFO", etc.
  context: string; // e.g. "Q3 2024 earnings call"
  quote: string;
}

// Financial metrics are passed as a flat key-value store.
// Use keys that match the assumption metrics where possible (e.g. "azure_yoy_growth_pct": 29).
export type FinancialMetrics = Record<string, string | number>;

// ─── Engine Input ─────────────────────────────────────────────────────────────

export interface RawKillCondition {
  id: string;
  description: string;
  metric?: string;
  operator?: string; // "lt" | "gt" | "gte" | "lte"
  threshold?: number;
}

export interface RawThesisAssumption {
  id: string;
  text: string;
  importance: "critical" | "important" | "supporting";
  metric?: string; // name of the metric to watch
}

export interface ThesisIntegrityInput {
  ticker: string;
  positionId?: string; // if provided, persist evaluation to DB

  thesis: {
    originalText: string;
    // Pre-structured components (optional — engine extracts if absent)
    keyAssumptions?: RawThesisAssumption[];
    killConditions?: RawKillCondition[];
  };

  evidence: {
    news?: NewsEvidenceItem[];
    earnings?: EarningsEvidenceBlock;
    financialMetrics?: FinancialMetrics;
    managementCommentary?: ManagementCommentaryItem[];
  };
}

// ─── Evidence Chunks (internal) ───────────────────────────────────────────────
// All input evidence is pre-indexed into labeled chunks.
// The LLM references chunk IDs — it cannot invent quotes.

export interface EvidenceChunk {
  id: string;           // "news-0", "earnings-eps", "mgmt-ceo-0"
  source: EvidenceSource;
  label: string;        // human-readable label shown to the LLM
  content: string;      // the verbatim text of this evidence item
}

// ─── Engine Output ────────────────────────────────────────────────────────────

export type IntegrityRecommendation = "HOLD" | "ADD" | "REDUCE" | "SELL";

export interface AssumptionVerdict {
  assumptionId: string;
  assumptionText: string;
  importance: "critical" | "important" | "supporting";
  verdict: "confirmed" | "holding" | "at_risk" | "violated";
  score: number;                // 0-10
  trend: "improving" | "stable" | "deteriorating";
  justification: string;        // one sentence, references chunk IDs
  chunkIds: string[];           // chunks used to reach this verdict
  // Resolved from chunks for output:
  supportingChunks: EvidenceChunk[];
}

export interface EvidencePoint {
  chunkId: string;
  source: EvidenceSource;
  label: string;
  verbatimContent: string;      // exact chunk content (not LLM-generated)
  interpretation: string;       // what it means for the thesis
  direction: "reinforcing" | "contradicting";
  weight: "strong" | "moderate" | "weak";
  assumptionIds: string[];      // which assumptions this evidence bears on
}

export interface TriggeredKillCondition {
  conditionId: string;
  conditionText: string;
  triggered: boolean;
  chunkId?: string;             // evidence that triggered or cleared it
  triggerNote: string;          // what specifically triggered or didn't trigger it
}

export interface EvidenceConflict {
  description: string;
  chunkIdA: string;
  chunkIdB: string;
  resolution: string;           // how the engine resolved the conflict
}

export interface IntegrityScoreBreakdown {
  assumptionsScore: number;     // importance-weighted average of assumption scores
  outcomesScore: number;        // LLM assessment of outcome trajectory
  riskScore: number;            // LLM assessment of risk non-materialization
  integrityScore: number;       // holistic: "would I write the same thesis today?"
  overallScore: number;         // assumptions×0.35 + outcomes×0.30 + risks×0.20 + integrity×0.15
}

export interface EvidenceAudit {
  totalChunksProvided: number;
  chunksUsed: number;
  chunksUnused: string[];       // chunk IDs the LLM did not reference
  allVerdictsCited: boolean;    // every assumption verdict has ≥1 chunk reference
  uncitedVerdicts: string[];    // assumption IDs without citations
  sourceCoverage: Record<EvidenceSource, number>; // chunks used per source
  confidenceLevel: number;      // 0-10: reflects evidence richness
}

export interface ThesisIntegrityResult {
  ticker: string;
  evaluatedAt: string;

  // Core output
  thesisStrength: number;       // 0-10 (= scoreBreakdown.overallScore)
  scoreBreakdown: IntegrityScoreBreakdown;

  // Evidence analysis
  assumptionVerdicts: AssumptionVerdict[];
  reinforcingEvidence: EvidencePoint[];
  contradictingEvidence: EvidencePoint[];
  evidenceConflicts: EvidenceConflict[];
  triggeredKillConditions: TriggeredKillCondition[];

  // Decision
  recommendation: IntegrityRecommendation;
  recommendationReasoning: string;
  thesisReference: string;      // exact quote from originalText supporting the decision
  killConditionOverride: boolean; // true when SELL is due to kill condition, not score

  // Audit trail
  evidenceAudit: EvidenceAudit;
}

// ─── Internal LLM Output State ────────────────────────────────────────────────
// Collected via tool calls during the agentic loop.

export interface LLMExtractedAssumption {
  id: string;
  text: string;
  importance: "critical" | "important" | "supporting";
  metric?: string;
}

export interface LLMAssumptionVerdict {
  assumptionId: string;
  verdict: "confirmed" | "holding" | "at_risk" | "violated";
  score: number;
  trend: "improving" | "stable" | "deteriorating";
  justification: string;
  chunkIds: string[];
}

export interface LLMKillConditionCheck {
  conditionId: string;
  triggered: boolean;
  chunkId?: string;
  triggerNote: string;
}

export interface LLMEvidencePoint {
  chunkId: string;
  interpretation: string;
  direction: "reinforcing" | "contradicting";
  weight: "strong" | "moderate" | "weak";
  assumptionIds: string[];
}

export interface LLMComponentScore {
  component: "outcomes" | "risks" | "integrity";
  score: number;
  rationale: string;
}

export interface LLMFinalVerdict {
  thesisReference: string;      // verbatim quote from originalText
  recommendationReasoning: string;
}
