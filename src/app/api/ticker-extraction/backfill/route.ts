import { NextResponse } from "next/server";

export async function POST() {
  try {
    const { backfillAllMentions } = await import("@/lib/ticker-extractor");
    const result = await backfillAllMentions();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
