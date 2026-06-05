// Stub: replace with real data provider (Alpha Vantage, Polygon, etc.)
export interface QuoteData {
  ticker: string;
  price: number;
  change: number;
  changePct: number;
  volume: number;
  marketCap: number;
  fetchedAt: Date;
}

export async function fetchQuote(_ticker: string): Promise<QuoteData | null> {
  // TODO: implement with real market data API
  console.warn("fetchQuote: market data feed not configured");
  return null;
}

export async function fetchQuotes(_tickers: string[]): Promise<QuoteData[]> {
  // TODO: implement with real market data API
  console.warn("fetchQuotes: market data feed not configured");
  return [];
}
