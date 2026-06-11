// GET /api/newsletter — list recent newsletter items
// POST /api/newsletter — trigger a newsletter refresh run

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runNewsletterRefresh, SOURCE_LABELS } from "@/lib/newsletter-engine";
import { isGmailConfigured } from "@/lib/gmail-newsletter";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days   = parseInt(searchParams.get("days")  ?? "7",  10);
  const source = searchParams.get("source") ?? undefined;

  const since = new Date(Date.now() - days * 86400 * 1000);

  const items = await db.newsletterItem.findMany({
    where: {
      publishedAt: { gte: since },
      ...(source ? { source } : {}),
    },
    orderBy: { publishedAt: "desc" },
    take: 100,
  });

  const serialized = items.map(item => ({
    id:                      item.id,
    source:                  item.source,
    sourceLabel:             SOURCE_LABELS[item.source] ?? item.source,
    title:                   item.title,
    url:                     item.url,
    publishedAt:             item.publishedAt.toISOString(),
    summary:                 JSON.parse(item.summary) as string[],
    keyPoints:               JSON.parse(item.keyPoints) as string[],
    marketImplications:      JSON.parse(item.marketImplications) as Record<string, string>,
    geopoliticalImplications: JSON.parse(item.geopoliticalImplications) as string[],
    portfolioRelevance:      item.portfolioRelevance,
    confidence:              item.confidence,
    createdAt:               item.createdAt.toISOString(),
  }));

  const counts = serialized.reduce<Record<string, number>>((acc, item) => {
    acc[item.source] = (acc[item.source] ?? 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    items: serialized,
    total: serialized.length,
    bySource: counts,
    gmailConfigured: isGmailConfigured(),
    period: { days, since: since.toISOString() },
  });
}

export async function POST() {
  try {
    const result = await runNewsletterRefresh();
    return NextResponse.json({
      success: true,
      fetched:           result.fetched,
      newItems:          result.newItems,
      duplicatesSkipped: result.duplicatesSkipped,
      bySource:          result.bySource,
      errors:            result.errors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
