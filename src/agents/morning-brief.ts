import Anthropic from "@anthropic-ai/sdk";
import { BaseAgent } from "./base";
import { portfolioTools } from "@/tools/portfolio";
import { journalTools } from "@/tools/journal";
import { newsTools } from "@/tools/news";
import { marketTools } from "@/tools/market";
import { MORNING_BRIEF_SYSTEM_PROMPT } from "@/prompts/morning-brief";
import { db } from "@/lib/db";

const saveBriefTool = {
  definition: {
    name: "save_brief",
    description: "Saves the completed brief to the database.",
    input_schema: {
      type: "object" as const,
      properties: {
        briefType: { type: "string", enum: ["morning", "weekly"] },
        content: { type: "string", description: "Full markdown content of the brief" },
      },
      required: ["briefType", "content"],
    },
  } as Anthropic.Tool,
  handler: async (input: Record<string, unknown>) => {
    const brief = await db.brief.create({
      data: {
        briefType: input.briefType as string,
        content: input.content as string,
      },
    });
    return { brief };
  },
};

export class MorningBriefAgent extends BaseAgent {
  constructor() {
    super({
      name: "MorningBrief",
      systemPrompt: MORNING_BRIEF_SYSTEM_PROMPT,
      tools: [...portfolioTools, ...journalTools, ...newsTools, ...marketTools, saveBriefTool],
    });
  }

  async generateBrief() {
    const today = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    return this.run(
      `Generate today's morning brief for ${today}. ` +
        "Review all active positions, pending recommendations, recent news, and thesis health. " +
        "Then save the brief using save_brief with briefType 'morning'."
    );
  }
}
