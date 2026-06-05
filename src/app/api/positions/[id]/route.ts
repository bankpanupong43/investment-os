import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const position = await db.position.findUnique({
    where: { id: params.id },
    include: {
      thesis: { include: { updates: { orderBy: { createdAt: "desc" } } } },
      killConditions: { orderBy: { createdAt: "asc" } },
      journalEntries: { orderBy: { createdAt: "desc" }, take: 20 },
      recommendations: { orderBy: { createdAt: "desc" }, take: 10 },
      earningsEvents: { orderBy: { reportDate: "desc" }, take: 8 },
    },
  });

  if (!position) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(position);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();
  const position = await db.position.update({
    where: { id: params.id },
    data: {
      shares: body.shares,
      avgCost: body.avgCost,
      status: body.status,
      notes: body.notes,
    },
  });
  return NextResponse.json(position);
}
