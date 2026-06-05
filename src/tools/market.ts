import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import type { AgentTool } from "@/agents/base";

const getEarningsDefinition: Anthropic.Tool = {
  name: "get_earnings",
  description: "Retrieves stored earnings events for a ticker, including thesis impact analysis.",
  input_schema: {
    type: "object" as const,
    properties: {
      ticker: { type: "string" },
      limit: { type: "number", description: "Max events to return (default 4)" },
    },
    required: ["ticker"],
  },
};

async function getEarningsHandler(input: Record<string, unknown>) {
  const events = await db.earningsEvent.findMany({
    where: { ticker: (input.ticker as string).toUpperCase() },
    orderBy: { reportDate: "desc" },
    take: (input.limit as number) ?? 4,
  });
  return events;
}

const saveEarningsEventDefinition: Anthropic.Tool = {
  name: "save_earnings_event",
  description:
    "Saves an earnings event with thesis impact analysis. Checks if any quantitative kill conditions are triggered.",
  input_schema: {
    type: "object" as const,
    properties: {
      ticker: { type: "string" },
      fiscalPeriod: { type: "string", description: "e.g. Q1 2025" },
      reportDate: { type: "string", description: "ISO date" },
      epsActual: { type: "number" },
      epsEstimate: { type: "number" },
      revenueActual: { type: "number", description: "In millions USD" },
      revenueEstimate: { type: "number", description: "In millions USD" },
      guidanceSummary: { type: "string" },
      thesisImpact: { type: "string", enum: ["positive", "negative", "neutral", "n/a"] },
      thesisAssumptionsHit: {
        type: "string",
        description:
          'JSON array: [{"assumption": "...", "result": "met|missed|n/a"}]',
      },
      killConditionsChecked: {
        type: "string",
        description: 'JSON array: [{"conditionId": "...", "triggered": true|false}]',
      },
    },
    required: ["ticker", "fiscalPeriod", "thesisImpact"],
  },
};

async function saveEarningsEventHandler(input: Record<string, unknown>) {
  const ticker = (input.ticker as string).toUpperCase();

  const position = await db.position.findFirst({
    where: { ticker, status: "active" },
    select: { id: true },
  });

  const event = await db.earningsEvent.create({
    data: {
      positionId: position?.id ?? null,
      ticker,
      fiscalPeriod: input.fiscalPeriod as string,
      reportDate: input.reportDate ? new Date(input.reportDate as string) : null,
      epsActual: (input.epsActual as number) ?? null,
      epsEstimate: (input.epsEstimate as number) ?? null,
      revenueActual: (input.revenueActual as number) ?? null,
      revenueEstimate: (input.revenueEstimate as number) ?? null,
      guidanceSummary: (input.guidanceSummary as string) ?? null,
      thesisImpact: input.thesisImpact as string,
      thesisAssumptionsHit: (input.thesisAssumptionsHit as string) ?? null,
      killConditionsChecked: (input.killConditionsChecked as string) ?? null,
    },
  });

  return { event };
}

const getWatchlistDefinition: Anthropic.Tool = {
  name: "get_watchlist",
  description: "Returns all stocks on the watchlist with their interest reasons and draft theses.",
  input_schema: {
    type: "object" as const,
    properties: {},
    required: [],
  },
};

async function getWatchlistHandler(_input: Record<string, unknown>) {
  const items = await db.watchlist.findMany({ orderBy: { addedAt: "desc" } });
  return items;
}

export const marketTools: AgentTool[] = [
  { definition: getEarningsDefinition, handler: getEarningsHandler },
  { definition: saveEarningsEventDefinition, handler: saveEarningsEventHandler },
  { definition: getWatchlistDefinition, handler: getWatchlistHandler },
];
