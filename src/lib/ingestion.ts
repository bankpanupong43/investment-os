// Ingestion orchestration: FMP fetch → DB upsert → rescore → log.

import { db } from "./db";
import { fetchFundamentals } from "./fmp-client";
import { computeScores } from "./scoring-engine";

export interface IngestionResult {
  ticker: string;
  status: "success" | "partial" | "failed" | "skipped";
  fieldsUpdated: string[];
  fieldsMissing: string[];
  errorMessage?: string;
  apiCallCount: number;
  durationMs: number;
}

export interface UniverseIngestionSummary {
  results: IngestionResult[];
  totalMs: number;
  successCount: number;
  partialCount: number;
  failedCount: number;
  skippedCount: number;
}

// ─── Single ticker ────────────────────────────────────────────────────────────

export async function ingestTicker(ticker: string, apiKey: string): Promise<IngestionResult> {
  const start = Date.now();
  const t = ticker.toUpperCase();

  const entry = await db.universe.findUnique({ where: { ticker: t } });

  if (!entry) {
    return { ticker: t, status: "failed", fieldsUpdated: [], fieldsMissing: [],
      errorMessage: "Not in universe", apiCallCount: 0, durationMs: Date.now() - start };
  }

  // ETFs have no income statements — skip gracefully
  if (entry.assetType === "etf") {
    await db.ingestionLog.create({
      data: { ticker: t, source: "fmp", status: "skipped",
        fieldsUpdated: "[]", fieldsMissing: "[]", apiCallCount: 0 },
    });
    return { ticker: t, status: "skipped", fieldsUpdated: [], fieldsMissing: [], apiCallCount: 0, durationMs: Date.now() - start };
  }

  try {
    const data = await fetchFundamentals(t, apiKey);
    const durationMs = Date.now() - start;

    const status: IngestionResult["status"] =
      data.fieldsFound.length === 0 ? "failed" :
      data.fieldsMissing.length > 0 ? "partial" : "success";

    if (data.fieldsFound.length > 0) {
      // Upsert fundamentals — only overwrite fields we received data for
      await db.fundamental.upsert({
        where: { universeId: entry.id },
        create: {
          universeId: entry.id,
          revenueGrowth:     data.revenueGrowth,
          epsGrowth:         data.epsGrowth,
          grossMargin:       data.grossMargin,
          operatingMargin:   data.operatingMargin,
          freeCashFlow:      data.freeCashFlow,
          debtToEquity:      data.debtToEquity,
          roic:              data.roic,
          sharesOutstanding: data.sharesOutstanding,
        },
        update: {
          ...(data.revenueGrowth     != null && { revenueGrowth:     data.revenueGrowth }),
          ...(data.epsGrowth         != null && { epsGrowth:         data.epsGrowth }),
          ...(data.grossMargin       != null && { grossMargin:       data.grossMargin }),
          ...(data.operatingMargin   != null && { operatingMargin:   data.operatingMargin }),
          ...(data.freeCashFlow      != null && { freeCashFlow:      data.freeCashFlow }),
          ...(data.debtToEquity      != null && { debtToEquity:      data.debtToEquity }),
          ...(data.roic              != null && { roic:              data.roic }),
          ...(data.sharesOutstanding != null && { sharesOutstanding: data.sharesOutstanding }),
        },
      });

      // Recompute and append a new score record
      const fund = await db.fundamental.findUnique({ where: { universeId: entry.id } });
      const scores = computeScores(fund);
      await db.universeScore.create({
        data: {
          universeId:        entry.id,
          businessQuality:   scores.businessQuality,
          growth:            scores.growth,
          financialStrength: scores.financialStrength,
          capitalAllocation: scores.capitalAllocation,
          valuation:         scores.valuation,
          totalScore:        scores.totalScore,
        },
      });
    }

    await db.ingestionLog.create({
      data: {
        ticker: t, source: "fmp", status,
        fieldsUpdated: JSON.stringify(data.fieldsFound),
        fieldsMissing: JSON.stringify(data.fieldsMissing),
        apiCallCount: data.apiCallCount, durationMs,
      },
    });

    return { ticker: t, status, fieldsUpdated: data.fieldsFound, fieldsMissing: data.fieldsMissing,
      apiCallCount: data.apiCallCount, durationMs };

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - start;

    await db.ingestionLog.create({
      data: { ticker: t, source: "fmp", status: "failed",
        fieldsUpdated: "[]", fieldsMissing: "[]", errorMessage, apiCallCount: 0, durationMs },
    });

    return { ticker: t, status: "failed", fieldsUpdated: [], fieldsMissing: [],
      errorMessage, apiCallCount: 0, durationMs };
  }
}

// ─── Full universe refresh ────────────────────────────────────────────────────

