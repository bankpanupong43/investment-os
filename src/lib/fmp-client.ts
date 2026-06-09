// Financial Modeling Prep API client — stable API strategy.
//
// FMP reorganised endpoints under /stable/ (v3 is now behind paywall).
// Stable API uses query params instead of path params: ?symbol=AAPL&apikey=...
//
// 3 calls per equity ticker:
//   1. /stable/ratios-ttm         → grossMargin, operatingMargin, D/E
//   2. /stable/key-metrics-ttm    → ROIC, absolute FCF (freeCashFlowToFirmTTM)
//   3. /stable/income-statement   → revenue growth, EPS growth, sharesOutstanding
//
// ETFs have no financial statements — callers should skip before calling fetchFundamentals.

const STABLE = "https://financialmodelingprep.com/stable";

const ALL_FIELDS = [
  "revenueGrowth", "epsGrowth", "grossMargin", "operatingMargin",
  "freeCashFlow", "debtToEquity", "roic", "sharesOutstanding",
] as const;

export type FundamentalField = typeof ALL_FIELDS[number];

export interface FMPFundamentals {
  revenueGrowth:     number | null;
  epsGrowth:         number | null;
  grossMargin:       number | null;  // %
  operatingMargin:   number | null;  // %
  freeCashFlow:      number | null;  // USD millions (FCFF)
  debtToEquity:      number | null;
  roic:              number | null;  // %
  sharesOutstanding: number | null;  // millions (diluted)
  fieldsFound:       FundamentalField[];
  fieldsMissing:     FundamentalField[];
  // Fields processed but explicitly set to null (e.g. non-USD FCF) — ingestion
  // should write null to DB rather than preserving the existing value.
  fieldsExplicitNull: FundamentalField[];
  apiCallCount:      number;
  // True when one or more endpoints returned 402 (paid-plan required).
  // Callers should continue with partial data rather than failing.
  premiumDataUnavailable: boolean;
}

// ─── FMP stable response shapes ───────────────────────────────────────────────

interface FMPRatiosTTM {
  grossProfitMarginTTM:     number | null;
  operatingProfitMarginTTM: number | null;
  debtToEquityRatioTTM:     number | null;
}

interface FMPKeyMetricsTTM {
  returnOnInvestedCapitalTTM: number | null;  // decimal ratio (0.55 = 55%)
  freeCashFlowToFirmTTM:      number | null;  // absolute USD (not millions)
}

interface FMPIncomeStatement {
  reportedCurrency:           string | null;
  revenue:                    number | null;
  epsDiluted:                 number | null;
  weightedAverageShsOutDil:   number | null;
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function stableGet<T>(path: string, symbol: string, apiKey: string, extra = ""): Promise<T[]> {
  const url = `${STABLE}/${path}?symbol=${encodeURIComponent(symbol)}${extra}&apikey=${apiKey}`;
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) throw new Error(`FMP ${path} HTTP ${res.status} for ${symbol}`);

  const body: unknown = await res.json();

  // Wrap single objects in an array (some endpoints return object not array)
  if (body && typeof body === "object" && !Array.isArray(body)) {
    if ("Error Message" in body) throw new Error(`FMP: ${(body as Record<string, string>)["Error Message"]}`);
    return [body as T];
  }

