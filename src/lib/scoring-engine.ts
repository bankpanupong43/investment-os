// Scoring engine for investment universe entries.
// Computes 5 category scores (0-100) + weighted total from fundamental data.
// Valuation is a placeholder (50 neutral) until price data is available.

export interface CategoryScores {
  businessQuality: number;  // 0-100
  growth: number;           // 0-100
  financialStrength: number; // 0-100
  capitalAllocation: number; // 0-100
  valuation: number;        // 0-100 (placeholder)
  totalScore: number;       // 0-100 weighted
}

interface FundamentalInput {
  grossMargin?: number | null;
  operatingMargin?: number | null;
  revenueGrowth?: number | null;
  epsGrowth?: number | null;
  freeCashFlow?: number | null;
  debtToEquity?: number | null;
  roic?: number | null;
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

  // Business Quality: gross margin, operating margin, ROIC
  const gmScore = f.grossMargin != null ? normalize(f.grossMargin, 0, 80) : null;
  const omScore = f.operatingMargin != null ? normalize(f.operatingMargin, 0, 40) : null;
  const roicScore = f.roic != null ? normalize(f.roic, 0, 40) : null;
  const businessQuality = avgAvailable(gmScore, omScore, roicScore) ?? 0;

  // Growth: revenue growth, EPS growth
  const rgScore = f.revenueGrowth != null ? normalize(f.revenueGrowth, -10, 35) : null;
  const egScore = f.epsGrowth != null ? normalize(f.epsGrowth, -20, 60) : null;
  const growth = avgAvailable(rgScore, egScore) ?? 0;

  // Financial Strength: debt/equity (inverted), free cash flow
  const deScore = f.debtToEquity != null ? clamp(((3.0 - f.debtToEquity) / 3.0) * 100, 0, 100) : null;
  const fcfScore = f.freeCashFlow != null ? normalize(f.freeCashFlow, 0, 60000) : null;
  const financialStrength = avgAvailable(deScore, fcfScore) ?? 0;

  // Capital Allocation: ROIC is the best available proxy
  const capitalAllocation = roicScore ?? 0;

  // Valuation: placeholder until price data available
  const valuation = 50;

  // Weighted total (valuation weighted low since it's a placeholder)
  const totalScore = round(
    businessQuality * 0.35 +
    growth          * 0.25 +
    financialStrength * 0.20 +
    capitalAllocation * 0.15 +
    valuation       * 0.05
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
