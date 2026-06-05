import Anthropic from "@anthropic-ai/sdk";
import { BaseAgent, type AgentTool } from "@/agents/base";
import { RISK_MANAGER_PROMPT } from "@/prompts/team/risk-manager";
import { submitBriefingTool, getPortfolioTool } from "@/tools/team";
import { db } from "@/lib/db";
import { parseJsonField } from "@/lib/utils";
import type { RiskManagerInput } from "@/types/team";

// Inline tool: get detailed risk data per position
const getPortfolioRiskDataTool: AgentTool = {
  definition: {
    name: "get_portfolio_risk_data",
    description:
      "Loads detailed risk data for all positions: thesis risks, kill conditions with thresholds, holding periods, and recent thesis evaluations.",
    input_schema: {
      type: "object" as const,
      properties: {
        tickers: {
          type: "array",
          items: { type: "string" },
          description: "Specific tickers to load. Omit for all active positions.",
        },
      },
      required: [],
    },
  },
  handler: async (input: Record<string, unknown>) => {
    const tickers = input.tickers as string[] | undefined;

    const positions = await db.position.findMany({
      where: {
        status: "active",
        ...(tickers && tickers.length > 0 ? { ticker: { in: tickers.map((t) => t.toUpperCase()) } } : {}),
      },
      include: {
        thesis: {
          include: {
            evaluations: { orderBy: { createdAt: "desc" }, take: 2 },
          },
        },
        killConditions: { where: { status: "active" } },
      },
    });

    const now = new Date();

    return positions.map((p) => {
      const entryDate = new Date(p.entryDate);
      const daysHeld = Math.floor((now.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
      const holdingPeriodMonths = p.thesis?.holdingPeriodMonths;
      const holdingPeriodDays = holdingPeriodMonths ? holdingPeriodMonths * 30 : null;

      let holdingPeriodStatus: "within_horizon" | "approaching_horizon" | "past_horizon" = "within_horizon";
      if (holdingPeriodDays) {
        if (daysHeld > holdingPeriodDays) {
          holdingPeriodStatus = "past_horizon";
        } else if (daysHeld > holdingPeriodDays * 0.8) {
          holdingPeriodStatus = "approaching_horizon";
        }
      }

      return {
        id: p.id,
        ticker: p.ticker,
        name: p.name,
        entryDate: p.entryDate,
        daysHeld,
        holdingPeriodStatus,
        holdingPeriod: p.thesis?.holdingPeriod,
        holdingPeriodMonths,
        thesis: p.thesis
          ? {
              healthStatus: p.thesis.healthStatus,
              healthScore: p.thesis.healthScore,
              risks: parseJsonField(p.thesis.risks, []),
              latestEvaluation: p.thesis.evaluations[0] ?? null,
            }
          : null,
        killConditions: p.killConditions.map((kc) => ({
          id: kc.id,
          description: kc.description,
          conditionType: kc.conditionType,
          metric: kc.metric,
          operator: kc.operator,
          threshold: kc.threshold,
          status: kc.status,
        })),
      };
    });
  },
};

export class RiskManagerAgent extends BaseAgent {
  constructor() {
    super({
      name: "risk-manager",
      systemPrompt: RISK_MANAGER_PROMPT,
      tools: [
        getPortfolioRiskDataTool,
        submitBriefingTool,
      ],
      maxIterations: 15,
    });
  }

  async analyze(input: RiskManagerInput): Promise<void> {
    const tickersNote =
      input.tickers.length > 0
        ? `Focus on these tickers: ${input.tickers.join(", ")}`
        : "Review the full portfolio.";

    const prompt = `
Produce a risk assessment for the portfolio in session ${input.sessionId}.
${tickersNote}
${input.focusArea ? `Focus area: ${input.focusArea}` : ""}

Steps:
1. Call get_portfolio_risk_data to load kill conditions, thesis risks, holding periods, and health scores for all relevant positions.
2. For each position, determine overallRisk level and identify any near-trigger conditions.
3. Flag positions past their holding period horizon.
4. Identify cross-portfolio concentration and correlation risks.
5. Create CriticalAlert entries for any triggered kill conditions, near-trigger conditions (within 5%), broken theses, or past-horizon positions.
6. Call submit_briefing with agentRole="risk_manager" (no ticker — this is a portfolio-wide report).

Your RiskManagerReport.summary should be 2-3 sentences: overall heat level, most critical active risks, and the PM's most urgent action.
`.trim();

    await this.run(prompt);
  }
}
