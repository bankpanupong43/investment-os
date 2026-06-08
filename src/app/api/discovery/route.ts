import { NextResponse } from "next/server";
import { buildDiscoveryRadarResult, runDiscoveryRefresh } from "@/lib/discovery-radar";

// GET /api/discovery — build result from current DB state
export async function GET(): Promise<NextResponse> {
  try {
    const result = await buildDiscoveryRadarResult();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/discovery]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/discovery — run full refresh + research queue promotion
export async function POST(): Promise<NextResponse> {
  try {
    const result = await runDiscoveryRefresh();
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/discovery]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
