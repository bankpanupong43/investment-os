import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { PortfolioReviewRecord } from "../route";

function parseReview(r: {
  id: string; generatedAt: Date; notes: string | null;
  portfolioSummary: string; allocationAnalysis: string;
  thesisCoverageAnalysis: string; riskAnalysis: string;
  cashAllocationReview: string; watchlistPrioritization: string;
  biggestRisk: string; biggestOpportunity: string;
  mostUnderallocated: string; weakestThesis: string; reviewsDue: string;
  brainContextReport: string | null;
  topOpportunities: string;
}): PortfolioReviewRecord {
  return {
    id: r.id,
    generatedAt: r.generatedAt.toISOString(),
    notes: r.notes,
    portfolioSummary:        JSON.parse(r.portfolioSummary),
    allocationAnalysis:      JSON.parse(r.allocationAnalysis),
    thesisCoverageAnalysis:  JSON.parse(r.thesisCoverageAnalysis),
    riskAnalysis:            JSON.parse(r.riskAnalysis),
    cashAllocationReview:    JSON.parse(r.cashAllocationReview),
    watchlistPrioritization: JSON.parse(r.watchlistPrioritization),
    biggestRisk:             JSON.parse(r.biggestRisk),
    biggestOpportunity:      JSON.parse(r.biggestOpportunity),
    mostUnderallocated:      JSON.parse(r.mostUnderallocated),
    weakestThesis:           JSON.parse(r.weakestThesis),
    reviewsDue:              JSON.parse(r.reviewsDue),
    brainContextReport:      r.brainContextReport ? JSON.parse(r.brainContextReport) : null,
    topOpportunities:        JSON.parse(r.topOpportunities),
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const row = await db.portfolioReview.findUnique({ where: { id: params.id } });
  if (!row) return NextResponse.json({ error: "Review not found" }, { status: 404 });
  return NextResponse.json(parseReview(row));
}
