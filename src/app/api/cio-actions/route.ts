import { NextResponse } from "next/server";
import { generateCioActions } from "@/lib/cio-actions-engine";

export async function GET(): Promise<NextResponse> {
  try {
    const result = await generateCioActions();
    return NextResponse.json({
      generatedAt: result.generatedAt.toISOString(),
      actions: result.actions,
      regime: result.regime,
      dataHealth: result.dataHealth,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/cio-actions]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
