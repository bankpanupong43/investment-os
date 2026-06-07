import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/cash-flows
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "200"), 500);

  const flows = await db.cashFlow.findMany({
    orderBy: { date: "desc" },
    take: limit,
  });

  const netDepositsUsd = flows.reduce((s, f) => {
    return f.type === "deposit" ? s + f.amountUsd : s - f.amountUsd;
  }, 0);

  return NextResponse.json({ flows, netDepositsUsd, total: flows.length });
}

// POST /api/cash-flows
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { date, type, amountUsd, note, source } = body;

  if (!date || !type || amountUsd == null) {
    return NextResponse.json({ error: "date, type, amountUsd required" }, { status: 400 });
  }
  if (type !== "deposit" && type !== "withdrawal") {
    return NextResponse.json({ error: "type must be deposit or withdrawal" }, { status: 400 });
  }
  if (amountUsd <= 0) {
    return NextResponse.json({ error: "amountUsd must be positive" }, { status: 400 });
  }

  const flow = await db.cashFlow.create({
    data: {
      date: new Date(date),
      type,
      amountUsd: parseFloat(amountUsd),
      note: note ?? null,
      source: source ?? "manual",
    },
  });

  return NextResponse.json(flow, { status: 201 });
}
