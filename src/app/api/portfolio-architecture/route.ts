import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  generateArchitectureReview,
  saveArchitectureReview,
  deserializeArchitectureReview,
  writeHedgeAuditToWiki,
  writeHedgeRankingToWiki,
  writeRegimeHedgeToWiki,
} from "@/lib/architecture-review-engine";

// GET — return most recent architecture review from DB
export async function GET(): Promise<NextResponse> {
  const rows = await db.portfolioArchitectureReview.findMany({
    orderBy: { reviewDate: "desc" },
    take: 12, // up to 12 months of history
  });

  if (rows.length === 0) {
    return NextResponse.json({ review: null, history: [] });
  }

  return NextResponse.json({
    review: deserializeArchitectureReview(rows[0]),
    history: rows.map(r => ({
      id: r.id,
      reviewDate: r.reviewDate.toISOString().slice(0, 10),
      architectureScore: r.architectureScore,
      scoreGrade: r.scoreGrade,
      scoreLabel: r.scoreLabel,
      marketRegime: r.marketRegime,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

// POST — generate a fresh review on demand
export async function POST(): Promise<NextResponse> {
  const data = await generateArchitectureReview();
  const record = await saveArchitectureReview(data);
  if (data.hedgeAudit) writeHedgeAuditToWiki(data.hedgeAudit, data.reviewDate);
  if (data.hedgeRanking && data.replacementScenarios) {
    writeHedgeRankingToWiki(data.hedgeRanking, data.replacementScenarios, data.reviewDate);
  }
  if (data.regimeHedgeReport) {
    writeRegimeHedgeToWiki(data.regimeHedgeReport, data.reviewDate);
  }
  return NextResponse.json(deserializeArchitectureReview(record), { status: 201 });
}
