import { NextResponse } from "next/server";
import { getThesisPillarStatus } from "@/lib/thesis-pillar-engine";

export async function GET() {
  try {
    const data = await getThesisPillarStatus();
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
