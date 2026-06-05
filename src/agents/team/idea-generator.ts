import Anthropic from "@anthropic-ai/sdk";
import { BaseAgent, type AgentTool } from "@/agents/base";
import { IDEA_GENERATOR_PROMPT } from "@/prompts/team/idea-generator";
import { submitBriefingTool, getWatchlistTool } from "@/tools/team";
import { db } from "@/lib/db";
import type { IdeaGeneratorInput } from "@/types/team";

// Inline tool: add a new idea to the watchlist
const addToWatchlistTool: AgentTool = {
  definition: {
    name: "add_to_watchlist",
    description: "Adds a new company to the watchlist for future research.",
    input_schema: {
      type: "object" as const,
      properties: {
        ticker: { type: "string" },
        name: { type: "string" },
        interestReason: { type: "string", description: "Why this is worth watching" },
        draftThesis: { type: "string", description: "Initial thesis hypothesis" },
        targetEntryPrice: { type: "number", description: "Optional price target for entry consideration" },
      },
      required: ["ticker", "name", "interestReason"],
    },
  },
  handler: async (input: Record<string, unknown>) => {
    const item = await db.watchlist.create({
      data: {
        ticker: (input.ticker as string).toUpperCase(),
        name: input.name as string,
        interestReason: input.interestReason as string,
        draftThesis: (input.draftThesis as string) ?? null,
        targetEntryPrice: (input.targetEntryPrice as number) ?? null,
      },
    });
    return { watchlistId: item.id, ticker: item.ticker };
  },
};

export class IdeaGeneratorAgent extends BaseAgent {
  constructor() {
    super({
      name: "idea-generator",
      systemPrompt: IDEA_GENERATOR_PROMPT,
      tools: [
        getWatchlistTool,
        addToWatchlistTool,
        submitBriefingTool,
      ],
      maxIterations: 15,
    });
  }

  async analyze(input: IdeaGeneratorInput): Promise<void> {
    const prompt = `
Generate investment ideas in session ${input.sessionId}.
Current portfolio tickers (do not duplicate): ${input.currentTickers.join(", ")}
${input.focusArea ? `Focus area: ${input.focusArea}` : ""}

Steps:
1. Call get_watchlist to review all watchlist candidates.
2. For each watchlist item, evaluate readiness: "ready_to_research" | "needs_more_data" | "not_ready".
3. For "ready_to_research" items, write a draftThesisSummary (the investment case in 2-3 sentences).
4. Identify portfolio gaps — themes or sectors not represented in the current portfolio.
5. Generate 2-3 new ideas (not on watchlist) if there are compelling, thesis-articulable opportunities.
   - For any strong new idea, call add_to_watchlist.
6. Call submit_briefing with agentRole="idea_generator" (no ticker).

Quality bar: Only include ideas where you can write a coherent thesisHypothesis. Vague speculations do not meet the bar.

Your IdeaGeneratorReport.conviction should be "high" only if you have at least one "ready_to_research" candidate with a compelling draft thesis.
`.trim();

    await this.run(prompt);
  }
}
