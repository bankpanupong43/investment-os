// Earnings Intelligence Layer — storage model and ingestion interfaces.
//
// Architecture: provider-agnostic interface with pluggable adapters.
// No paid providers required — adapters can implement free sources.
//
// Free sources supported:
//   - SEC EDGAR 8-K filings (earnings press releases)
//   - Manual entry via POST /api/earnings
//
// Pluggable (future / optional):
//   - Alpha Vantage (free tier, rate-limited)
//   - yfinance-compatible endpoints
//   - CSV import

import { db } from "./db";

// ─── Provider interface ───────────────────────────────────────────────────────

export interface EarningsDataPoint {
  ticker: string;
  fiscalQuarter: number;       // 1–4
  fiscalYear: number;
  reportDate: string;          // ISO date string
  epsActual: number | null;
  epsEstimate: number | null;
  revenueActual: number | null;  // USD millions
  revenueEstimate: number | null;
  guidanceSummary: string | null;
  transcript: string | null;
  managementCommentary: string | null;
  keyMetrics: Record<string, string | number> | null;
}

export interface EarningsProvider {
  name: string;
  fetchLatest(ticker: string): Promise<EarningsDataPoint | null>;
  fetchHistory(ticker: string, quarters?: number): Promise<EarningsDataPoint[]>;
}

// ─── SEC 8-K adapter (free) ───────────────────────────────────────────────────
// Extracts earnings data from SEC EDGAR 8-K filings (press releases).
// This is a best-effort extraction — structured data availability varies by company.

export const SecEarningsAdapter: EarningsProvider = {
  name: "sec-edgar-8k",

  async fetchLatest(ticker: string): Promise<EarningsDataPoint | null> {
    const filing = await db.filing.findFirst({
      where: { ticker: ticker.toUpperCase(), filingType: "8-K" },
      orderBy: { filingDate: "desc" },
    });

    if (!filing || !filing.rawContent) return null;
    return extractEarningsFromContent(filing.rawContent, ticker, filing.filingDate);
  },

  async fetchHistory(ticker: string, quarters = 4): Promise<EarningsDataPoint[]> {
    const filings = await db.filing.findMany({
      where: { ticker: ticker.toUpperCase(), filingType: "8-K" },
      orderBy: { filingDate: "desc" },
      take: quarters,
    });

    return filings
      .filter(f => f.rawContent)
      .map(f => extractEarningsFromContent(f.rawContent!, ticker, f.filingDate))
      .filter((d): d is EarningsDataPoint => d !== null);
  },
};

// ─── Manual entry adapter ─────────────────────────────────────────────────────

export const ManualEarningsAdapter: EarningsProvider = {
  name: "manual",

  async fetchLatest(ticker: string): Promise<EarningsDataPoint | null> {
    const event = await db.earningsEvent.findFirst({
      where: { ticker: ticker.toUpperCase() },
      orderBy: { reportDate: "desc" },
    });

    if (!event) return null;
    return earningsEventToDataPoint(event);
  },

  async fetchHistory(ticker: string, quarters = 4): Promise<EarningsDataPoint[]> {
    const events = await db.earningsEvent.findMany({
      where: { ticker: ticker.toUpperCase() },
      orderBy: { reportDate: "desc" },
      take: quarters,
    });

    return events.map(earningsEventToDataPoint);
  },
};

// ─── Composite provider ───────────────────────────────────────────────────────
// Tries providers in order; returns first non-null result.

export function createCompositeProvider(
  providers: EarningsProvider[] = [ManualEarningsAdapter, SecEarningsAdapter],
): EarningsProvider {
  return {
    name: "composite",

    async fetchLatest(ticker: string) {
      for (const p of providers) {
        const result = await p.fetchLatest(ticker);
        if (result) return result;
      }
      return null;
    },

    async fetchHistory(ticker: string, quarters = 4) {
      for (const p of providers) {
        const results = await p.fetchHistory(ticker, quarters);
        if (results.length > 0) return results;
      }
      return [];
    },
  };
}

// ─── Storage ──────────────────────────────────────────────────────────────────

