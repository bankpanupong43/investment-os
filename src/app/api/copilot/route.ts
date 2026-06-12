import { NextRequest, NextResponse } from "next/server";
import { answerQuestion } from "@/lib/copilot-engine";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as { question?: string };
    const question = (body.question ?? "").trim();
    if (!question) {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }

    const answer = await answerQuestion(question);
    return NextResponse.json(answer);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/copilot]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
