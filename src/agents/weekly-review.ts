import Anthropic from "@anthropic-ai/sdk";
import { BaseAgent } from "./base";
import { portfolioTools } from "@/tools/portfolio";
import { journalTools } from "@/tools/journal";
import { newsTools } from "@/tools/news";
import { marketTools } from "@/tools/market";
import { WEEKLY_REVIEW_SYSTEM_PROMPT } from "@/prompts/weekly-review";
import { db } from "@/lib/db";

const saveBriefTool = {
  definition: {
    name: "save_brief",
    description: "Saves the completed weekly review to the database.",
    input_schema: {
      type: "object" as const,
      properties: {
        briefType: { type: "string", enum: ["morning", "weekly"] },
        content: { type: "string", description: "Full markdown content of the weekly review" },
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

export class WeeklyReviewAgent extends BaseAgent {
  constructor() {
    super({
      name: "WeeklyReview",
      systemPrompt: WEEKLY_REVIEW_SYSTEM_PROMPT,
      tools: [...portfolioTools, ...journalTools, ...newsTools, ...marketTools, saveBriefTool],
      maxIterations: 20,
    });
  }

  async generateReview() {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    const dateStr = weekStart.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

    return this.run(
      `Generate the weekly portfolio review for the week of ${dateStr}. ` +
        "Conduct a thorough review of every active position: thesis health, kill conditions, " +
        "earnings, news, and journal entries. Then save the review using save_brief with briefType 'weekly'."
    );
  }
}
