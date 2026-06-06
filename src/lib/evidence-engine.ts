// Evidence Engine — collects raw facts from OpportunityEntry data, derives
// interpretations, and assembles traceable recommendations.
//
// Facts:          raw data points with source citations (no inference)
// Interpretation: conclusions drawn from facts, referencing fact IDs
// Recommendation: actionable advice citing interpretation and fact IDs
//
// Rule: no claim in Interpretation or Recommendation may exist without
// at least one supporting fact ID.

import type { OpportunityEntry } from "./opportunity-engine";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type EvidenceCategory = "Fundamentals" | "Portfolio" | "Opportunity" | "BrainContext" | "Research";
export type ConfidenceLevel = "high" | "medium" | "low";
export type InterpretationStrength = "strong" | "moderate" | "weak";
export type InterpretationDirection = "positive" | "negative" | "neutral";
export type RecommendationWeight = "primary" | "secondary";
export type PositionAction = "initiate" | "add" | "hold" | "avoid";

export interface FactItem {
  id: string;           // e.g., "MSFT_001" — stable reference used by interpretation/recommendation
  ticker: string;
  metric: string;       // human-readable name, e.g., "ROIC"
  value: string;        // formatted display string, e.g., "21.3%"
  numericValue: number | null;
  unit: string | null;  // "%", "x", "USD M", "/100", etc.
  category: EvidenceCategory;
  source: string;       // data provenance
  sourceDate: string | null;
  confidence: ConfidenceLevel;
}

export interface InterpretationItem {
  id: string;           // e.g., "MSFT_I01"
  claim: string;        // one-sentence conclusion
  context: string;      // supporting context / explanation
  evidenceIds: string[]; // IDs from facts that support this claim
  strength: InterpretationStrength;
  direction: InterpretationDirection;
}

export interface RecommendationItem {
  reason: string;
  evidenceIds: string[]; // IDs from facts that support this reason
  weight: RecommendationWeight;
}

export interface RecommendationSection {
  positionAction: PositionAction;
  whyBuy: RecommendationItem[];
  whyNotBuy: RecommendationItem[];
  suggestedAllocation: {
    starterPct: number;
    starterUsd: number;
    targetPct: number;
    targetUsd: number;
    maxPct: number;
    maxUsd: number;
  };
  confidence: number; // 1–10
  confidenceEvidenceIds: string[];
  summary: string;
}

export interface EvidenceSummary {
  evidenceCount: number;
  factsByCategory: Record<string, number>;
  missingMetrics: string[];
  highConfidenceCount: number;
  mediumConfidenceCount: number;
  lowConfidenceCount: number;
  interpretationCount: number;
  supportingCount: number;
  contradictingCount: number;
}

// ─── Fact collection ───────────────────────────────────────────────────────────

