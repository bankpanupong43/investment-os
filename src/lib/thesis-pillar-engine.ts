// Thesis Pillar Engine
//
// Derives per-pillar status (intact/weakening/broken) and trend
// (improving/stable/deteriorating) from InvestmentThesis text + ThesisImpactRecord history.
// No AI — purely rules-based signal extraction.

import { db } from "./db";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PillarStatus = "intact" | "weakening" | "broken";
export type PillarTrend  = "improving" | "stable" | "deteriorating";

export interface ThesisPillar {
  name: string;
  status: PillarStatus;
  trend: PillarTrend;
  lastEvidence: string | null;
  lastEvidenceDate: string | null; // ISO string
}

export interface ThesisPillarResult {
  ticker: string;
  title: string;
  overallStatus: PillarStatus;
  confidenceScore: number;
  pillars: ThesisPillar[];
  disconfirmingEvidence: { text: string; date: string }[];
  lastReviewedAt: string | null;
}

// ─── Pillar extraction ────────────────────────────────────────────────────────

function extractPillars(thesis: string): string[] {
  // Try numbered list: "1. ..." or "1) ..."
  const numbered = thesis.match(/(?:^|\n)\s*\d+[.)]\s+(.+)/g);
  if (numbered && numbered.length >= 2) {
    return numbered.slice(0, 5).map(s => s.replace(/^\s*\d+[.)]\s+/, "").trim().slice(0, 70));
  }

  // Try bullet list: "- ..." or "• ..."
  const bullets = thesis.match(/(?:^|\n)\s*[-•*]\s+(.+)/g);
  if (bullets && bullets.length >= 2) {
    return bullets.slice(0, 5).map(s => s.replace(/^\s*[-•*]\s+/, "").trim().slice(0, 70));
  }

  // Fallback: split on sentence boundary, take first 3–4 sentences
  const sentences = thesis
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 20 && s.length < 200);
  if (sentences.length >= 2) {
    return sentences.slice(0, 4).map(s => s.slice(0, 70));
  }

  // Last resort: whole thesis as one pillar
  return [thesis.slice(0, 70)];
}

// ─── Status derivation from impact records ────────────────────────────────────

type ImpactLevel = "intact" | "strengthened" | "weakened" | "kill_criteria_triggered";

interface RawImpact {
  impactLevel: string;
  reasoning: string;
  createdAt: Date;
}

function deriveStatus(recent: RawImpact[], older: RawImpact[]): PillarStatus {
  const killOrBreak = recent.filter(r => r.impactLevel === "kill_criteria_triggered");
  if (killOrBreak.length > 0) return "broken";

  const weakenCount = recent.filter(r => r.impactLevel === "weakened").length;
  const intactCount = recent.filter(r => r.impactLevel === "intact" || r.impactLevel === "strengthened").length;

  if (weakenCount >= 2 || weakenCount > intactCount) return "weakening";
  if (weakenCount === 1 && older.filter(r => r.impactLevel === "weakened").length >= 1) return "weakening";
  return "intact";
}

function deriveTrend(recent: RawImpact[], older: RawImpact[]): PillarTrend {
  const score = (records: RawImpact[]) =>
    records.reduce((s, r) => {
      if (r.impactLevel === "kill_criteria_triggered") return s - 3;
      if (r.impactLevel === "weakened") return s - 1;
      if (r.impactLevel === "strengthened") return s + 1;
      return s;
    }, 0);

  const recentScore = score(recent);
  const olderScore  = score(older);

  if (recentScore > olderScore + 0) return "improving";
  if (recentScore < olderScore - 0 || recentScore < -1) return "deteriorating";
  return "stable";
}

// ─── Main function ────────────────────────────────────────────────────────────

export async function getThesisPillarStatus(): Promise<ThesisPillarResult[]> {
  const theses = await db.investmentThesis.findMany({
    where: { status: { in: ["active", "watchlist"] } },
    orderBy: { ticker: "asc" },
  });

  if (theses.length === 0) return [];

  const tickers = theses.map(t => t.ticker);

  const now    = new Date();
  const day30  = new Date(now.getTime() - 30  * 24 * 60 * 60 * 1000);
  const day90  = new Date(now.getTime() - 90  * 24 * 60 * 60 * 1000);

  const allImpacts = await db.thesisImpactRecord.findMany({
    where: { ticker: { in: tickers }, createdAt: { gte: day90 } },
    orderBy: { createdAt: "desc" },
  });

  const byTicker = new Map<string, RawImpact[]>();
  for (const imp of allImpacts) {
    const list = byTicker.get(imp.ticker) ?? [];
    list.push({ impactLevel: imp.impactLevel, reasoning: imp.reasoning, createdAt: imp.createdAt });
    byTicker.set(imp.ticker, list);
  }

  return theses.map(thesis => {
    const impacts    = byTicker.get(thesis.ticker) ?? [];
    const recent     = impacts.filter(r => r.createdAt >= day30);
    const older      = impacts.filter(r => r.createdAt <  day30);

    const overallStatus = deriveStatus(recent, older);
    const trend         = deriveTrend(recent, older);

    const pillars = extractPillars(thesis.thesis).map((name): ThesisPillar => ({
      name,
      // All pillars share the overall status unless we have pillar-specific signals
      // (the impact records don't reference individual pillars, so we propagate globally)
      status:            overallStatus,
      trend,
      lastEvidence:      recent[0]?.reasoning ?? null,
      lastEvidenceDate:  recent[0]?.createdAt.toISOString() ?? null,
    }));

    // Disconfirming evidence = weakening/kill signals, most recent 3
    const disconfirming = impacts
      .filter(r => r.impactLevel === "weakened" || r.impactLevel === "kill_criteria_triggered")
      .slice(0, 3)
      .map(r => ({ text: r.reasoning, date: r.createdAt.toISOString() }));

    return {
      ticker:          thesis.ticker,
      title:           thesis.title,
      overallStatus,
      confidenceScore: thesis.confidenceScore,
      pillars,
      disconfirmingEvidence: disconfirming,
      lastReviewedAt:  thesis.lastReviewedAt?.toISOString() ?? null,
    };
  });
}
