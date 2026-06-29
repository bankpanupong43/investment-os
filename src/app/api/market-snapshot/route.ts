export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getLatestMarketSnapshots } from "@/lib/macro-ingestion";

// GET /api/market-snapshot — latest market index prices
export async function GET() {
  const data = await getLatestMarketSnapshots();
  return NextResponse.json({
    snapshots: Object.values(data),
    count: Object.keys(data).length,
    asOf: new Date().toISOString(),
  });
}
