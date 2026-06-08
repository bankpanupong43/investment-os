import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateBlueprint, saveBlueprint, deserializeBlueprint } from "@/lib/architect-engine";

// GET /api/architect — fetch latest blueprint or by ?date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");

  let record;
  if (dateParam) {
    const d = new Date(dateParam);
    d.setHours(0, 0, 0, 0);
    record = await db.portfolioBlueprint.findUnique({ where: { blueprintDate: d } });
  } else {
    record = await db.portfolioBlueprint.findFirst({ orderBy: { blueprintDate: "desc" } });
  }

  if (!record) return NextResponse.json({ blueprint: null });

  return NextResponse.json({ blueprint: deserializeBlueprint(record) });
}

// POST /api/architect — generate + save blueprint, returns 201
export async function POST(_req: NextRequest) {
  const data = await generateBlueprint();
  const record = await saveBlueprint(data);
  return NextResponse.json({ blueprint: deserializeBlueprint(record) }, { status: 201 });
}
