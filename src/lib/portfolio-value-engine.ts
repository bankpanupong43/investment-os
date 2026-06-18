// Portfolio Value Engine — Phase 26
//
// Single source of truth for portfolio market value.
// Reads PortfolioHolding + CashAccount → fetches live prices (Yahoo Finance)
// via MarketSnapshot cache → computes market values, allocation %, gain/loss.
//
// Base currency: THB. All USD values converted at live USDTHB rate.

import { db } from "./db";
import { fetchEquityPrices, fetchUSDTHB } from "./market-data-client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HoldingLine {
  ticker: string;
  shares: number;
  costBasis: number | null;    // per share, in position currency
  currency: string;
  price: number | null;        // live price in USD
  marketValueUsd: number | null;
  marketValueThb: number | null;
  allocationPct: number | null;
  gainLossUsd: number | null;
  gainLossPct: number | null;
  notes: string | null;
}

export interface CashLine {
  id: string;
  accountName: string;
  currency: string;
  balance: number;
  balanceThb: number;
  allocationPct: number | null;
  notes: string | null;
}

export interface PortfolioSnapshot {
  generatedAt: Date;
  usdthb: number;
  priceDate: string;           // YYYY-MM-DD of price data
  holdings: HoldingLine[];
  cashAccounts: CashLine[];
  totalEquityUsd: number;
  totalEquityThb: number;
  totalCashThb: number;
  totalValueThb: number;
  totalValueUsd: number;
  largestPosition: { ticker: string; allocationPct: number } | null;
  totalUsdExposure: number;    // USD cash + USD equity, in USD
  totalThbCash: number;        // THB cash only
}

// ─── Price cache via MarketSnapshot ──────────────────────────────────────────

const METRIC_PREFIX = "PRICE:";
const FX_METRIC     = "USDTHB";

async function getTodayPrices(
  tickers: string[],
): Promise<{ prices: Map<string, number>; usdthb: number | null }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const metrics = [...tickers.map(t => `${METRIC_PREFIX}${t}`), FX_METRIC];

  const cached = await db.marketSnapshot.findMany({
    where: { date: today, metric: { in: metrics } },
  });

  const priceMap = new Map<string, number>();
  let usdthb: number | null = null;

  for (const row of cached) {
    if (row.metric === FX_METRIC) usdthb = row.value;
    else priceMap.set(row.metric.replace(METRIC_PREFIX, ""), row.value);
  }

  // Determine what still needs to be fetched
  const missingTickers = tickers.filter(t => !priceMap.has(t));
  const missingFx      = usdthb === null;

  const [fetchedPrices, fetchedFx] = await Promise.all([
    missingTickers.length > 0 ? fetchEquityPrices(missingTickers) : Promise.resolve(new Map<string, number>()),
    missingFx ? fetchUSDTHB() : Promise.resolve(null),
  ]);

  // Merge fetched into maps
  for (const [t, p] of fetchedPrices) priceMap.set(t, p);
  if (fetchedFx != null) usdthb = fetchedFx;

  // Persist new data to MarketSnapshot cache
  const upserts: Promise<unknown>[] = [];
  for (const [t, p] of fetchedPrices) {
    upserts.push(
      db.marketSnapshot.upsert({
        where: { date_metric: { date: today, metric: `${METRIC_PREFIX}${t}` } },
        update: { value: p },
        create: { date: today, metric: `${METRIC_PREFIX}${t}`, value: p, source: "Yahoo Finance" },
      }).catch(() => null),
    );
  }
  if (fetchedFx != null) {
    upserts.push(
      db.marketSnapshot.upsert({
        where: { date_metric: { date: today, metric: FX_METRIC } },
        update: { value: fetchedFx },
        create: { date: today, metric: FX_METRIC, value: fetchedFx, source: "Yahoo Finance" },
      }).catch(() => null),
    );
  }
  await Promise.allSettled(upserts);

  return { prices: priceMap, usdthb };
}

// ─── Main engine ──────────────────────────────────────────────────────────────

const DEFAULT_CASH_ACCOUNTS = [
  { accountName: "Dime Save", currency: "THB" },
  { accountName: "Dime USD",  currency: "USD" },
  { accountName: "FCD-USD",   currency: "USD" },
];

