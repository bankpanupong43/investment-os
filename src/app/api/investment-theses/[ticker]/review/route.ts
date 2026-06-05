import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enrichThesis } from "../../_shared";

type Params = { params: { ticker: string } };

export async function POST(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const body = await req.json();
  const { reviewType, previousConfidence, newConfidence, notes } = body;

  if (!reviewType || !["review_completed", "confidence_changed"].includes(reviewType)) {
    return NextResponse.json({ error: "reviewType must be review_completed or confidence_changed" }, { status: 400 });
  }

  const record = await db.investmentThesis.findUnique({
    where: { ticker: params.ticker.toUpperCase() },
  });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.thesisReview.create({
    data: {
      thesisId: record.id,
      reviewType,
      previousConfidence: previousConfidence ?? null,
      newConfidence: newConfidence ?? null,
      notes: notes ?? null,
    },
  });

  const updateData: Record<string, unknown> = { lastReviewedAt: new Date() };
  if (reviewType === "confidence_changed" && newConfidence != null) {
    updateData.confidenceScore = newConfidence;
  }
  // Mark as no longer a draft once the human reviews it
  if (record.isDraft) {
    updateData.isDraft = false;
  }

  const updated = await db.investmentThesis.update({
    where: { id: record.id },
    data: updateData,
    include: { reviews: { orderBy: { reviewedAt: "desc" } } },
  });

  return NextResponse.json(enrichThesis(updated), { status: 201 });
}