  return Array.isArray(body) ? (body as T[]) : [];
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function fetchFundamentals(ticker: string, apiKey: string): Promise<FMPFundamentals> {
  const result: FMPFundamentals = {
    revenueGrowth: null, epsGrowth: null, grossMargin: null, operatingMargin: null,
    freeCashFlow: null, debtToEquity: null, roic: null, sharesOutstanding: null,
    fieldsFound: [], fieldsMissing: [], fieldsExplicitNull: [], apiCallCount: 0,
    premiumDataUnavailable: false,
  };

  const found = new Set<FundamentalField>();
  const explicitNulls = new Set<FundamentalField>();
  let premiumBlocked = false;

  function is402(err: unknown): boolean {
    return err instanceof Error && err.message.includes("HTTP 402");
  }

  // ── Call 1: Ratios TTM — margins + D/E ───────────────────────────────────
  let ratiosArr: FMPRatiosTTM[] = [];
  try {
    ratiosArr = await stableGet<FMPRatiosTTM>("ratios-ttm", ticker, apiKey);
  } catch (err) {
    if (is402(err)) premiumBlocked = true;
  }
  result.apiCallCount++;
  const ratios = ratiosArr[0] ?? null;

  if (ratios) {
    if (ratios.grossProfitMarginTTM != null) {
      result.grossMargin = r2(ratios.grossProfitMarginTTM * 100);
      found.add("grossMargin");
    }
    if (ratios.operatingProfitMarginTTM != null) {
      result.operatingMargin = r2(ratios.operatingProfitMarginTTM * 100);
      found.add("operatingMargin");
    }
    if (ratios.debtToEquityRatioTTM != null) {
      result.debtToEquity = r2(Math.abs(ratios.debtToEquityRatioTTM));
      found.add("debtToEquity");
    }
  }

  // ── Call 2: Key Metrics TTM — ROIC + absolute FCF ────────────────────────
  let kmArr: FMPKeyMetricsTTM[] = [];
  try {
    kmArr = await stableGet<FMPKeyMetricsTTM>("key-metrics-ttm", ticker, apiKey);
  } catch (err) {
    if (is402(err)) premiumBlocked = true;
  }
  result.apiCallCount++;
  const km = kmArr[0] ?? null;

  if (km) {
    if (km.returnOnInvestedCapitalTTM != null) {
      // FMP stable ROIC is a decimal ratio (0.496 = 49.6%)
      const rv = km.returnOnInvestedCapitalTTM;
      result.roic = r2(Math.abs(rv) < 10 ? rv * 100 : rv);
      found.add("roic");
    }
    if (km.freeCashFlowToFirmTTM != null) {
      // freeCashFlowToFirmTTM is absolute USD — convert to millions
      result.freeCashFlow = r2(km.freeCashFlowToFirmTTM / 1_000_000);
      found.add("freeCashFlow");
    }
  }

  // ── Call 3: Income Statement (2 years) — growth + shares outstanding ─────
  let incomeArr: FMPIncomeStatement[] = [];
  try {
    incomeArr = await stableGet<FMPIncomeStatement>("income-statement", ticker, apiKey, "&limit=2");
  } catch (err) {
    if (is402(err)) premiumBlocked = true;
  }
  result.apiCallCount++;

  if (incomeArr.length >= 1) {
    const curr = incomeArr[0];

    // Non-USD reporters (TSM→TWD, BABA→CNY, etc.) have FCF in local currency — unusable
    if (curr.reportedCurrency && curr.reportedCurrency !== "USD") {
      result.freeCashFlow = null;
      found.delete("freeCashFlow");
      explicitNulls.add("freeCashFlow");
    }

    if (curr.weightedAverageShsOutDil != null && curr.weightedAverageShsOutDil > 0) {
      result.sharesOutstanding = r2(curr.weightedAverageShsOutDil / 1_000_000);
      found.add("sharesOutstanding");
    }

    if (incomeArr.length >= 2) {
      const prior = incomeArr[1];

      if (curr.revenue != null && prior.revenue != null && prior.revenue !== 0) {
        result.revenueGrowth = r2((curr.revenue - prior.revenue) / Math.abs(prior.revenue) * 100);
        found.add("revenueGrowth");
      }
      if (curr.epsDiluted != null && prior.epsDiluted != null && prior.epsDiluted !== 0) {
        result.epsGrowth = r2((curr.epsDiluted - prior.epsDiluted) / Math.abs(prior.epsDiluted) * 100);
        found.add("epsGrowth");
      }
    }
  }

  result.fieldsFound = [...found] as FundamentalField[];
  result.fieldsMissing = ALL_FIELDS.filter(f => !found.has(f) && !explicitNulls.has(f)) as FundamentalField[];
  result.fieldsExplicitNull = [...explicitNulls] as FundamentalField[];
  result.premiumDataUnavailable = premiumBlocked;

  return result;
}

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

export { ALL_FIELDS };

// ─── Company Profile ──────────────────────────────────────────────────────────

export interface FMPProfile {
  symbol:              string;
  companyName:         string;
  sector:              string | null;
  industry:            string | null;
  description:         string | null;
  ceo:                 string | null;
  fullTimeEmployees:   string | null;
  website:             string | null;
  mktCap:              number | null;
  beta:                number | null;
  country:             string | null;
}

export async function fetchCompanyProfile(ticker: string, apiKey: string): Promise<FMPProfile | null> {
  try {
    const arr = await stableGet<FMPProfile>("profile", ticker, apiKey);
    const p = arr[0] ?? null;
    if (!p || !p.symbol) return null;
    return p;
  } catch {
    return null;
  }
}

// ─── Ticker search ────────────────────────────────────────────────────────────

export interface FMPSearchResult {
  symbol: string;
  name: string;
  currency: string | null;
  stockExchange: string | null;
  exchangeShortName: string | null;
}

interface FMPSearchSymbolRaw {
  symbol: string;
  name: string;
  currency: string | null;
  exchangeFullName: string | null;
  exchange: string | null;
}

export async function searchTickers(query: string, apiKey: string, limit = 10): Promise<FMPSearchResult[]> {
  try {
    const url = `${STABLE}/search-symbol?query=${encodeURIComponent(query)}&limit=${limit}&apikey=${apiKey}`;
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const body: unknown = await res.json();
    if (!Array.isArray(body)) return [];
    return (body as FMPSearchSymbolRaw[]).map(r => ({
      symbol: r.symbol,
      name: r.name,
      currency: r.currency ?? null,
      stockExchange: r.exchangeFullName ?? null,
      exchangeShortName: r.exchange ?? null,
    }));
  } catch {
    return [];
  }
}
