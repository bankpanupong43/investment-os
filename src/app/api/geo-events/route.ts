import { NextRequest, NextResponse } from "next/server";
import { getRecentGeoEvents } from "@/lib/macro-ingestion";

// GET /api/geo-events?days=7 — recent geopolitical events
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") ?? "7", 10);
  const events = await getRecentGeoEvents(Math.min(Math.max(days, 1), 30));
  return NextResponse.json({ events, count: events.length });
}
