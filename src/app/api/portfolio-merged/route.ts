import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { computePortfolioValue } from "@/lib/portfolio-value-engine";

export interface MergedPositionRow {
  ticker: string;
  hasHolding: boolean;
  hasPosition: boolean;
  positionId: string | null;
  shares: number | null;
  costBasis: number | null;
  currency: string;
  price: number | null;
  marketValueUsd: number | null;
  marketValueThb: number | null;
  allocationPct: number | null;
  gainLossUsd: number | null;
  gainLossPct: number | null;
  notes: string | null;
  name: string;
  sector: string | null;
  industry: string | null;
  assetClass: string | null;
  entryDate: string | null;
  status: string | null;
  thesisHealth: string | null;
  thesisScore: number | null;
  killConditionCount: number;
  triggeredKillCount: number;
  recommendation: { action: string; urgency: string } | null;
}

export async function GET() {
  try {
    const [snapshot, positions] = await Promise.all([
      computePortfolioValue(),
      db.position.findMany({
        include: {
          thesis: { select: { healthStatus: true, healthScore: true } },
          killConditions: { select: { status: true } },
          recommendations: {
            where: { status: "pending" },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { action: true, urgency: true },
          },
        },
        orderBy: { ticker: "asc" },
      }),
    ]);

    const holdingByTicker = new Map(snapshot.holdings.map(h => [h.ticker, h]));
    const positionByTicker = new Map(positions.map(p => [p.ticker, p]));
    const tickers = new Set([...holdingByTicker.keys(), ...positionByTicker.keys()]);

    const rows: MergedPositionRow[] = Array.from(tickers).map(ticker => {
      const h = holdingByTicker.get(ticker) ?? null;
      const p = positionByTicker.get(ticker) ?? null;
      return {
        ticker,
        hasHolding: h != null,
        hasPosition: p != null,
        positionId: p?.id ?? null,
        shares: h?.shares ?? p?.shares ?? null,
        costBasis: h?.costBasis ?? null,
        currency: h?.currency ?? "USD",
        price: h?.price ?? null,
        marketValueUsd: h?.marketValueUsd ?? null,
        marketValueThb: h?.marketValueThb ?? null,
        allocationPct: h?.allocationPct ?? null,
        gainLossUsd: h?.gainLossUsd ?? null,
        gainLossPct: h?.gainLossPct ?? null,
        notes: h?.notes ?? p?.notes ?? null,
        name: p?.name ?? ticker,
        sector: p?.sector ?? null,
        industry: p?.industry ?? null,
        assetClass: p?.assetClass ?? null,
        entryDate: p?.entryDate?.toISOString() ?? null,
        status: p?.status ?? null,
        thesisHealth: p?.thesis?.healthStatus ?? null,
        thesisScore: p?.thesis?.healthScore ?? null,
        killConditionCount: p?.killConditions.length ?? 0,
        triggeredKillCount: p?.killConditions.filter(k => k.status === "triggered").length ?? 0,
        recommendation: p?.recommendations[0] ?? null,
      };
    }).sort((a, b) => (b.marketValueUsd ?? -1) - (a.marketValueUsd ?? -1));

    return NextResponse.json({
      rows,
      cashAccounts: snapshot.cashAccounts,
      totalValueThb: snapshot.totalValueThb,
      totalValueUsd: snapshot.totalValueUsd,
      totalEquityUsd: snapshot.totalEquityUsd,
      totalEquityThb: snapshot.totalEquityThb,
      totalCashThb: snapshot.totalCashThb,
      usdthb: snapshot.usdthb,
      priceDate: snapshot.priceDate,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
