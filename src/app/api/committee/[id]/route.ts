import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

function safe<T>(json: string, fallback: T): T {
  try { return JSON.parse(json); } catch { return fallback; }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const row = await db.committeeSession.findUnique({ where: { id: params.id } });
    if (!row) return NextResponse.json({ error: "Session not found" }, { status: 404 });

    return NextResponse.json({
      id: row.id,
      ticker: row.ticker,
      companyName: row.companyName,
      sector: row.sector,
      universeTier: row.universeTier,
      conviction: row.conviction,
      bullCase: safe(row.bullCase, {}),
      bearCase: safe(row.bearCase, {}),
      riskAssessment: safe(row.riskAssessment, {}),
      thesisAudit: safe(row.thesisAudit, {}),
      finalDecision: safe(row.finalDecision, {}),
      createdAt: row.createdAt.toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
