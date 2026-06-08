import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deserializeBrief } from "@/lib/morning-brief-engine";
import { buildCIOBrief } from "@/lib/brief-generator";
import { renderNarrativeEmail } from "@/lib/html-email-exporter";
import { renderNarrativeBrief } from "@/lib/narrative-brief";
import { readArchiveEntry } from "@/lib/brief-archive-service";

// GET /api/morning-brief/email-preview — HTML email for the latest (or ?date=) brief
// Serves text/html so it can be displayed in an iframe
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");

  // Try reading from archive first
  if (dateParam) {
    const archived = readArchiveEntry(dateParam, "html");
    if (archived) {
      return new NextResponse(archived, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
  }

  // Fall back to generating from DB
  let record;
  if (dateParam) {
    const d = new Date(dateParam);
    d.setHours(0, 0, 0, 0);
    record = await db.morningBrief.findUnique({ where: { briefingDate: d } });
  } else {
    record = await db.morningBrief.findFirst({ orderBy: { briefingDate: "desc" } });
  }

  if (!record) {
    return new NextResponse("<html><body><p>No brief found. Generate one first.</p></body></html>", {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const briefData = deserializeBrief(record);
  const doc = await buildCIOBrief(briefData);
  const narrative = renderNarrativeBrief(doc);
  const html = renderNarrativeEmail(narrative, doc);

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
