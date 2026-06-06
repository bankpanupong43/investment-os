import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { storeEarningsEvent, type EarningsDataPoint } from "@/lib/earnings-intelligence";

// GET /api/earnings — list earnings events
// Query params: ticker, limit
export async function GET(req: NextRequest) {
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

  return NextResponse.json(events.map(e => ({
    ...e,
    keyMetrics: e.keyMetrics ? JSON.parse(e.keyMetrics) : null,
    thesisAssumptionsHit: e.thesisAssumptionsHit ? JSON.parse(e.thesisAssumptionsHit) : null,
    killConditionsChecked: e.killConditionsChecked ? JSON.parse(e.killConditionsChecked) : null,
    reportDate: e.reportDate?.toISOString() ?? null,
  })));
}

// POST /api/earnings — store an earnings event (manual or from ingestion)
export async function POST(req: NextRequest) {
  const body = await req.json() as EarningsDataPoint;

  if (!body.ticker) {
    return NextResponse.json({ error: "ticker is required" }, { status: 400 });
  }

  const id = await storeEarningsEvent(body);
  const event = await db.earningsEvent.findUnique({ where: { id } });

  return NextResponse.json({ id, event }, { status: 201 });
}
