import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enrichThesis, InvestmentThesisItem } from "./_shared";

export type { InvestmentThesisItem, ThesisReviewRecord } from "./_shared";

export interface ThesisCoverage {
  total: number;
  active: number;
  watchlist: number;
  avgConfidence: number;
  overdueCount: number;
  draftCount: number;
  confidenceDistribution: { high: number; medium: number; low: number };
}

export interface InvestmentThesesResponse {
  theses: InvestmentThesisItem[];
  coverage: ThesisCoverage;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ticker = req.nextUrl.searchParams.get("ticker");
  const where = ticker ? { ticker: ticker.toUpperCase() } : {};

  const raw = await db.investmentThesis.findMany({
    where,
    include: { reviews: { orderBy: { reviewedAt: "desc" } } },
    orderBy: [{ status: "asc" }, { confidenceScore: "desc" }],
  });

  const theses = raw.map(enrichThesis);

  const coverage: ThesisCoverage = {
    total: theses.length,
    active: theses.filter(t => t.status === "active").length,
    watchlist: theses.filter(t => t.status === "watchlist").length,
    avgConfidence: theses.length
      ? theses.reduce((s, t) => s + t.confidenceScore, 0) / theses.length
      : 0,
    overdueCount: theses.filter(t => t.isReviewDue).length,
    draftCount: theses.filter(t => t.isDraft).length,
    confidenceDistribution: {
      high: theses.filter(t => t.confidenceScore >= 8).length,
      medium: theses.filter(t => t.confidenceScore >= 6 && t.confidenceScore < 8).length,
      low: theses.filter(t => t.confidenceScore < 6).length,
    },
  };

  return NextResponse.json({ theses, coverage } satisfies InvestmentThesesResponse);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json();
  const { ticker, title, thesis, whyOwn, risks, killCriteria, confidenceScore, reviewFrequency, status, isDraft, notes } = body;

  if (!ticker || !title || !thesis || !whyOwn || !risks || !killCriteria) {
    return NextResponse.json({ error: "Missing required fields: ticker, title, thesis, whyOwn, risks, killCriteria" }, { status: 400 });
  }

  const existing = await db.investmentThesis.findUnique({ where: { ticker: ticker.toUpperCase() } });
  if (existing) {
    return NextResponse.json({ error: `Thesis for ${ticker.toUpperCase()} already exists` }, { status: 409 });
  }

  const record = await db.investmentThesis.create({
    data: {
      ticker: ticker.toUpperCase(),
      title,
      thesis,
      whyOwn,
      risks,
      killCriteria,
      confidenceScore: confidenceScore ?? 7,
      reviewFrequency: reviewFrequency ?? "quarterly",
      status: status ?? "active",
      isDraft: isDraft ?? true,
      notes: notes ?? null,
    },
    include: { reviews: true },
  });

  return NextResponse.json(enrichThesis(record), { status: 201 });
}
