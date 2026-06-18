import { NextResponse } from "next/server";
import { fetchInsiderActivity } from "@/lib/fmp-client";

export interface InsiderTransaction {
  name:       string;
  title:      string | null;
  type:       "buy" | "sell" | "other";
  shares:     number;
  price:      number | null;
  totalValue: number | null;  // USD
  date:       string;         // YYYY-MM-DD
}

export interface InsiderSummary {
  transactions:  InsiderTransaction[];
  buyCount:      number;
  sellCount:     number;
  netShares:     number;      // buy shares - sell shares (last 90d)
  netValue:      number;      // USD (last 90d)
  sentiment:     "bullish" | "neutral" | "bearish";
  signal:        string;      // plain-text one-liner
  dataAvailable: boolean;
}

// Open-market transaction codes that count as meaningful buy/sell signals
const BUY_TYPES  = new Set(["P-Purchase"]);
const SELL_TYPES = new Set(["S-Sale", "S-Sale+OE"]);

function classifyType(raw: string | null, disposed: string | null): InsiderTransaction["type"] {
  if (!raw) return "other";
  if (BUY_TYPES.has(raw))  return "buy";
  if (SELL_TYPES.has(raw)) return "sell";
  // acquistedDisposed can also help for ambiguous codes
  if (disposed === "A" && raw.startsWith("P")) return "buy";
  if (disposed === "D" && raw.startsWith("S")) return "sell";
  return "other";
}

function buildSignal(buys: number, sells: number, netVal: number): string {
  if (buys === 0 && sells === 0) return "No open-market insider transactions in the last 90 days.";
  if (buys === 0 && sells > 0)   return `${sells} open-market sale${sells > 1 ? "s" : ""}, zero purchases — net bearish signal.`;
  if (sells === 0 && buys > 0)   return `${buys} open-market purchase${buys > 1 ? "s" : ""}, zero sales — net bullish signal.`;
  const ratio = (buys / (buys + sells) * 100).toFixed(0);
  const valStr = Math.abs(netVal) > 1_000_000
    ? `$${(Math.abs(netVal) / 1_000_000).toFixed(1)}M`
    : `$${Math.round(Math.abs(netVal) / 1000)}K`;
  const direction = netVal >= 0 ? "net accumulation" : "net distribution";
  return `${buys} purchase${buys > 1 ? "s" : ""} vs ${sells} sale${sells > 1 ? "s" : ""} (${ratio}% buy ratio) — ${valStr} ${direction}.`;
}

function buildSentiment(buys: number, sells: number, netVal: number): InsiderSummary["sentiment"] {
  if (buys === 0 && sells >= 3)   return "bearish";
  if (sells === 0 && buys >= 1)   return "bullish";
  if (netVal < -5_000_000)        return "bearish";
  if (buys > sells * 1.5)         return "bullish";
  if (sells > buys * 2)           return "bearish";
  return "neutral";
}

export async function GET(
  _req: Request,
  { params }: { params: { ticker: string } },
) {
  const ticker = params.ticker.toUpperCase();
  const apiKey = process.env.FMP_API_KEY ?? "";

  if (!apiKey) {
    return NextResponse.json({ error: "FMP_API_KEY not configured" }, { status: 500 });
  }

  try {
    const raw = await fetchInsiderActivity(ticker, apiKey, 25);

    const now90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const transactions: InsiderTransaction[] = raw
      .filter(r => r.transactionDate != null && r.securitiesTransacted != null)
      .map(r => {
        const type       = classifyType(r.transactionType, r.acquistedDisposed);
        const shares     = Math.abs(r.securitiesTransacted ?? 0);
        const price      = r.price ?? null;
        const totalValue = price != null ? shares * price : null;
        return {
          name:  r.reportingName ?? "Unknown",
          title: r.officerTitle  ?? null,
          type,
          shares,
          price,
          totalValue,
          date:  r.transactionDate!,
        };
      });

    // Count open-market buys/sells in last 90d only
    const recent = transactions.filter(t => new Date(t.date) >= now90);
    const buys   = recent.filter(t => t.type === "buy");
    const sells  = recent.filter(t => t.type === "sell");

    const netShares = buys.reduce((s, t) => s + t.shares, 0)
                    - sells.reduce((s, t) => s + t.shares, 0);
    const netValue  = buys.reduce((s, t) => s + (t.totalValue ?? 0), 0)
                    - sells.reduce((s, t) => s + (t.totalValue ?? 0), 0);

    const summary: InsiderSummary = {
      transactions: transactions.slice(0, 10),
      buyCount:  buys.length,
      sellCount: sells.length,
      netShares,
      netValue,
      sentiment:     buildSentiment(buys.length, sells.length, netValue),
      signal:        buildSignal(buys.length, sells.length, netValue),
      dataAvailable: transactions.length > 0,
    };

    return NextResponse.json(summary);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