export function collectFacts(entry: OpportunityEntry): FactItem[] {
  const facts: FactItem[] = [];
  const ticker = entry.ticker.toUpperCase();
  let seq = 0;
  const nextId = () => `${ticker}_${String(++seq).padStart(3, "0")}`;
  const today = new Date().toISOString().slice(0, 10);
  const f = entry.fundamentals;
  const fundConf: ConfidenceLevel = f ? "high" : "low";

  // ── Fundamentals ───────────────────────────────────────────────────────────
  if (entry.assetType !== "etf") {
    if (f?.roic != null) {
      facts.push({ id: nextId(), ticker, metric: "ROIC", value: `${f.roic}%`, numericValue: f.roic, unit: "%", category: "Fundamentals", source: "FMP Key Metrics TTM", sourceDate: today, confidence: fundConf });
    } else {
      facts.push({ id: nextId(), ticker, metric: "ROIC", value: "Not available", numericValue: null, unit: "%", category: "Fundamentals", source: "FMP Key Metrics TTM", sourceDate: null, confidence: "low" });
    }
    if (f?.grossMargin != null) {
      facts.push({ id: nextId(), ticker, metric: "Gross Margin", value: `${f.grossMargin}%`, numericValue: f.grossMargin, unit: "%", category: "Fundamentals", source: "FMP Ratios TTM", sourceDate: today, confidence: fundConf });
    }
    if (f?.operatingMargin != null) {
      facts.push({ id: nextId(), ticker, metric: "Operating Margin", value: `${f.operatingMargin}%`, numericValue: f.operatingMargin, unit: "%", category: "Fundamentals", source: "FMP Ratios TTM", sourceDate: today, confidence: fundConf });
    }
    if (f?.revenueGrowth != null) {
      facts.push({ id: nextId(), ticker, metric: "Revenue Growth (YoY)", value: `${f.revenueGrowth}%`, numericValue: f.revenueGrowth, unit: "%", category: "Fundamentals", source: "FMP Income Statement", sourceDate: today, confidence: fundConf });
    }
    if (f?.epsGrowth != null) {
      facts.push({ id: nextId(), ticker, metric: "EPS Growth (YoY)", value: `${f.epsGrowth}%`, numericValue: f.epsGrowth, unit: "%", category: "Fundamentals", source: "FMP Income Statement", sourceDate: today, confidence: fundConf });
    }
    if (f?.debtToEquity != null) {
      facts.push({ id: nextId(), ticker, metric: "Debt/Equity", value: `${f.debtToEquity}x`, numericValue: f.debtToEquity, unit: "x", category: "Fundamentals", source: "FMP Ratios TTM", sourceDate: today, confidence: fundConf });
    }
    if (f?.freeCashFlow != null) {
      facts.push({ id: nextId(), ticker, metric: "Free Cash Flow", value: `$${Math.round(f.freeCashFlow).toLocaleString()}M`, numericValue: f.freeCashFlow, unit: "USD M", category: "Fundamentals", source: "FMP Key Metrics TTM", sourceDate: today, confidence: fundConf });
    }
  }

  // ── Portfolio ──────────────────────────────────────────────────────────────
  const currentUsd = entry.currentValue?.usd ?? 0;
  const currentPct = entry.currentValue?.allocationPct ?? 0;
  const targetPct = entry.allocationTarget?.targetPct ?? 0;
  const targetUsd = entry.allocationTarget?.targetUsd ?? 0;
  const gapUsd = Math.max(0, targetUsd - currentUsd);
  const gapPp = targetPct - (currentPct ?? 0);

  facts.push({ id: nextId(), ticker, metric: "Current Weight", value: `${(currentPct ?? 0).toFixed(1)}%`, numericValue: currentPct, unit: "%", category: "Portfolio", source: "Portfolio Snapshot", sourceDate: today, confidence: "high" });
  facts.push({ id: nextId(), ticker, metric: "Current Value", value: `$${Math.round(currentUsd).toLocaleString()}`, numericValue: currentUsd, unit: "USD", category: "Portfolio", source: "Portfolio Snapshot", sourceDate: today, confidence: "high" });

  if (entry.allocationTarget) {
    facts.push({ id: nextId(), ticker, metric: "Target Weight", value: `${targetPct}%`, numericValue: targetPct, unit: "%", category: "Portfolio", source: "Allocation Engine", sourceDate: today, confidence: "high" });
    facts.push({ id: nextId(), ticker, metric: "Target Value", value: `$${Math.round(targetUsd).toLocaleString()}`, numericValue: targetUsd, unit: "USD", category: "Portfolio", source: "Allocation Engine", sourceDate: today, confidence: "high" });
    facts.push({ id: nextId(), ticker, metric: "Allocation Gap", value: `$${Math.round(gapUsd).toLocaleString()} (${gapPp.toFixed(1)}pp)`, numericValue: gapUsd, unit: "USD", category: "Portfolio", source: "Allocation Engine", sourceDate: today, confidence: "high" });
  }

  facts.push({ id: nextId(), ticker, metric: "Position Status", value: entry.inPortfolio ? "Active position" : "Not held", numericValue: entry.inPortfolio ? 1 : 0, unit: null, category: "Portfolio", source: "Portfolio", sourceDate: today, confidence: "high" });
  facts.push({ id: nextId(), ticker, metric: "Watchlist Status", value: entry.inWatchlist ? "On watchlist" : "Not on watchlist", numericValue: entry.inWatchlist ? 1 : 0, unit: null, category: "Portfolio", source: "Watchlist", sourceDate: today, confidence: "high" });

  // ── Opportunity scores ─────────────────────────────────────────────────────
  facts.push({ id: nextId(), ticker, metric: "Opportunity Score", value: `${entry.opportunityScore}/100`, numericValue: entry.opportunityScore, unit: "/100", category: "Opportunity", source: "Opportunity Engine", sourceDate: today, confidence: "high" });
  facts.push({ id: nextId(), ticker, metric: "Company Score", value: `${entry.companyScore}/100`, numericValue: entry.companyScore, unit: "/100", category: "Opportunity", source: "Universe Scorer", sourceDate: today, confidence: "high" });
  facts.push({ id: nextId(), ticker, metric: "Allocation Gap Score", value: `${entry.allocationGapScore}/100`, numericValue: entry.allocationGapScore, unit: "/100", category: "Opportunity", source: "Opportunity Engine", sourceDate: today, confidence: "high" });
  facts.push({ id: nextId(), ticker, metric: "Diversification Score", value: `${entry.diversificationScore}/100`, numericValue: entry.diversificationScore, unit: "/100", category: "Opportunity", source: "Opportunity Engine", sourceDate: today, confidence: "high" });
  facts.push({ id: nextId(), ticker, metric: "Brain Alignment Score", value: `${entry.brainAlignmentScore}/100`, numericValue: entry.brainAlignmentScore, unit: "/100", category: "Opportunity", source: "Opportunity Engine", sourceDate: today, confidence: "high" });
  facts.push({ id: nextId(), ticker, metric: "Watchlist Score", value: `${entry.watchlistScore}/100`, numericValue: entry.watchlistScore, unit: "/100", category: "Opportunity", source: "Watchlist", sourceDate: today, confidence: "high" });

  // ── Brain OS criteria ──────────────────────────────────────────────────────
  if (entry.assetType !== "etf") {
    facts.push({ id: nextId(), ticker, metric: "Quality Threshold: ROIC", value: "> 10%", numericValue: 10, unit: "%", category: "BrainContext", source: "Brain OS — Stock Selection Framework", sourceDate: null, confidence: "high" });
    facts.push({ id: nextId(), ticker, metric: "Growth Threshold: EPS CAGR", value: "> 15%", numericValue: 15, unit: "%", category: "BrainContext", source: "Brain OS — Stock Selection Framework", sourceDate: null, confidence: "high" });
    facts.push({ id: nextId(), ticker, metric: "Leverage Limit: D/E", value: "< 1.0x", numericValue: 1.0, unit: "x", category: "BrainContext", source: "Brain OS — Stock Selection Framework", sourceDate: null, confidence: "high" });
  }

  // ── Universe metadata ──────────────────────────────────────────────────────
  facts.push({ id: nextId(), ticker, metric: "Sector", value: entry.sector ?? "Not classified", numericValue: null, unit: null, category: "Research", source: "Universe", sourceDate: null, confidence: "high" });
  facts.push({ id: nextId(), ticker, metric: "Universe Tier", value: entry.universeTier, numericValue: null, unit: null, category: "Research", source: "Universe", sourceDate: null, confidence: "high" });
  facts.push({ id: nextId(), ticker, metric: "Asset Type", value: entry.assetType, numericValue: null, unit: null, category: "Research", source: "Universe", sourceDate: null, confidence: "high" });

  return facts;
}

