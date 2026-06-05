import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import type { AgentTool } from "@/agents/base";

const getJournalDefinition: Anthropic.Tool = {
  name: "get_journal",
  description: "Retrieves journal entries, optionally filtered by position or entry type.",
  input_schema: {
    type: "object" as const,
    properties: {
      positionId: { type: "string" },
      entryType: {
        type: "string",
        enum: ["buy_rationale", "thesis_update", "decision", "observation", "earnings_note", "macro"],
      },
      limit: { type: "number", description: "Max entries to return (default 20)" },
    },
    required: [],
  },
};

async function getJournalHandler(input: Record<string, unknown>) {
  const where: Record<string, unknown> = {};
  if (input.positionId) where.positionId = input.positionId;
  if (input.entryType) where.entryType = input.entryType;

  const entries = await db.journalEntry.findMany({
    where,
    include: { position: { select: { ticker: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: (input.limit as number) ?? 20,
  });

  return entries;
}

const getThesisHistoryDefinition: Anthropic.Tool = {
  name: "get_thesis_history",
  description: "Returns the full thesis update history for a position to understand how the thesis has evolved over time.",
  input_schema: {
    type: "object" as const,
    properties: {
      positionId: { type: "string", description: "Position ID" },
    },
    required: ["positionId"],
  },
};

async function getThesisHistoryHandler(input: Record<string, unknown>) {
  const thesis = await db.thesis.findUnique({
    where: { positionId: input.positionId as string },
    include: {
      updates: { orderBy: { createdAt: "asc" } },
      position: { select: { ticker: true, name: true, entryDate: true } },
    },
  });

  if (!thesis) return { error: "No thesis found for this position" };
  return thesis;
}

export const journalTools: AgentTool[] = [
  { definition: getJournalDefinition, handler: getJournalHandler },
  { definition: getThesisHistoryDefinition, handler: getThesisHistoryHandler },
];
