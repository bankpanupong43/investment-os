import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const [totalMentions, latestMention, bySource] = await Promise.all([
      db.companyMention.count(),
      db.companyMention.findFirst({
        orderBy: { mentionDate: "desc" },
        select:  { mentionDate: true, ticker: true },
      }),
      db.companyMention.groupBy({
        by:          ["sourceType"],
        _count:      { id: true },
        orderBy:     { _count: { id: "desc" } },
      }),
    ]);

    const topTickers = await db.companyMention.groupBy({
      by:      ["ticker"],
      _count:  { id: true },
      where:   { mentionDate: { gte: new Date(Date.now() - 30 * 86_400_000) } },
      orderBy: { _count: { id: "desc" } },
      take:    10,
    });

    return NextResponse.json({
      totalMentions,
      latestMentionDate: latestMention?.mentionDate ?? null,
      latestMentionTicker: latestMention?.ticker ?? null,
      bySource: bySource.map(r => ({ sourceType: r.sourceType, count: r._count.id })),
      top10Tickers30d: topTickers.map(r => ({ ticker: r.ticker, count: r._count.id })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const { extractNewMentions } = await import("@/lib/ticker-extractor");
    const result = await extractNewMentions();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
