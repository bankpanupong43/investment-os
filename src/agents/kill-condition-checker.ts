import { BaseAgent } from "./base";
import { portfolioTools } from "@/tools/portfolio";
import { journalTools } from "@/tools/journal";
import { newsTools } from "@/tools/news";
import { marketTools } from "@/tools/market";
import { KILL_CONDITION_SYSTEM_PROMPT } from "@/prompts/kill-condition";

export class KillConditionCheckerAgent extends BaseAgent {
  constructor() {
    super({
      name: "KillConditionChecker",
      systemPrompt: KILL_CONDITION_SYSTEM_PROMPT,
      tools: [...portfolioTools, ...journalTools, ...newsTools, ...marketTools],
    });
  }

  async runFullCheck() {
    return this.run(
      "Check all active kill conditions across all portfolio positions. " +
        "Review each condition against recent earnings and news data. " +
        "Trigger any conditions that have been met and document your reasoning."
    );
  }

  async checkPosition(ticker: string) {
    return this.run(
      `Check all kill conditions for ${ticker}. ` +
        "Review recent earnings, news, and any quantitative metrics to determine if any conditions have been triggered."
    );
  }
}
