import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_MODEL, MAX_AGENT_ITERATIONS, SCORE_WEIGHTS } from "@/lib/constants";
import { buildSystemPrompt, buildUserMessage } from "./prompt";
import type {
  ThesisIntegrityInput,
  ThesisIntegrityResult,
  EvidenceChunk,
  EvidenceSource,
  LLMExtractedAssumption,
  LLMAssumptionVerdict,
  LLMKillConditionCheck,
  LLMEvidencePoint,
  LLMComponentScore,
  LLMFinalVerdict,
  EvidencePoint,
  AssumptionVerdict,
  TriggeredKillCondition,
  EvidenceConflict,
  IntegrityScoreBreakdown,
  IntegrityRecommendation,
  EvidenceAudit,
} from "./types";

// ─── Scoring ──────────────────────────────────────────────────────────────────

const IMPORTANCE_WEIGHT: Record<string, number> = {
  critical: 3,
  important: 2,
  supporting: 1,
};

function calculateAssumptionsScore(verdicts: LLMAssumptionVerdict[], assumptions: LLMExtractedAssumption[]): number {
  if (verdicts.length === 0) return 5;

  let totalWeight = 0;
  let weightedSum = 0;

  for (const verdict of verdicts) {
    const assumption = assumptions.find((a) => a.id === verdict.assumptionId);
    const weight = IMPORTANCE_WEIGHT[assumption?.importance ?? "supporting"] ?? 1;
    weightedSum += verdict.score * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 10) / 10 : 5;
}

function buildScoreBreakdown(
  assumptionsScore: number,
  componentScores: LLMComponentScore[]
): IntegrityScoreBreakdown {
  const getScore = (c: "outcomes" | "risks" | "integrity") =>
    componentScores.find((s) => s.component === c)?.score ?? 5;

  const outcomesScore = getScore("outcomes");
  const riskScore = getScore("risks");
  const integrityScore = getScore("integrity");

  const overallScore =
    assumptionsScore * SCORE_WEIGHTS.ASSUMPTIONS +
    outcomesScore * SCORE_WEIGHTS.OUTCOMES +
    riskScore * SCORE_WEIGHTS.RISKS +
    integrityScore * SCORE_WEIGHTS.INTEGRITY;

  return {
    assumptionsScore: Math.round(assumptionsScore * 10) / 10,
    outcomesScore: Math.round(outcomesScore * 10) / 10,
    riskScore: Math.round(riskScore * 10) / 10,
    integrityScore: Math.round(integrityScore * 10) / 10,
    overallScore: Math.round(overallScore * 10) / 10,
  };
}

function deriveRecommendation(
  overallScore: number,
  triggered: boolean
): IntegrityRecommendation {
  if (triggered) return "SELL"; // kill condition short-circuit
  if (overallScore >= 8.0) return "ADD";
  if (overallScore >= 6.0) return "HOLD";
  if (overallScore >= 4.0) return "REDUCE";
  return "SELL";
}

// ─── Evidence Chunker ─────────────────────────────────────────────────────────

