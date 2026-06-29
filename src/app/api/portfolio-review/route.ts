import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateReview, parseReview } from "@/lib/portfolio-review";

export async function GET(): Promise<NextResponse> {
  const rows = await db.portfolioReview.findMany({
    orderBy: { generatedAt: "desc" },
    take: 20,
  });
  return NextResponse.json({ reviews: rows.map(parseReview) });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => ({}));
  const review = await generateReview(body.notes ?? null);
  return NextResponse.json(review, { status: 201 });
}
