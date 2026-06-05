import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { parseJsonField, serializeJsonField } from "@/lib/utils";
import type { AgentTool } from "@/agents/base";

// ─── Tool: get_portfolio ─────────────────────────────────────────────────────

const getPortfolioDefinition: Anthropic.Tool = {
  name: "get_portfolio",
  description:
    "Returns all active portfolio positions with their investment theses, kill conditions, and health status. Use this first to understand the current portfolio.",
  input_schema: {
    type: "object" as const,
    properties: {
      status: {
        type: "string",
        enum: ["active", "closed", "all"],
        description: "Filter by position status. Defaults to 'active'.",
      },
    },
    required: [],
  },
};

async function getPortfolioHandler(input: Record<string, unknown>) {
  const status = (input.status as string) ?? "active";
  const where = status === "all" ? {} : { status: status === "closed" ? "closed" : "active" };

  const positions = await db.position.findMany({
    where,
    include: {
      thesis: { include: { updates: { orderBy: { createdAt: "desc" }, take: 3 } } },
      killConditions: { where: { status: "active" } },
      recommendations: { where: { status: "pending" }, orderBy: { createdAt: "desc" }, take: 3 },
    },
    orderBy: { entryDate: "asc" },
  });

  return positions.map((p) => ({
    ...p,
    thesis: p.thesis
      ? { ...p.thesis, keyAssumptions: parseJsonField<string[]>(p.thesis.keyAssumptions, []) }
      : null,
  }));
}

// ─── Tool: get_position ──────────────────────────────────────────────────────

const getPositionDefinition: Anthropic.Tool = {
  name: "get_position",
  description:
    "Returns full details for a single position by ticker or ID, including complete thesis history, all kill conditions, and recent journal entries.",
  input_schema: {
    type: "object" as const,
    properties: {
      ticker: { type: "string", description: "Ticker symbol (e.g. MSFT)" },
      positionId: { type: "string", description: "Position ID (cuid)" },
    },
    required: [],
  },
};

