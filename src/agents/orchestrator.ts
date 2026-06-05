import { ThesisMonitorAgent } from "./thesis-monitor";
import { ThesisEvaluatorAgent } from "./thesis-evaluator";
import { KillConditionCheckerAgent } from "./kill-condition-checker";
import { NewsAnalystAgent } from "./news-analyst";
import { EarningsAnalystAgent } from "./earnings-analyst";
import { MorningBriefAgent } from "./morning-brief";
import { WeeklyReviewAgent } from "./weekly-review";
import { InvestmentTeamSession } from "./team/session";
import type { AgentRunResult } from "@/types";
import type { TeamSessionInput } from "@/types/team";

export type AgentType =
  | "thesis-monitor"
  | "thesis-evaluator"
  | "kill-condition-checker"
  | "news-analyst"
  | "earnings-analyst"
  | "morning-brief"
  | "weekly-review"
  | "team-session";

export class AgentOrchestrator {
  async run(
    agentType: AgentType,
    options: {
      positionId?: string;
      ticker?: string;
      additionalContext?: string;
      earningsData?: Record<string, unknown>;
      newsItems?: Array<{ ticker: string; headline: string; content?: string; url?: string }>;
      versionA?: number;
      versionB?: number;
      teamSessionInput?: TeamSessionInput;
    } = {}
  ): Promise<AgentRunResult> {
    try {
      switch (agentType) {
        case "thesis-monitor": {
          const agent = new ThesisMonitorAgent();
          const result = options.ticker
            ? await agent.reviewPosition(options.ticker)
            : await agent.runFullReview();
          return { ...result, agentType };
        }

        case "thesis-evaluator": {
          const agent = new ThesisEvaluatorAgent();
          let result;
          if (options.additionalContext && options.ticker) {
            result = await agent.evaluateAfterEvent(options.ticker, options.additionalContext);
          } else if (options.ticker && (options.versionA || options.versionB)) {
            result = await agent.compareVersions(options.ticker, options.versionA, options.versionB);
          } else if (options.ticker) {
            result = await agent.evaluatePosition(options.ticker);
          } else {
            result = await agent.evaluateAll();
          }
          return { ...result, agentType };
        }

        case "kill-condition-checker": {
          const agent = new KillConditionCheckerAgent();
          const result = options.ticker
            ? await agent.checkPosition(options.ticker)
            : await agent.runFullCheck();
          return { ...result, agentType };
        }

        case "news-analyst": {
          const agent = new NewsAnalystAgent();
          if (!options.newsItems?.length) {
            return {
              success: false,
              output: "",
              toolCallCount: 0,
              agentType,
              error: "news-analyst requires newsItems",
            };
          }
          const result = await agent.analyzeNews(options.newsItems);
          return { ...result, agentType };
        }

        case "earnings-analyst": {
          const agent = new EarningsAnalystAgent();
          if (!options.ticker || !options.earningsData) {
            return {
              success: false,
              output: "",
              toolCallCount: 0,
              agentType,
              error: "earnings-analyst requires ticker and earningsData",
            };
          }
          const result = await agent.analyzeEarnings(
            options.ticker,
            options.earningsData as Parameters<EarningsAnalystAgent["analyzeEarnings"]>[1]
          );
          return { ...result, agentType };
        }

        case "morning-brief": {
          const agent = new MorningBriefAgent();
          const result = await agent.generateBrief();
          return { ...result, agentType };
        }

        case "weekly-review": {
          const agent = new WeeklyReviewAgent();
          const result = await agent.generateReview();
          return { ...result, agentType };
        }

        case "team-session": {
          if (!options.teamSessionInput) {
            return {
              success: false,
              output: "",
              toolCallCount: 0,
              agentType,
              error: "team-session requires teamSessionInput",
            };
          }
          const teamSession = new InvestmentTeamSession();
          const result = await teamSession.run(options.teamSessionInput);
          return {
            success: result.status === "complete",
            output: JSON.stringify(result),
            toolCallCount: 0,
            agentType,
            error: result.error,
          };
        }

        default:
          return {
            success: false,
            output: "",
            toolCallCount: 0,
            agentType,
            error: `Unknown agent type: ${agentType}`,
          };
      }
    } catch (err) {
      return {
        success: false,
        output: "",
        toolCallCount: 0,
        agentType,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
