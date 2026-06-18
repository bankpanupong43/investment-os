import { NextResponse } from "next/server";
import { generateResearchQueue, writeResearchQueueToWiki } from "@/lib/research-queue-engine";

export async function GET() {
  try {
    const queue = await generateResearchQueue();
    return NextResponse.json(queue);
  } catch (err) {
    console.error("[research-queue] GET error:", err);
    return NextResponse.json({ error: "Failed to generate research queue" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const queue = await generateResearchQueue();
    writeResearchQueueToWiki(queue);
    return NextResponse.json({ success: true, themesNeedingResearch: queue.themesNeedingResearch });
  } catch (err) {
    console.error("[research-queue] POST error:", err);
    return NextResponse.json({ error: "Failed to generate research queue" }, { status: 500 });
  }
}