function buildChunks(input: ThesisIntegrityInput): EvidenceChunk[] {
  const chunks: EvidenceChunk[] = [];

  // News
  for (const [i, item] of (input.evidence.news ?? []).entries()) {
    const lines = [`Headline: ${item.headline}`];
    if (item.source) lines.push(`Source: ${item.source}`);
    if (item.publishedAt) lines.push(`Date: ${item.publishedAt}`);
    if (item.content) lines.push(`\n${item.content}`);

    chunks.push({
      id: `news-${i}`,
      source: "news",
      label: item.headline,
      content: lines.join("\n"),
    });
  }

  // Earnings — one chunk per meaningful field group
  const e = input.evidence.earnings;
  if (e) {
    // EPS + revenue beat/miss
    const epsLines: string[] = [`Period: ${e.fiscalPeriod}`];
    if (e.reportDate) epsLines.push(`Report date: ${e.reportDate}`);
    if (e.epsActual !== undefined) epsLines.push(`EPS actual: $${e.epsActual}`);
    if (e.epsEstimate !== undefined) {
      epsLines.push(`EPS estimate: $${e.epsEstimate}`);
      if (e.epsActual !== undefined) {
        const beatPct = (((e.epsActual - e.epsEstimate) / Math.abs(e.epsEstimate)) * 100).toFixed(1);
        epsLines.push(`EPS beat/miss: ${Number(beatPct) >= 0 ? "+" : ""}${beatPct}%`);
      }
    }
    if (e.revenueActual !== undefined) epsLines.push(`Revenue actual: $${e.revenueActual}B`);
    if (e.revenueEstimate !== undefined) {
      epsLines.push(`Revenue estimate: $${e.revenueEstimate}B`);
    }
    chunks.push({ id: "earnings-financials", source: "earnings", label: `${e.fiscalPeriod} headline financials`, content: epsLines.join("\n") });

    // Segment data
    if (e.segmentData && Object.keys(e.segmentData).length > 0) {
      const segLines = Object.entries(e.segmentData).map(([k, v]) => `${k}: ${v}`);
      chunks.push({ id: "earnings-segments", source: "earnings", label: `${e.fiscalPeriod} segment metrics`, content: segLines.join("\n") });
    }

    // Guidance
    if (e.guidanceSummary) {
      const guidLines = [`Guidance summary: ${e.guidanceSummary}`];
      if (e.guidanceMetrics) {
        Object.entries(e.guidanceMetrics).forEach(([k, v]) => guidLines.push(`${k}: ${v}`));
      }
      chunks.push({ id: "earnings-guidance", source: "earnings", label: `${e.fiscalPeriod} guidance`, content: guidLines.join("\n") });
    }

    // Transcript excerpts
    for (const [i, excerpt] of (e.rawTranscriptExcerpts ?? []).entries()) {
      chunks.push({ id: `earnings-transcript-${i}`, source: "earnings", label: `Earnings call excerpt ${i + 1}`, content: excerpt });
    }
  }

  // Financial metrics — one chunk, all KV pairs
  const fm = input.evidence.financialMetrics;
  if (fm && Object.keys(fm).length > 0) {
    const lines = Object.entries(fm).map(([k, v]) => `${k}: ${v}`);
    chunks.push({ id: "metrics-snapshot", source: "financial_metrics", label: "Financial metrics snapshot", content: lines.join("\n") });
  }

  // Management commentary — one chunk per speaker item
  for (const [i, item] of (input.evidence.managementCommentary ?? []).entries()) {
    chunks.push({
      id: `mgmt-${i}`,
      source: "management_commentary",
      label: `${item.speaker} — ${item.context}`,
      content: `${item.speaker} (${item.context}): "${item.quote}"`,
    });
  }

  return chunks;
}

// ─── Tool Definitions ─────────────────────────────────────────────────────────

