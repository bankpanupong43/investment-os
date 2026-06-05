import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { parseJsonField, serializeJsonField } from "@/lib/utils";
import {
  calculateThesisScore,
  scoreToHealthStatus,
  type AssumptionAssessment,
  type OutcomeAssessment,
  type RiskAssessment,
  type ThesisKeyAssumption,
  type ExpectedOutcome,
  type ThesisRisk,
} from "@/types";
import type { AgentTool } from "@/agents/base";

// ─── Tool: get_thesis_for_evaluation ─────────────────────────────────────────

const getThesisForEvaluationDefinition: Anthropic.Tool = {
  name: "get_thesis_for_evaluation",
  description:
    "Fetches everything needed to evaluate a thesis: the original thesis text, all structured components (assumptions, outcomes, risks), kill conditions, recent news, recent earnings, and all prior evaluations. Use this first before scoring.",
  input_schema: {
    type: "object" as const,
    properties: {
      ticker: { type: "string", description: "Ticker symbol (e.g. MSFT)" },
      positionId: { type: "string", description: "Position ID (alternative to ticker)" },
    },
    required: [],
  },
};

async function getThesisForEvaluationHandler(input: Record<string, unknown>) {
  const where = input.positionId
    ? { id: input.positionId as string }
    : { ticker: (input.ticker as string).toUpperCase(), status: "active" };

  const position = await db.position.findFirst({
    where,
    include: {
      thesis: {
        include: {
          updates: { orderBy: { createdAt: "desc" }, take: 10 },
          versions: { orderBy: { version: "asc" } },
          evaluations: { orderBy: { createdAt: "desc" }, take: 3 },
        },
      },
      killConditions: { where: { status: "active" }, orderBy: { createdAt: "asc" } },
      newsItems: { where: { thesisRelevance: { in: ["high", "medium"] } }, orderBy: { fetchedAt: "desc" }, take: 10 },
      earningsEvents: { orderBy: { reportDate: "desc" }, take: 4 },
      journalEntries: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });

  if (!position) return { error: `Position not found: ${input.ticker ?? input.positionId}` };
  if (!position.thesis) return { error: `No thesis found for ${position.ticker}` };

  return {
    position: {
      id: position.id,
      ticker: position.ticker,
      name: position.name,
      sector: position.sector,
      shares: position.shares,
      avgCost: position.avgCost,
      entryDate: position.entryDate,
    },
    thesis: {
      id: position.thesis.id,
      version: position.thesis.version,
      originalThesis: position.thesis.originalThesis,
      currentAssessment: position.thesis.currentAssessment,
      keyAssumptions: parseJsonField<ThesisKeyAssumption[]>(position.thesis.keyAssumptions, []),
      expectedOutcomes: parseJsonField<ExpectedOutcome[]>(position.thesis.expectedOutcomes, []),
      risks: parseJsonField<ThesisRisk[]>(position.thesis.risks, []),
      holdingPeriod: position.thesis.holdingPeriod,
      holdingPeriodMonths: position.thesis.holdingPeriodMonths,
      entryConfidence: position.thesis.entryConfidence,
      healthStatus: position.thesis.healthStatus,
      healthScore: position.thesis.healthScore,
      lastReviewedAt: position.thesis.lastReviewedAt,
      recentUpdates: position.thesis.updates,
      previousEvaluations: position.thesis.evaluations.map((e) => ({
        createdAt: e.createdAt,
        overallScore: e.overallScore,
        recommendation: e.recommendation,
        strengths: e.strengths,
        concerns: e.concerns,
      })),
    },
    killConditions: position.killConditions,
    recentNews: position.newsItems,
    recentEarnings: position.earningsEvents,
    recentJournal: position.journalEntries,
  };
}

// ─── Tool: save_thesis_evaluation ────────────────────────────────────────────

const saveThesisEvaluationDefinition: Anthropic.Tool = {
  name: "save_thesis_evaluation",
  description:
    "Saves a complete thesis evaluation with scores for all components. Automatically calculates the weighted overall score and updates the thesis health. The evaluation is the permanent record of this scoring session.",
  input_schema: {
    type: "object" as const,
    properties: {
      positionId: { type: "string" },
      thesisId: { type: "string" },

      // Per-component assessments as JSON strings
      assumptionAssessments: {
        type: "string",
        description:
          'JSON: AssumptionAssessment[]. Each item: {assumptionId, assumptionText, status, score (0-10), evidence, trend, lastUpdated}. status values: "confirmed"|"holding"|"at_risk"|"violated"',
      },
      outcomeAssessments: {
        type: "string",
        description:
          'JSON: OutcomeAssessment[]. Each item: {outcomeId, outcomeText, status, score (0-10), evidence, progressNote, lastUpdated}. status values: "on_track"|"ahead"|"behind"|"missed"|"pending"|"exceeded"',
      },
      riskAssessments: {
        type: "string",
        description:
          'JSON: RiskAssessment[]. Each item: {riskId, riskText, status, score (0-10), evidence, severity, lastUpdated}. score of 10 means risk has NOT materialized (good). status values: "not_materialized"|"monitoring"|"partially_materialized"|"materialized"',
      },

      // AI holistic judgment (0-10) — is the core thesis text still coherent given everything you know?
      integrityScore: {
        type: "number",
        description:
          "0-10. Your holistic judgment of whether the core thesis narrative is still coherent and valid. This is NOT the average of other scores — it captures whether the fundamental investment premise still holds.",
      },

      // Narrative analysis
      strengths: {
        type: "string",
        description: "What is confirmed and going well — specific evidence for each strength",
      },
      concerns: {
        type: "string",
        description: "What has changed or is at risk — specific evidence for each concern",
      },
      scoreRationale: {
        type: "string",
        description:
          "Brief explanation of the overall score — why these component scores add up to this overall picture",
      },

      // Recommendation
      recommendation: {
        type: "string",
        enum: ["hold", "add", "reduce", "sell", "watch"],
      },
      recommendationReason: {
        type: "string",
        description: "Specific reason for this recommendation, tied to thesis evaluation",
      },
      thesisReference: {
        type: "string",
        description: "Quote from the original thesis that most directly informs this recommendation",
      },

      modelUsed: { type: "string", description: "AI model that performed this evaluation" },
    },
    required: [
      "positionId",
      "thesisId",
      "assumptionAssessments",
      "outcomeAssessments",
      "riskAssessments",
      "integrityScore",
      "strengths",
      "concerns",
      "scoreRationale",
      "recommendation",
      "recommendationReason",
      "thesisReference",
    ],
  },
};

async function saveThesisEvaluationHandler(input: Record<string, unknown>) {
  const assumptionAssessments = parseJsonField<AssumptionAssessment[]>(
    input.assumptionAssessments as string,
    []
  );
  const outcomeAssessments = parseJsonField<OutcomeAssessment[]>(
    input.outcomeAssessments as string,
    []
  );
  const riskAssessments = parseJsonField<RiskAssessment[]>(
    input.riskAssessments as string,
    []
  );

  const scores = calculateThesisScore({
    assummentAssessments: assumptionAssessments,
    outcomeAssessments,
    riskAssessments,
    integrityScore: input.integrityScore as number,
  });

  const evaluation = await db.thesisEvaluation.create({
    data: {
      thesisId: input.thesisId as string,
      positionId: input.positionId as string,
      assumptionsScore: scores.assumptionsScore,
      outcomesScore: scores.outcomesScore,
      riskScore: scores.riskScore,
      integrityScore: scores.integrityScore,
      overallScore: scores.overallScore,
      assumptionAssessments: serializeJsonField(assumptionAssessments),
      outcomeAssessments: serializeJsonField(outcomeAssessments),
      riskAssessments: serializeJsonField(riskAssessments),
      strengths: input.strengths as string,
      concerns: input.concerns as string,
      scoreRationale: input.scoreRationale as string,
      recommendation: input.recommendation as string,
      recommendationReason: input.recommendationReason as string,
      thesisReference: input.thesisReference as string,
      evaluatedBy: "ai",
      modelUsed: (input.modelUsed as string) ?? "claude-opus-4-8",
    },
  });

  // Update thesis health based on score
  const newHealthStatus = scoreToHealthStatus(scores.overallScore);
  await db.thesis.update({
    where: { id: input.thesisId as string },
    data: {
      healthStatus: newHealthStatus,
      healthScore: Math.round(scores.overallScore),
      lastReviewedAt: new Date(),
    },
  });

  // Create a recommendation tied to this evaluation
  const recommendation = await db.recommendation.create({
    data: {
      positionId: input.positionId as string,
      action: input.recommendation as string,
      reasoning: input.recommendationReason as string,
      thesisReference: input.thesisReference as string,
      evaluationId: evaluation.id,
      confidence: Math.round(scores.overallScore / 2), // 0-10 → 1-5
      urgency: scores.overallScore < 4 ? "high" : scores.overallScore < 6 ? "medium" : "low",
      status: "pending",
    },
  });

  return {
    evaluation: { ...evaluation, scores },
    recommendation,
    thesisHealthUpdated: { status: newHealthStatus, score: scores.overallScore },
  };
}

// ─── Tool: revise_thesis ──────────────────────────────────────────────────────

const reviseThesisDefinition: Anthropic.Tool = {
  name: "revise_thesis",
  description:
    "Creates a new thesis version (snapshot) and updates the thesis with new structured components. Use when the thesis materially changes — not for minor updates, but when assumptions, outcomes, or risks need to be formally revised. Always requires a revision reason.",
  input_schema: {
    type: "object" as const,
    properties: {
      thesisId: { type: "string" },
      revisionReason: {
        type: "string",
        description:
          "Why is this thesis being revised? Be specific: what changed in reality that requires updating the thesis?",
      },
      updatedThesisText: {
        type: "string",
        description: "Updated thesis narrative (if the core thesis itself has changed)",
      },
      updatedKeyAssumptions: {
        type: "string",
        description: "JSON: ThesisKeyAssumption[] — full updated list of assumptions",
      },
      updatedExpectedOutcomes: {
        type: "string",
        description: "JSON: ExpectedOutcome[] — full updated list of outcomes",
      },
      updatedRisks: {
        type: "string",
        description: "JSON: ThesisRisk[] — full updated list of risks",
      },
      updatedHoldingPeriod: { type: "string" },
      updatedConfidence: { type: "number", description: "New confidence score 0-10" },
    },
    required: ["thesisId", "revisionReason"],
  },
};

async function reviseThesisHandler(input: Record<string, unknown>) {
  const currentThesis = await db.thesis.findUnique({
    where: { id: input.thesisId as string },
  });

  if (!currentThesis) return { error: "Thesis not found" };

  const newVersion = currentThesis.version + 1;

  // Snapshot current state as the new version BEFORE updating
  const [version] = await db.$transaction([
    db.thesisVersion.create({
      data: {
        thesisId: currentThesis.id,
        version: newVersion,
        thesisText: (input.updatedThesisText as string) ?? currentThesis.originalThesis,
        keyAssumptions: (input.updatedKeyAssumptions as string) ?? currentThesis.keyAssumptions,
        expectedOutcomes: (input.updatedExpectedOutcomes as string) ?? currentThesis.expectedOutcomes,
        risks: (input.updatedRisks as string) ?? currentThesis.risks,
        holdingPeriod: (input.updatedHoldingPeriod as string) ?? currentThesis.holdingPeriod,
        entryConfidence: (input.updatedConfidence as number) ?? currentThesis.entryConfidence,
        revisionReason: input.revisionReason as string,
        revisedBy: "ai",
      },
    }),
    db.thesis.update({
      where: { id: currentThesis.id },
      data: {
        version: newVersion,
        ...(input.updatedKeyAssumptions && { keyAssumptions: input.updatedKeyAssumptions as string }),
        ...(input.updatedExpectedOutcomes && { expectedOutcomes: input.updatedExpectedOutcomes as string }),
        ...(input.updatedRisks && { risks: input.updatedRisks as string }),
        ...(input.updatedHoldingPeriod && { holdingPeriod: input.updatedHoldingPeriod as string }),
        lastReviewedAt: new Date(),
      },
    }),
    db.thesisUpdate.create({
      data: {
        thesisId: currentThesis.id,
        updateType: "neutral",
        content: `Thesis revised to version ${newVersion}. Reason: ${input.revisionReason}`,
        triggeredBy: "manual",
      },
    }),
  ]);

  return { version, newVersion, message: `Thesis revised to v${newVersion}` };
}

// ─── Tool: get_evaluation_history ─────────────────────────────────────────────

const getEvaluationHistoryDefinition: Anthropic.Tool = {
  name: "get_evaluation_history",
  description: "Returns all past thesis evaluations for a position, ordered newest first. Use to track score trends and see how the thesis has evolved.",
  input_schema: {
    type: "object" as const,
    properties: {
      positionId: { type: "string" },
      limit: { type: "number", description: "Max evaluations to return (default 10)" },
    },
    required: ["positionId"],
  },
};

async function getEvaluationHistoryHandler(input: Record<string, unknown>) {
  const evaluations = await db.thesisEvaluation.findMany({
    where: { positionId: input.positionId as string },
    orderBy: { createdAt: "desc" },
    take: (input.limit as number) ?? 10,
  });

  return evaluations.map((e) => ({
    id: e.id,
    createdAt: e.createdAt,
    overallScore: e.overallScore,
    assumptionsScore: e.assumptionsScore,
    outcomesScore: e.outcomesScore,
    riskScore: e.riskScore,
    integrityScore: e.integrityScore,
    recommendation: e.recommendation,
    strengths: e.strengths,
    concerns: e.concerns,
    scoreRationale: e.scoreRationale,
    assumptionAssessments: parseJsonField<AssumptionAssessment[]>(e.assumptionAssessments, []),
    outcomeAssessments: parseJsonField<OutcomeAssessment[]>(e.outcomeAssessments, []),
    riskAssessments: parseJsonField<RiskAssessment[]>(e.riskAssessments, []),
  }));
}

// ─── Tool: compare_thesis_versions ───────────────────────────────────────────

const compareThesisVersionsDefinition: Anthropic.Tool = {
  name: "compare_thesis_versions",
  description: "Compares two thesis versions side-by-side. Use to understand how the thesis has evolved over time and what changed between revisions.",
  input_schema: {
    type: "object" as const,
    properties: {
      thesisId: { type: "string" },
      versionA: { type: "number", description: "First version (defaults to 1 — original)" },
      versionB: { type: "number", description: "Second version (defaults to latest)" },
    },
    required: ["thesisId"],
  },
};

async function compareThesisVersionsHandler(input: Record<string, unknown>) {
  const allVersions = await db.thesisVersion.findMany({
    where: { thesisId: input.thesisId as string },
    orderBy: { version: "asc" },
  });

  const current = await db.thesis.findUnique({
    where: { id: input.thesisId as string },
    include: { position: { select: { ticker: true } } },
  });

  if (!current) return { error: "Thesis not found" };

  const versionA = (input.versionA as number) ?? 1;
  const versionB = (input.versionB as number) ?? current.version;

  const a = allVersions.find((v) => v.version === versionA);
  const b = allVersions.find((v) => v.version === versionB);

  // Version 1 is the original thesis (before any revisions)
  // "current" holds the live state if no versions exist yet
  const stateA = a ?? {
    version: 1,
    thesisText: current.originalThesis,
    keyAssumptions: current.keyAssumptions,
    expectedOutcomes: current.expectedOutcomes,
    risks: current.risks,
    holdingPeriod: current.holdingPeriod,
    entryConfidence: current.entryConfidence,
    revisionReason: "Initial thesis at time of entry",
    createdAt: current.createdAt,
  };

  const stateB = b ?? {
    version: current.version,
    thesisText: current.originalThesis,
    keyAssumptions: current.keyAssumptions,
    expectedOutcomes: current.expectedOutcomes,
    risks: current.risks,
    holdingPeriod: current.holdingPeriod,
    entryConfidence: current.entryConfidence,
    revisionReason: "Current version",
    createdAt: current.updatedAt,
  };

  return {
    ticker: current.position?.ticker,
    versionA: {
      ...stateA,
      keyAssumptions: parseJsonField<ThesisKeyAssumption[]>(stateA.keyAssumptions as string, []),
      expectedOutcomes: parseJsonField<ExpectedOutcome[]>(stateA.expectedOutcomes as string, []),
      risks: parseJsonField<ThesisRisk[]>(stateA.risks as string, []),
    },
    versionB: {
      ...stateB,
      keyAssumptions: parseJsonField<ThesisKeyAssumption[]>(stateB.keyAssumptions as string, []),
      expectedOutcomes: parseJsonField<ExpectedOutcome[]>(stateB.expectedOutcomes as string, []),
      risks: parseJsonField<ThesisRisk[]>(stateB.risks as string, []),
    },
    totalVersions: allVersions.length + 1,
  };
}

// ─── Export ───────────────────────────────────────────────────────────────────

export const thesisEvaluationTools: AgentTool[] = [
  { definition: getThesisForEvaluationDefinition, handler: getThesisForEvaluationHandler },
  { definition: saveThesisEvaluationDefinition, handler: saveThesisEvaluationHandler },
  { definition: reviseThesisDefinition, handler: reviseThesisHandler },
  { definition: getEvaluationHistoryDefinition, handler: getEvaluationHistoryHandler },
  { definition: compareThesisVersionsDefinition, handler: compareThesisVersionsHandler },
];