export async function storeEarningsEvent(data: EarningsDataPoint): Promise<string> {
  const position = await db.position.findFirst({ where: { ticker: data.ticker.toUpperCase() } });

  const period = `Q${data.fiscalQuarter} ${data.fiscalYear}`;

  const existing = await db.earningsEvent.findFirst({
    where: { ticker: data.ticker.toUpperCase(), fiscalQuarter: data.fiscalQuarter, fiscalYear: data.fiscalYear },
  });

  if (existing) {
    await db.earningsEvent.update({
      where: { id: existing.id },
      data: {
        epsActual: data.epsActual,
        epsEstimate: data.epsEstimate,
        revenueActual: data.revenueActual,
        revenueEstimate: data.revenueEstimate,
        guidanceSummary: data.guidanceSummary,
        transcript: data.transcript,
        managementCommentary: data.managementCommentary,
        keyMetrics: data.keyMetrics ? JSON.stringify(data.keyMetrics) : null,
      },
    });
    return existing.id;
  }

  const event = await db.earningsEvent.create({
    data: {
      ticker: data.ticker.toUpperCase(),
      positionId: position?.id ?? null,
      fiscalQuarter: data.fiscalQuarter,
      fiscalYear: data.fiscalYear,
      fiscalPeriod: period,
      reportDate: data.reportDate ? new Date(data.reportDate) : null,
      epsActual: data.epsActual,
      epsEstimate: data.epsEstimate,
      revenueActual: data.revenueActual,
      revenueEstimate: data.revenueEstimate,
      guidanceSummary: data.guidanceSummary,
      transcript: data.transcript,
      managementCommentary: data.managementCommentary,
      keyMetrics: data.keyMetrics ? JSON.stringify(data.keyMetrics) : null,
    },
  });

  return event.id;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function extractEarningsFromContent(
  content: string,
  ticker: string,
  filingDate: Date,
): EarningsDataPoint | null {
  const year = filingDate.getFullYear();
  const month = filingDate.getMonth() + 1;
  const quarter = Math.ceil(month / 3);

  const epsMatch = content.match(/earnings per (?:diluted )?share.*?\$([\d.]+)/i);
  const revMatch = content.match(/(?:total )?revenue.*?\$([\d,]+\.?\d*)\s*(billion|million|B|M)?/i);

  if (!epsMatch && !revMatch) return null;

  const parseAmount = (val: string, unit?: string): number | null => {
    const n = parseFloat(val.replace(/,/g, ""));
    if (isNaN(n)) return null;
    if (!unit) return n;
    if (/billion|B/i.test(unit)) return n * 1000;
    return n;
  };

  return {
    ticker,
    fiscalQuarter: quarter,
    fiscalYear: year,
    reportDate: filingDate.toISOString().slice(0, 10),
    epsActual: epsMatch ? parseFloat(epsMatch[1]) : null,
    epsEstimate: null,
    revenueActual: revMatch ? parseAmount(revMatch[1], revMatch[2]) : null,
    revenueEstimate: null,
    guidanceSummary: null,
    transcript: null,
    managementCommentary: null,
    keyMetrics: null,
  };
}

function earningsEventToDataPoint(event: {
  ticker: string;
  fiscalQuarter: number | null;
  fiscalYear: number | null;
  reportDate: Date | null;
  epsActual: number | null;
  epsEstimate: number | null;
  revenueActual: number | null;
  revenueEstimate: number | null;
  guidanceSummary: string | null;
  transcript: string | null;
  managementCommentary: string | null;
  keyMetrics: string | null;
}): EarningsDataPoint {
  return {
    ticker: event.ticker,
    fiscalQuarter: event.fiscalQuarter ?? 1,
    fiscalYear: event.fiscalYear ?? new Date().getFullYear(),
    reportDate: event.reportDate?.toISOString().slice(0, 10) ?? "",
    epsActual: event.epsActual,
    epsEstimate: event.epsEstimate,
    revenueActual: event.revenueActual,
    revenueEstimate: event.revenueEstimate,
    guidanceSummary: event.guidanceSummary,
    transcript: event.transcript,
    managementCommentary: event.managementCommentary,
    keyMetrics: event.keyMetrics ? JSON.parse(event.keyMetrics) : null,
  };
}
