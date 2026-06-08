import { NextRequest, NextResponse } from "next/server";
import { computeCapitalDeployment } from "@/lib/architect-v2";

// POST /api/architect/capital — variable capital allocation
// Body: { amount: number }
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json().catch(() => ({}));
    const amount = Number(body.amount);
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
    }
    const result = await computeCapitalDeployment(amount);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