export async function computePortfolioValue(): Promise<PortfolioSnapshot> {
  const [holdingsRaw, cashAccountsRaw] = await Promise.all([
    db.portfolioHolding.findMany({ orderBy: { ticker: "asc" } }),
    db.cashAccount.findMany({ orderBy: { accountName: "asc" } }),
  ]);

  // Seed default cash accounts if none exist
  let cashAccounts = cashAccountsRaw;
  if (cashAccounts.length === 0) {
    await Promise.all(
      DEFAULT_CASH_ACCOUNTS.map(c =>
        db.cashAccount.upsert({
          where: { accountName: c.accountName },
          update: {},
          create: { ...c, balance: 0, updatedAt: new Date() },
        }),
      ),
    );
    cashAccounts = await db.cashAccount.findMany({ orderBy: { accountName: "asc" } });
  }

  // Fetch prices (with cache)
  const tickers = holdingsRaw.map(h => h.ticker);
  const { prices, usdthb: rawRate } = await getTodayPrices(tickers);
  const usdthb = rawRate ?? 33.0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Build holding lines
  const holdings: HoldingLine[] = holdingsRaw.map(h => {
    const price          = prices.get(h.ticker) ?? null;
    const marketValueUsd = price != null ? Math.round(h.shares * price * 100) / 100 : null;
    const marketValueThb = marketValueUsd != null ? Math.round(marketValueUsd * usdthb * 100) / 100 : null;
    const gainLossUsd    = price != null && h.costBasis != null
      ? Math.round(h.shares * (price - h.costBasis) * 100) / 100 : null;
    const gainLossPct    = price != null && h.costBasis != null && h.costBasis > 0
      ? Math.round(((price - h.costBasis) / h.costBasis) * 10000) / 100 : null;
    return {
      ticker: h.ticker,
      shares: h.shares,
      costBasis: h.costBasis ?? null,
      currency: h.currency,
      price,
      marketValueUsd,
      marketValueThb,
      allocationPct: null,
      gainLossUsd,
      gainLossPct,
      notes: h.notes ?? null,
    };
  });

  // Build cash lines
  const cashLines: CashLine[] = cashAccounts.map(c => ({
    id: c.id,
    accountName: c.accountName,
    currency: c.currency,
    balance: c.balance,
    balanceThb: c.currency === "THB" ? c.balance : Math.round(c.balance * usdthb * 100) / 100,
    allocationPct: null,
    notes: c.notes ?? null,
  }));

  // Totals
  const totalEquityUsd = holdings.reduce((s, h) => s + (h.marketValueUsd ?? 0), 0);
  const totalEquityThb = holdings.reduce((s, h) => s + (h.marketValueThb ?? 0), 0);
  const totalCashThb   = cashLines.reduce((s, c) => s + c.balanceThb, 0);
  const totalValueThb  = totalEquityThb + totalCashThb;
  const totalValueUsd  = totalValueThb > 0 ? Math.round((totalValueThb / usdthb) * 100) / 100 : 0;

  // Allocation %
  if (totalValueThb > 0) {
    for (const h of holdings) {
      h.allocationPct = h.marketValueThb != null
        ? Math.round((h.marketValueThb / totalValueThb) * 10000) / 100 : null;
    }
    for (const c of cashLines) {
      c.allocationPct = Math.round((c.balanceThb / totalValueThb) * 10000) / 100;
    }
  }

  // Derived metrics
  const sorted = [...holdings].filter(h => h.allocationPct != null).sort((a, b) => (b.allocationPct ?? 0) - (a.allocationPct ?? 0));
  const largestPosition = sorted[0]
    ? { ticker: sorted[0].ticker, allocationPct: sorted[0].allocationPct! }
    : null;

  const totalUsdExposure =
    totalEquityUsd +
    cashLines.filter(c => c.currency === "USD").reduce((s, c) => s + c.balance, 0);

  const totalThbCash = cashLines
    .filter(c => c.currency === "THB")
    .reduce((s, c) => s + c.balance, 0);

  return {
    generatedAt: new Date(),
    usdthb,
    priceDate: today.toISOString().split("T")[0],
    holdings,
    cashAccounts: cashLines,
    totalEquityUsd,
    totalEquityThb,
    totalCashThb,
    totalValueThb,
    totalValueUsd,
    largestPosition,
    totalUsdExposure,
    totalThbCash,
  };
}

// ─── Active Position Entries (live allocation) ────────────────────────────────

export interface ActivePositionEntry {
  ticker: string;
  name: string;
  sector: string | null;
  assetClass: string | null;
  allocationPct: number;    // LIVE: from PortfolioHolding + prices
  marketValueUsd: number;
  shares: number;
}

export async function getActivePortfolioPositions(): Promise<ActivePositionEntry[]> {
  const [snapshot, positionsRaw] = await Promise.all([
    computePortfolioValue(),
    db.position.findMany({
      where: { status: "active" },
      select: { ticker: true, name: true, sector: true, assetClass: true },
    }),
  ]);

  const metaMap = new Map(positionsRaw.map(p => [p.ticker, p]));

  return snapshot.holdings
    .filter(h => (h.allocationPct ?? 0) > 0)
    .map(h => {
      const meta = metaMap.get(h.ticker);
      return {
        ticker: h.ticker,
        name: meta?.name ?? h.ticker,
        sector: meta?.sector ?? null,
        assetClass: meta?.assetClass ?? null,
        allocationPct: h.allocationPct ?? 0,
        marketValueUsd: h.marketValueUsd ?? 0,
        shares: h.shares,
      };
    });
}
