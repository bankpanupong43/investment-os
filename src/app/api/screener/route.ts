import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { applyFilters, buildResearchQueue, ScreenerResult, ScoredEntry } from "@/lib/screener-pipeline";

export type { ScreenerResult, ScoredEntry } from "@/lib/screener-pipeline";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const s = req.nextUrl.searchParams;

  const filters = {
    grossMarginMin:      s.get("grossMarginMin")    != null ? Number(s.get("grossMarginMin"))    : undefined,
    operatingMarginMin:  s.get("operatingMarginMin") != null ? Number(s.get("operatingMarginMin")) : undefined,
    revenueGrowthMin:    s.get("revenueGrowthMin")  != null ? Number(s.get("revenueGrowthMin"))  : undefined,
    epsGrowthMin:        s.get("epsGrowthMin")       != null ? Number(s.get("epsGrowthMin"))       : undefined,
    debtToEquityMax:     s.get("debtToEquityMax")   != null ? Number(s.get("debtToEquityMax"))   : undefined,
    minScore:            s.get("minScore")           != null ? Number(s.get("minScore"))           : undefined,
    tiers:               s.get("tiers") ? s.get("tiers")!.split(",").map(t => t.trim()) : undefined,
  };

  // Load universe + latest scores + fundamentals
  const raw = await db.universe.findMany({
    where: { status: "active" },
    include: {
      fundamentals: true,
      scores: { orderBy: { scoredAt: "desc" }, take: 1 },
    },
    orderBy: { ticker: "asc" },
  });

  // Load portfolio tickers (positions + watchlist)
  const [positions, watchlist] = await Promise.all([
    db.position.findMany({ where: { status: "active" }, select: { ticker: true } }),
    db.watchlist.findMany({ select: { ticker: true } }),
  ]);

  const portfolioTickers = new Set(positions.map(p => p.ticker.toUpperCase()));
  const watchlistTickers = new Set(watchlist.map(w => w.ticker.toUpperCase()));

  const all: ScoredEntry[] = raw.map(u => {
    const latest = u.scores[0] ?? null;
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
      inPortfolio: portfolioTickers.has(u.ticker),
      inWatchlist: watchlistTickers.has(u.ticker),
    };
  });

  const passed = applyFilters(all, filters);
  const researchQueue = buildResearchQueue(passed);

  const result: ScreenerResult = {
    all,
    passed,
    researchQueue,
    stats: {
      universeSize: all.length,
      passedFilters: passed.length,
      researchQueueSize: researchQueue.length,
      byTier: all.reduce<Record<string, number>>((acc, e) => {
        acc[e.universeTier] = (acc[e.universeTier] ?? 0) + 1;
        return acc;
      }, {}),
    },
  };

  return NextResponse.json(result);
}
