import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function PUT(req: NextRequest, { params }: { params: { ticker: string } }): Promise<NextResponse> {
  const ticker = params.ticker.toUpperCase();
  const body = await req.json();

  const entry = await db.universe.findUnique({ where: { ticker } });
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { revenueGrowth, epsGrowth, grossMargin, operatingMargin, freeCashFlow, debtToEquity, roic, sharesOutstanding } = body;

  const fund = await db.fundamental.upsert({
    where: { universeId: entry.id },
    create: {
      universeId: entry.id,
      revenueGrowth: revenueGrowth ?? null,
      epsGrowth: epsGrowth ?? null,
      grossMargin: grossMargin ?? null,
      operatingMargin: operatingMargin ?? null,
      freeCashFlow: freeCashFlow ?? null,
      debtToEquity: debtToEquity ?? null,
      roic: roic ?? null,
      sharesOutstanding: sharesOutstanding ?? null,
    },
    update: {
      ...(revenueGrowth !== undefined && { revenueGrowth }),
      ...(epsGrowth !== undefined && { epsGrowth }),
      ...(grossMargin !== undefined && { grossMargin }),
      ...(operatingMargin !== undefined && { operatingMargin }),
      ...(freeCashFlow !== undefined && { freeCashFlow }),
      ...(debtToEquity !== undefined && { debtToEquity }),
      ...(roic !== undefined && { roic }),
      ...(sharesOutstanding !== undefined && { sharesOutstanding }),
    },
  });

  return NextResponse.json(fund);
}
