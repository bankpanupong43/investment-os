import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ingestPortfolioFilings, ingestFilingsForTicker } from "@/lib/sec-ingestion";

// GET /api/filings — list filings
// Query params: ticker, filingType, limit, offset
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker");
  const filingType = searchParams.get("filingType");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 100);
  const offset = parseInt(searchParams.get("offset") ?? "0");

  const where: Record<string, unknown> = {};
  if (ticker) where.ticker = ticker.toUpperCase();
  if (filingType) where.filingType = filingType;

  const [filings, total] = await Promise.all([
    db.filing.findMany({
      where,
      orderBy: { filingDate: "desc" },
      take: limit,
      skip: offset,
      include: { thesisImpacts: true },
    }),
    db.filing.count({ where }),
  ]);

  return NextResponse.json({ filings, total, limit, offset });
}

// POST /api/filings — trigger ingestion
// Body: { ticker?: string, tickers?: string[], types?: string[], maxPerType?: number }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { ticker, tickers, types, maxPerType } = body as {
    ticker?: string;
    tickers?: string[];
    types?: string[];
    maxPerType?: number;
  };

  const options = {
    types: types as ("10-K" | "10-Q" | "8-K" | "20-F")[] | undefined,
    maxPerType: maxPerType ?? 3,
    downloadContent: true,
    runAnalysis: true,
  };

  if (ticker) {
    const result = await ingestFilingsForTicker(ticker, options);
    return NextResponse.json(result);
  }

  if (tickers && tickers.length > 0) {
    const { ingestFilingsForTickers } = await import("@/lib/sec-ingestion");
    const result = await ingestFilingsForTickers(tickers, options);
    return NextResponse.json(result);
  }

  // Default: ingest for entire portfolio
  const result = await ingestPortfolioFilings(options);
  return NextResponse.json(result);
}