// ─── Interpretation generation ─────────────────────────────────────────────────

export function generateInterpretations(facts: FactItem[], entry: OpportunityEntry): InterpretationItem[] {
  const interps: InterpretationItem[] = [];
  const ticker = entry.ticker.toUpperCase();
  let seq = 0;
  const nextId = () => `${ticker}_I${String(++seq).padStart(2, "0")}`;

  const getFact = (metric: string) => facts.find(f => f.metric === metric);
  const getNum = (metric: string) => getFact(metric)?.numericValue;
  const ids = (...metrics: string[]): string[] =>
    metrics.map(m => getFact(m)?.id).filter((x): x is string => x != null);

  const roic = getNum("ROIC");
  const grossMargin = getNum("Gross Margin");
  const epsGrowth = getNum("EPS Growth (YoY)");
  const revenueGrowth = getNum("Revenue Growth (YoY)");
  const debtToEquity = getNum("Debt/Equity");
  const allocationGapScore = getNum("Allocation Gap Score");
  const brainAlignmentScore = getNum("Brain Alignment Score");
  const diversificationScore = getNum("Diversification Score");
  const watchlistStatus = getNum("Watchlist Status");
  const freeCashFlow = getNum("Free Cash Flow");

  // ── ROIC ──────────────────────────────────────────────────────────────────
  if (roic != null) {
    const ref = ids("ROIC", "Quality Threshold: ROIC");
    if (roic >= 25) {
      interps.push({ id: nextId(), claim: `Exceptional ROIC (${roic}%) — well above 10% quality threshold`, context: "ROIC above 25% is rare and signals a durable competitive advantage. Management converts each dollar of invested capital into compounding shareholder returns at an above-market rate.", evidenceIds: ref, strength: "strong", direction: "positive" });
    } else if (roic >= 10) {
      interps.push({ id: nextId(), claim: `ROIC (${roic}%) passes the 10% quality hurdle`, context: "Businesses earning above their cost of capital create long-term value. Consistent ROIC above 10% is a core Buffett/Lynch quality criterion.", evidenceIds: ref, strength: roic >= 15 ? "strong" : "moderate", direction: "positive" });
    } else {
      interps.push({ id: nextId(), claim: `ROIC (${roic}%) below 10% quality threshold — requires explanation`, context: "Sub-threshold ROIC means the business does not efficiently convert capital into returns. Cyclical dip vs. structural weakness is the key question.", evidenceIds: ref, strength: "strong", direction: "negative" });
    }
  }

  // ── Gross margin ──────────────────────────────────────────────────────────
  if (grossMargin != null) {
    const ref = ids("Gross Margin");
    if (grossMargin >= 60) {
      interps.push({ id: nextId(), claim: `High gross margin (${grossMargin}%) signals durable pricing power`, context: "Margins above 60% mean customers pay premium prices — a sign of differentiated products that competitors cannot easily replicate.", evidenceIds: ref, strength: "strong", direction: "positive" });
    } else if (grossMargin >= 40) {
      interps.push({ id: nextId(), claim: `Solid gross margin (${grossMargin}%) indicates competitive positioning`, context: "Above-average margins reflect product differentiation and pricing ability over commodity alternatives.", evidenceIds: ref, strength: "moderate", direction: "positive" });
    } else if (grossMargin < 25) {
      interps.push({ id: nextId(), claim: `Thin gross margin (${grossMargin}%) limits downside buffer`, context: "Low margins indicate commodity-like competition or high cost structure. Leaves little room for error in cost control or pricing.", evidenceIds: ref, strength: "moderate", direction: "negative" });
    }
  }

  // ── EPS growth ────────────────────────────────────────────────────────────
  if (epsGrowth != null) {
    const ref = ids("EPS Growth (YoY)", "Growth Threshold: EPS CAGR");
    if (epsGrowth >= 20) {
      interps.push({ id: nextId(), claim: `Strong EPS growth (${epsGrowth}%) exceeds 15% quality-compounder threshold`, context: "EPS compounding above 20% is a hallmark of the quality-growth companies in the Buffett/Lynch framework. Earnings momentum creates per-share value regardless of near-term multiple fluctuations.", evidenceIds: ref, strength: "strong", direction: "positive" });
    } else if (epsGrowth >= 8) {
      interps.push({ id: nextId(), claim: `Positive EPS growth (${epsGrowth}%) below 15% fast-grower threshold`, context: "Consistent earnings expansion indicates business momentum, though below the preferred threshold for quality compounders.", evidenceIds: ref, strength: "moderate", direction: "positive" });
    } else if (epsGrowth < 0) {
      interps.push({ id: nextId(), claim: `EPS contraction (${epsGrowth}%) — earnings declining YoY`, context: "Negative EPS growth requires investigation: one-time (restructuring, impairment) or structural (business deterioration)? Structural decline invalidates the quality-compounder thesis.", evidenceIds: ref, strength: "strong", direction: "negative" });
    }
  } else if (revenueGrowth != null && revenueGrowth >= 12) {
    const ref = ids("Revenue Growth (YoY)");
    interps.push({ id: nextId(), claim: `Revenue growth (${revenueGrowth}%) demonstrates market demand expansion`, context: "Top-line growth at scale is a leading indicator of future earnings power when EPS data is unavailable or temporarily depressed.", evidenceIds: ref, strength: revenueGrowth >= 20 ? "strong" : "moderate", direction: "positive" });
  }

  // ── Debt/Equity ───────────────────────────────────────────────────────────
  if (debtToEquity != null) {
    const ref = ids("Debt/Equity", "Leverage Limit: D/E");
    if (debtToEquity < 0.5) {
      interps.push({ id: nextId(), claim: `Low leverage (${debtToEquity}x D/E) provides financial flexibility`, context: "Minimal debt means the company can self-fund growth, pursue acquisitions, and withstand downturns without dilutive equity raises.", evidenceIds: ref, strength: "strong", direction: "positive" });
    } else if (debtToEquity > 1) {
      interps.push({ id: nextId(), claim: `Elevated leverage (${debtToEquity}x D/E) exceeds 1.0x quality limit`, context: "Higher debt amplifies downside in economic contractions. Above 1.0x, fixed debt obligations constrain financial flexibility and increase risk of covenant breaches.", evidenceIds: ref, strength: debtToEquity > 2 ? "strong" : "moderate", direction: "negative" });
    }
  }

  // ── Allocation gap ────────────────────────────────────────────────────────
  if (allocationGapScore != null && allocationGapScore >= 50) {
    const ref = ids("Allocation Gap", "Target Weight", "Current Weight");
    interps.push({ id: nextId(), claim: `High deployment priority — ${Math.round(allocationGapScore)}% allocation gap score`, context: "The investment plan explicitly targets this position. Closing the gap executes a pre-made strategic decision rather than introducing a speculative new idea.", evidenceIds: ref, strength: allocationGapScore >= 80 ? "strong" : "moderate", direction: "positive" });
  }

  // ── Watchlist conviction ──────────────────────────────────────────────────
  if (watchlistStatus === 1) {
    const ref = ids("Watchlist Status");
    interps.push({ id: nextId(), claim: "Pre-researched watchlist conviction — prior due diligence completed", context: "Watchlist entries represent stocks where research has been conducted and interest is established. Converting to a position is acting on existing conviction, not impulse.", evidenceIds: ref, strength: "moderate", direction: "positive" });
  }

  // ── Diversification ───────────────────────────────────────────────────────
  if (diversificationScore != null && diversificationScore >= 65 && entry.assetType !== "etf") {
    const ref = ids("Diversification Score", "Sector");
    interps.push({ id: nextId(), claim: `${entry.sector ?? "Sector"} underrepresented — meaningful diversification benefit`, context: "Adding exposure to underrepresented sectors reduces single-sector concentration risk and improves portfolio resilience across economic cycles.", evidenceIds: ref, strength: diversificationScore >= 85 ? "strong" : "moderate", direction: "positive" });
  }

  // ── FCF generation ────────────────────────────────────────────────────────
  if (freeCashFlow != null && freeCashFlow > 2000) {
    const ref = ids("Free Cash Flow");
    interps.push({ id: nextId(), claim: `Substantial FCF ($${Math.round(freeCashFlow).toLocaleString()}M) self-funds growth and returns`, context: "Large FCF-generative businesses can fund R&D, buybacks, dividends, and acquisitions without external financing. Reduces dilution risk and cycle sensitivity.", evidenceIds: ref, strength: freeCashFlow > 15000 ? "strong" : "moderate", direction: "positive" });
  }

  // ── Brain alignment ───────────────────────────────────────────────────────
  if (brainAlignmentScore != null && entry.assetType !== "etf") {
    const ref = ids("Brain Alignment Score");
    if (brainAlignmentScore >= 75) {
      interps.push({ id: nextId(), claim: `Strong Brain OS alignment (${brainAlignmentScore}/100) — meets quality-compounder criteria`, context: "High alignment with the Buffett/Lynch philosophy: ROIC above threshold, defensible margins, and growth trajectory supporting long-term compounding.", evidenceIds: ref, strength: "strong", direction: "positive" });
    } else if (brainAlignmentScore < 40) {
      interps.push({ id: nextId(), claim: `Weak Brain OS alignment (${brainAlignmentScore}/100) — does not fully meet quality criteria`, context: "Key quality metrics are missing or below threshold. This position should be sized conservatively unless the investment rationale diverges intentionally from the quality-compounder framework.", evidenceIds: ref, strength: "moderate", direction: "negative" });
    }
  }

  // ── Valuation fallback ──────────────────────────────────────────────────────
  // Every dossier must surface at least one risk — even world-class companies carry
  // valuation risk when they trade at premium multiples.
  if (!interps.some(i => i.direction === "negative")) {
    const ref = ids("Opportunity Score", "Company Score");
    interps.push({
      id: nextId(),
      claim: "Valuation premium risk — quality businesses rarely trade cheaply",
      context: "High-quality compounders command premium multiples. Even with strong fundamentals, multiple compression in risk-off environments can produce near-term drawdowns. Entry price matters for long-term returns.",
      evidenceIds: ref,
      strength: "moderate",
      direction: "negative",
    });
  }

  return interps;
}

