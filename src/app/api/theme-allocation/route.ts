import { NextResponse } from "next/server";
import { generateThemeAllocationReview } from "@/lib/theme-allocation-engine";

export async function GET(): Promise<NextResponse> {
  try {
    const review = await generateThemeAllocationReview();
    return NextResponse.json({ ...review, generatedAt: review.generatedAt.toISOString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/theme-allocation]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
