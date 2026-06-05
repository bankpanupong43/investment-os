import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker");
  const limit = parseInt(searchParams.get("limit") ?? "10");

  const where: Record<string, unknown> = {};
  if (ticker) where.ticker = ticker.toUpperCase();

  const events = await db.earningsEvent.findMany({
    where,
    orderBy: { reportDate: "desc" },
    take: limit,
  });

  return NextResponse.json(events);
}
