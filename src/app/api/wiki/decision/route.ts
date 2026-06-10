"use client";
import { NextRequest, NextResponse } from "next/server";
import { createDecisionPage } from "@/lib/wiki-service";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const filePath = createDecisionPage(body);
    return NextResponse.json({ ok: true, filePath });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
