// Stub: replace with real earnings provider (Alpha Vantage, Polygon, etc.)
export interface EarningsData {
  ticker: string;
  fiscalPeriod: string;
  reportDate: Date;
  epsActual: number;
  epsEstimate: number;
  revenueActual: number;
  revenueEstimate: number;
  guidanceSummary?: string;
}

export async function fetchLatestEarnings(_ticker: string): Promise<EarningsData | null> {
  // TODO: implement with real earnings API
  console.warn("fetchLatestEarnings: earnings feed not configured");
  return null;
}

export async function fetchUpcomingEarnings(_tickers: string[]): Promise<Array<{ ticker: string; reportDate: Date }>> {
  // TODO: implement with real earnings calendar API
  console.warn("fetchUpcomingEarnings: earnings calendar not configured");
  return [];
}
