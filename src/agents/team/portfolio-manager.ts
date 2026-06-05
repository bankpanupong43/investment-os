import { BaseAgent, type AgentTool } from "@/agents/base";
import { PORTFOLIO_MANAGER_PROMPT } from "@/prompts/team/portfolio-manager";
import {
  getBriefingsTool,
  getPortfolioTool,
  finalizeSessionTool,
  submitBriefingTool,
} from "@/tools/team";
import type { TriggerType } from "@/types/team";

export class PortfolioManagerAgent extends BaseAgent {
  constructor() {
    super({
      name: "portfolio-manager",
      systemPrompt: PORTFOLIO_MANAGER_PROMPT,
      tools: [
        getPortfolioTool,
        getBriefingsTool,
        finalizeSessionTool,
        submitBriefingTool,
      ],
      maxIterations: 25,
    });
  }

  async synthesize(params: {
    sessionId: string;
    triggerType: TriggerType;
    triggerNote?: string;
    tickers: string[];
  }): Promise<string> {
    const prompt = `
You are finalizing investment team session ${params.sessionId}.
Trigger: ${params.triggerType}${params.triggerNote ? ` — ${params.triggerNote}` : ""}
Tickers reviewed: ${params.tickers.length > 0 ? params.tickers.join(", ") : "Full portfolio"}

Steps:
1. Call get_portfolio_for_session to load current portfolio state.
2. Call get_briefings with sessionId="${params.sessionId}" to read all analyst findings.
3. For each position reviewed, weigh all analyst inputs against the original thesis.
4. Apply the decision rules: sell only on thesis break or kill condition; add only on increased conviction; hold is the default.
5. Build your evidenceChain for every decision — minimum 2 links, sourced from actual analyst briefing content.
6. For every decision, include thesisReference — an exact quote from the original thesis.
7. Call finalize_session with:
   - synthesis: JSON PortfolioManagerDecision (sessionSummary, decisions, noActionPositions, portfolioOutlook, nextReviewTriggers)
   - decisions: array of actions requiring Recommendation records (omit pure "hold" decisions)

Decision rules reminder:
- SELL: kill condition triggered OR thesis factually broken
- REDUCE: one critical assumption at risk with deteriorating trend
- ADD: conviction increased with new confirming evidence
- HOLD: thesis intact, no new material information
- WATCH: assumption at risk but need more evidence

Forbidden inputs: price movement, market sentiment, analyst ratings, recency bias.

After calling finalize_session, output a brief plain-English summary of your decisions for the session log.
`.trim();

    const result = await this.run(prompt);
    return result.output;
  }
}