function buildToolDefinitions(hasPreStructuredAssumptions: boolean): Anthropic.Tool[] {
  const tools: Anthropic.Tool[] = [];

  if (!hasPreStructuredAssumptions) {
    tools.push({
      name: "extract_assumption",
      description:
        "Extracts and registers a thesis assumption from the original thesis text. Call once per assumption you identify. Only needed when assumptions are not pre-structured.",
      input_schema: {
        type: "object" as const,
        properties: {
          id: { type: "string", description: "Stable slug, e.g. 'azure-ai-moat'" },
          text: { type: "string", description: "The assumption as a declarative statement" },
          importance: { type: "string", enum: ["critical", "important", "supporting"] },
          metric: { type: "string", description: "Observable metric that tracks this assumption, if any" },
        },
        required: ["id", "text", "importance"],
      },
    });
  }

  tools.push({
    name: "record_evidence_point",
    description:
      "Records your interpretation of an evidence chunk in relation to the thesis. Call for every chunk that has thesis relevance. Skipping a chunk is valid only if it is completely irrelevant.",
    input_schema: {
      type: "object" as const,
      properties: {
        chunkId: { type: "string", description: "The chunk ID (e.g. 'news-0', 'earnings-segments')" },
        interpretation: { type: "string", description: "What this evidence means for the thesis — be specific, cite numbers" },
        direction: { type: "string", enum: ["reinforcing", "contradicting"], description: "Does this evidence support or challenge the thesis?" },
        weight: { type: "string", enum: ["strong", "moderate", "weak"] },
        assumptionIds: {
          type: "array",
          items: { type: "string" },
          description: "IDs of assumptions this evidence bears on",
        },
      },
      required: ["chunkId", "interpretation", "direction", "weight", "assumptionIds"],
    },
  });

  tools.push({
    name: "record_assumption_verdict",
    description:
      "Records the verdict for one thesis assumption. Every assumption must have a verdict. Chunk IDs are mandatory — if no evidence addresses this assumption, use an empty array and set score=5 with verdict='holding'.",
    input_schema: {
      type: "object" as const,
      properties: {
        assumptionId: { type: "string" },
        verdict: { type: "string", enum: ["confirmed", "holding", "at_risk", "violated"] },
        score: { type: "number", description: "0-10. 10=confirmed, 0=violated. Use 5 for no evidence." },
        trend: { type: "string", enum: ["improving", "stable", "deteriorating"] },
        justification: { type: "string", description: "One sentence that references the chunk IDs used" },
        chunkIds: {
          type: "array",
          items: { type: "string" },
          description: "Chunk IDs used to reach this verdict. Empty array = no evidence (score must be 5).",
        },
      },
      required: ["assumptionId", "verdict", "score", "trend", "justification", "chunkIds"],
    },
  });

  tools.push({
    name: "record_component_score",
    description:
      "Records the outcomes or risks holistic score. Call twice: once for outcomes, once for risks. The integrity score is provided in finalize_verdict.",
    input_schema: {
      type: "object" as const,
      properties: {
        component: { type: "string", enum: ["outcomes", "risks"] },
        score: { type: "number", description: "0-10. For risks: inverted scale, 10=no risks materialized." },
        rationale: { type: "string", description: "2-3 sentences citing specific evidence chunks" },
      },
      required: ["component", "score", "rationale"],
    },
  });

  tools.push({
    name: "check_kill_condition",
    description:
      "Evaluates whether a kill condition has been triggered. Call for every kill condition. If no evidence covers this condition, mark triggered=false and note 'no data available'.",
    input_schema: {
      type: "object" as const,
      properties: {
        conditionId: { type: "string" },
        triggered: { type: "boolean" },
        chunkId: { type: "string", description: "Chunk ID of the evidence that triggered or cleared this condition" },
        triggerNote: { type: "string", description: "What specifically triggered or did not trigger this condition" },
      },
      required: ["conditionId", "triggered", "triggerNote"],
    },
  });

  tools.push({
    name: "record_evidence_conflict",
    description:
      "Documents when two evidence sources contradict each other. Call when you see genuine conflicts (e.g., metrics vs. management commentary). Explain how you resolved the conflict.",
    input_schema: {
      type: "object" as const,
      properties: {
        description: { type: "string" },
        chunkIdA: { type: "string" },
        chunkIdB: { type: "string" },
        resolution: { type: "string", description: "Which source you trusted more and why" },
      },
      required: ["description", "chunkIdA", "chunkIdB", "resolution"],
    },
  });

  tools.push({
    name: "finalize_verdict",
    description:
      "Produces the final integrity score and overall reasoning. Call once after completing all assumption verdicts and component scores.",
    input_schema: {
      type: "object" as const,
      properties: {
        integrityScore: { type: "number", description: "0-10. Holistic: would you write the same thesis today?" },
        thesisReference: { type: "string", description: "An exact verbatim quote from the original thesis that best represents the core investment case" },
        recommendationReasoning: { type: "string", description: "2-3 sentence overall assessment of thesis integrity" },
      },
      required: ["integrityScore", "thesisReference", "recommendationReasoning"],
    },
  });

  return tools;
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export class ThesisIntegrityEngine {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic();
  }

  async evaluate(input: ThesisIntegrityInput): Promise<ThesisIntegrityResult> {
    // Per-evaluation mutable state
    const extractedAssumptions: LLMExtractedAssumption[] = [];
    const assumptionVerdicts: LLMAssumptionVerdict[] = [];
    const killConditionChecks: LLMKillConditionCheck[] = [];
    const evidencePoints: LLMEvidencePoint[] = [];
    const componentScores: LLMComponentScore[] = [];
    const evidenceConflicts: EvidenceConflict[] = [];
    let finalVerdict: LLMFinalVerdict | null = null;

    const chunks = buildChunks(input);
    const chunkMap = new Map(chunks.map((c) => [c.id, c]));
    const usedChunkIds = new Set<string>();

    // Merge pre-structured assumptions into extractedAssumptions
    const hasPreStructured = !!(
      input.thesis.keyAssumptions && input.thesis.keyAssumptions.length > 0
    );
    if (hasPreStructured) {
      for (const a of input.thesis.keyAssumptions!) {
        extractedAssumptions.push({
          id: a.id,
          text: a.text,
          importance: a.importance,
          metric: a.metric,
        });
      }
    }

    // ── Build tool handlers ────────────────────────────────────────────────────

    const handlers: Record<string, (input: Record<string, unknown>) => unknown> = {
      extract_assumption: (i) => {
        const a: LLMExtractedAssumption = {
          id: i.id as string,
          text: i.text as string,
          importance: i.importance as "critical" | "important" | "supporting",
          metric: i.metric as string | undefined,
        };
        extractedAssumptions.push(a);
        return { registered: true, assumptionId: a.id };
      },

      record_evidence_point: (i) => {
        const chunkId = i.chunkId as string;
        if (!chunkMap.has(chunkId)) {
          return { error: `Chunk ID "${chunkId}" does not exist. Use IDs from the provided chunk list.` };
        }
        usedChunkIds.add(chunkId);
        evidencePoints.push({
          chunkId,
          interpretation: i.interpretation as string,
          direction: i.direction as "reinforcing" | "contradicting",
          weight: i.weight as "strong" | "moderate" | "weak",
          assumptionIds: (i.assumptionIds as string[]) ?? [],
        });
        return { recorded: true };
      },

      record_assumption_verdict: (i) => {
        const chunkIds = (i.chunkIds as string[]) ?? [];
        // Validate all referenced chunk IDs exist
        const invalid = chunkIds.filter((id) => !chunkMap.has(id));
        if (invalid.length > 0) {
          return { error: `Invalid chunk IDs: ${invalid.join(", ")}. Only use IDs from the provided chunk list.` };
        }
        // Enforce: no evidence → score must be 5
        const score = i.score as number;
        const adjustedScore = chunkIds.length === 0 && score !== 5 ? 5 : score;

        chunkIds.forEach((id) => usedChunkIds.add(id));
        assumptionVerdicts.push({
          assumptionId: i.assumptionId as string,
          verdict: i.verdict as LLMAssumptionVerdict["verdict"],
          score: Math.max(0, Math.min(10, adjustedScore)),
          trend: i.trend as LLMAssumptionVerdict["trend"],
          justification: i.justification as string,
          chunkIds,
        });
        return { recorded: true, scoreApplied: adjustedScore };
      },

      record_component_score: (i) => {
        componentScores.push({
          component: i.component as "outcomes" | "risks",
          score: Math.max(0, Math.min(10, i.score as number)),
          rationale: i.rationale as string,
        });
        return { recorded: true };
      },

      check_kill_condition: (i) => {
        const chunkId = i.chunkId as string | undefined;
        if (chunkId && !chunkMap.has(chunkId)) {
          return { error: `Chunk ID "${chunkId}" does not exist.` };
        }
        if (chunkId) usedChunkIds.add(chunkId);
        killConditionChecks.push({
          conditionId: i.conditionId as string,
          triggered: i.triggered as boolean,
          chunkId,
          triggerNote: i.triggerNote as string,
        });
        return { recorded: true, triggered: i.triggered };
      },

      record_evidence_conflict: (i) => {
        evidenceConflicts.push({
          description: i.description as string,
          chunkIdA: i.chunkIdA as string,
          chunkIdB: i.chunkIdB as string,
          resolution: i.resolution as string,
        });
        return { recorded: true };
      },

      finalize_verdict: (i) => {
        finalVerdict = {
          thesisReference: i.thesisReference as string,
          recommendationReasoning: i.recommendationReasoning as string,
        };
        // Also store integrity score in componentScores
        componentScores.push({
          component: "integrity" as never,
          score: Math.max(0, Math.min(10, i.integrityScore as number)),
          rationale: i.recommendationReasoning as string,
        });
        return { recorded: true };
      },
    };

    // ── Agentic loop ──────────────────────────────────────────────────────────

    const tools = buildToolDefinitions(hasPreStructured);
    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: buildUserMessage(input, chunks),
      },
    ];

    for (let i = 0; i < MAX_AGENT_ITERATIONS; i++) {
      const response = await this.client.messages.create({
        model: DEFAULT_MODEL,
        max_tokens: 8192,
        system: buildSystemPrompt(),
        tools,
        messages,
      });

      messages.push({ role: "assistant", content: response.content });

      if (response.stop_reason === "end_turn") break;

      if (response.stop_reason === "tool_use") {
        const results: Anthropic.ToolResultBlockParam[] = [];

        for (const block of response.content) {
          if (block.type !== "tool_use") continue;
          const handler = handlers[block.name];
          if (!handler) {
            results.push({ type: "tool_result", tool_use_id: block.id, content: `Unknown tool: ${block.name}`, is_error: true });
            continue;
          }
          try {
            const result = handler(block.input as Record<string, unknown>);
            results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
          } catch (err) {
            results.push({ type: "tool_result", tool_use_id: block.id, content: `Error: ${err instanceof Error ? err.message : String(err)}`, is_error: true });
          }
        }

        messages.push({ role: "user", content: results });
      }
    }

    // ── Post-processing (deterministic) ───────────────────────────────────────

    const assumptionsScore = calculateAssumptionsScore(assumptionVerdicts, extractedAssumptions);
    const scoreBreakdown = buildScoreBreakdown(assumptionsScore, componentScores);

    const anyKillTriggered = killConditionChecks.some((k) => k.triggered);
    const recommendation = deriveRecommendation(scoreBreakdown.overallScore, anyKillTriggered);

    // Assemble output evidence points (link chunk content)
    const reinforcingEvidence: EvidencePoint[] = [];
    const contradictingEvidence: EvidencePoint[] = [];
    for (const ep of evidencePoints) {
      const chunk = chunkMap.get(ep.chunkId);
      if (!chunk) continue;
      const point: EvidencePoint = {
        chunkId: ep.chunkId,
        source: chunk.source,
        label: chunk.label,
        verbatimContent: chunk.content,
        interpretation: ep.interpretation,
        direction: ep.direction,
        weight: ep.weight,
        assumptionIds: ep.assumptionIds,
      };
      if (ep.direction === "reinforcing") reinforcingEvidence.push(point);
      else contradictingEvidence.push(point);
    }

    // Assemble assumption verdicts with supporting chunks
    const fullAssumptionVerdicts: AssumptionVerdict[] = assumptionVerdicts.map((v) => {
      const assumption = extractedAssumptions.find((a) => a.id === v.assumptionId);
      return {
        assumptionId: v.assumptionId,
        assumptionText: assumption?.text ?? v.assumptionId,
        importance: assumption?.importance ?? "supporting",
        verdict: v.verdict,
        score: v.score,
        trend: v.trend,
        justification: v.justification,
        chunkIds: v.chunkIds,
        supportingChunks: v.chunkIds.map((id) => chunkMap.get(id)!).filter(Boolean),
      };
    });

    // Assemble kill conditions
    const triggeredKillConditions: TriggeredKillCondition[] = killConditionChecks.map((k) => ({
      conditionId: k.conditionId,
      conditionText:
        input.thesis.killConditions?.find((kc) => kc.id === k.conditionId)?.description ??
        k.conditionId,
      triggered: k.triggered,
      chunkId: k.chunkId,
      triggerNote: k.triggerNote,
    }));

    // Evidence audit
    const unusedChunkIds = chunks.map((c) => c.id).filter((id) => !usedChunkIds.has(id));
    const uncitedVerdicts = fullAssumptionVerdicts
      .filter((v) => v.chunkIds.length === 0)
      .map((v) => v.assumptionId);
    const sourceCoverage: Record<EvidenceSource, number> = {
      news: 0,
      earnings: 0,
      financial_metrics: 0,
      management_commentary: 0,
    };
    for (const id of usedChunkIds) {
      const chunk = chunkMap.get(id);
      if (chunk) sourceCoverage[chunk.source]++;
    }
    const confidenceLevel = Math.min(10, Math.round((chunks.length / 15) * 10));

    const audit: EvidenceAudit = {
      totalChunksProvided: chunks.length,
      chunksUsed: usedChunkIds.size,
      chunksUnused: unusedChunkIds,
      allVerdictsCited: uncitedVerdicts.length === 0,
      uncitedVerdicts,
      sourceCoverage,
      confidenceLevel,
    };

    return {
      ticker: input.ticker,
      evaluatedAt: new Date().toISOString(),
      thesisStrength: scoreBreakdown.overallScore,
      scoreBreakdown,
      assumptionVerdicts: fullAssumptionVerdicts,
      reinforcingEvidence,
      contradictingEvidence,
      evidenceConflicts,
      triggeredKillConditions,
      recommendation,
      recommendationReasoning: (finalVerdict as unknown as Record<string, unknown>)?.["recommendationReasoning"] as string ?? "Evaluation incomplete.",
      thesisReference: (finalVerdict as unknown as Record<string, unknown>)?.["thesisReference"] as string ?? "",
      killConditionOverride: anyKillTriggered && recommendation === "SELL",
      evidenceAudit: audit,
    };
  }
}
