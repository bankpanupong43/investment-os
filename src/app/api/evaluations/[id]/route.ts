import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseJsonField } from "@/lib/utils";
import type { AssumptionAssessment, OutcomeAssessment, RiskAssessment } from "@/types";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const evaluation = await db.thesisEvaluation.findUnique({
    where: { id: params.id },
    include: {
      position: { select: { ticker: true, name: true } },
      thesis: { select: { version: true, originalThesis: true } },
    },
  });

  if (!evaluation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    ...evaluation,
    assumptionAssessments: parseJsonField<AssumptionAssessment[]>(evaluation.assumptionAssessments, []),
    outcomeAssessments: parseJsonField<OutcomeAssessment[]>(evaluation.outcomeAssessments, []),
    riskAssessments: parseJsonField<RiskAssessment[]>(evaluation.riskAssessments, []),
  });
}
