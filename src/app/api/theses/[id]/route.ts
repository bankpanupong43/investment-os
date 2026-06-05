import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const thesis = await db.thesis.findUnique({
    where: { id: params.id },
    include: { updates: { orderBy: { createdAt: "asc" } }, position: true },
  });
  if (!thesis) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(thesis);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();

  const update = await db.thesisUpdate.create({
    data: {
      thesisId: params.id,
      updateType: body.updateType,
      content: body.content,
      triggeredBy: body.triggeredBy ?? null,
      sourceUrl: body.sourceUrl ?? null,
    },
  });

  await db.thesis.update({
    where: { id: params.id },
    data: { lastReviewedAt: new Date() },
  });

  return NextResponse.json(update, { status: 201 });
}
