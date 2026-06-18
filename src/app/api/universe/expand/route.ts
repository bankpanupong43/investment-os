import { NextRequest, NextResponse } from "next/server";
import { expandUniverse, ingestCandidateBatch, getUniverseStats } from "@/lib/universe-expander";

const API_KEY = process.env.FMP_API_KEY ?? "";

export async function GET() {
  const stats = await getUniverseStats();
  return NextResponse.json(stats);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = (body as { action?: string }).action ?? "expand";

  if (!API_KEY) {
    return NextResponse.json({ error: "FMP_API_KEY not set" }, { status: 500 });
  }

  if (action === "ingest") {
    const batchSize = (body as { batchSize?: number }).batchSize ?? 40;
    const result = await ingestCandidateBatch(API_KEY, batchSize);
    return NextResponse.json(result);
  }

  // Default: expand (screener → upsert metadata)
  const result = await expandUniverse(API_KEY);
  return NextResponse.json(result);
}
