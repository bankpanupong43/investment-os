import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  try {
    const item = await db.watchlist.update({
      where: { id: params.id },
      data: {
        ...(body.status           !== undefined && { status: body.status }),
        ...(body.notes            !== undefined && { notes: body.notes ?? null }),
        ...(body.interestReason   !== undefined && { interestReason: body.interestReason }),
        ...(body.draftThesis      !== undefined && { draftThesis: body.draftThesis ?? null }),
        ...(body.targetEntryPrice !== undefined && { targetEntryPrice: body.targetEntryPrice ?? null }),
        ...(body.name             !== undefined && { name: body.name ?? null }),
      },
    });
    return NextResponse.json(item);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await db.watchlist.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
