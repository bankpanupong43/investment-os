// Market Data Client — Phase 11: Real World Intelligence
//
// Fetches daily market prices via Yahoo Finance unofficial JSON API.
// No authentication required. Server-side only (no CORS concerns).
//
// Symbols:
//   ^VIX  — CBOE Volatility Index
//   ^GSPC — S&P 500
//   ^IXIC — Nasdaq Composite
//   ^RUT  — Russell 2000

export interface MarketDataPoint {
  metric: string;
  symbol: string;
  value: number;
  date: Date;
  source: string;
}

const YAHOO_SYMBOLS: { symbol: string; metric: string }[] = [
  { symbol: "^VIX",  metric: "VIX" },
  { symbol: "^GSPC", metric: "SP500" },
  { symbol: "^IXIC", metric: "Nasdaq" },
  { symbol: "^RUT",  metric: "Russell2000" },
];

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: { regularMarketPrice?: number; symbol?: string };
      indicators?: { quote?: Array<{ close?: (number | null)[] }> };
    }>;
    error?: unknown;
  };
}

async function fetchYahooQuote(symbol: string): Promise<number | null> {
  try {
    const encoded = encodeURIComponent(symbol);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=5d&includePrePost=false`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as YahooChartResponse;
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    // Prefer regularMarketPrice from meta (most recent)
    const price = result.meta?.regularMarketPrice;
    if (price != null && !isNaN(price) && price > 0) return Math.round(price * 100) / 100;

    // Fallback: last non-null close in the series
    const closes = result.indicators?.quote?.[0]?.close;
    if (closes) {
      for (let i = closes.length - 1; i >= 0; i--) {
        const c = closes[i];
        if (c != null && !isNaN(c) && c > 0) return Math.round(c * 100) / 100;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchMarketData(): Promise<MarketDataPoint[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const results: MarketDataPoint[] = [];

  for (const { symbol, metric } of YAHOO_SYMBOLS) {
    const price = await fetchYahooQuote(symbol);
    if (price != null) {
      results.push({ metric, symbol, value: price, date: today, source: "Yahoo Finance" });
    }
  }

  return results;
}

// ─── VIX interpretation ───────────────────────────────────────────────────────

export function interpretVIX(vix: number): {
  regime: "risk_on" | "neutral" | "risk_off" | "crisis";
  label: string;
  regimePoints: number; // positive = bullish contribution, negative = bearish
} {
  if (vix < 15) return { regime: "risk_on",  label: `VIX ${vix.toFixed(1)} — low volatility, risk appetite elevated`,  regimePoints: 2 };
  if (vix < 20) return { regime: "neutral",  label: `VIX ${vix.toFixed(1)} — normal volatility range`,                 regimePoints: 0 };
  if (vix < 30) return { regime: "risk_off", label: `VIX ${vix.toFixed(1)} — elevated volatility, risk-off caution`,   regimePoints: -2 };
  return             { regime: "crisis",   label: `VIX ${vix.toFixed(1)} — fear spike, defensive posture warranted`, regimePoints: -4 };
}