async function getPositionHandler(input: Record<string, unknown>) {
  const where = input.positionId
    ? { id: input.positionId as string }
    : { ticker: (input.ticker as string).toUpperCase() };

  const position = await db.position.findFirst({
    where,
    include: {
      thesis: { include: { updates: { orderBy: { createdAt: "desc" } } } },
      killConditions: { orderBy: { createdAt: "asc" } },
      journalEntries: { orderBy: { createdAt: "desc" }, take: 10 },
      recommendations: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });

  if (!position) return { error: `Position not found: ${input.ticker ?? input.positionId}` };

  return {
    ...position,
    thesis: position.thesis
      ? { ...position.thesis, keyAssumptions: parseJsonField<string[]>(position.thesis.keyAssumptions, []) }
      : null,
  };
}

// ─── Tool: update_thesis_health ──────────────────────────────────────────────

const updateThesisHealthDefinition: Anthropic.Tool = {
  name: "update_thesis_health",
  description:
    "Updates the thesis health status and score for a position. Also records a thesis update with reasoning.",
  input_schema: {
    type: "object" as const,
    properties: {
      positionId: { type: "string", description: "Position ID" },
      healthStatus: {
        type: "string",
        enum: ["intact", "weakening", "broken", "monitoring"],
        description: "New health status",
      },
      healthScore: {
        type: "number",
        description: "Health score 1-10 (10 = perfectly intact)",
      },
      updateType: {
        type: "string",
        enum: ["confirmation", "weakening", "neutral", "breaking"],
      },
      content: { type: "string", description: "Explanation of the thesis update" },
      triggeredBy: {
        type: "string",
        enum: ["earnings", "news", "manual", "macro", "price_action"],
      },
      sourceUrl: { type: "string", description: "Optional source URL" },
    },
    required: ["positionId", "healthStatus", "healthScore", "updateType", "content"],
  },
};

async function updateThesisHealthHandler(input: Record<string, unknown>) {
  const thesis = await db.thesis.findUnique({
    where: { positionId: input.positionId as string },
  });

  if (!thesis) return { error: "Thesis not found for position" };

  const [updatedThesis, thesisUpdate] = await db.$transaction([
    db.thesis.update({
      where: { id: thesis.id },
      data: {
        healthStatus: input.healthStatus as string,
        healthScore: input.healthScore as number,
        lastReviewedAt: new Date(),
      },
    }),
    db.thesisUpdate.create({
      data: {
        thesisId: thesis.id,
        updateType: input.updateType as string,
        content: input.content as string,
        triggeredBy: (input.triggeredBy as string) ?? null,
        sourceUrl: (input.sourceUrl as string) ?? null,
      },
    }),
  ]);

  return { thesis: updatedThesis, update: thesisUpdate };
}

// ─── Tool: create_recommendation ─────────────────────────────────────────────

const createRecommendationDefinition: Anthropic.Tool = {
  name: "create_recommendation",
  description:
    "Creates an investment recommendation (hold/add/reduce/sell/watch). REQUIRES quoting the original thesis — this enforces thesis-driven decision making. Never recommend based on price alone.",
  input_schema: {
    type: "object" as const,
    properties: {
      positionId: { type: "string", description: "Position ID" },
      action: {
        type: "string",
        enum: ["hold", "add", "reduce", "sell", "watch"],
        description: "Recommended action",
      },
      reasoning: {
        type: "string",
        description: "Full reasoning for this recommendation, referencing thesis status",
      },
      thesisReference: {
        type: "string",
        description:
          "REQUIRED: An exact quote or direct reference to the original investment thesis. Must explain how the recommendation relates to the original thesis.",
      },
      killConditionId: {
        type: "string",
        description: "If triggered by a kill condition, provide the condition ID",
      },
      confidence: {
        type: "number",
        description: "Confidence level 1-5 (5 = highest conviction)",
      },
      urgency: {
        type: "string",
        enum: ["low", "medium", "high", "critical"],
        description: "How urgently this recommendation requires attention",
      },
    },
    required: ["positionId", "action", "reasoning", "thesisReference"],
  },
};

async function createRecommendationHandler(input: Record<string, unknown>) {
  const position = await db.position.findUnique({
    where: { id: input.positionId as string },
    select: { id: true, ticker: true },
  });

  if (!position) return { error: "Position not found" };

  const recommendation = await db.recommendation.create({
    data: {
      positionId: input.positionId as string,
      action: input.action as string,
      reasoning: input.reasoning as string,
      thesisReference: input.thesisReference as string,
      killConditionId: (input.killConditionId as string) ?? null,
      confidence: input.confidence ? (input.confidence as number) : null,
      urgency: (input.urgency as string) ?? "low",
      status: "pending",
    },
  });

  return { recommendation, ticker: position.ticker };
}

// ─── Tool: trigger_kill_condition ────────────────────────────────────────────

const triggerKillConditionDefinition: Anthropic.Tool = {
  name: "trigger_kill_condition",
  description:
    "Marks a kill condition as triggered and automatically creates a SELL recommendation. This is the core enforcement mechanism.",
  input_schema: {
    type: "object" as const,
    properties: {
      killConditionId: { type: "string", description: "Kill condition ID" },
      triggeredNote: {
        type: "string",
        description: "Explanation of why this condition was triggered",
      },
      thesisReference: {
        type: "string",
        description: "Quote from original thesis that this kill condition was designed to protect",
      },
    },
    required: ["killConditionId", "triggeredNote", "thesisReference"],
  },
};

async function triggerKillConditionHandler(input: Record<string, unknown>) {
  const killCondition = await db.killCondition.findUnique({
    where: { id: input.killConditionId as string },
    include: { position: { include: { thesis: true } } },
  });

  if (!killCondition) return { error: "Kill condition not found" };
  if (killCondition.status === "triggered") return { error: "Kill condition already triggered" };

  const [updatedCondition, recommendation] = await db.$transaction([
    db.killCondition.update({
      where: { id: killCondition.id },
      data: {
        status: "triggered",
        triggeredAt: new Date(),
        triggeredNote: input.triggeredNote as string,
      },
    }),
    db.recommendation.create({
      data: {
        positionId: killCondition.positionId,
        action: "sell",
        reasoning: `Kill condition triggered: "${killCondition.description}"\n\n${input.triggeredNote}`,
        thesisReference: input.thesisReference as string,
        killConditionId: killCondition.id,
        urgency: "critical",
        confidence: 5,
        status: "pending",
      },
    }),
  ]);

  return {
    killCondition: updatedCondition,
    recommendation,
    ticker: killCondition.position.ticker,
  };
}

// ─── Tool: add_journal_entry ─────────────────────────────────────────────────

const addJournalEntryDefinition: Anthropic.Tool = {
  name: "add_journal_entry",
  description: "Adds a journal entry for a position or as a general macro observation.",
  input_schema: {
    type: "object" as const,
    properties: {
      positionId: { type: "string", description: "Position ID (optional for macro entries)" },
      entryType: {
        type: "string",
        enum: ["buy_rationale", "thesis_update", "decision", "observation", "earnings_note", "macro"],
      },
      content: { type: "string", description: "Journal entry content" },
    },
    required: ["entryType", "content"],
  },
};

async function addJournalEntryHandler(input: Record<string, unknown>) {
  const entry = await db.journalEntry.create({
    data: {
      positionId: (input.positionId as string) ?? null,
      entryType: input.entryType as string,
      content: input.content as string,
    },
  });
  return { entry };
}

// ─── Tool: get_pending_recommendations ───────────────────────────────────────

const getPendingRecommendationsDefinition: Anthropic.Tool = {
  name: "get_pending_recommendations",
  description: "Returns all pending recommendations that have not yet been acknowledged or acted on.",
  input_schema: {
    type: "object" as const,
    properties: {
      urgency: {
        type: "string",
        enum: ["low", "medium", "high", "critical"],
        description: "Filter by urgency level",
      },
    },
    required: [],
  },
};

async function getPendingRecommendationsHandler(input: Record<string, unknown>) {
  const where: Record<string, unknown> = { status: "pending" };
  if (input.urgency) where.urgency = input.urgency;

  const recommendations = await db.recommendation.findMany({
    where,
    include: {
      position: { select: { ticker: true, name: true } },
      killCondition: true,
    },
    orderBy: [
      { urgency: "desc" },
      { createdAt: "desc" },
    ],
  });

  return recommendations;
}

// ─── Export ───────────────────────────────────────────────────────────────────

export const portfolioTools: AgentTool[] = [
  { definition: getPortfolioDefinition, handler: getPortfolioHandler },
  { definition: getPositionDefinition, handler: getPositionHandler },
  { definition: updateThesisHealthDefinition, handler: updateThesisHealthHandler },
  { definition: createRecommendationDefinition, handler: createRecommendationHandler },
  { definition: triggerKillConditionDefinition, handler: triggerKillConditionHandler },
  { definition: addJournalEntryDefinition, handler: addJournalEntryHandler },
  { definition: getPendingRecommendationsDefinition, handler: getPendingRecommendationsHandler },
];
