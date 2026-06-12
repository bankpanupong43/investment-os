import { NextRequest, NextResponse } from "next/server";
import { assembleTickerContext } from "@/lib/wiki-assemblers";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ticker = req.nextUrl.searchParams.get("ticker");
  if (!ticker) {
    return NextResponse.json({ error: "ticker parameter is required" }, { status: 400 });
  }
  const context = assembleTickerContext(ticker);
  return NextResponse.json({ ticker: ticker.toUpperCase(), context });
}
