import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: { ticker: string } }): Promise<NextResponse> {
  const ticker = params.ticker.toUpperCase();
  const entry = await db.universe.findUnique({
    where: { ticker },
    include: {
      fundamentals: true,
      scores: { orderBy: { scoredAt: "desc" }, take: 5 },
    },
  });
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(entry);
}

export async function PATCH(req: NextRequest, { params }: { params: { ticker: string } }): Promise<NextResponse> {
  const ticker = params.ticker.toUpperCase();
  const body = await req.json();
  const { companyName, exchange, sector, industry, marketCap, universeTier, country, assetType, status } = body;

  const entry = await db.universe.update({
    where: { ticker },
    data: {
      ...(companyName != null && { companyName }),
      ...(exchange != null && { exchange }),
      ...(sector != null && { sector }),
      ...(industry != null && { industry }),
      ...(marketCap != null && { marketCap }),
      ...(universeTier != null && { universeTier }),
      ...(country != null && { country }),
      ...(assetType != null && { assetType }),
      ...(status != null && { status }),
    },
    include: { fundamentals: true, scores: { orderBy: { scoredAt: "desc" }, take: 1 } },
  });
  return NextResponse.json(entry);
}

export async function DELETE(req: NextRequest, { params }: { params: { ticker: string } }): Promise<NextResponse> {
  const ticker = params.ticker.toUpperCase();
  await db.universe.update({ where: { ticker }, data: { status: "excluded" } });
  return NextResponse.json({ ok: true });
}
