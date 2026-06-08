import { NextRequest, NextResponse } from "next/server";
import { searchTickers } from "@/lib/fmp-client";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ results: [] });

  const apiKey = process.env.FMP_API_KEY ?? "";
  const results = await searchTickers(q, apiKey, 10);
  return NextResponse.json({ results });
}
