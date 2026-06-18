import { NextResponse } from "next/server";
import { getMentionStats } from "@/lib/ticker-extractor";

export async function GET(
  _req: Request,
  { params }: { params: { ticker: string } },
) {
  const ticker = params.ticker?.toUpperCase();
  if (!ticker) return NextResponse.json({ error: "ticker required" }, { status: 400 });

  try {
    const stats = await getMentionStats(ticker);
    return NextResponse.json(stats);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
