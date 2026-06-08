import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export type FeedbackType = "interested" | "not_interested" | "already_owned" | "disagree" | "researching";

export interface FeedbackRecord {
  id: string;
  ticker: string;
  feedbackType: FeedbackType;
  notes: string | null;
  createdAt: string;
}

const VALID_TYPES: FeedbackType[] = ["interested", "not_interested", "already_owned", "disagree", "researching"];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker");

  const rows = await db.recommendationFeedback.findMany({
    where: ticker ? { ticker: ticker.toUpperCase() } : undefined,
    orderBy: { createdAt: "desc" },
  });

  const records: FeedbackRecord[] = rows.map(r => ({
    id: r.id,
    ticker: r.ticker,
    feedbackType: r.feedbackType as FeedbackType,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
  }));

  return NextResponse.json(records);
}

export async function POST(req: Request) {
  let body: { ticker?: string; feedbackType?: string; notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ticker = body.ticker?.trim().toUpperCase();
  if (!ticker) return NextResponse.json({ error: "ticker is required" }, { status: 400 });

  const feedbackType = body.feedbackType as FeedbackType;
  if (!VALID_TYPES.includes(feedbackType)) {
    return NextResponse.json({ error: `feedbackType must be one of: ${VALID_TYPES.join(", ")}` }, { status: 400 });
  }

  const record = await db.recommendationFeedback.create({
    data: {
      ticker,
      feedbackType,
      notes: body.notes?.trim() || null,
    },
  });

  return NextResponse.json({
    id: record.id,
    ticker: record.ticker,
    feedbackType: record.feedbackType as FeedbackType,
    notes: record.notes,
    createdAt: record.createdAt.toISOString(),
  } satisfies FeedbackRecord);
}
