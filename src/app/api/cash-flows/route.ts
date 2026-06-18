import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

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

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    date, type,
    currency = "USD",
    accountName,
    note,
    source,
  } = body;

  // Support both new (amountNative) and legacy (amountUsd) field names
  const nativeAmount: number | null = body.amountNative ?? body.amountUsd ?? null;

  if (!date || !type || nativeAmount == null) {
    return NextResponse.json({ error: "date, type, and amount required" }, { status: 400 });
  }
  if (type !== "deposit" && type !== "withdrawal") {
    return NextResponse.json({ error: "type must be deposit or withdrawal" }, { status: 400 });
  }
  if (nativeAmount <= 0) {
    return NextResponse.json({ error: "amount must be positive" }, { status: 400 });
  }

  // Convert to USD equivalent for performance tracking
  let amountUsd = nativeAmount;
  if (currency === "THB") {
    const fxRow = await db.marketSnapshot.findFirst({
      where: { metric: "USDTHB" },
      orderBy: { date: "desc" },
    });
    const usdthb = fxRow?.value ?? 35;
    amountUsd = nativeAmount / usdthb;
  }

  const flow = await db.cashFlow.create({
    data: {
      date:        new Date(date),
      type,
      amountUsd,
      amountNative: nativeAmount,
      currency,
      accountName:  accountName ?? null,
      note:         note ?? null,
      source:       source ?? "manual",
    },
  });

  return NextResponse.json(flow, { status: 201 });
}
