import { NextResponse } from "next/server";
import { generateAllocationReview } from "@/lib/allocation-engine";

export async function GET(): Promise<NextResponse> {
  try {
    const review = await generateAllocationReview();
    return NextResponse.json({
      ...review,
      generatedAt: review.generatedAt.toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/allocation-review]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
