import { NextResponse } from "next/server";
import { compareScenarios } from "@/lib/allocation-simulator";

export async function GET() {
  try {
    const result = await compareScenarios();
    return NextResponse.json(result);
  } catch (e) {
    console.error("Allocation simulator error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
