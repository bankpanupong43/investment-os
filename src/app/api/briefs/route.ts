import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const briefType = searchParams.get("type");
  const limit = parseInt(searchParams.get("limit") ?? "10");

  const where: Record<string, unknown> = {};
  if (briefType) where.briefType = briefType;

  const briefs = await db.brief.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json(briefs);
}
