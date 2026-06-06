import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { computeScores } from "@/lib/scoring-engine";

export async function POST(req: NextRequest, { params }: { params: { ticker: string } }): Promise<NextResponse> {
  const ticker = params.ticker.toUpperCase();

  const entry = await db.universe.findUnique({
    where: { ticker },
    include: { fundamentals: true },
  });
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const scores = computeScores(entry.fundamentals);

  const record = await db.universeScore.create({
    data: {
      universeId: entry.id,
      businessQuality: scores.businessQuality,
      growth: scores.growth,
      financialStrength: scores.financialStrength,
      capitalAllocation: scores.capitalAllocation,
      valuation: scores.valuation,
      totalScore: scores.totalScore,
    },
  });

  return NextResponse.json(record, { status: 201 });
}
