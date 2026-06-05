// Stub: replace with real news provider (NewsAPI, Polygon, etc.)
export interface RawNewsItem {
  ticker: string;
  headline: string;
  content: string;
  source: string;
  url: string;
  publishedAt: Date;
}

export async function fetchNewsForTicker(_ticker: string): Promise<RawNewsItem[]> {
  // TODO: implement with real news API
  console.warn("fetchNewsForTicker: news feed not configured");
  return [];
}

export async function fetchNewsForTickers(_tickers: string[]): Promise<RawNewsItem[]> {
  // TODO: implement with real news API
  console.warn("fetchNewsForTickers: news feed not configured");
  return [];
}
