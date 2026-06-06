import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runCommitteeSession } from "@/lib/committee-engine";

function parseFinaldecision(json: string) {
  try { return JSON.parse(json); } catch { return {}; }
}

export async function GET(): Promise<NextResponse> {
  try {
    const rows = await db.committeeSession.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const sessions = rows.map(row => {
      const fd = parseFinaldecision(row.finalDecision);
      return {
        id: row.id,
        ticker: row.ticker,
        companyName: row.companyName,
        sector: row.sector,
        universeTier: row.universeTier,
        conviction: row.conviction,
        bullScore: fd.bullScore ?? 0,
        bearScore: fd.bearScore ?? 0,
        convictionLevel: fd.convictionLevel ?? 5,
        createdAt: row.createdAt.toISOString(),
      };
    });

    return NextResponse.json({ sessions });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { ticker } = await req.json();
    if (!ticker || typeof ticker !== "string") {
      return NextResponse.json({ error: "ticker required" }, { status: 400 });
    }

    const data = await runCommitteeSession(ticker.toUpperCase());

    const saved = await db.committeeSession.create({
      data: {
        ticker: data.ticker,
        companyName: data.companyName,
        sector: data.sector ?? null,
        universeTier: data.universeTier,
        bullCase: JSON.stringify(data.bullCase),
        bearCase: JSON.stringify(data.bearCase),
        riskAssessment: JSON.stringify(data.riskAssessment),
        thesisAudit: JSON.stringify(data.thesisAudit),
        finalDecision: JSON.stringify(data.finalDecision),
        conviction: data.conviction,
      },
    });

    return NextResponse.json({
      id: saved.id,
      ticker: saved.ticker,
      companyName: saved.companyName,
      sector: saved.sector,
      universeTier: saved.universeTier,
      conviction: saved.conviction,
      evidenceCount: data.evidenceCount,
      bullCase: data.bullCase,
      bearCase: data.bearCase,
      riskAssessment: data.riskAssessment,
      thesisAudit: data.thesisAudit,
      finalDecision: data.finalDecision,
      createdAt: saved.createdAt.toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/committee]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
