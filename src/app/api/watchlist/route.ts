import { NextResponse } from "next/server";
import { db } from "@/lib/db";

type WatchlistStatus = "watching" | "researching" | "high_conviction" | "rejected" | "owned";

const WATCHLIST_STATUSES: { value: WatchlistStatus; label: string }[] = [
  { value: "watching",        label: "Watching" },
  { value: "researching",     label: "Researching" },
  { value: "high_conviction", label: "High Conviction" },
  { value: "rejected",        label: "Rejected" },
  { value: "owned",           label: "Owned" },
];

export async function GET() {
  const items = await db.watchlist.findMany({ orderBy: { addedAt: "desc" } });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const body = await req.json();
  const ticker = (body.ticker as string).toUpperCase().trim();
  const existing = await db.watchlist.findUnique({ where: { ticker } });
  if (existing) {
    return NextResponse.json({ error: `${ticker} is already on your watchlist.` }, { status: 409 });
  }
  const item = await db.watchlist.create({
    data: {
      ticker,
      name: body.name ?? null,
      status: body.status ?? "watching",
      interestReason: body.interestReason ?? "Added manually",
      notes: body.notes ?? null,
      draftThesis: body.draftThesis ?? null,
      targetEntryPrice: body.targetEntryPrice ?? null,
    },
  });
  return NextResponse.json(item, { status: 201 });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker")?.toUpperCase();
  if (!ticker) return NextResponse.json({ error: "ticker required" }, { status: 400 });
  try {
    await db.watchlist.delete({ where: { ticker } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
