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

// Parse all valid rows from a FRED CSV response.
function parseFREDRows(csvText: string): { date: Date; value: number }[] {
  const lines = csvText.trim().split("\n");
  const rows: { date: Date; value: number }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const [dateStr, valStr] = line.split(",");
    if (!dateStr || !valStr) continue;
    if (valStr.trim() === "." || valStr.trim() === "") continue;
    const value = parseFloat(valStr.trim());
    if (isNaN(value)) continue;
    const date = new Date(dateStr.trim() + "T00:00:00Z");
    if (isNaN(date.getTime())) continue;
    rows.push({ date, value });
  }
  return rows;
}

async function fetchFREDCSV(seriesId: string): Promise<string | null> {
  try {
    const res = await fetch(`${FRED_CSV}?id=${seriesId}`, {
      headers: { "User-Agent": "InvestmentOS/1.0 (personal-finance-app)" },
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

async function fetchFREDSeries(seriesId: string): Promise<{ date: Date; value: number } | null> {
  const csv = await fetchFREDCSV(seriesId);
  if (!csv) return null;
  const rows = parseFREDRows(csv);
  return rows.length > 0 ? rows[rows.length - 1] : null;
}

// For index-level series (CPIAUCSL, CPILFESL) compute year-over-year % change.
// FRED returns the raw price index (~332); callers expect a percentage like 2.4%.
async function fetchFREDSeriesYoY(seriesId: string): Promise<{ date: Date; value: number } | null> {
  const csv = await fetchFREDCSV(seriesId);
  if (!csv) return null;
  const rows = parseFREDRows(csv);
  if (rows.length < 2) return null;

  const current = rows[rows.length - 1];
  // Find the row closest to 12 months ago (within a 45-day window)
  const targetMs = current.date.getTime() - 365 * 24 * 60 * 60 * 1000;
  const yearAgo = rows.reduce((best, row) => {
    const dist = Math.abs(row.date.getTime() - targetMs);
    return dist < Math.abs(best.date.getTime() - targetMs) ? row : best;
  });

  // Sanity: year-ago must be at least 11 months back and no more than 14 months back
  const monthsBack = (current.date.getTime() - yearAgo.date.getTime()) / (30.4 * 24 * 60 * 60 * 1000);
  if (monthsBack < 11 || monthsBack > 14) return null;

  const yoy = ((current.value - yearAgo.value) / yearAgo.value) * 100;
  return { date: current.date, value: parseFloat(yoy.toFixed(2)) };
}

export async function fetchMacroData(): Promise<MacroDataPoint[]> {
  const releaseDate = new Date();
  const results: MacroDataPoint[] = [];

  for (const { id, metric } of FRED_SERIES) {
    // CPI index series need YoY computation; all other series are already rates/percentages
    const isCpiIndex = id === "CPIAUCSL" || id === "CPILFESL";
    const data = isCpiIndex ? await fetchFREDSeriesYoY(id) : await fetchFREDSeries(id);
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
