import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const recommendation = await db.recommendation.update({
    where: { id: params.id },
    data: { status: "acknowledged", acknowledgedAt: new Date() },
  });
  return NextResponse.json(recommendation);
}
