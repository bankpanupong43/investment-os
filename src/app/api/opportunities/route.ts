import { NextResponse } from "next/server";
import { computeOpportunities, saveOpportunityScores } from "@/lib/opportunity-engine";

export type { OpportunityEntry, OpportunityResult } from "@/lib/opportunity-engine";

// GET /api/opportunities — compute fresh (no save)
export async function GET(): Promise<NextResponse> {
  try {
    const result = await computeOpportunities();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/opportunities]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/opportunities — compute and save snapshot to DB
export async function POST(): Promise<NextResponse> {
  try {
    const result = await computeOpportunities();
    await saveOpportunityScores(result.entries);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/opportunities]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
