import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseJsonField } from "@/lib/utils";
import type { AssumptionAssessment, OutcomeAssessment, RiskAssessment } from "@/types";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const positionId = searchParams.get("positionId");
  const ticker = searchParams.get("ticker");
  const limit = parseInt(searchParams.get("limit") ?? "10");

  let resolvedPositionId = positionId;
  if (!resolvedPositionId && ticker) {
    const position = await db.position.findFirst({
      where: { ticker: ticker.toUpperCase(), status: "active" },
      select: { id: true },
    });
    resolvedPositionId = position?.id ?? null;
  }

  const where = resolvedPositionId ? { positionId: resolvedPositionId } : {};

  const evaluations = await db.thesisEvaluation.findMany({
    where,
    include: {
      position: { select: { ticker: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json(
    evaluations.map((e) => ({
      ...e,
      assumptionAssessments: parseJsonField<AssumptionAssessment[]>(e.assumptionAssessments, []),
      outcomeAssessments: parseJsonField<OutcomeAssessment[]>(e.outcomeAssessments, []),
      riskAssessments: parseJsonField<RiskAssessment[]>(e.riskAssessments, []),
    }))
  );
}
