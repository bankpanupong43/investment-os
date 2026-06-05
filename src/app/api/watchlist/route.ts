import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const items = await db.watchlist.findMany({ orderBy: { addedAt: "desc" } });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const body = await req.json();
  const item = await db.watchlist.create({
    data: {
      ticker: body.ticker.toUpperCase(),
      name: body.name ?? null,
      interestReason: body.interestReason,
      draftThesis: body.draftThesis ?? null,
      targetEntryPrice: body.targetEntryPrice ?? null,
    },
  });
  return NextResponse.json(item, { status: 201 });
}
