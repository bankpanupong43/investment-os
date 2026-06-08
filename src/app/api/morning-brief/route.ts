import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateMorningBrief, saveMorningBrief, deserializeBrief } from "@/lib/morning-brief-engine";

// GET /api/morning-brief — return the latest brief (or by ?date=YYYY-MM-DD)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");

  let record;

  if (dateParam) {
    const d = new Date(dateParam);
    d.setHours(0, 0, 0, 0);
    record = await db.morningBrief.findUnique({ where: { briefingDate: d } });
  } else {
    record = await db.morningBrief.findFirst({ orderBy: { briefingDate: "desc" } });
  }

  if (!record) {
    return NextResponse.json({ error: "No morning brief found. POST to generate one." }, { status: 404 });
  }

  return NextResponse.json(deserializeBrief(record));
}

// POST /api/morning-brief — generate (and save) a new brief for today
export async function POST(_req: NextRequest) {
  const data = await generateMorningBrief();
  const record = await saveMorningBrief(data);
  return NextResponse.json(deserializeBrief(record), { status: 201 });
}
