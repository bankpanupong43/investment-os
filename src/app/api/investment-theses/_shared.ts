export interface ThesisReviewRecord {
  id: string;
  reviewType: string;
  previousConfidence: number | null;
  newConfidence: number | null;
  notes: string | null;
  reviewedAt: string;
}

export interface InvestmentThesisItem {
  id: string;
  ticker: string;
  title: string;
  thesis: string;
  whyOwn: string;
  risks: string;
  killCriteria: string;
  confidenceScore: number;
  reviewFrequency: string;
  lastReviewedAt: string | null;
  status: string;
  isDraft: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  isReviewDue: boolean;
  daysSinceReview: number | null;
  reviewDueDate: string | null;
  daysOverdue: number | null;
  reviews: ThesisReviewRecord[];
}

export function freqDays(freq: string): number {
  if (freq === "monthly") return 30;
  if (freq === "quarterly") return 90;
  return 365;
}

export function enrichThesis(t: {
  id: string; ticker: string; title: string; thesis: string; whyOwn: string;
  risks: string; killCriteria: string; confidenceScore: number; reviewFrequency: string;
  lastReviewedAt: Date | null; status: string; isDraft: boolean; notes: string | null;
  createdAt: Date; updatedAt: Date;
  reviews: Array<{ id: string; reviewType: string; previousConfidence: number | null; newConfidence: number | null; notes: string | null; reviewedAt: Date }>;
}): InvestmentThesisItem {
  const now = new Date();
  const days = freqDays(t.reviewFrequency);
  let isReviewDue = true;
  let daysSinceReview: number | null = null;
  let reviewDueDate: string | null = null;
  let daysOverdue: number | null = null;

  if (t.lastReviewedAt) {
    const msAgo = now.getTime() - t.lastReviewedAt.getTime();
    daysSinceReview = Math.floor(msAgo / 86_400_000);
    const due = new Date(t.lastReviewedAt);
    due.setDate(due.getDate() + days);
    reviewDueDate = due.toISOString();
    isReviewDue = due < now;
    if (isReviewDue) {
      daysOverdue = Math.floor((now.getTime() - due.getTime()) / 86_400_000);
    }
  }

  return {
    ...t,
    lastReviewedAt: t.lastReviewedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    isReviewDue,
    daysSinceReview,
    reviewDueDate,
    daysOverdue,
    reviews: t.reviews.map(r => ({
      ...r,
      reviewedAt: r.reviewedAt.toISOString(),
    })),
  };
}
