import { BaseAgent } from "@/agents/base";
import { THESIS_ANALYST_PROMPT } from "@/prompts/team/thesis-analyst";
import { submitBriefingTool, getPortfolioTool } from "@/tools/team";
import { thesisEvaluationTools } from "@/tools/thesis-evaluation";
import type { ThesisAnalystInput, ThesisAnalystReport } from "@/types/team";

export class ThesisAnalystAgent extends BaseAgent {
  constructor() {
    super({
      name: "thesis-analyst",
      systemPrompt: THESIS_ANALYST_PROMPT,
      tools: [
        ...thesisEvaluationTools,
        submitBriefingTool,
        getPortfolioTool,
      ],
      maxIterations: 20,
    });
  }

  async analyze(input: ThesisAnalystInput): Promise<ThesisAnalystReport | null> {
    const prompt = `
Analyze the thesis for ${input.ticker} in session ${input.sessionId}.
${input.focusArea ? `Focus area: ${input.focusArea}` : ""}

Steps:
1. Call get_thesis_for_evaluation to load all thesis components, kill conditions, recent news, and earnings.
2. Score each assumption, expected outcome, and risk with specific evidence from the loaded data.
3. Determine integrity score independently.
4. Set needsRevision = true only if reality has materially changed, not just underperformed.
5. Call submit_briefing with agentRole="thesis_analyst", ticker="${input.ticker}", and your typed ThesisAnalystReport as the report field.

Your summary should be 2-3 sentences: overall thesis status, most important finding, and recommendation.
`.trim();

    const result = await this.run(prompt);
    if (!result.success) return null;

    return null; // actual report was submitted via submit_briefing tool; caller reads from DB
  }
}
