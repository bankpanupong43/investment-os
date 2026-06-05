import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseJsonField } from "@/lib/utils";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await db.teamSession.findUnique({
    where: { id: params.id },
    include: {
      briefings: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: session.id,
    triggerType: session.triggerType,
    triggerNote: session.triggerNote,
    status: session.status,
    tickers: parseJsonField<string[]>(session.tickers, []),
    finalSynthesis: session.finalSynthesis
      ? parseJsonField(session.finalSynthesis, null)
      : null,
    decisionsCreated: session.decisionsCreated,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    briefings: session.briefings.map((b) => ({
      id: b.id,
      agentRole: b.agentRole,
      ticker: b.ticker,
      summary: b.summary,
      report: parseJsonField(b.report, {}),
      createdAt: b.createdAt,
    })),
  });
}
