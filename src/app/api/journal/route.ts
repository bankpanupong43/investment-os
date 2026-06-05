import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const positionId = searchParams.get("positionId");
  const entryType = searchParams.get("entryType");
  const limit = parseInt(searchParams.get("limit") ?? "20");

  const where: Record<string, unknown> = {};
  if (positionId) where.positionId = positionId;
  if (entryType) where.entryType = entryType;

  const entries = await db.journalEntry.findMany({
    where,
    include: { position: { select: { ticker: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json(entries);
}

export async function POST(req: Request) {
  const body = await req.json();

  const entry = await db.journalEntry.create({
    data: {
      positionId: body.positionId ?? null,
      entryType: body.entryType,
      content: body.content,
    },
  });

  return NextResponse.json(entry, { status: 201 });
}
