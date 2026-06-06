// Screening pipeline: Universe → filters → ranked research queue.

export interface ScreenerFilters {
  grossMarginMin?: number;       // default 20
  operatingMarginMin?: number;   // default 5
  revenueGrowthMin?: number;     // default 0
  epsGrowthMin?: number;         // default -999 (no filter)
  debtToEquityMax?: number;      // default 3.0
  minScore?: number;             // default 30
  tiers?: string[];              // filter by tier(s)
}

export const DEFAULT_FILTERS: Required<ScreenerFilters> = {
  grossMarginMin: 20,
  operatingMarginMin: 5,
  revenueGrowthMin: 0,
  epsGrowthMin: -999,
  debtToEquityMax: 3.0,
  minScore: 30,
  tiers: [],
};

export interface ScoredEntry {
  id: string;
  ticker: string;
  companyName: string;
  exchange: string | null;
  sector: string | null;
  industry: string | null;
  marketCap: number | null;
  universeTier: string;
  country: string;
  assetType: string;
  status: string;
  fundamentals: {
    revenueGrowth: number | null;
    epsGrowth: number | null;
    grossMargin: number | null;
    operatingMargin: number | null;
    freeCashFlow: number | null;
    debtToEquity: number | null;
    roic: number | null;
    sharesOutstanding: number | null;
    updatedAt: string;
  } | null;
  latestScore: {
    businessQuality: number;
    growth: number;
    financialStrength: number;
    capitalAllocation: number;
    valuation: number;
    totalScore: number;
    scoredAt: string;
  } | null;
  inPortfolio: boolean;
  inWatchlist: boolean;
}

export interface ScreenerResult {
  all: ScoredEntry[];
  passed: ScoredEntry[];
  researchQueue: ScoredEntry[];
  stats: {
    universeSize: number;
    passedFilters: number;
    researchQueueSize: number;
    byTier: Record<string, number>;
  };
}

export function applyFilters(entries: ScoredEntry[], filters: ScreenerFilters): ScoredEntry[] {
  const f = { ...DEFAULT_FILTERS, ...filters };
  // Spreading filters with tiers:undefined overrides the default [] — guard explicitly
  const tiers = f.tiers ?? [];

  return entries.filter(e => {
    if (tiers.length > 0 && !tiers.includes(e.universeTier)) return false;

    const fund = e.fundamentals;
    if (!fund) {
      // ETFs or entries without fundamentals always pass filter (can't score them out)
      return e.assetType === "etf";
    }

    if (fund.grossMargin != null && fund.grossMargin < f.grossMarginMin) return false;
    if (fund.operatingMargin != null && fund.operatingMargin < f.operatingMarginMin) return false;
    if (fund.revenueGrowth != null && fund.revenueGrowth < f.revenueGrowthMin) return false;
    if (fund.epsGrowth != null && f.epsGrowthMin > -999 && fund.epsGrowth < f.epsGrowthMin) return false;
    if (fund.debtToEquity != null && fund.debtToEquity > f.debtToEquityMax) return false;

    const score = e.latestScore?.totalScore ?? 0;
    if (score < f.minScore) return false;

    return true;
  });
}

export function buildResearchQueue(passed: ScoredEntry[]): ScoredEntry[] {
  return passed
    .filter(e => !e.inPortfolio)
    .sort((a, b) => (b.latestScore?.totalScore ?? 0) - (a.latestScore?.totalScore ?? 0))
    .slice(0, 20);
}
