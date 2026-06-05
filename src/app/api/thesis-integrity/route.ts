import { NextResponse } from "next/server";
import { ThesisIntegrityEngine } from "@/lib/thesis-integrity/engine";
import { db } from "@/lib/db";
import { serializeJsonField } from "@/lib/utils";
import type { ThesisIntegrityInput } from "@/lib/thesis-integrity/types";

export async function POST(req: Request) {
  const body: ThesisIntegrityInput = await req.json();

  if (!body.ticker) {
    return NextResponse.json({ error: "ticker is required" }, { status: 400 });
  }
  if (!body.thesis?.originalText) {
    return NextResponse.json({ error: "thesis.originalText is required" }, { status: 400 });
  }

  const engine = new ThesisIntegrityEngine();
  const result = await engine.evaluate(body);

  // If positionId is provided, persist the evaluation to the DB
  if (body.positionId) {
    try {
      const position = await db.position.findUnique({
        where: { id: body.positionId },
        include: { thesis: { select: { id: true } } },
      });

      if (position?.thesis) {
        // Save as a ThesisEvaluation record
        await db.thesisEvaluation.create({
          data: {
            thesisId: position.thesis.id,
            positionId: body.positionId,
            assumptionsScore: result.scoreBreakdown.assumptionsScore,
            outcomesScore: result.scoreBreakdown.outcomesScore,
            riskScore: result.scoreBreakdown.riskScore,
            integrityScore: result.scoreBreakdown.integrityScore,
            overallScore: result.scoreBreakdown.overallScore,
            assumptionAssessments: serializeJsonField(result.assumptionVerdicts),
            outcomeAssessments: serializeJsonField([]), // merged into assumptionVerdicts
            riskAssessments: serializeJsonField([]),    // merged into assumptionVerdicts
            strengths: result.reinforcingEvidence
              .filter((e) => e.weight === "strong")
              .map((e) => e.interpretation)
              .join("; "),
            concerns: result.contradictingEvidence
              .filter((e) => e.weight === "strong")
              .map((e) => e.interpretation)
              .join("; "),
            scoreRationale: result.recommendationReasoning,
            recommendation: result.recommendation.toLowerCase(),
            recommendationReason: result.recommendationReasoning,
            thesisReference: result.thesisReference,
            evaluatedBy: "ai",
            modelUsed: "claude-opus-4-8",
          },
        });

        // Update thesis health
        const healthStatus =
          result.thesisStrength >= 6
            ? "intact"
            : result.thesisStrength >= 4
            ? "weakening"
            : "broken";

        await db.thesis.update({
          where: { id: position.thesis.id },
          data: {
            healthStatus,
            healthScore: Math.round(result.thesisStrength),
            lastReviewedAt: new Date(),
          },
        });

        // Create recommendation if action needed
        if (result.recommendation !== "HOLD") {
          await db.recommendation.create({
            data: {
              positionId: body.positionId,
              action: result.recommendation.toLowerCase(),
              reasoning: result.recommendationReasoning,
              thesisReference: result.thesisReference,
              urgency:
                result.recommendation === "SELL"
                  ? result.killConditionOverride ? "critical" : "high"
                  : result.recommendation === "REDUCE"
                  ? "medium"
                  : "low",
              status: "pending",
            },
          });
        }
      }
    } catch {
      // Persistence failure is non-fatal — still return the evaluation result
    }
  }

  return NextResponse.json(result, { status: 200 });
}