// ─── Recommendation assembly ───────────────────────────────────────────────────

export function generateRecommendation(
  facts: FactItem[],
  interpretations: InterpretationItem[],
  entry: OpportunityEntry
): RecommendationSection {
  const getFact = (metric: string) => facts.find(f => f.metric === metric);

  const positive = interpretations.filter(i => i.direction === "positive");
  const negative = interpretations.filter(i => i.direction === "negative");

  const whyBuy: RecommendationItem[] = positive.slice(0, 4).map(interp => ({
    reason: interp.claim,
    evidenceIds: interp.evidenceIds,
    weight: interp.strength === "strong" ? "primary" : "secondary",
  }));

  let whyNotBuy: RecommendationItem[] = negative.slice(0, 3).map(interp => ({
    reason: interp.claim,
    evidenceIds: interp.evidenceIds,
    weight: interp.strength === "strong" ? "primary" : "secondary",
  }));

  if (whyNotBuy.length === 0) {
    const oppId = getFact("Opportunity Score")?.id;
    whyNotBuy = [{ reason: "Valuation risk — quality businesses often trade at premium multiples; multiple compression can produce near-term losses even with strong fundamentals", evidenceIds: oppId ? [oppId] : [], weight: "secondary" }];
  }

  const positionAction: PositionAction =
    entry.reasoning.positionType === "initiate" ? "initiate" :
    entry.reasoning.positionType === "add" ? "add" : "hold";

  const brainScore = getFact("Brain Alignment Score")?.numericValue ?? 50;
  const strongPos = positive.filter(i => i.strength === "strong").length;
  const strongNeg = negative.filter(i => i.strength === "strong").length;
  const confidence = Math.max(4, Math.min(9, Math.round(
    5 + (brainScore / 100) * 4 - strongNeg * 0.5 + (strongPos >= 3 ? 0.5 : 0)
  )));

  const confidenceEvidenceIds = interpretations.slice(0, 3).flatMap(i => i.evidenceIds).slice(0, 5);

  const actionVerb = positionAction === "initiate" ? "initiate a starter position"
    : positionAction === "add" ? "add to the existing position"
    : "hold the current position";
  const summary = `${actionVerb.charAt(0).toUpperCase() + actionVerb.slice(1)} in ${entry.ticker}. ${positive.length} supporting factor${positive.length !== 1 ? "s" : ""}, ${negative.length} risk factor${negative.length !== 1 ? "s" : ""}. Confidence: ${confidence}/10.`;

  return {
    positionAction,
    whyBuy,
    whyNotBuy,
    suggestedAllocation: entry.suggestedAllocation,
    confidence,
    confidenceEvidenceIds,
    summary,
  };
}

