import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker");
  const relevance = searchParams.get("relevance");
  const limit = parseInt(searchParams.get("limit") ?? "20");

  const where: Record<string, unknown> = {};
  if (ticker) where.ticker = ticker.toUpperCase();
  if (relevance) where.thesisRelevance = relevance;

  const items = await db.newsItem.findMany({
    where,
    orderBy: { fetchedAt: "desc" },
    take: limit,
  });

  return NextResponse.json(items);
}
