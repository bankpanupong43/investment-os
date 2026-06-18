// Catalyst Engine
//
// Builds a forward-looking per-position event calendar from:
//   - EarningsEvent history (last known reportDate → estimate next quarter)
//   - Active positions (coverage)
//   - InvestmentThesis confidence scores (drive H/M/L impact rating)
//
// No AI, no paid APIs. Estimates are clearly flagged.

import { db } from "./db";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ImpactRating = "H" | "M" | "L";
export type CatalystType = "earnings" | "macro" | "other";

export interface CatalystEvent {
  ticker: string;
  eventType: CatalystType;
  title: string;
  date: string;          // ISO date string (YYYY-MM-DD)
  impactRating: ImpactRating;
  notes: string | null;
  isEstimated: boolean;  // true = projected from history; false = confirmed date
  daysAway: number;      // negative = past
}

// ─── Quarter helpers ──────────────────────────────────────────────────────────

function nextQuarterDate(last: Date): Date {
  const d = new Date(last);
  d.setDate(d.getDate() + 91); // ~one fiscal quarter
  return d;
}

function quarterLabel(d: Date): string {
  const month = d.getMonth() + 1; // 1-12
  const q = month <= 3 ? 1 : month <= 6 ? 2 : month <= 9 ? 3 : 4;
  return `Q${q} ${d.getFullYear()}`;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─── Impact rating ────────────────────────────────────────────────────────────

function impactRating(
  allocationPct: number,
  confidence: number | null,
): ImpactRating {
  if (allocationPct >= 10 || (confidence ?? 0) >= 8) return "H";
  if (allocationPct >= 4  || (confidence ?? 0) >= 6) return "M";
  return "L";
}

// ─── Main function ────────────────────────────────────────────────────────────

export async function getCatalystCalendar(windowDays = 90): Promise<CatalystEvent[]> {
  const now     = new Date();
  const pastCut = new Date(now.getTime() - 14  * 24 * 60 * 60 * 1000);  // 14d back
  const futureCut = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);

  const [positions, theses] = await Promise.all([
    db.position.findMany({ where: { status: "active" } }),
    db.investmentThesis.findMany({ where: { status: { in: ["active", "watchlist"] } } }),
  ]);

  const tickers = [...new Set(positions.map(p => p.ticker))];

  // Latest earnings event per ticker
  const earningsRows = await db.earningsEvent.findMany({
    where: { ticker: { in: tickers } },
    orderBy: { reportDate: "desc" },
  });

  // Keep most recent per ticker
  const latestByTicker = new Map<string, typeof earningsRows[0]>();
  for (const row of earningsRows) {
    if (!latestByTicker.has(row.ticker)) latestByTicker.set(row.ticker, row);
  }

  const confidenceMap = new Map<string, number>();
  for (const t of theses) confidenceMap.set(t.ticker, t.confidenceScore);

  const events: CatalystEvent[] = [];

  for (const pos of positions) {
    const ticker     = pos.ticker;
    const allocPct   = pos.allocationPct ?? 0;
    const confidence = confidenceMap.get(ticker) ?? null;
    const latest     = latestByTicker.get(ticker);

    if (!latest?.reportDate) continue;

    const lastDate = new Date(latest.reportDate);
    const nextDate = nextQuarterDate(lastDate);

    // Only include if within our window (past 14d or next N days)
    if (nextDate < pastCut || nextDate > futureCut) continue;

    const daysAway = Math.round((nextDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    events.push({
      ticker,
      eventType:    "earnings",
      title:        `${ticker} Earnings — ${quarterLabel(nextDate)}`,
      date:         toDateStr(nextDate),
      impactRating: impactRating(allocPct, confidence),
      notes:        latest.guidanceSummary
        ? `Prior guidance: ${latest.guidanceSummary.slice(0, 120)}`
        : null,
      isEstimated: true,
      daysAway,
    });
  }

  // Sort: soonest first (past events at end)
  events.sort((a, b) => a.daysAway - b.daysAway);

  return events;
}