// ─── Evidence summary ──────────────────────────────────────────────────────────

export function buildEvidenceSummary(
  facts: FactItem[],
  interpretations: InterpretationItem[],
  entry: OpportunityEntry
): EvidenceSummary {
  const expectedFundamentals = entry.assetType === "etf"
    ? []
    : ["ROIC", "Gross Margin", "Revenue Growth (YoY)", "EPS Growth (YoY)", "Debt/Equity", "Free Cash Flow"];

  const presentFundamentals = facts
    .filter(f => f.category === "Fundamentals" && f.numericValue != null)
    .map(f => f.metric);

  const missingMetrics = expectedFundamentals.filter(m => !presentFundamentals.includes(m));

  const byCategory: Record<string, number> = {};
  for (const f of facts) {
    byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
  }

  return {
    evidenceCount: facts.length,
    factsByCategory: byCategory,
    missingMetrics,
    highConfidenceCount: facts.filter(f => f.confidence === "high").length,
    mediumConfidenceCount: facts.filter(f => f.confidence === "medium").length,
    lowConfidenceCount: facts.filter(f => f.confidence === "low").length,
    interpretationCount: interpretations.length,
    supportingCount: interpretations.filter(i => i.direction === "positive").length,
    contradictingCount: interpretations.filter(i => i.direction === "negative").length,
  };
}
