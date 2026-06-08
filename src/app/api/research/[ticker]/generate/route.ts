import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateDossier, generateDossierOnDemand, saveDossier, parseDossierRow } from "@/lib/dossier-engine";

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST(
  req: NextRequest,
  { params }: { params: { ticker: string } }
): Promise<NextResponse> {
  const ticker = params.ticker.toUpperCase();
  const force = req.nextUrl.searchParams.get("force") === "true";
  const apiKey = process.env.FMP_API_KEY ?? "";

  // Return cached dossier if it's under 7 days old (unless force=true)
  if (!force) {
    const cached = await db.researchDossier.findUnique({ where: { ticker } });
    if (cached && (Date.now() - cached.generatedAt.getTime()) < CACHE_TTL_MS) {
      return NextResponse.json(parseDossierRow(cached));
    }
  }

  try {
    let data;
    try {
      data = await generateDossier(ticker, apiKey);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (!msg.includes("not found in active universe")) throw err;
      // Ticker not in universe — generate on-demand from FMP directly
      data = await generateDossierOnDemand(ticker, apiKey);
    }
    await saveDossier(data);
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[POST /api/research/${ticker}/generate]`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
