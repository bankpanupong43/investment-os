"use client";
import { NextRequest, NextResponse } from "next/server";
import { upsertDailyNote } from "@/lib/wiki-service";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    upsertDailyNote(body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
