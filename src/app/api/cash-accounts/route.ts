import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const DEFAULTS = [
  { accountName: "Dime Save", currency: "THB" },
  { accountName: "Dime USD",  currency: "USD" },
  { accountName: "FCD-USD",   currency: "USD" },
];

export async function GET() {
  let accounts = await db.cashAccount.findMany({ orderBy: { accountName: "asc" } });

  if (accounts.length === 0) {
    await Promise.all(
      DEFAULTS.map(d =>
        db.cashAccount.upsert({
          where: { accountName: d.accountName },
          update: {},
          create: { ...d, balance: 0, updatedAt: new Date() },
        }),
      ),
    );
    accounts = await db.cashAccount.findMany({ orderBy: { accountName: "asc" } });
  }

  return NextResponse.json(accounts);
}

export async function PATCH(req: Request) {
  const body = await req.json() as { id: string; balance: number; notes?: string | null };
  if (!body.id || body.balance == null) {
    return NextResponse.json({ error: "id and balance required" }, { status: 400 });
  }

  try {
    const account = await db.cashAccount.update({
      where: { id: body.id },
      data: {
        balance: body.balance,
        notes: body.notes ?? null,
        updatedAt: new Date(),
      },
    });
    return NextResponse.json(account);
  } catch {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }
}
