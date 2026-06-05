import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import type { AgentTool } from "@/agents/base";

const getNewsDefinition: Anthropic.Tool = {
  name: "get_news",
  description: "Retrieves stored news items for a ticker or all tickers, filtered by thesis relevance.",
  input_schema: {
    type: "object" as const,
    properties: {
      ticker: { type: "string", description: "Ticker symbol to filter news for" },
      thesisRelevance: {
        type: "string",
        enum: ["high", "medium", "low", "none"],
        description: "Filter by thesis relevance",
      },
      limit: { type: "number", description: "Max items to return (default 10)" },
      since: { type: "string", description: "ISO date string to filter news after this date" },
    },
    required: [],
  },
};

async function getNewsHandler(input: Record<string, unknown>) {
  const where: Record<string, unknown> = {};
  if (input.ticker) where.ticker = (input.ticker as string).toUpperCase();
  if (input.thesisRelevance) where.thesisRelevance = input.thesisRelevance;
  if (input.since) where.fetchedAt = { gte: new Date(input.since as string) };

  const newsItems = await db.newsItem.findMany({
    where,
    include: { position: { select: { ticker: true } } },
    orderBy: { fetchedAt: "desc" },
    take: (input.limit as number) ?? 10,
  });

  return newsItems;
}

const saveNewsItemDefinition: Anthropic.Tool = {
  name: "save_news_item",
  description:
    "Saves a news item with thesis relevance analysis. Call this after analyzing news to persist the analysis.",
  input_schema: {
    type: "object" as const,
    properties: {
      ticker: { type: "string" },
      headline: { type: "string" },
      content: { type: "string" },
      source: { type: "string" },
      url: { type: "string" },
      sentiment: { type: "string", enum: ["positive", "negative", "neutral"] },
      thesisRelevance: { type: "string", enum: ["high", "medium", "low", "none"] },
      relevanceReasoning: {
        type: "string",
        description: "Explanation of why this is relevant or not relevant to the thesis",
      },
      publishedAt: { type: "string", description: "ISO date string of publication" },
    },
    required: ["ticker", "headline", "thesisRelevance", "relevanceReasoning"],
  },
};

async function saveNewsItemHandler(input: Record<string, unknown>) {
  const ticker = (input.ticker as string).toUpperCase();

  const position = await db.position.findFirst({
    where: { ticker, status: "active" },
    select: { id: true },
  });

  const newsItem = await db.newsItem.create({
    data: {
      positionId: position?.id ?? null,
      ticker,
      headline: input.headline as string,
      content: (input.content as string) ?? null,
      source: (input.source as string) ?? null,
      url: (input.url as string) ?? null,
      sentiment: (input.sentiment as string) ?? null,
      thesisRelevance: input.thesisRelevance as string,
      relevanceReasoning: input.relevanceReasoning as string,
      publishedAt: input.publishedAt ? new Date(input.publishedAt as string) : null,
    },
  });

  return { newsItem };
}

export const newsTools: AgentTool[] = [
  { definition: getNewsDefinition, handler: getNewsHandler },
  { definition: saveNewsItemDefinition, handler: saveNewsItemHandler },
];
