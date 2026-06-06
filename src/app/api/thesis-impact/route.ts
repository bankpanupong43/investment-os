import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { evaluatePortfolioThesisImpacts } from "@/lib/thesis-impact-engine";

// GET /api/thesis-impact — list thesis impact records
// Query params: ticker, impactLevel, limit
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker");
  const impactLevel = searchParams.get("impactLevel");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 100);

  const where: Record<string, unknown> = {};
  if (ticker) where.ticker = ticker.toUpperCase();
  if (impactLevel) where.impactLevel = impactLevel;

  const records = await db.thesisImpactRecord.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      filing: {
        select: { filingType: true, filingDate: true, title: true, accessionNumber: true, sourceUrl: true },
      },
    },
  });

  return NextResponse.json(records.map(r => ({
    ...r,
    evidenceIds: JSON.parse(r.evidenceIds),
    createdAt: r.createdAt.toISOString(),
    filing: r.filing
      ? { ...r.filing, filingDate: r.filing.filingDate.toISOString() }
      : null,
  })));
}

// POST /api/thesis-impact — run batch evaluation on unanalyzed filings
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const since = body.since ? new Date(body.since) : undefined;

  const results = await evaluatePortfolioThesisImpacts({ since });
  return NextResponse.json({ evaluated: results.length, results });
}
