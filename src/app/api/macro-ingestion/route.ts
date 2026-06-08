import { NextResponse } from "next/server";
import { runMacroIngestion } from "@/lib/macro-ingestion";

// POST /api/macro-ingestion — trigger macro/market/geo data fetch
export async function POST() {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "FMP_API_KEY not configured" }, { status: 500 });
  }

  const result = await runMacroIngestion(apiKey);
  return NextResponse.json(result);
}
