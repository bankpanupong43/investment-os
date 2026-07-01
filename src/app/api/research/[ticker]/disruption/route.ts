import { NextRequest, NextResponse } from "next/server";
import { generateDisruptionAnalysis, saveDisruptionAnalysis } from "@/lib/disruption-engine";

export type { DisruptionAnalysis } from "@/lib/disruption-engine";

export async function POST(
  _req: NextRequest,
  { params }: { params: { ticker: string } }
): Promise<NextResponse> {
  const ticker = params.ticker.toUpperCase();

  try {
    const analysis = await generateDisruptionAnalysis(ticker);
    await saveDisruptionAnalysis(ticker, analysis);
    return NextResponse.json(analysis, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[POST /api/research/${ticker}/disruption]`, message);
    const status = message.includes("No research dossier exists") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
