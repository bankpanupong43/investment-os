import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enrichThesis } from "../_shared";

type Params = { params: { ticker: string } };

export async function GET(_req: NextRequest, { params }: Params): Promise<NextResponse> {
  const record = await db.investmentThesis.findUnique({
    where: { ticker: params.ticker.toUpperCase() },
    include: { reviews: { orderBy: { reviewedAt: "desc" } } },
  });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(enrichThesis(record));
}

export async function PATCH(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const body = await req.json();
  const { title, thesis, whyOwn, risks, killCriteria, confidenceScore, reviewFrequency, status, isDraft, notes } = body;

  const existing = await db.investmentThesis.findUnique({ where: { ticker: params.ticker.toUpperCase() } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await db.investmentThesis.update({
    where: { ticker: params.ticker.toUpperCase() },
    data: {
      ...(title !== undefined && { title }),
      ...(thesis !== undefined && { thesis }),
      ...(whyOwn !== undefined && { whyOwn }),
      ...(risks !== undefined && { risks }),
      ...(killCriteria !== undefined && { killCriteria }),
      ...(confidenceScore !== undefined && { confidenceScore }),
      ...(reviewFrequency !== undefined && { reviewFrequency }),
      ...(status !== undefined && { status }),
      ...(isDraft !== undefined && { isDraft }),
      ...(notes !== undefined && { notes }),
    },
    include: { reviews: { orderBy: { reviewedAt: "desc" } } },
  });

  return NextResponse.json(enrichThesis(updated));
}

export async function DELETE(_req: NextRequest, { params }: Params): Promise<NextResponse> {
  const existing = await db.investmentThesis.findUnique({ where: { ticker: params.ticker.toUpperCase() } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.investmentThesis.delete({ where: { ticker: params.ticker.toUpperCase() } });
  return NextResponse.json({ deleted: true });
}
