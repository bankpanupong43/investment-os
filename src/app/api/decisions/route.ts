import { NextResponse } from "next/server";
import { generateDecisionQueue } from "@/lib/decision-engine";

export async function GET() {
  try {
    const queue = await generateDecisionQueue();
    return NextResponse.json(queue);
  } catch (err) {
    console.error("[decisions] generateDecisionQueue failed:", err);
    return NextResponse.json({ error: "Failed to generate decision queue" }, { status: 500 });
  }
}
