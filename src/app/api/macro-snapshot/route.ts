export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getLatestMacroSnapshots } from "@/lib/macro-ingestion";

// GET /api/macro-snapshot — latest value per macro metric
export async function GET() {
  const data = await getLatestMacroSnapshots();
  return NextResponse.json({
    snapshots: Object.values(data),
    count: Object.keys(data).length,
    asOf: new Date().toISOString(),
  });
}
