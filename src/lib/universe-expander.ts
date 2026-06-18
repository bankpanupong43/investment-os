// Universe Expander — Phase 30A
//
// Expands the investment universe from the manually curated 38-ticker seed
// to a screened set of ~300–500 high-quality US equities using FMP's stock
// screener API.
//
// Two-phase design (respects FMP free-tier 250 calls/day):
//
//   Phase 1 — expandUniverse():
//     1 API call → screener → upsert metadata for ~300 candidates into
//     Universe table as universeTier="candidate". Zero fundamentals yet.
//     Candidates appear in all downstream engines immediately (with neutral
//     scores until fundamentals are ingested).
//
//   Phase 2 — ingestCandidateBatch():
//     Picks up to `batchSize` candidates that have no Fundamental record yet.
//     Calls fetchFundamentals() + recomputes UniverseScore for each.
//     Budget: batchSize=40 → 120 FMP calls (fits within 250/day alongside
//     the existing 38-ticker nightly refresh which costs ~114 calls).
//     Run daily until all candidates have fundamentals (~7–8 days for 300).
//
// Screener filters (applied at FMP + client side):
//   - Market cap ≥ $1B (quality signal, avoids micro-caps)
//   - US only (NYSE + NASDAQ)
//   - Excludes: Real Estate, Utilities (low-growth sectors)
//   - Excludes: tickers already in Universe

import { db } from "./db";
import { fetchScreener } from "./fmp-client";
import { ingestTicker } from "./ingestion";
import type { IngestionResult } from "./ingestion";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExpansionResult {
  added:     number;   // new tickers upserted
  skipped:   number;   // already in universe
  screened:  number;   // total from FMP screener
  tickers:   string[]; // newly added ticker symbols
  apiCallCount: number;
}

export interface CandidateIngestResult {
  processed: number;
  results:   IngestionResult[];
  remaining: number;  // candidates still without fundamentals
  apiCallCount: number;
}

// ─── Screener config ──────────────────────────────────────────────────────────

const SCREENER_BASE = {
  marketCapMoreThan: 1_000_000_000,
  country:           "US",
  limit:             500,
  isEtf:             false,
  isFund:            false,
  excludeSectors:    ["Real Estate", "Utilities"],
} as const;

// ─── Phase 1: Expand universe metadata ───────────────────────────────────────

export async function expandUniverse(apiKey: string): Promise<ExpansionResult> {
  // FMP does not support comma-separated exchange values — call each separately
  const [nyse, nasdaq] = await Promise.all([
    fetchScreener(apiKey, { ...SCREENER_BASE, exchange: "NYSE" }),
    fetchScreener(apiKey, { ...SCREENER_BASE, exchange: "NASDAQ" }),
  ]);

  const seen = new Set<string>();
  const raw = [...nyse, ...nasdaq].filter(r => {
    if (!r.symbol || seen.has(r.symbol)) return false;
    seen.add(r.symbol);
    return true;
  });

  if (raw.length === 0) {
    return { added: 0, skipped: 0, screened: 0, tickers: [], apiCallCount: 2 };
  }

  // Load existing universe tickers for deduplication
  const existing = await db.universe.findMany({ select: { ticker: true } });
  const existingSet = new Set(existing.map(e => e.ticker.toUpperCase()));

  const toAdd = raw.filter(r =>
    r.symbol &&
    r.companyName &&
    !existingSet.has(r.symbol.toUpperCase()) &&
    // Exclude non-equity instruments (funds, ETFs from screener)
    !r.symbol.includes("/") &&
    r.symbol.length <= 5
  );

  const addedTickers: string[] = [];

  for (const candidate of toAdd) {
    const ticker = candidate.symbol.toUpperCase();
    try {
      await db.universe.upsert({
        where: { ticker },
        create: {
          ticker,
          companyName:  candidate.companyName,
          exchange:     candidate.exchange ?? null,
          sector:       candidate.sector ?? null,
          industry:     candidate.industry ?? null,
          marketCap:    candidate.marketCap ? candidate.marketCap / 1_000_000 : null, // convert to millions
          universeTier: "candidate",
          country:      candidate.country ?? "US",
          assetType:    "equity",
          status:       "active",
        },
        update: {
          // Only update metadata fields, preserve manual overrides
          companyName:  candidate.companyName,
          exchange:     candidate.exchange ?? null,
          sector:       candidate.sector ?? null,
          industry:     candidate.industry ?? null,
          marketCap:    candidate.marketCap ? candidate.marketCap / 1_000_000 : null,
        },
      });
      addedTickers.push(ticker);
    } catch {
      // Skip individual failures silently
    }
  }

  return {
    added:    addedTickers.length,
    skipped:  raw.length - toAdd.length,
    screened: raw.length,
    tickers:  addedTickers,
    apiCallCount: 2,
  };
}

// ─── Phase 2: Ingest fundamentals for candidates ──────────────────────────────

export async function ingestCandidateBatch(
  apiKey: string,
  batchSize = 40,
): Promise<CandidateIngestResult> {
  // Find candidates without any fundamental record yet
  const candidates = await db.universe.findMany({
    where: {
      universeTier: "candidate",
      status:       "active",
      assetType:    "equity",
      fundamentals: null,  // no Fundamental record yet
    },
    orderBy: [
      { marketCap: "desc" },  // largest first — most likely to be relevant
    ],
    take: batchSize,
  });

  const remaining = await db.universe.count({
    where: {
      universeTier: "candidate",
      status:       "active",
      assetType:    "equity",
      fundamentals: null,
    },
  });

  if (candidates.length === 0) {
    return { processed: 0, results: [], remaining: 0, apiCallCount: 0 };
  }

  const results: IngestionResult[] = [];
  let apiCallCount = 0;

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const result = await ingestTicker(candidate.ticker, apiKey);
    results.push(result);
    apiCallCount += result.apiCallCount;

    // Mark failed candidates inactive so they're skipped in future runs
    if (result.status === "failed") {
      await db.universe.update({
        where: { ticker: candidate.ticker },
        data: { status: "inactive" },
      });
    }

    // Polite delay between equity calls
    if (i < candidates.length - 1) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  const stillRemaining = await db.universe.count({
    where: {
      universeTier: "candidate",
      status:       "active",
      assetType:    "equity",
      fundamentals: null,
    },
  });

  return {
    processed:   candidates.length,
    results,
    remaining:   stillRemaining,
    apiCallCount,
  };
}

// ─── Universe stats ───────────────────────────────────────────────────────────

export interface UniverseStats {
  total:          number;
  curated:        number;  // tier1–tier5
  candidates:     number;  // universeTier="candidate"
  withFundamentals: number;
  withoutFundamentals: number;
  byTier:         Record<string, number>;
  bySector:       Record<string, number>;
}

export async function getUniverseStats(): Promise<UniverseStats> {
  const all = await db.universe.findMany({
    where: { status: "active" },
    include: { fundamentals: { select: { id: true } } },
  });

  const byTier: Record<string, number> = {};
  const bySector: Record<string, number> = {};

  for (const u of all) {
    byTier[u.universeTier] = (byTier[u.universeTier] ?? 0) + 1;
    const s = u.sector ?? "Unknown";
    bySector[s] = (bySector[s] ?? 0) + 1;
  }

  const withFundamentals = all.filter(u => u.fundamentals !== null).length;

  return {
    total:    all.length,
    curated:  all.filter(u => u.universeTier !== "candidate").length,
    candidates: all.filter(u => u.universeTier === "candidate").length,
    withFundamentals,
    withoutFundamentals: all.length - withFundamentals,
    byTier,
    bySector,
  };
}
