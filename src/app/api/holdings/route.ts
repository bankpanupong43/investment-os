import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const holdings = await db.portfolioHolding.findMany({ orderBy: { ticker: "asc" } });
  return NextResponse.json(holdings);
}

export async function POST(req: Request) {
  const body = await req.json() as {
    ticker: string;
    shares: number;
    costBasis?: number | null;
    currency?: string;
    notes?: string | null;
  };

  const ticker = body.ticker?.trim().toUpperCase();
  if (!ticker || body.shares == null || isNaN(body.shares)) {
    return NextResponse.json({ error: "ticker and shares required" }, { status: 400 });
  }

  const holding = await db.portfolioHolding.upsert({
    where: { ticker },
    update: {
      shares: body.shares,
      costBasis: body.costBasis ?? null,
      currency: body.currency ?? "USD",
      notes: body.notes ?? null,
      updatedAt: new Date(),
    },
    create: {
      ticker,
      shares: body.shares,
      costBasis: body.costBasis ?? null,
      currency: body.currency ?? "USD",
      notes: body.notes ?? null,
      updatedAt: new Date(),
    },
  });

  return NextResponse.json(holding, { status: 201 });
}
