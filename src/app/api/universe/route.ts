import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { computeScores } from "@/lib/scoring-engine";

export interface UniverseListItem {
  id: string;
  ticker: string;
  companyName: string;
  exchange: string | null;
  sector: string | null;
  industry: string | null;
  marketCap: number | null;
  universeTier: string;
  country: string;
  assetType: string;
  status: string;
  fundamentals: {
    revenueGrowth: number | null;
    epsGrowth: number | null;
    grossMargin: number | null;
    operatingMargin: number | null;
    freeCashFlow: number | null;
    debtToEquity: number | null;
    roic: number | null;
    sharesOutstanding: number | null;
    updatedAt: string;
  } | null;
  latestScore: {
    businessQuality: number;
    growth: number;
    financialStrength: number;
    capitalAllocation: number;
    valuation: number;
    totalScore: number;
    scoredAt: string;
  } | null;
}

export interface UniverseStats {
  total: number;
  byTier: Record<string, number>;
  scored: number;
  withFundamentals: number;
}

export interface UniverseResponse {
  items: UniverseListItem[];
  stats: UniverseStats;
}

function toItem(u: {
  id: string; ticker: string; companyName: string; exchange: string | null;
  sector: string | null; industry: string | null; marketCap: number | null;
  universeTier: string; country: string; assetType: string; status: string;
  fundamentals: { revenueGrowth: number | null; epsGrowth: number | null; grossMargin: number | null; operatingMargin: number | null; freeCashFlow: number | null; debtToEquity: number | null; roic: number | null; sharesOutstanding: number | null; updatedAt: Date } | null;
  scores: Array<{ businessQuality: number; growth: number; financialStrength: number; capitalAllocation: number; valuation: number; totalScore: number; scoredAt: Date }>;
}): UniverseListItem {
  const latest = u.scores.length > 0
    ? u.scores.sort((a, b) => b.scoredAt.getTime() - a.scoredAt.getTime())[0]
    : null;

  return {
    id: u.id,
    ticker: u.ticker,
    companyName: u.companyName,
    exchange: u.exchange,
    sector: u.sector,
    industry: u.industry,
    marketCap: u.marketCap,
    universeTier: u.universeTier,
    country: u.country,
    assetType: u.assetType,
    status: u.status,
    fundamentals: u.fundamentals
      ? { ...u.fundamentals, updatedAt: u.fundamentals.updatedAt.toISOString() }
      : null,
    latestScore: latest
      ? { ...latest, scoredAt: latest.scoredAt.toISOString() }
      : null,
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tier = req.nextUrl.searchParams.get("tier");
  const status = req.nextUrl.searchParams.get("status") ?? "active";

  const raw = await db.universe.findMany({
    where: { ...(tier ? { universeTier: tier } : {}), ...(status !== "all" ? { status } : {}) },
    include: {
      fundamentals: true,
      scores: { orderBy: { scoredAt: "desc" }, take: 1 },
    },
    orderBy: { ticker: "asc" },
  });

  const items = raw.map(toItem);

  const stats: UniverseStats = {
    total: items.length,
    byTier: items.reduce<Record<string, number>>((acc, i) => {
      acc[i.universeTier] = (acc[i.universeTier] ?? 0) + 1;
      return acc;
    }, {}),
    scored: items.filter(i => i.latestScore != null).length,
    withFundamentals: items.filter(i => i.fundamentals != null).length,
  };

  return NextResponse.json({ items, stats } satisfies UniverseResponse);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json();
  const { ticker, companyName, exchange, sector, industry, marketCap, universeTier, country, assetType } = body;

  if (!ticker || !companyName || !universeTier) {
    return NextResponse.json({ error: "ticker, companyName, universeTier required" }, { status: 400 });
  }

  const existing = await db.universe.findUnique({ where: { ticker: ticker.toUpperCase() } });
  if (existing) {
    return NextResponse.json({ error: `${ticker.toUpperCase()} already in universe` }, { status: 409 });
  }

  const entry = await db.universe.create({
    data: {
      ticker: ticker.toUpperCase(),
      companyName,
      exchange: exchange ?? null,
      sector: sector ?? null,
      industry: industry ?? null,
      marketCap: marketCap ?? null,
      universeTier,
      country: country ?? "US",
      assetType: assetType ?? "equity",
    },
    include: { fundamentals: true, scores: true },
  });

  return NextResponse.json(toItem(entry), { status: 201 });
}
