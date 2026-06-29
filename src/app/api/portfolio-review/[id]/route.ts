import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseReview } from "@/lib/portfolio-review";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const row = await db.portfolioReview.findUnique({ where: { id: params.id } });
  if (!row) return NextResponse.json({ error: "Review not found" }, { status: 404 });
  return NextResponse.json(parseReview(row));
}
