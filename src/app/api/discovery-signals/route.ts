import { NextResponse } from "next/server";
import { getDiscoveryLeaderboard, buildDiscoveryCandidates } from "@/lib/discovery-intelligence-engine";

export async function GET() {
  try {
    const board = await getDiscoveryLeaderboard();
    return NextResponse.json(board);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const result = await buildDiscoveryCandidates();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
