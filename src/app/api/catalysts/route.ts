import { NextResponse } from "next/server";
import { getCatalystCalendar } from "@/lib/catalyst-engine";

export async function GET(req: Request) {
  const days = Number(new URL(req.url).searchParams.get("days") ?? "90");
  try {
    const data = await getCatalystCalendar(isNaN(days) ? 90 : days);
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
