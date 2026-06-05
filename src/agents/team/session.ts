import { db } from "@/lib/db";
import { serializeJsonField, parseJsonField } from "@/lib/utils";
import { ThesisAnalystAgent } from "./thesis-analyst";
import { NewsAnalystAgent } from "./news-analyst";
import { EarningsAnalystAgent } from "./earnings-analyst";
import { RiskManagerAgent } from "./risk-manager";
import { IdeaGeneratorAgent } from "./idea-generator";
import { PortfolioManagerAgent } from "./portfolio-manager";
import type {
  TeamSessionInput,
  TeamSessionResult,
  TriggerType,
} from "@/types/team";

export class InvestmentTeamSession {
  async run(input: TeamSessionInput): Promise<TeamSessionResult> {
    const startTime = Date.now();

    // 1. Create session record
    const session = await db.teamSession.create({
      data: {
        triggerType: input.triggerType,
        triggerNote: input.triggerNote ?? null,
        tickers: serializeJsonField(input.tickers ?? []),
        status: "running",
      },
    });

    const sessionId = session.id;

    try {
      // 2. Resolve which tickers to analyze
      const tickers = await this.resolveTickers(input.tickers ?? []);

      // 3. Run analysts in parallel (they do not see each other's reports)
      await this.runAnalysts(sessionId, tickers, input);

      // 4. Portfolio Manager reads all briefings and finalizes decisions
      const pm = new PortfolioManagerAgent();
      const pmOutput = await pm.synthesize({
        sessionId,
        triggerType: input.triggerType,
        triggerNote: input.triggerNote,
        tickers,
      });

      // 5. Load final state from DB
      const finalSession = await db.teamSession.findUnique({
        where: { id: sessionId },
        include: { briefings: true },
      });

      const pmDecision = finalSession?.finalSynthesis
        ? parseJsonField(finalSession.finalSynthesis, undefined)
        : undefined;

      return {
        sessionId,
        triggerType: input.triggerType,
        status: "complete",
        agentOutputs: this.extractAgentOutputs(finalSession?.briefings ?? []),
        pmDecision,
        recommendationsCreated: finalSession?.decisionsCreated ?? 0,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      await db.teamSession.update({
        where: { id: sessionId },
        data: { status: "failed", completedAt: new Date() },
      });

      return {
        sessionId,
        triggerType: input.triggerType,
        status: "failed",
        agentOutputs: {},
        recommendationsCreated: 0,
        durationMs: Date.now() - startTime,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async resolveTickers(requestedTickers: string[]): Promise<string[]> {
    if (requestedTickers.length > 0) {
      return requestedTickers.map((t) => t.toUpperCase());
    }
    const positions = await db.position.findMany({
      where: { status: "active" },
      select: { ticker: true },
    });
    return positions.map((p) => p.ticker);
  }

  private async runAnalysts(
    sessionId: string,
    tickers: string[],
    input: TeamSessionInput
  ): Promise<void> {
    const tasks: Promise<void>[] = [];

    // Thesis Analyst: one run per ticker
    const thesisAnalyst = new ThesisAnalystAgent();
    for (const ticker of tickers) {
      tasks.push(
        thesisAnalyst.analyze({ sessionId, ticker }).then(() => undefined)
      );
    }

    // News Analyst: one portfolio-wide run
    if (input.newsItems && input.newsItems.length > 0) {
      const newsAnalyst = new NewsAnalystAgent();
      tasks.push(
        newsAnalyst.analyze({
          sessionId,
          tickers,
          newsItems: input.newsItems,
        })
      );
    }

    // Earnings Analyst: one run per ticker that has earnings data
    if (input.earningsData) {
      const earningsAnalyst = new EarningsAnalystAgent();
      for (const [ticker, earningsData] of Object.entries(input.earningsData)) {
        if (tickers.includes(ticker.toUpperCase())) {
          tasks.push(
            earningsAnalyst.analyze({ sessionId, ticker: ticker.toUpperCase(), earningsData })
          );
        }
      }
    }

    // Risk Manager: one portfolio-wide run
    const riskManager = new RiskManagerAgent();
    tasks.push(riskManager.analyze({ sessionId, tickers }));

    // Idea Generator: runs on idea_generation sessions and weekly_review
    if (
      input.triggerType === "idea_generation" ||
      input.triggerType === "weekly_review"
    ) {
      const ideaGenerator = new IdeaGeneratorAgent();
      tasks.push(ideaGenerator.analyze({ sessionId, currentTickers: tickers }));
    }

    await Promise.allSettled(tasks);
  }

  private extractAgentOutputs(briefings: { agentRole: string; ticker?: string | null; report: string }[]) {
    const outputs: TeamSessionResult["agentOutputs"] = {};

    for (const briefing of briefings) {
      const report = parseJsonField(briefing.report, {});

      switch (briefing.agentRole) {
        case "thesis_analyst":
          if (!outputs.thesisAnalyst) outputs.thesisAnalyst = [];
          outputs.thesisAnalyst.push(report as never);
          break;
        case "news_analyst":
          outputs.newsAnalyst = report as never;
          break;
        case "earnings_analyst":
          if (!outputs.earningsAnalyst) outputs.earningsAnalyst = [];
          outputs.earningsAnalyst.push(report as never);
          break;
        case "risk_manager":
          outputs.riskManager = report as never;
          break;
        case "idea_generator":
          outputs.ideaGenerator = report as never;
          break;
      }
    }

    return outputs;
  }
}
