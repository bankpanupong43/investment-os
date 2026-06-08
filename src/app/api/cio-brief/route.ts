import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deserializeBrief, generateMorningBrief, saveMorningBrief } from "@/lib/morning-brief-engine";
import { buildCIOBrief, renderCIOBriefMarkdown } from "@/lib/brief-generator";
import { renderNarrativeEmail } from "@/lib/html-email-exporter";
import { renderNarrativeBrief } from "@/lib/narrative-brief";
import { archiveBrief, archiveNarrative } from "@/lib/brief-archive-service";

// GET /api/cio-brief               — latest brief as CIOBriefDocument JSON
// GET /api/cio-brief?date=YYYY-MM-DD
// GET /api/cio-brief?format=narrative[&date=YYYY-MM-DD] — plain-text narrative
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");
  const format    = searchParams.get("format");

  let record;
  if (dateParam) {
    const d = new Date(dateParam);
    d.setHours(0, 0, 0, 0);
    record = await db.morningBrief.findUnique({ where: { briefingDate: d } });
  } else {
    record = await db.morningBrief.findFirst({ orderBy: { briefingDate: "desc" } });
  }

  if (!record) {
    return NextResponse.json({ error: "No brief found. POST to generate one." }, { status: 404 });
  }

  const briefData = deserializeBrief(record);
  const doc = await buildCIOBrief(briefData);

  if (format === "narrative") {
    const narrative = renderNarrativeBrief(doc);
    return new NextResponse(narrative, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return NextResponse.json(doc);
}

// POST /api/cio-brief — generate, save to DB, archive to Brain OS
export async function POST() {
  const data = await generateMorningBrief();
  await saveMorningBrief(data);

  const doc       = await buildCIOBrief(data);
  const md        = renderCIOBriefMarkdown(doc);
  const narrative = renderNarrativeBrief(doc);
  const narrativeHtml = renderNarrativeEmail(narrative, doc);

  archiveBrief(data.briefingDate, md, narrativeHtml);
  archiveNarrative(data.briefingDate, narrative);

  return NextResponse.json(doc, { status: 201 });
}
