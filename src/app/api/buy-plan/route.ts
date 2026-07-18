import { NextResponse } from "next/server";
import { computeBuyPlan } from "@/lib/buy-plan-engine";

export async function GET(): Promise<NextResponse> {
  try {
    const plan = await computeBuyPlan();
    return NextResponse.json(plan);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/buy-plan]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
