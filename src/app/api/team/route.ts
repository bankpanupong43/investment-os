import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseJsonField } from "@/lib/utils";
import { InvestmentTeamSession } from "@/agents/team/session";
import type { TeamSessionInput } from "@/types/team";

export async function POST(req: Request) {
  const body: TeamSessionInput = await req.json();

  if (!body.triggerType) {
    return NextResponse.json({ error: "triggerType is required" }, { status: 400 });
  }

  const session = new InvestmentTeamSession();
  const result = await session.run(body);

  const status = result.status === "complete" ? 200 : 500;
  return NextResponse.json(result, { status });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") ?? "10", 10);
  const triggerType = searchParams.get("triggerType") ?? undefined;

  const sessions = await db.teamSession.findMany({
    where: triggerType ? { triggerType } : undefined,
    orderBy: { startedAt: "desc" },
    take: Math.min(limit, 50),
    include: {
      _count: { select: { briefings: true } },
    },
  });

  return NextResponse.json(
    sessions.map((s) => ({
      id: s.id,
      triggerType: s.triggerType,
      triggerNote: s.triggerNote,
      status: s.status,
      tickers: parseJsonField<string[]>(s.tickers, []),
      decisionsCreated: s.decisionsCreated,
      briefingCount: s._count.briefings,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
    }))
  );
}
