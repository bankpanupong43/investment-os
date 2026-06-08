import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  generateRadarCandidates, saveRadarCandidates, deserializeCandidate, buildThemeSummaries,
} from "@/lib/radar-engine";

// GET /api/radar — fetch candidates
// ?category=small_cap|mid_cap|large_cap|etf|special_situation
// ?theme=AI+Infrastructure
// ?status=active|promoted|dismissed|stale
// ?limit=50
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category") ?? undefined;
  const theme = searchParams.get("theme") ?? undefined;
  const status = searchParams.get("status") ?? "active";
  const limit = parseInt(searchParams.get("limit") ?? "50");
  const summaries = searchParams.get("summaries") === "true";

  if (summaries) {
    const themes = await buildThemeSummaries();
    return NextResponse.json({ themes });
  }

  const where: Record<string, unknown> = { status };
  if (category) where.category = category;

  let candidates = await db.discoveryCandidate.findMany({
    where,
    orderBy: { radarScore: "desc" },
    take: limit,
  });

  // Filter by theme (JSON string contains check)
  if (theme) {
    candidates = candidates.filter(c => {
      try { return (JSON.parse(c.themes) as string[]).includes(theme); }
      catch { return false; }
    });
  }

  return NextResponse.json({
    candidates: candidates.map(deserializeCandidate),
    total: candidates.length,
  });
}

// POST /api/radar — trigger a full radar refresh
export async function POST(_req: NextRequest) {
  const t0 = Date.now();
  const candidates = await generateRadarCandidates();
  const saved = await saveRadarCandidates(candidates);
  const durationMs = Date.now() - t0;

  return NextResponse.json({
    generated: saved.length,
    tickers: saved,
    durationMs,
    topCandidates: candidates.slice(0, 5).map(c => ({
      ticker: c.ticker,
      radarScore: c.radarScore,
      category: c.category,
      themes: c.themes,
    })),
  }, { status: 201 });
}

// PATCH /api/radar — update candidate status (promote / dismiss)
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { ticker, status } = body as { ticker: string; status: string };

  if (!ticker || !["promoted", "dismissed", "active"].includes(status)) {
    return NextResponse.json({ error: "ticker and valid status required" }, { status: 400 });
  }

  const updated = await db.discoveryCandidate.update({
    where: { ticker },
    data: {
      status,
      promotedAt: status === "promoted" ? new Date() : undefined,
    },
  });

  return NextResponse.json(deserializeCandidate(updated));
}
