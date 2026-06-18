import { NextRequest, NextResponse } from "next/server";
import { getScenarios, runRippleAnalysis } from "@/lib/ripple-engine";

export async function GET(req: NextRequest) {
  const scenarioId = req.nextUrl.searchParams.get("scenario");

  if (!scenarioId) {
    return NextResponse.json({ scenarios: getScenarios() });
  }

  const analysis = await runRippleAnalysis(scenarioId);
  if (!analysis) {
    return NextResponse.json({ error: `Unknown scenario: ${scenarioId}` }, { status: 404 });
  }
  return NextResponse.json(analysis);
}
