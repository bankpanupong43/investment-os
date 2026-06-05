import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serializeJsonField } from "@/lib/utils";
import type { CreatePositionInput, ThesisKeyAssumption, ExpectedOutcome, ThesisRisk } from "@/types";

export async function GET() {
  const positions = await db.position.findMany({
    where: { status: "active" },
    include: {
      thesis: true,
      killConditions: { where: { status: "active" } },
      recommendations: { where: { status: "pending" }, orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { ticker: "asc" },
  });
  return NextResponse.json(positions);
}

export async function POST(req: Request) {
  const body: CreatePositionInput = await req.json();

  const position = await db.position.create({
    data: {
      ticker: body.ticker.toUpperCase(),
      name: body.name,
      sector: body.sector ?? null,
      assetClass: body.assetClass ?? "equity",
      shares: body.shares,
      avgCost: body.avgCost,
      entryDate: new Date(body.entryDate),
      notes: body.notes ?? null,
      thesis: {
        create: {
          originalThesis: body.thesis.originalThesis,
          keyAssumptions: serializeJsonField(body.thesis.keyAssumptions ?? []),
          expectedOutcomes: serializeJsonField(body.thesis.expectedOutcomes ?? []),
          risks: serializeJsonField(body.thesis.risks ?? []),
          holdingPeriod: body.thesis.holdingPeriod ?? null,
          holdingPeriodMonths: body.thesis.holdingPeriodMonths ?? null,
          entryConfidence: body.thesis.entryConfidence ?? 7,
        },
      },
      killConditions: {
        create: body.killConditions.map((kc) => ({
          conditionType: kc.conditionType,
          description: kc.description,
          metric: kc.metric ?? null,
          operator: kc.operator ?? null,
          threshold: kc.threshold ?? null,
        })),
      },
      journalEntries: {
        create: [
          {
            entryType: "buy_rationale",
            content: `Initial position opened.\n\nThesis: ${body.thesis.originalThesis}`,
          },
        ],
      },
    },
    include: { thesis: true, killConditions: true },
  });

  return NextResponse.json(position, { status: 201 });
}
