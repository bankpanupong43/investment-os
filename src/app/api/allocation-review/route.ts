import { NextResponse } from "next/server";
import { db } from "@/lib/db";
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

// PATCH /api/allocation-review — set return target
// Body: { returnTargetPct: number | null }
export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json() as { returnTargetPct?: number | null };
    const value = body.returnTargetPct ?? null;

    if (value !== null && (typeof value !== "number" || value < 0 || value > 100)) {
      return NextResponse.json({ error: "returnTargetPct must be 0–100 or null" }, { status: 400 });
    }

    const settings = await db.portfolioSettings.findFirst();
    if (!settings) {
      return NextResponse.json({ error: "Portfolio settings not found" }, { status: 404 });
    }

    await db.portfolioSettings.update({
      where: { id: settings.id },
      data: { returnTargetPct: value },
    });

    // Return the updated allocation review so the UI can refresh in one round-trip
    const review = await generateAllocationReview();
    return NextResponse.json({
      ...review,
      generatedAt: review.generatedAt.toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
