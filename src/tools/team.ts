import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { parseJsonField, serializeJsonField } from "@/lib/utils";
import type { AgentTool } from "@/agents/base";
import type { AgentRole } from "@/types/team";

// ─── Tool: create_team_session ─────────────────────────────────────────────────

const createTeamSessionDefinition: Anthropic.Tool = {
  name: "create_team_session",
  description: "Creates a new team session record. Call once at the start of any multi-agent analysis cycle.",
  input_schema: {
    type: "object" as const,
    properties: {
      triggerType: {
        type: "string",
        enum: ["morning_review", "earnings_event", "news_event", "weekly_review", "manual", "idea_generation"],
        description: "What triggered this session",
      },
      triggerNote: { type: "string", description: "Human-readable description of what prompted this session" },
      tickers: {
        type: "array",
        items: { type: "string" },
        description: "Tickers to focus on. Empty = full portfolio review.",
      },
    },
    required: ["triggerType"],
  },
};

async function createTeamSessionHandler(input: Record<string, unknown>) {
  const session = await db.teamSession.create({
    data: {
      triggerType: input.triggerType as string,
      triggerNote: (input.triggerNote as string) ?? null,
      tickers: serializeJsonField((input.tickers as string[]) ?? []),
      status: "running",
    },
  });
  return { sessionId: session.id, status: session.status, startedAt: session.startedAt };
}

// ─── Tool: submit_briefing ─────────────────────────────────────────────────────

const submitBriefingDefinition: Anthropic.Tool = {
  name: "submit_briefing",
  description:
    "Submits an analyst briefing to the team session. Each analyst calls this once (or once per ticker for position-specific reports). The Portfolio Manager reads all briefings via get_briefings.",
  input_schema: {
    type: "object" as const,
    properties: {
      sessionId: { type: "string", description: "Team session ID" },
      agentRole: {
        type: "string",
        enum: [
          "portfolio_manager",
          "thesis_analyst",
          "news_analyst",
          "earnings_analyst",
          "risk_manager",
          "idea_generator",
        ],
        description: "Which agent is submitting this briefing",
      },
      ticker: {
        type: "string",
        description: "Ticker symbol for position-specific briefings. Omit for portfolio-wide reports.",
      },
      report: {
        type: "string",
        description: "JSON-serialized typed report matching the agent's report interface",
      },
      summary: {
        type: "string",
        description: "2-3 sentence plaintext summary for quick scanning by the Portfolio Manager",
      },
    },
    required: ["sessionId", "agentRole", "report", "summary"],
  },
};

async function submitBriefingHandler(input: Record<string, unknown>) {
  const briefing = await db.agentBriefing.create({
    data: {
      sessionId: input.sessionId as string,
      agentRole: input.agentRole as string,
      ticker: (input.ticker as string) ?? null,
      report: input.report as string,
      summary: input.summary as string,
    },
  });
  return { briefingId: briefing.id, accepted: true };
}

// ─── Tool: get_briefings ───────────────────────────────────────────────────────

const getBriefingsDefinition: Anthropic.Tool = {
  name: "get_briefings",
  description:
    "Fetches all analyst briefings for a team session. Used by the Portfolio Manager to read all specialist findings before making decisions.",
  input_schema: {
    type: "object" as const,
    properties: {
      sessionId: { type: "string", description: "Team session ID" },
      agentRole: {
        type: "string",
        description: "Filter to a specific agent role. Omit to retrieve all briefings.",
      },
      ticker: {
        type: "string",
        description: "Filter to briefings for a specific ticker. Omit for all tickers.",
      },
    },
    required: ["sessionId"],
  },
};

async function getBriefingsHandler(input: Record<string, unknown>) {
  const briefings = await db.agentBriefing.findMany({
    where: {
      sessionId: input.sessionId as string,
      agentRole: input.agentRole ? (input.agentRole as string) : undefined,
      ticker: input.ticker ? (input.ticker as string) : undefined,
    },
    orderBy: { createdAt: "asc" },
  });

  return briefings.map((b) => ({
    id: b.id,
    agentRole: b.agentRole,
    ticker: b.ticker,
    summary: b.summary,
    report: parseJsonField(b.report, {}),
    createdAt: b.createdAt,
  }));
}

// ─── Tool: get_portfolio_for_session ──────────────────────────────────────────

const getPortfolioForSessionDefinition: Anthropic.Tool = {
  name: "get_portfolio_for_session",
  description:
    "Fetches all active positions with their current thesis state, kill conditions, and recent context. Use at the start of any portfolio-wide analysis.",
  input_schema: {
    type: "object" as const,
    properties: {
      tickers: {
        type: "array",
        items: { type: "string" },
        description: "Specific tickers to include. Omit for all active positions.",
      },
    },
    required: [],
  },
};

