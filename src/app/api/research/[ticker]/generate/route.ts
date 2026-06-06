import { NextRequest, NextResponse } from "next/server";
import { generateDossier, saveDossier } from "@/lib/dossier-engine";

export async function POST(
  _req: NextRequest,
  { params }: { params: { ticker: string } }
): Promise<NextResponse> {
  try {
    const ticker = params.ticker.toUpperCase();
    const apiKey = process.env.FMP_API_KEY ?? "";
    const data = await generateDossier(ticker, apiKey);
    await saveDossier(data);
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[POST /api/research/${params.ticker}/generate]`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
