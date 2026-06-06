// Financial Modeling Prep API client.
// Pure fetch functions — no DB writes. Call from ingestion.ts.
// Free tier: 250 requests/day. 3 calls per equity ticker.

const BASE = "https://financialmodelingprep.com/api/v3";

const ALL_FIELDS = [
  "revenueGrowth", "epsGrowth", "grossMargin", "operatingMargin",
  "freeCashFlow", "debtToEquity", "roic", "sharesOutstanding",
] as const;

export type FundamentalField = typeof ALL_FIELDS[number];

export interface FMPFundamentals {
  revenueGrowth:     number | null;
  epsGrowth:         number | null;
  grossMargin:       number | null;
  operatingMargin:   number | null;
  freeCashFlow:      number | null;  // USD millions
  debtToEquity:      number | null;
  roic:              number | null;  // %
  sharesOutstanding: number | null;  // millions
  fieldsFound:       FundamentalField[];
  fieldsMissing:     FundamentalField[];
  apiCallCount:      number;
}

// ─── FMP response shapes (partial — only fields we use) ───────────────────────

interface FMPIncomeStatement {
  date: string;
  symbol: string;
  revenue: number | null;
  grossProfit: number | null;
  grossProfitRatio: number | null;
  operatingIncome: number | null;
  operatingIncomeRatio: number | null;
  epsdiluted: number | null;
  weightedAverageShsOutDil: number | null;
}

interface FMPCashFlow {
  freeCashFlow: number | null;
}

interface FMPKeyMetrics {
  debtToEquity: number | null;
  roic: number | null;             // FMP returns this as a decimal ratio (0.55 = 55%)
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function fmpGet<T>(path: string, apiKey: string): Promise<T[]> {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${BASE}${path}${sep}apikey=${apiKey}`;
  const res = await fetch(url, { cache: "no-store" });

  if (res.status === 429) throw new Error("FMP rate limit exceeded (429)");
  if (!res.ok) throw new Error(`FMP HTTP ${res.status} for ${path}`);

  const data: unknown = await res.json();

  // FMP returns {"Error Message": "..."} for bad API keys
  if (data && typeof data === "object" && !Array.isArray(data) && "Error Message" in data) {
    throw new Error(`FMP error: ${(data as Record<string, string>)["Error Message"]}`);
  }

  return Array.isArray(data) ? (data as T[]) : [];
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function fetchFundamentals(ticker: string, apiKey: string): Promise<FMPFundamentals> {
  const result: FMPFundamentals = {
    revenueGrowth: null, epsGrowth: null, grossMargin: null,
    operatingMargin: null, freeCashFlow: null, debtToEquity: null,
    roic: null, sharesOutstanding: null,
    fieldsFound: [], fieldsMissing: [], apiCallCount: 0,
  };

  const found = new Set<FundamentalField>();

  // ── Call 1: Income statement — 2 years for growth + margins ──────────────
  const income = await fmpGet<FMPIncomeStatement>(
    `/income-statement/${ticker}?period=annual&limit=2`,
    apiKey,
  );
  result.apiCallCount++;

  if (income.length >= 1) {
    const curr = income[0];

    if (curr.grossProfitRatio != null) {
      result.grossMargin = r2(curr.grossProfitRatio * 100);
      found.add("grossMargin");
    }
    if (curr.operatingIncomeRatio != null) {
      result.operatingMargin = r2(curr.operatingIncomeRatio * 100);
      found.add("operatingMargin");
    }
    if (curr.weightedAverageShsOutDil != null && curr.weightedAverageShsOutDil > 0) {
      result.sharesOutstanding = r2(curr.weightedAverageShsOutDil / 1_000_000);
      found.add("sharesOutstanding");
    }

    if (income.length >= 2) {
      const prior = income[1];

      if (curr.revenue != null && prior.revenue != null && prior.revenue !== 0) {
        result.revenueGrowth = r2((curr.revenue - prior.revenue) / Math.abs(prior.revenue) * 100);
        found.add("revenueGrowth");
      }
      if (curr.epsdiluted != null && prior.epsdiluted != null && prior.epsdiluted !== 0) {
        result.epsGrowth = r2((curr.epsdiluted - prior.epsdiluted) / Math.abs(prior.epsdiluted) * 100);
        found.add("epsGrowth");
      }
    }
  }

  // ── Call 2: Cash flow — freeCashFlow in absolute USD ──────────────────────
  const cashFlow = await fmpGet<FMPCashFlow>(
    `/cash-flow-statement/${ticker}?period=annual&limit=1`,
    apiKey,
  );
  result.apiCallCount++;

  if (cashFlow.length >= 1 && cashFlow[0].freeCashFlow != null) {
    result.freeCashFlow = r2(cashFlow[0].freeCashFlow / 1_000_000);
    found.add("freeCashFlow");
  }

  // ── Call 3: Key metrics — ROIC, D/E ───────────────────────────────────────
  const keyMetrics = await fmpGet<FMPKeyMetrics>(
    `/key-metrics/${ticker}?period=annual&limit=1`,
    apiKey,
  );
  result.apiCallCount++;

  if (keyMetrics.length >= 1) {
    const km = keyMetrics[0];
    if (km.debtToEquity != null) {
      result.debtToEquity = r2(Math.abs(km.debtToEquity));
      found.add("debtToEquity");
    }
    if (km.roic != null) {
      // FMP key-metrics roic is a decimal ratio (0.55 = 55%)
      // Guard: if > 10 it's already in percentage form (shouldn't happen but safe)
      result.roic = r2(Math.abs(km.roic) < 10 ? km.roic * 100 : km.roic);
      found.add("roic");
    }
  }

  result.fieldsFound = [...found] as FundamentalField[];
  result.fieldsMissing = ALL_FIELDS.filter(f => !found.has(f)) as FundamentalField[];

  return result;
}

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

export { ALL_FIELDS };
