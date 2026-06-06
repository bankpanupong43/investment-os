import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ingestFilingsForTicker } from "@/lib/sec-ingestion";

// GET /api/filings/[ticker] — get filings for a ticker with thesis impacts
export async function GET(
  req: NextRequest,
  { params }: { params: { ticker: string } },
) {
  const ticker = params.ticker.toUpperCase();
  const { searchParams } = new URL(req.url);
  const filingType = searchParams.get("filingType");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "10"), 50);

  const where: Record<string, unknown> = { ticker };
  if (filingType) where.filingType = filingType;

  const [filings, thesisImpacts] = await Promise.all([
    db.filing.findMany({
      where,
      orderBy: { filingDate: "desc" },
      take: limit,
      include: { thesisImpacts: true },
    }),
    db.thesisImpactRecord.findMany({
      where: { ticker },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const thesis = await db.investmentThesis.findUnique({ where: { ticker } });

  return NextResponse.json({ ticker, filings, thesisImpacts, hasThesis: !!thesis });
}

// POST /api/filings/[ticker] — ingest filings for a specific ticker
export async function POST(
  req: NextRequest,
  { params }: { params: { ticker: string } },
) {
  const ticker = params.ticker.toUpperCase();
  const body = await req.json().catch(() => ({}));
  const { types, maxPerType } = body as { types?: string[]; maxPerType?: number };

  const result = await ingestFilingsForTicker(ticker, {
    types: types as ("10-K" | "10-Q" | "8-K" | "20-F")[] | undefined,
    maxPerType: maxPerType ?? 3,
    downloadContent: true,
    runAnalysis: true,
  });

  return NextResponse.json(result);
}
