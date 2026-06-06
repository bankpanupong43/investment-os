import { NextRequest, NextResponse } from "next/server";
import { ingestTicker, ingestUniverse, buildCoverageReport } from "@/lib/ingestion";

export type { CoverageReport, IngestionResult, UniverseIngestionSummary } from "@/lib/ingestion";

// Universe refresh can take ~15-30s — increase Next.js route timeout for local dev
export const maxDuration = 120;

function getApiKey(): string | null {
  return process.env.FMP_API_KEY ?? null;
}

// GET /api/ingestion — coverage report + recent logs
export async function GET(): Promise<NextResponse> {
  const report = await buildCoverageReport();
  const hasApiKey = getApiKey() != null && getApiKey() !== "";
  return NextResponse.json({ ...report, hasApiKey });
}

// POST /api/ingestion — trigger ingestion
// body: { mode: "ticker", ticker: "AAPL" } | { mode: "universe" }
export async function POST(req: NextRequest): Promise<NextResponse> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "FMP_API_KEY not configured. Add it to .env and restart the server." },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const { mode, ticker } = body as { mode?: string; ticker?: string };

  if (mode === "ticker") {
    if (!ticker) return NextResponse.json({ error: "ticker required" }, { status: 400 });
    const result = await ingestTicker(ticker, apiKey);
    return NextResponse.json(result);
  }

  if (mode === "universe") {
    const summary = await ingestUniverse(apiKey);
    return NextResponse.json(summary);
  }

  return NextResponse.json({ error: "mode must be 'ticker' or 'universe'" }, { status: 400 });
}
