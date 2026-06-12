// Decision Review Engine — Phase 17
//
// Rules-based only. No LLM. Answers "Why do we still own this?"
// Inputs: InvestmentThesis, OpportunityScore, PortfolioArchitectureReview,
//         MorningBrief (30d), NewsletterItem (30d), CommitteeSession (latest)

import { db } from "./db";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ThesisStatus = "Confirmed" | "Partially Confirmed" | "Broken";
export type Verdict = "Strengthen" | "Hold" | "Reduce" | "Exit";

export interface ArchitectureContext {
  score: number;
  grade: string;
  tickerNotes: string[];
}

export interface DecisionReviewData {
  ticker: string;
  reviewDate: Date;
  originalThesis: string;
  thesisStatus: ThesisStatus;
  evidenceFor: string[];
  evidenceAgainst: string[];
  opportunityScore: number;
  architectureContext: ArchitectureContext;
  verdict: Verdict;
  confidence: number;
  lessonLearned: string;
}

export interface SerializedDecisionReview extends DecisionReviewData {
  id: string;
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeJson<T>(s: string, fallback: T): T {
  try { return JSON.parse(s); } catch { return fallback; }
}

// Normalized to first Saturday of the current month — one review slot per cycle
function currentReviewDate(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
  return d;
}

// ─── Core engine ──────────────────────────────────────────────────────────────

export async function generateDecisionReview(ticker: string): Promise<DecisionReviewData> {
  const t = ticker.toUpperCase();
  const since30d = new Date(Date.now() - 30 * 86_400_000);

  const [position, thesis, latestScore, archReview, recentBriefs, recentNewsletter, latestCommittee] =
    await Promise.all([
      db.position.findFirst({ where: { ticker: t, status: "active" } }),
      db.investmentThesis.findUnique({ where: { ticker: t } }),
      db.opportunityScore.findFirst({ where: { ticker: t }, orderBy: { generatedAt: "desc" } }),
      db.portfolioArchitectureReview.findFirst({ orderBy: { reviewDate: "desc" } }),
      db.morningBrief.findMany({
        where: { briefingDate: { gte: since30d } },
        orderBy: { briefingDate: "desc" },
        take: 30,
      }),
      db.newsletterItem.findMany({
        where: { publishedAt: { gte: since30d } },
        orderBy: { publishedAt: "desc" },
        take: 100,
      }),
      db.committeeSession.findFirst({ where: { ticker: t }, orderBy: { createdAt: "desc" } }),
    ]);

  if (!position) throw new Error(`No active position for ${t}`);

  const evidenceFor: string[] = [];
  const evidenceAgainst: string[] = [];

  // Morning brief: portfolioImpact.positive / .negative arrays keyed by ticker
  for (const brief of recentBriefs) {
    const impact = safeJson<{
      positive?: { ticker: string; reason: string }[];
      negative?: { ticker: string; reason: string }[];
    }>(brief.portfolioImpact, {});
    const date = brief.briefingDate.toISOString().slice(0, 10);

    for (const item of impact.positive ?? []) {
      if (item.ticker === t) evidenceFor.push(`[Brief ${date}] ${item.reason}`);
    }
    for (const item of impact.negative ?? []) {
      if (item.ticker === t) evidenceAgainst.push(`[Brief ${date}] ${item.reason}`);
    }
  }

  // Newsletter/institutional research: text-search for ticker, then use portfolioRelevance
  const tickerLower = t.toLowerCase();
  for (const item of recentNewsletter) {
    const summaryBullets = safeJson<string[]>(item.summary, []);
    const keyPointBullets = safeJson<string[]>(item.keyPoints, []);
    const allText = [item.title, ...summaryBullets, ...keyPointBullets].join(" ").toLowerCase();

    if (!allText.includes(tickerLower)) continue;

    const date = item.publishedAt.toISOString().slice(0, 10);
    const label = `[${item.source} ${date}] ${item.title}`;
    if (item.portfolioRelevance === "bullish") evidenceFor.push(label);
    else if (item.portfolioRelevance === "bearish") evidenceAgainst.push(label);
  }

  // Committee conviction signal (most recent session for this ticker)
  if (latestCommittee) {
    const date = latestCommittee.createdAt.toISOString().slice(0, 10);
    const conv = latestCommittee.conviction;
    if (conv === "Strong Buy" || conv === "Buy") {
      evidenceFor.push(`[Committee ${date}] Conviction: ${conv}`);
    } else if (conv === "Watch") {
      evidenceFor.push(`[Committee ${date}] Conviction: Watch — monitoring`);
    } else if (conv === "Pass") {
      evidenceAgainst.push(`[Committee ${date}] Conviction: ${conv}`);
    }
  }

  // Opportunity score thresholds: >= 70 strong signal, < 40 weak signal
  const oppScore = latestScore?.opportunityScore ?? 0;
  if (oppScore >= 70) {
    evidenceFor.push(`Opportunity score ${oppScore.toFixed(0)}/100 — strong`);
  } else if (oppScore > 0 && oppScore < 40) {
    evidenceAgainst.push(`Opportunity score ${oppScore.toFixed(0)}/100 — weak`);
  }

  // Architecture context: extract any recommendation that names this ticker
  const archContext: ArchitectureContext = {
    score: archReview?.architectureScore ?? 0,
    grade: archReview?.scoreGrade ?? "N/A",
    tickerNotes: [],
  };
  if (archReview) {
    const recs = safeJson<{ action: string; description?: string; tickers?: string[] }[]>(
      archReview.recommendations,
      []
    );
    for (const rec of recs) {
      const inTickers = rec.tickers?.includes(t);
      const inText =
        rec.action?.toUpperCase().includes(t) || rec.description?.toUpperCase().includes(t);
      if (inTickers || inText) archContext.tickerNotes.push(rec.action);
    }
  }

  // Thesis status: ratio of supporting to total evidence
  const forCount = evidenceFor.length;
  const againstCount = evidenceAgainst.length;
  const total = forCount + againstCount;
  const positiveRatio = total === 0 ? 0.5 : forCount / total;

  let thesisStatus: ThesisStatus;
  if (positiveRatio >= 0.6) thesisStatus = "Confirmed";
  else if (positiveRatio >= 0.35) thesisStatus = "Partially Confirmed";
  else thesisStatus = "Broken";

  // Verdict matrix
  let verdict: Verdict;
  if (thesisStatus === "Broken") {
    verdict = "Exit";
  } else if (thesisStatus === "Confirmed" && oppScore >= 70) {
    verdict = "Strengthen";
  } else if (thesisStatus === "Confirmed") {
    verdict = "Hold";
  } else if (oppScore >= 60) {
    verdict = "Hold";
  } else {
    verdict = "Reduce";
  }

  // Confidence: evidence volume × consistency × data richness (deterministic)
  const evidenceBonus = Math.min(total * 5, 35);
  const consistencyBonus =
    positiveRatio > 0.75 || positiveRatio < 0.25 ? 20
    : positiveRatio > 0.6 || positiveRatio < 0.4 ? 10
    : 0;
  const thesisBonus = thesis ? 10 : 0;
  const scoreBonus = oppScore > 0 ? 5 : 0;
  let confidence = 30 + evidenceBonus + consistencyBonus + thesisBonus + scoreBonus;
  if (total === 0) confidence = 20;
  confidence = Math.min(Math.max(confidence, 10), 100);

  return {
    ticker: t,
    reviewDate: currentReviewDate(),
    originalThesis: thesis?.thesis ?? "",
    thesisStatus,
    evidenceFor,
    evidenceAgainst,
    opportunityScore: oppScore,
    architectureContext: archContext,
    verdict,
    confidence,
    lessonLearned: buildLessonLearned(thesisStatus, verdict, forCount, againstCount, oppScore),
  };
}

function buildLessonLearned(
  status: ThesisStatus,
  verdict: Verdict,
  forCount: number,
  againstCount: number,
  oppScore: number
): string {
  if (status === "Broken") {
    return `Core thesis appears invalidated — ${againstCount} signals against vs ${forCount} for. Review kill criteria and consider exit.`;
  }
  if (verdict === "Strengthen") {
    return `Thesis confirmed with strong opportunity score (${oppScore.toFixed(0)}). ${forCount} supporting signals. Case for adding to position.`;
  }
  if (verdict === "Reduce") {
    return `Mixed signals — ${forCount} for, ${againstCount} against, weak opportunity score (${oppScore.toFixed(0)}). Monitor closely; reduce on weakness.`;
  }
  if (forCount === 0 && againstCount === 0) {
    return "Insufficient evidence in recent intelligence — thesis neither confirmed nor challenged. Review manually.";
  }
  return `Thesis holds on balance (${forCount} for, ${againstCount} against). Hold and monitor.`;
}

// ─── Portfolio batch ──────────────────────────────────────────────────────────

export async function generatePortfolioDecisionReviews(): Promise<DecisionReviewData[]> {
  const positions = await db.position.findMany({
    where: { status: "active", NOT: { ticker: "CASH" } },
    select: { ticker: true },
    distinct: ["ticker"],
  });

  const results: DecisionReviewData[] = [];
  for (const pos of positions) {
    try {
      results.push(await generateDecisionReview(pos.ticker));
    } catch {
      // Position may lack data — skip silently
    }
  }
  return results;
}

// ─── Persistence ──────────────────────────────────────────────────────────────

export async function saveDecisionReview(data: DecisionReviewData) {
  const payload = {
    ticker: data.ticker,
    reviewDate: data.reviewDate,
    originalThesis: data.originalThesis,
    thesisStatus: data.thesisStatus,
    evidenceFor: JSON.stringify(data.evidenceFor),
    evidenceAgainst: JSON.stringify(data.evidenceAgainst),
    opportunityScore: data.opportunityScore,
    architectureContext: JSON.stringify(data.architectureContext),
    verdict: data.verdict,
    confidence: data.confidence,
    lessonLearned: data.lessonLearned,
  };

  return db.decisionReview.upsert({
    where: { ticker_reviewDate: { ticker: data.ticker, reviewDate: data.reviewDate } },
    create: payload,
    update: {
      thesisStatus: payload.thesisStatus,
      evidenceFor: payload.evidenceFor,
      evidenceAgainst: payload.evidenceAgainst,
      opportunityScore: payload.opportunityScore,
      architectureContext: payload.architectureContext,
      verdict: payload.verdict,
      confidence: payload.confidence,
      lessonLearned: payload.lessonLearned,
    },
  });
}

export function deserializeDecisionReview(row: {
  id: string;
  ticker: string;
  reviewDate: Date;
  originalThesis: string;
  thesisStatus: string;
  evidenceFor: string;
  evidenceAgainst: string;
  opportunityScore: number;
  architectureContext: string;
  verdict: string;
  confidence: number;
  lessonLearned: string;
  createdAt: Date;
}): SerializedDecisionReview {
  return {
    id: row.id,
    ticker: row.ticker,
    reviewDate: row.reviewDate,
    originalThesis: row.originalThesis,
    thesisStatus: row.thesisStatus as ThesisStatus,
    evidenceFor: safeJson<string[]>(row.evidenceFor, []),
    evidenceAgainst: safeJson<string[]>(row.evidenceAgainst, []),
    opportunityScore: row.opportunityScore,
    architectureContext: safeJson<ArchitectureContext>(row.architectureContext, {
      score: 0,
      grade: "N/A",
      tickerNotes: [],
    }),
    verdict: row.verdict as Verdict,
    confidence: row.confidence,
    lessonLearned: row.lessonLearned,
    createdAt: row.createdAt.toISOString(),
  };
}
