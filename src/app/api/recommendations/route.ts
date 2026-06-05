import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { CreateRecommendationInput } from "@/types";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "pending";

  const recommendations = await db.recommendation.findMany({
    where: { status },
    include: {
      position: { select: { ticker: true, name: true } },
      killCondition: true,
    },
    orderBy: [{ urgency: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(recommendations);
}

export async function POST(req: Request) {
  const body: CreateRecommendationInput = await req.json();

  const recommendation = await db.recommendation.create({
    data: {
      positionId: body.positionId,
      action: body.action,
      reasoning: body.reasoning,
      thesisReference: body.thesisReference,
      killConditionId: body.killConditionId ?? null,
      confidence: body.confidence ?? null,
      urgency: body.urgency ?? "low",
      status: "pending",
    },
    include: { position: { select: { ticker: true, name: true } } },
  });

  return NextResponse.json(recommendation, { status: 201 });
}
