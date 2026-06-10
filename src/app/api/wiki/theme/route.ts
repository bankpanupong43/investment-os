"use client";
import { NextRequest, NextResponse } from "next/server";
import { upsertThemePage } from "@/lib/wiki-service";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    upsertThemePage(body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
