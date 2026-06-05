export function parseJsonField<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function serializeJsonField(value: unknown): string {
  return JSON.stringify(value);
}

export function formatCurrency(value: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
}

export function formatPercent(value: number, decimals = 2): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function calcGainLoss(shares: number, avgCost: number, currentPrice: number) {
  const costBasis = shares * avgCost;
  const marketValue = shares * currentPrice;
  const gainLoss = marketValue - costBasis;
  const gainLossPct = gainLoss / costBasis;
  return { costBasis, marketValue, gainLoss, gainLossPct };
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + "...";
}
