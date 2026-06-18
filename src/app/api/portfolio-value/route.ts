import { NextResponse } from "next/server";
import { computePortfolioValue } from "@/lib/portfolio-value-engine";

export async function GET() {
  try {
    const snapshot = await computePortfolioValue();
    return NextResponse.json(snapshot);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
