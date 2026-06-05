import Anthropic from "@anthropic-ai/sdk";
import { BaseAgent, type AgentTool } from "@/agents/base";
import { EARNINGS_ANALYST_PROMPT } from "@/prompts/team/earnings-analyst";
import { submitBriefingTool } from "@/tools/team";
import { db } from "@/lib/db";
import { parseJsonField, serializeJsonField } from "@/lib/utils";
import type { EarningsAnalystInput, EarningsAnalystReport } from "@/types/team";

// Inline tool: load position + thesis for earnings analysis
const getPositionForEarningsTool: AgentTool = {
  definition: {
    name: "get_position_for_earnings",
    description: "Loads a position's full thesis, assumptions, kill conditions, and prior earnings for earnings analysis.",
    input_schema: {
      type: "object" as const,
      properties: {
        ticker: { type: "string" },
      },
      required: ["ticker"],
    },
  },
  handler: async (input: Record<string, unknown>) => {
    const position = await db.position.findFirst({
      where: { ticker: (input.ticker as string).toUpperCase(), status: "active" },
      include: {
        thesis: true,
        killConditions: { where: { status: "active" } },
        earningsEvents: { orderBy: { reportDate: "desc" }, take: 4 },
      },
    });

    if (!position) return { error: `Position not found: ${input.ticker}` };
    if (!position.thesis) return { error: `No thesis for ${input.ticker}` };

    return {
      id: position.id,
      ticker: position.ticker,
      thesis: {
        originalThesis: position.thesis.originalThesis,
        keyAssumptions: parseJsonField(position.thesis.keyAssumptions, []),
        expectedOutcomes: parseJsonField(position.thesis.expectedOutcomes, []),
        risks: parseJsonField(position.thesis.risks, []),
      },
      killConditions: position.killConditions,
      priorEarnings: position.earningsEvents.map((e) => ({
        fiscalPeriod: e.fiscalPeriod,
        reportDate: e.reportDate,
        epsActual: e.epsActual,
        revenueActual: e.revenueActual,
        thesisImpact: e.thesisImpact,
      })),
    };
  },
};

// Inline tool: save earnings event to DB
const saveEarningsEventTool: AgentTool = {
  definition: {
    name: "save_earnings_event",
    description: "Saves the earnings event to the database with thesis impact analysis.",
    input_schema: {
      type: "object" as const,
      properties: {
        ticker: { type: "string" },
        fiscalPeriod: { type: "string" },
        reportDate: { type: "string" },
        epsActual: { type: "number" },
        epsEstimate: { type: "number" },
        revenueActual: { type: "number" },
        revenueEstimate: { type: "number" },
        guidanceSummary: { type: "string" },
        thesisImpact: { type: "string", enum: ["positive", "negative", "neutral", "n/a"] },
        thesisAssumptionsHit: { type: "string", description: "JSON: AssumptionCheck[]" },
        killConditionsChecked: { type: "string", description: "JSON: KillConditionCheck[]" },
      },
      required: ["ticker", "fiscalPeriod"],
    },
  },
  handler: async (input: Record<string, unknown>) => {
    const position = await db.position.findFirst({
      where: { ticker: (input.ticker as string).toUpperCase(), status: "active" },
      select: { id: true },
    });

    const event = await db.earningsEvent.create({
      data: {
        ticker: (input.ticker as string).toUpperCase(),
        positionId: position?.id ?? null,
        fiscalPeriod: input.fiscalPeriod as string,
        reportDate: input.reportDate ? new Date(input.reportDate as string) : null,
        epsActual: (input.epsActual as number) ?? null,
        epsEstimate: (input.epsEstimate as number) ?? null,
        revenueActual: (input.revenueActual as number) ?? null,
        revenueEstimate: (input.revenueEstimate as number) ?? null,
        guidanceSummary: (input.guidanceSummary as string) ?? null,
        thesisImpact: (input.thesisImpact as string) ?? null,
        thesisAssumptionsHit: (input.thesisAssumptionsHit as string) ?? null,
        killConditionsChecked: (input.killConditionsChecked as string) ?? null,
      },
    });

    return { earningsEventId: event.id };
  },
};

// Inline tool: trigger a kill condition
const triggerKillConditionTool: AgentTool = {
  definition: {
    name: "trigger_kill_condition",
    description: "Marks a kill condition as triggered when earnings data confirms the threshold was crossed.",
    input_schema: {
      type: "object" as const,
      properties: {
        conditionId: { type: "string" },
        triggeredNote: { type: "string", description: "Evidence from earnings that triggered this condition" },
      },
      required: ["conditionId", "triggeredNote"],
    },
  },
  handler: async (input: Record<string, unknown>) => {
    const condition = await db.killCondition.update({
      where: { id: input.conditionId as string },
      data: {
        status: "triggered",
        triggeredAt: new Date(),
        triggeredNote: input.triggeredNote as string,
      },
      include: { position: { select: { id: true, ticker: true, thesis: true } } },
    });

    // Auto-create SELL recommendation
    const thesisReference =
      condition.position.thesis?.originalThesis?.slice(0, 200) ??
      "Kill condition triggered — see condition details";

    await db.recommendation.create({
      data: {
        positionId: condition.positionId,
        action: "sell",
        reasoning: `Kill condition triggered: ${condition.description}. Evidence: ${input.triggeredNote}`,
        thesisReference,
        killConditionId: condition.id,
        urgency: "critical",
        status: "pending",
      },
    });

    return { triggered: true, conditionId: condition.id, ticker: condition.position.ticker };
  },
};

export class EarningsAnalystAgent extends BaseAgent {
  constructor() {
    super({
      name: "earnings-analyst",
      systemPrompt: EARNINGS_ANALYST_PROMPT,
      tools: [
        getPositionForEarningsTool,
        saveEarningsEventTool,
        triggerKillConditionTool,
        submitBriefingTool,
      ],
      maxIterations: 20,
    });
  }

  async analyze(input: EarningsAnalystInput): Promise<void> {
    const prompt = `
Analyze earnings for ${input.ticker} in session ${input.sessionId}.
${input.focusArea ? `Focus area: ${input.focusArea}` : ""}

Earnings data:
${serializeJsonField(input.earningsData)}

Steps:
1. Call get_position_for_earnings for ${input.ticker} to load thesis, assumptions, and kill conditions.
2. Map each earnings metric to the relevant thesis assumptions.
3. Check every active kill condition against the earnings data.
4. If any kill condition threshold is crossed, call trigger_kill_condition immediately.
5. Call save_earnings_event to persist the event with your analysis.
6. Call submit_briefing with agentRole="earnings_analyst", ticker="${input.ticker}".

Your EarningsAnalystReport must include:
- keyMetrics: actual numbers from the report, keyed by the thesis metric names where possible
- assumptionChecks: for every measurable assumption, confirmed/neutral/contradicted
- killConditionChecks: for every active kill condition, whether triggered
- urgency: "none" | "review" | "action_required"

Your summary must lead with the most important finding (kill condition status or the single biggest assumption impact).
`.trim();

    await this.run(prompt);
  }
}
