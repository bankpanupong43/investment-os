import { BaseAgent } from "./base";
import { portfolioTools } from "@/tools/portfolio";
import { journalTools } from "@/tools/journal";
import { THESIS_MONITOR_SYSTEM_PROMPT } from "@/prompts/thesis-monitor";

export class ThesisMonitorAgent extends BaseAgent {
  constructor() {
    super({
      name: "ThesisMonitor",
      systemPrompt: THESIS_MONITOR_SYSTEM_PROMPT,
      tools: [...portfolioTools, ...journalTools],
    });
  }

  async runFullReview() {
    return this.run(
      "Review the thesis health of all active portfolio positions. " +
        "Check each thesis against recent developments, update health scores, " +
        "and create recommendations where warranted. Be thorough."
    );
  }

  async reviewPosition(ticker: string) {
    return this.run(
      `Review the thesis health for ${ticker}. ` +
        "Fetch the full position details, review the original thesis and all updates, " +
        "assess whether key assumptions still hold, and update the health score."
    );
  }
}
