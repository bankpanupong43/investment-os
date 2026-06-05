import { NextResponse } from "next/server";
import { AgentOrchestrator } from "@/agents/orchestrator";
import type { RunAgentInput } from "@/types";

export async function POST(req: Request) {
  const body: RunAgentInput = await req.json();

  if (!body.agentType) {
    return NextResponse.json({ error: "agentType is required" }, { status: 400 });
  }

  const orchestrator = new AgentOrchestrator();

  const result = await orchestrator.run(body.agentType, {
    positionId: body.positionId,
    ticker: body.ticker,
    additionalContext: body.additionalContext,
  });

  return NextResponse.json(result);
}
