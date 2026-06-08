// Macro Data Client — Phase 11: Real World Intelligence
//
// Fetches macroeconomic indicators from FRED (Federal Reserve Economic Data).
// Free CSV endpoint — no API key required.
//
// Series:
//   CPIAUCSL        — CPI (All Urban Consumers, SA)
//   CPILFESL        — Core CPI (Less Food & Energy)
//   FEDFUNDS        — Federal Funds Effective Rate
//   UNRATE          — Unemployment Rate
//   A191RL1Q225SBEA — Real GDP Growth Rate (annualized, SAAR)
//   DGS10           — 10-Year Treasury Constant Maturity
//   DGS2            — 2-Year Treasury Constant Maturity

const FRED_CSV = "https://fred.stlouisfed.org/graph/fredgraph.csv";

export interface MacroDataPoint {
  metric: string;
  value: number;
  date: Date;
  releaseDate: Date;
  source: string;
}

const FRED_SERIES: { id: string; metric: string }[] = [
  { id: "CPIAUCSL",        metric: "CPI" },
  { id: "CPILFESL",        metric: "Core CPI" },
  { id: "FEDFUNDS",        metric: "Fed Funds Rate" },
  { id: "UNRATE",          metric: "Unemployment" },
  { id: "A191RL1Q225SBEA", metric: "GDP Growth" },
  { id: "DGS10",           metric: "10Y Treasury Yield" },
  { id: "DGS2",            metric: "2Y Treasury Yield" },
];

async function fetchFREDSeries(seriesId: string): Promise<{ date: Date; value: number } | null> {
  try {
    const url = `${FRED_CSV}?id=${seriesId}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "InvestmentOS/1.0 (personal-finance-app)" },
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;

    const text = await res.text();
    const lines = text.trim().split("\n");

    // FRED CSV: header row + data rows. Scan from the end for the most recent valid value.
    // Missing values are represented as "." — skip them.
    for (let i = lines.length - 1; i >= 1; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      const [dateStr, valStr] = line.split(",");
      if (!dateStr || !valStr) continue;
      if (valStr.trim() === "." || valStr.trim() === "") continue;
      const value = parseFloat(valStr.trim());
      if (isNaN(value)) continue;
      const date = new Date(dateStr.trim() + "T00:00:00Z");
      if (isNaN(date.getTime())) continue;
      return { date, value };
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchMacroData(): Promise<MacroDataPoint[]> {
  const releaseDate = new Date();
  const results: MacroDataPoint[] = [];

  for (const { id, metric } of FRED_SERIES) {
    const data = await fetchFREDSeries(id);
    if (data) {
      results.push({
        metric,
        value: data.value,
        date: data.date,
        releaseDate,
        source: "FRED",
      });
    }
  }

  return results;
}

// ─── Interpretation helpers ───────────────────────────────────────────────────
// Used by engines to turn raw numbers into human-readable signals.

export function interpretCPI(value: number): { signal: "positive" | "neutral" | "negative"; label: string } {
  if (value < 2.5) return { signal: "positive", label: "Below target — disinflationary" };
  if (value < 3.5) return { signal: "neutral", label: "Moderately elevated — watch trend" };
  return { signal: "negative", label: "Elevated — restricts Fed easing" };
}

export function interpretFedFunds(value: number): { signal: "positive" | "neutral" | "negative"; label: string } {
  if (value < 3.0) return { signal: "positive", label: "Accommodative — multiple expansion supportive" };
  if (value < 4.5) return { signal: "neutral", label: "Moderately restrictive" };
  return { signal: "negative", label: "Restrictive — compresses growth multiples" };
}

export function interpretUnemployment(value: number): { signal: "positive" | "neutral" | "negative"; label: string } {
  if (value < 4.5) return { signal: "positive", label: "Strong labor market — supports spending" };
  if (value < 6.0) return { signal: "neutral", label: "Softening labor market — watch trend" };
  return { signal: "negative", label: "Elevated unemployment — recessionary signal" };
}

export function interpretGDPGrowth(value: number): { signal: "positive" | "neutral" | "negative"; label: string } {
  if (value >= 2.5) return { signal: "positive", label: "Solid growth — soft landing intact" };
  if (value >= 0) return { signal: "neutral", label: "Slowing growth — monitor" };
  return { signal: "negative", label: "Contraction — recession risk elevated" };
}

export function interpretYieldCurve(y10: number, y2: number): { inverted: boolean; spread: number; label: string } {
  const spread = parseFloat((y10 - y2).toFixed(2));
  const inverted = spread < 0;
  return {
    inverted,
    spread,
    label: inverted
      ? `Inverted by ${Math.abs(spread).toFixed(2)}% — recession historically follows within 12-18 months`
      : `Normal curve (+${spread.toFixed(2)}%) — no imminent recession signal`,
  };
}