async function getPortfolioForSessionHandler(input: Record<string, unknown>) {
  const tickers = input.tickers as string[] | undefined;

  const positions = await db.position.findMany({
    where: {
      status: "active",
      ...(tickers && tickers.length > 0 ? { ticker: { in: tickers.map((t) => t.toUpperCase()) } } : {}),
    },
    include: {
      thesis: {
        include: {
          evaluations: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
      killConditions: { where: { status: "active" } },
      recommendations: { where: { status: "pending" }, orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { entryDate: "asc" },
  });

  return positions.map((p) => ({
    id: p.id,
    ticker: p.ticker,
    name: p.name,
    sector: p.sector,
    shares: p.shares,
    avgCost: p.avgCost,
    entryDate: p.entryDate,
    thesis: p.thesis
      ? {
          id: p.thesis.id,
          version: p.thesis.version,
          originalThesis: p.thesis.originalThesis,
          currentAssessment: p.thesis.currentAssessment,
          healthStatus: p.thesis.healthStatus,
          healthScore: p.thesis.healthScore,
          holdingPeriod: p.thesis.holdingPeriod,
          holdingPeriodMonths: p.thesis.holdingPeriodMonths,
          entryConfidence: p.thesis.entryConfidence,
          lastReviewedAt: p.thesis.lastReviewedAt,
          latestEvaluation: p.thesis.evaluations[0] ?? null,
        }
      : null,
    activeKillConditions: p.killConditions.length,
    pendingRecommendation: p.recommendations[0] ?? null,
  }));
}

// ─── Tool: finalize_session ────────────────────────────────────────────────────

const finalizeSessionDefinition: Anthropic.Tool = {
  name: "finalize_session",
  description:
    "Marks a team session as complete and saves the Portfolio Manager's final synthesis. Also creates Recommendation records for any decisions that require action.",
  input_schema: {
    type: "object" as const,
    properties: {
      sessionId: { type: "string", description: "Team session ID" },
      synthesis: {
        type: "string",
        description: "JSON-serialized PortfolioManagerDecision",
      },
      decisions: {
        type: "array",
        description: "Investment decisions requiring Recommendation records",
        items: {
          type: "object",
          properties: {
            positionId: { type: "string" },
            ticker: { type: "string" },
            action: { type: "string", enum: ["hold", "add", "reduce", "sell", "watch"] },
            reasoning: { type: "string" },
            thesisReference: { type: "string" },
            urgency: { type: "string", enum: ["low", "medium", "high", "critical"] },
            confidence: { type: "number" },
          },
          required: ["ticker", "action", "reasoning", "thesisReference"],
        },
      },
    },
    required: ["sessionId", "synthesis"],
  },
};

async function finalizeSessionHandler(input: Record<string, unknown>) {
  const decisions = (input.decisions as Record<string, unknown>[]) ?? [];

  // Resolve positionIds for any decisions that only have tickers
  const tickers = decisions
    .filter((d) => !d.positionId && d.ticker)
    .map((d) => (d.ticker as string).toUpperCase());

  const positions =
    tickers.length > 0
      ? await db.position.findMany({
          where: { ticker: { in: tickers }, status: "active" },
          select: { id: true, ticker: true },
        })
      : [];

  const tickerToId = Object.fromEntries(positions.map((p) => [p.ticker, p.id]));

  const recommendations = await Promise.all(
    decisions
      .filter((d) => d.action !== "hold") // "hold" decisions are recorded in synthesis only
      .map(async (d) => {
        const positionId = (d.positionId as string) ?? tickerToId[(d.ticker as string).toUpperCase()];
        if (!positionId) return null;

        return db.recommendation.create({
          data: {
            positionId,
            action: d.action as string,
            reasoning: d.reasoning as string,
            thesisReference: d.thesisReference as string,
            urgency: (d.urgency as string) ?? "medium",
            confidence: d.confidence ? Math.round(d.confidence as number) : null,
            status: "pending",
          },
        });
      })
  );

  const created = recommendations.filter(Boolean);

  await db.teamSession.update({
    where: { id: input.sessionId as string },
    data: {
      status: "complete",
      finalSynthesis: input.synthesis as string,
      decisionsCreated: created.length,
      completedAt: new Date(),
    },
  });

  return {
    sessionId: input.sessionId,
    status: "complete",
    recommendationsCreated: created.length,
    recommendationIds: created.map((r) => r?.id),
  };
}

// ─── Tool: get_watchlist ───────────────────────────────────────────────────────

const getWatchlistDefinition: Anthropic.Tool = {
  name: "get_watchlist",
  description: "Fetches all watchlist items for the Idea Generator to evaluate.",
  input_schema: {
    type: "object" as const,
    properties: {},
    required: [],
  },
};

async function getWatchlistHandler(_input: Record<string, unknown>) {
  const items = await db.watchlist.findMany({
    orderBy: { addedAt: "desc" },
  });
  return items;
}

// ─── Exports ───────────────────────────────────────────────────────────────────

export const teamTools: AgentTool[] = [
  { definition: createTeamSessionDefinition, handler: createTeamSessionHandler },
  { definition: submitBriefingDefinition, handler: submitBriefingHandler },
  { definition: getBriefingsDefinition, handler: getBriefingsHandler },
  { definition: getPortfolioForSessionDefinition, handler: getPortfolioForSessionHandler },
  { definition: finalizeSessionDefinition, handler: finalizeSessionHandler },
  { definition: getWatchlistDefinition, handler: getWatchlistHandler },
];

export const submitBriefingTool: AgentTool = {
  definition: submitBriefingDefinition,
  handler: submitBriefingHandler,
};

export const getBriefingsTool: AgentTool = {
  definition: getBriefingsDefinition,
  handler: getBriefingsHandler,
};

export const getPortfolioTool: AgentTool = {
  definition: getPortfolioForSessionDefinition,
  handler: getPortfolioForSessionHandler,
};

export const finalizeSessionTool: AgentTool = {
  definition: finalizeSessionDefinition,
  handler: finalizeSessionHandler,
};

export const getWatchlistTool: AgentTool = {
  definition: getWatchlistDefinition,
  handler: getWatchlistHandler,
};
