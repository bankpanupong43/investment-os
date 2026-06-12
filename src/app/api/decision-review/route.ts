import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  generateDecisionReview,
  saveDecisionReview,
  deserializeDecisionReview,
} from "@/lib/decision-review-engine";

export async function GET(): Promise<NextResponse> {
  try {
    const rows = await db.decisionReview.findMany({
      orderBy: { reviewDate: "desc" },
    });

    // Latest review per ticker
    const seen = new Set<string>();
    const latest = rows.filter((r) => {
      if (seen.has(r.ticker)) return false;
      seen.add(r.ticker);
      return true;
    });

    return NextResponse.json({ reviews: latest.map(deserializeDecisionReview) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { ticker } = await req.json();
    if (!ticker || typeof ticker !== "string") {
      return NextResponse.json({ error: "ticker required" }, { status: 400 });
    }

    const data = await generateDecisionReview(ticker.toUpperCase());
    const saved = await saveDecisionReview(data);

    // Wiki: create review page + bidirectional backlink
    try {
      const { createReviewPage, addReviewBacklinkToCompanyPage } = await import("@/lib/wiki-service");
      const slug = createReviewPage(data.ticker, {
        ticker: data.ticker,
        reviewDate: data.reviewDate,
        originalThesis: data.originalThesis,
        thesisStatus: data.thesisStatus,
        evidenceFor: data.evidenceFor,
        evidenceAgainst: data.evidenceAgainst,
        opportunityScore: data.opportunityScore,
        architectureContext: data.architectureContext,
        verdict: data.verdict,
        confidence: data.confidence,
        lessonLearned: data.lessonLearned,
      });
      addReviewBacklinkToCompanyPage(data.ticker, slug);
    } catch (err) {
      console.error("[POST /api/decision-review] wiki failed:", err);
    }

    return NextResponse.json({
      id: saved.id,
      ticker: data.ticker,
      thesisStatus: data.thesisStatus,
      verdict: data.verdict,
      confidence: data.confidence,
      opportunityScore: data.opportunityScore,
      evidenceFor: data.evidenceFor.length,
      evidenceAgainst: data.evidenceAgainst.length,
      lessonLearned: data.lessonLearned,
      reviewDate: data.reviewDate.toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/decision-review]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
