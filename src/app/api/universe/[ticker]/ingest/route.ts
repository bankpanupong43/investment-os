import { NextRequest, NextResponse } from "next/server";
import { ingestTicker } from "@/lib/ingestion";

export async function POST(
  _req: NextRequest,
  { params }: { params: { ticker: string } }
): Promise<NextResponse> {
  const ticker = params.ticker.toUpperCase();
  const apiKey = process.env.FMP_API_KEY ?? "";

  const result = await ingestTicker(ticker, apiKey);
  const status = result.status === "failed" ? 422 : 200;
  return NextResponse.json(result, { status });
}