export async function ingestUniverse(
  apiKey: string,
  onProgress?: (r: IngestionResult, done: number, total: number) => void,
): Promise<UniverseIngestionSummary> {
  const universalStart = Date.now();

  const entries = await db.universe.findMany({
    where: { status: "active" },
    orderBy: { ticker: "asc" },
  });

  const results: IngestionResult[] = [];

  for (let i = 0; i < entries.length; i++) {
    const result = await ingestTicker(entries[i].ticker, apiKey);
    results.push(result);
    onProgress?.(result, i + 1, entries.length);

    // Polite delay between equity calls to stay within FMP rate limits
    if (i < entries.length - 1 && result.status !== "skipped") {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return {
    results,
    totalMs: Date.now() - universalStart,
    successCount: results.filter(r => r.status === "success").length,
    partialCount:  results.filter(r => r.status === "partial").length,
    failedCount:   results.filter(r => r.status === "failed").length,
    skippedCount:  results.filter(r => r.status === "skipped").length,
  };
}

// ─── Coverage report ─────────────────────────────────────────────────────────

export interface CoverageReport {
  universeSize: number;
  equityCount: number;
  withFundamentals: number;
  withScores: number;
  fieldCoverage: Record<string, { count: number; pct: number }>;
  tickerStatus: Array<{
    ticker: string;
    companyName: string;
    assetType: string;
    universeTier: string;
    hasFundamentals: boolean;
    hasScore: boolean;
    fieldsPresent: string[];
    fieldsMissing: string[];
    lastIngested: string | null;
    lastStatus: string | null;
    lastSource: string | null;
  }>;
  recentLogs: Array<{
    id: string;
    ticker: string;
    source: string;
    status: string;
    fieldsUpdated: string[];
    fieldsMissing: string[];
    errorMessage: string | null;
    apiCallCount: number;
    durationMs: number | null;
    createdAt: string;
  }>;
}

const FUNDAMENTAL_FIELDS = [
  "revenueGrowth","epsGrowth","grossMargin","operatingMargin",
  "freeCashFlow","debtToEquity","roic","sharesOutstanding",
];

export async function buildCoverageReport(): Promise<CoverageReport> {
  const [entries, recentLogs] = await Promise.all([
    db.universe.findMany({
      where: { status: "active" },
      include: {
        fundamentals: true,
        scores: { orderBy: { scoredAt: "desc" }, take: 1 },
      },
      orderBy: { ticker: "asc" },
    }),
    db.ingestionLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  // Latest log per ticker (for status display)
  const latestByTicker = new Map<string, typeof recentLogs[0]>();
  for (const log of recentLogs) {
    if (!latestByTicker.has(log.ticker)) latestByTicker.set(log.ticker, log);
  }

  const equityEntries = entries.filter(e => e.assetType !== "etf");

  // Field coverage across equities
  const fieldCoverage: Record<string, { count: number; pct: number }> = {};
  for (const field of FUNDAMENTAL_FIELDS) {
    const count = equityEntries.filter(e => e.fundamentals != null && (e.fundamentals as Record<string, unknown>)[field] != null).length;
    fieldCoverage[field] = {
      count,
      pct: equityEntries.length > 0 ? Math.round((count / equityEntries.length) * 100) : 0,
    };
  }

  // Per-ticker status
  const tickerStatus = entries.map(e => {
    const fund = e.fundamentals;
    const fieldsPresent = fund ? FUNDAMENTAL_FIELDS.filter(f => (fund as Record<string, unknown>)[f] != null) : [];
    const fieldsMissing = FUNDAMENTAL_FIELDS.filter(f => !fieldsPresent.includes(f));
    const log = latestByTicker.get(e.ticker) ?? null;

    return {
      ticker: e.ticker,
      companyName: e.companyName,
      assetType: e.assetType,
      universeTier: e.universeTier,
      hasFundamentals: fund != null,
      hasScore: e.scores.length > 0,
      fieldsPresent,
      fieldsMissing: e.assetType === "etf" ? [] : fieldsMissing,
      lastIngested: log?.createdAt.toISOString() ?? null,
      lastStatus: log?.status ?? null,
      lastSource: log?.source ?? null,
    };
  });

  return {
    universeSize: entries.length,
    equityCount: equityEntries.length,
    withFundamentals: equityEntries.filter(e => e.fundamentals != null).length,
    withScores: equityEntries.filter(e => e.scores.length > 0).length,
    fieldCoverage,
    tickerStatus,
    recentLogs: recentLogs.map(l => ({
      id: l.id,
      ticker: l.ticker,
      source: l.source,
      status: l.status,
      fieldsUpdated: JSON.parse(l.fieldsUpdated) as string[],
      fieldsMissing: JSON.parse(l.fieldsMissing) as string[],
      errorMessage: l.errorMessage ?? null,
      apiCallCount: l.apiCallCount,
      durationMs: l.durationMs ?? null,
      createdAt: l.createdAt.toISOString(),
    })),
  };
}
