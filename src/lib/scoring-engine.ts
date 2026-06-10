// Scoring engine for investment universe entries.
// Computes 5 category scores (0-100) + weighted total from fundamental data.
//
// V2 Phase 1 changes (2026-06-10):
//   - Growth ceilings widened: revenue (-20,50), EPS (-30,100)
//   - FCF signed range (-30000,60000); null → 50 neutral (non-USD or missing); <-30000 → 0
//   - Valuation weight zeroed; 5% redistributed proportionally (7:5:4:3 = 19 parts)
//   - Valuation field retained at 50 for future implementation
//   - Sector-adjusted gross margin + operating margin ceilings (Consumer Staples/Disc/Materials)

export interface CategoryScores {
  businessQuality: number;  // 0-100
  growth: number;           // 0-100
  financialStrength: number; // 0-100
  capitalAllocation: number; // 0-100
  valuation: number;        // 0-100 (placeholder)
  totalScore: number;       // 0-100 weighted
}

export interface FundamentalInput {
  grossMargin?: number | null;
  operatingMargin?: number | null;
  revenueGrowth?: number | null;
  epsGrowth?: number | null;
  freeCashFlow?: number | null;
  debtToEquity?: number | null;
  roic?: number | null;
  sector?: string | null;
}

// Sector-specific gross margin and operating margin ceilings for normalization.
// Low-margin sectors penalized under the default 80/40 tech ceilings get their own range.
function getMarginCeilings(sector?: string | null): { gmCeiling: number; omCeiling: number } {
  const s = (sector ?? "").toLowerCase();
  if (s === "consumer staples")       return { gmCeiling: 30, omCeiling: 8  };
  if (s === "consumer discretionary") return { gmCeiling: 55, omCeiling: 15 };
  if (s === "materials" || s === "industrials") return { gmCeiling: 50, omCeiling: 20 };
  // Technology, Healthcare, Financials, Communication Svcs, and unknown → default
  return { gmCeiling: 80, omCeiling: 40 };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return clamp(((value - min) / (max - min)) * 100, 0, 100);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function avgAvailable(...values: Array<number | null | undefined>): number | null {
  const valid = values.filter((v): v is number => v != null);
  if (valid.length === 0) return null;
  return average(valid);
}

export function computeScores(f: FundamentalInput | null | undefined): CategoryScores {
  if (!f) {
    return { businessQuality: 0, growth: 0, financialStrength: 0, capitalAllocation: 0, valuation: 50, totalScore: 0 };
  }

  const { gmCeiling, omCeiling } = getMarginCeilings(f.sector);

  // Business Quality: sector-adjusted gross margin, operating margin, ROIC
  const gmScore   = f.grossMargin     != null ? normalize(f.grossMargin,     0, gmCeiling) : null;
  const omScore   = f.operatingMargin != null ? normalize(f.operatingMargin, 0, omCeiling) : null;
  const roicScore = f.roic            != null ? normalize(f.roic,            0, 40)        : null;
  const businessQuality = avgAvailable(gmScore, omScore, roicScore) ?? 0;

  // Growth: widened ceilings — revenue (-20,50), EPS (-30,100)
  const rgScore = f.revenueGrowth != null ? normalize(f.revenueGrowth, -20, 50) : null;
  const egScore = f.epsGrowth     != null ? normalize(f.epsGrowth,     -30, 100) : null;
  const growth = avgAvailable(rgScore, egScore) ?? 0;

  // Financial Strength: D/E inverted + FCF signed range.
  // null FCF = non-USD reporter or missing data → 50 (neutral, not penalized).
  // Genuine negative FCF uses the signed range; extreme negative → 0.
  const deScore = f.debtToEquity != null ? clamp(((3.0 - f.debtToEquity) / 3.0) * 100, 0, 100) : null;
  const fcfScore: number =
    f.freeCashFlow == null  ? 50 :
    f.freeCashFlow < -30000 ? 0 :
    normalize(f.freeCashFlow, -30000, 60000);
  const financialStrength = avgAvailable(deScore, fcfScore) ?? fcfScore;

  // Capital Allocation: ROIC is the best available proxy
  const capitalAllocation = roicScore ?? 0;

  // Valuation: reserved for future implementation (weight = 0)
  const valuation = 50;

  // Weighted total: valuation zeroed; remaining 95% redistributed proportionally.
  // Original ratio 35:25:20:15 → 7:5:4:3 of 19 parts → sums to 100%.
  const totalScore = round(
    businessQuality   * (7 / 19) +
    growth            * (5 / 19) +
    financialStrength * (4 / 19) +
    capitalAllocation * (3 / 19) +
    valuation         * 0         // reserved
  );

  return {
    businessQuality: round(businessQuality),
    growth: round(growth),
    financialStrength: round(financialStrength),
    capitalAllocation: round(capitalAllocation),
    valuation,
    totalScore,
  };
}

function round(v: number): number {
  return Math.round(v * 10) / 10;
}
