import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function PUT(
  req: Request,
  { params }: { params: { ticker: string } },
) {
  const ticker = params.ticker.toUpperCase();
  const body = await req.json() as {
    shares?: number;
    costBasis?: number | null;
    currency?: string;
    notes?: string | null;
  };

  try {
    const holding = await db.portfolioHolding.update({
      where: { ticker },
      data: {
        ...(body.shares != null    && { shares: body.shares }),
        ...(body.currency != null  && { currency: body.currency }),
        costBasis: body.costBasis ?? null,
        notes: body.notes ?? null,
        updatedAt: new Date(),
      },
    });
    return NextResponse.json(holding);
  } catch {
    return NextResponse.json({ error: "Holding not found" }, { status: 404 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { ticker: string } },
) {
  const ticker = params.ticker.toUpperCase();
  try {
    await db.portfolioHolding.delete({ where: { ticker } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Holding not found" }, { status: 404 });
  }
}
