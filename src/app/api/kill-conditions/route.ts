import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const positionId = searchParams.get("positionId");
  const status = searchParams.get("status") ?? "active";

  const where: Record<string, unknown> = { status };
  if (positionId) where.positionId = positionId;

  const killConditions = await db.killCondition.findMany({
    where,
    include: { position: { select: { ticker: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(killConditions);
}
