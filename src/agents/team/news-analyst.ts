import Anthropic from "@anthropic-ai/sdk";
import { BaseAgent, type AgentTool } from "@/agents/base";
import { NEWS_ANALYST_PROMPT } from "@/prompts/team/news-analyst";
import { submitBriefingTool, getPortfolioTool } from "@/tools/team";
import { db } from "@/lib/db";
import { serializeJsonField } from "@/lib/utils";
import type { NewsAnalystInput, RawNewsItem } from "@/types/team";

// Inline tool: save news items to DB so they are persistent and linkable
const saveNewsItemsTool: AgentTool = {
  definition: {
    name: "save_news_items",
    description: "Saves analyzed news items to the database, linking them to the relevant position.",
    input_schema: {
      type: "object" as const,
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              ticker: { type: "string" },
              headline: { type: "string" },
              content: { type: "string" },
              source: { type: "string" },
              url: { type: "string" },
              publishedAt: { type: "string" },
              sentiment: { type: "string", enum: ["positive", "negative", "neutral"] },
              thesisRelevance: { type: "string", enum: ["high", "medium", "low", "none"] },
              relevanceReasoning: { type: "string" },
            },
            required: ["ticker", "headline"],
          },
        },
      },
      required: ["items"],
    },
  },
  handler: async (input: Record<string, unknown>) => {
    const items = input.items as Record<string, unknown>[];
    const positions = await db.position.findMany({
      where: { status: "active" },
      select: { id: true, ticker: true },
    });
    const tickerToId = Object.fromEntries(positions.map((p) => [p.ticker, p.id]));

    const created = await Promise.all(
      items.map((item) =>
        db.newsItem.create({
          data: {
            ticker: (item.ticker as string).toUpperCase(),
            headline: item.headline as string,
            content: (item.content as string) ?? null,
            source: (item.source as string) ?? null,
            url: (item.url as string) ?? null,
            publishedAt: item.publishedAt ? new Date(item.publishedAt as string) : null,
            sentiment: (item.sentiment as string) ?? null,
            thesisRelevance: (item.thesisRelevance as string) ?? null,
            relevanceReasoning: (item.relevanceReasoning as string) ?? null,
            positionId: tickerToId[(item.ticker as string).toUpperCase()] ?? null,
          },
        })
      )
    );
    return { saved: created.length };
  },
};

export class NewsAnalystAgent extends BaseAgent {
  constructor() {
    super({
      name: "news-analyst",
      systemPrompt: NEWS_ANALYST_PROMPT,
      tools: [
        getPortfolioTool,
        saveNewsItemsTool,
        submitBriefingTool,
      ],
      maxIterations: 15,
    });
  }

  async analyze(input: NewsAnalystInput): Promise<void> {
    const newsJson = serializeJsonField(input.newsItems);

    const prompt = `
Analyze news for the following tickers in session ${input.sessionId}: ${input.tickers.join(", ")}.
${input.focusArea ? `Focus area: ${input.focusArea}` : ""}

News items to analyze (${input.newsItems.length} total):
${newsJson}

Steps:
1. Call get_portfolio_for_session with tickers=[${input.tickers.map((t) => `"${t}"`).join(",")}] to load thesis data for each position.
2. For each news item, evaluate relevance against the specific thesis assumptions and kill conditions.
3. Filter out all irrelevant items (price movement, analyst ratings, general market commentary).
4. Call save_news_items with the items that have thesisRelevance of "high" or "medium", including your relevance reasoning.
5. Call submit_briefing with agentRole="news_analyst" (no ticker — this is a portfolio-wide report).

Structure your NewsAnalystReport:
- coverage[]: one TickerNewsSummary per ticker
- macroSignals[]: portfolio-wide macro implications
- urgentItems[]: items requiring immediate PM attention
- noNewsPositions[]: tickers with no thesis-relevant news

Your summary should state: overall noise level today, how many tickers have relevant news, and the single most important finding.
`.trim();

    await this.run(prompt);
  }
}
