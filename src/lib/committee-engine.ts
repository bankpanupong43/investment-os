// Committee Engine — Phase 6: Evidence-Based Investment Committee
//
// 5 committee members challenge the investment thesis before capital is deployed.
// Every claim must cite at least one evidence ID (fact, filing, or earnings record).
// No opinion without evidence.
//
// Members:
//   1. Bull Analyst      — builds strongest buy case with upside scenarios
//   2. Bear Analyst      — builds bear case, red flags, failure scenarios
//   3. Risk Manager      — evaluates portfolio concentration, sizing, correlation
//   4. Thesis Auditor    — verifies all claims, detects evidence gaps
//   5. Portfolio Manager — reads all outputs, makes final recommendation

import { db } from "./db";
import { collectFacts, generateInterpretations } from "./evidence-engine";
import type { FactItem, InterpretationItem } from "./evidence-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DecisionState = "Strong Buy" | "Buy" | "Watch" | "Hold" | "Pass";

export interface EvidenceRef {
  id: string;
  type: "fact" | "filing" | "earnings" | "metric";
  label: string;
  value: string;
}

export interface BullDriver {
  driver: string;
  evidenceIds: string[];
  strength: "strong" | "moderate";
}

export interface UpsideScenario {
  scenario: string;
  condition: string;
  probability: "high" | "medium" | "low";
}

export interface BullCase {
  thesis: string;
  supportingEvidence: EvidenceRef[];
  keyDrivers: BullDriver[];
  upsideScenarios: UpsideScenario[];
  bullScore: number;
}

export interface RedFlag {
  flag: string;
  severity: "critical" | "high" | "medium";
  evidenceIds: string[];
}

export interface FailureScenario {
  scenario: string;
  trigger: string;
  probability: "high" | "medium" | "low";
}

export interface BearCase {
  thesis: string;
  contradictingEvidence: EvidenceRef[];
  failureScenarios: FailureScenario[];
  redFlags: RedFlag[];
  bearScore: number;
}

export interface RiskAssessment {
  portfolioRiskScore: number;
  positionSizeRecommendation: {
    maxPct: number;
    suggestedPct: number;
    starterPct: number;
    rationale: string;
  };
  concentrationRisk: {
    level: "high" | "medium" | "low";
    reasoning: string;
    sectorExposure: string;
  };
  correlationRisk: {
    level: "high" | "medium" | "low";
    correlatedTickers: string[];
    reasoning: string;
  };
  diversificationImpact: {
    positive: boolean;
    reasoning: string;
  };
}

export interface ThesisAudit {
  auditScore: number;
  unsupportedClaims: { claim: string; source: "bull" | "bear"; issue: string }[];
  missingEvidence: string[];
  confidenceAdjustments: { metric: string; adjustment: number; reason: string }[];
  overallVerdict: "well-supported" | "partially-supported" | "evidence-gaps";
}

export interface FinalDecision {
  recommendation: DecisionState;
  suggestedAllocation: { pct: number; usd: number; rationale: string };
  convictionLevel: number;
  bullScore: number;
  bearScore: number;
  summaryReasoning: string;
  keyRisksAcknowledged: string[];
  committeeSplit: { bullStrength: number; bearStrength: number; reasoning: string };
}

export interface CommitteeSessionData {
  ticker: string;
  companyName: string;
  sector: string | null;
  universeTier: string;
  bullCase: BullCase;
  bearCase: BearCase;
  riskAssessment: RiskAssessment;
  thesisAudit: ThesisAudit;
  finalDecision: FinalDecision;
  conviction: DecisionState;
  evidenceCount: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safe<T>(json: string, fallback: T): T {
  try { return JSON.parse(json); } catch { return fallback; }
}

function getNum(facts: FactItem[], metric: string): number | null {
  return facts.find(f => f.metric === metric)?.numericValue ?? null;
}

function getFact(facts: FactItem[], metric: string): FactItem | undefined {
  return facts.find(f => f.metric === metric);
}

// ─── Data loading ─────────────────────────────────────────────────────────────

async function loadTickerData(ticker: string) {
  const [universe, dossier, filings, earnings, investmentThesis, positions, allocationTarget] =
    await Promise.all([
      db.universe.findUnique({
        where: { ticker },
        include: {
          fundamentals: true,
          scores: { orderBy: { scoredAt: "desc" }, take: 1 },
        },
      }),
      db.researchDossier.findUnique({ where: { ticker } }),
      db.filing.findMany({
        where: { ticker },
        orderBy: { filingDate: "desc" },
        take: 5,
        include: { thesisImpacts: { orderBy: { createdAt: "desc" }, take: 1 } },
      }),
      db.earningsEvent.findMany({
        where: { ticker },
        orderBy: { reportDate: "desc" },
        take: 4,
      }),
      db.investmentThesis.findUnique({ where: { ticker } }),
      db.position.findMany({ where: { status: "active" } }),
      db.allocationTarget.findUnique({ where: { ticker } }),
    ]);

  if (!universe) throw new Error(`Ticker ${ticker} not found in universe`);
  return { universe, dossier, filings, earnings, investmentThesis, positions, allocationTarget };
}

// ─── Minimal OpportunityEntry for evidence engine ─────────────────────────────

function buildMinimalEntry(
  ticker: string,
  universe: { companyName: string; universeTier: string; sector: string | null; assetType: string; fundamentals: { roic: number | null; grossMargin: number | null; operatingMargin: number | null; revenueGrowth: number | null; epsGrowth: number | null; debtToEquity: number | null; freeCashFlow: number | null } | null; scores: { totalScore: number }[] },
  allocationTarget: { targetPct: number; targetUsd: number; bucket: string; priority: number } | null,
  positions: { ticker: string; currentValueUsd: number | null; allocationPct: number | null }[]
) {
  const pos = positions.find(p => p.ticker === ticker);
  const score = universe.scores[0]?.totalScore ?? 50;
  const f = universe.fundamentals;

  return {
    ticker,
    companyName: universe.companyName,
    universeTier: universe.universeTier,
    sector: universe.sector,
    assetType: universe.assetType,
    inPortfolio: !!pos,
    inWatchlist: false,
    companyScore: score,
    allocationGapScore: allocationTarget ? 65 : 20,
    diversificationScore: 50,
    watchlistScore: 0,
    brainAlignmentScore: score >= 70 ? 70 : score >= 50 ? 50 : 30,
    objectiveScore: score,
    opportunityScore: score,
    preferenceScore: 0,
    userFeedback: null,
    confidence: f ? 7 : 3,
    uncertaintyFactors: f ? [] : ["No fundamental data available"],
    fundamentals: f ? {
      grossMargin: f.grossMargin,
      operatingMargin: f.operatingMargin,
      revenueGrowth: f.revenueGrowth,
      epsGrowth: f.epsGrowth,
      freeCashFlow: f.freeCashFlow,
      debtToEquity: f.debtToEquity,
      roic: f.roic,
    } : null,
    allocationTarget: allocationTarget ? {
      targetPct: allocationTarget.targetPct,
      targetUsd: allocationTarget.targetUsd,
      bucket: allocationTarget.bucket,
      priority: allocationTarget.priority,
    } : null,
    currentValue: pos ? { usd: pos.currentValueUsd, allocationPct: pos.allocationPct } : null,
    suggestedAllocation: {
      starterPct: allocationTarget ? allocationTarget.targetPct * 0.4 : 2,
      starterUsd: allocationTarget ? allocationTarget.targetUsd * 0.4 : 0,
      targetPct: allocationTarget?.targetPct ?? 5,
      targetUsd: allocationTarget?.targetUsd ?? 0,
      maxPct: allocationTarget ? allocationTarget.targetPct * 1.5 : 7.5,
      maxUsd: allocationTarget ? allocationTarget.targetUsd * 1.5 : 0,
    },
    reasoning: {
      whyBuy: "",
      whyNow: "",
      portfolioImpact: "",
      positionType: pos ? ("add" as const) : ("initiate" as const),
    },
    supportingFactors: [],
    contradictingFactors: [],
  };
}

// ─── 1. Bull Analyst ──────────────────────────────────────────────────────────

function buildBullCase(
  facts: FactItem[],
  interpretations: InterpretationItem[],
  filings: { id: string; filingType: string; filingDate: Date | string; thesisImpacts: { impactLevel: string }[] }[],
  earnings: { id: string; fiscalPeriod: string | null; epsActual: number | null; epsEstimate: number | null }[],
  ticker: string
): BullCase {
  const positive = interpretations.filter(i => i.direction === "positive");
  const strong = positive.filter(i => i.strength === "strong");
  const moderate = positive.filter(i => i.strength === "moderate");
  const top = [...strong.slice(0, 2), ...moderate.slice(0, 1)];

  const thesis =
    top.length >= 2
      ? `${ticker} presents a compelling investment opportunity. ${top[0].claim}. ${top.slice(1).map(t => t.claim).join(". ")}. These fundamentals support a long-term compounding thesis.`
      : top.length === 1
        ? `${ticker} shows meaningful strength: ${top[0].claim}. A starter position is warranted pending additional thesis validation.`
        : `${ticker} shows potential but current evidence is limited. Monitor for improving fundamental signals before deploying capital.`;

  // Evidence refs from top interpretation fact IDs
  const seenIds = new Set<string>();
  const supportingEvidence: EvidenceRef[] = top.flatMap(interp =>
    interp.evidenceIds.slice(0, 2).flatMap(id => {
      if (seenIds.has(id)) return [];
      seenIds.add(id);
      const fact = facts.find(f => f.id === id);
      return fact ? [{ id: fact.id, type: "fact" as const, label: fact.metric, value: fact.value }] : [];
    })
  );

  // Positive filing as evidence
  const positiveFiling = filings.find(f => f.thesisImpacts[0]?.impactLevel === "strengthened");
  if (positiveFiling) {
    supportingEvidence.push({
      id: positiveFiling.id,
      type: "filing",
      label: `${positiveFiling.filingType} — Thesis Strengthened`,
      value: new Date(positiveFiling.filingDate).toLocaleDateString("en-US", { month: "short", year: "numeric" }),
    });
  }

  // Earnings beat as evidence
  const latestBeat = earnings.find(e => e.epsActual != null && e.epsEstimate != null && e.epsActual > e.epsEstimate * 1.02);
  if (latestBeat) {
    supportingEvidence.push({
      id: latestBeat.id,
      type: "earnings",
      label: `EPS Beat — ${latestBeat.fiscalPeriod ?? "Recent Quarter"}`,
      value: `$${latestBeat.epsActual!.toFixed(2)} vs est $${latestBeat.epsEstimate!.toFixed(2)}`,
    });
  }

  // Key drivers — all positive interpretations
  const keyDrivers: BullDriver[] = positive.slice(0, 5).map(interp => ({
    driver: interp.claim,
    evidenceIds: interp.evidenceIds,
    strength: interp.strength === "strong" ? "strong" : "moderate",
  }));

  const epsGrowthFact = getFact(facts, "EPS Growth (YoY)");
  if (epsGrowthFact && (epsGrowthFact.numericValue ?? 0) >= 15 && !keyDrivers.some(d => d.evidenceIds.includes(epsGrowthFact.id))) {
    keyDrivers.push({
      driver: `Strong EPS growth (${epsGrowthFact.value}) — per-share value compounds faster than market pricing reflects`,
      evidenceIds: [epsGrowthFact.id],
      strength: (epsGrowthFact.numericValue ?? 0) >= 25 ? "strong" : "moderate",
    });
  }

  const upsideScenarios = buildUpsideScenarios(facts, earnings, ticker);

  const bullScore = Math.min(100, strong.length * 20 + moderate.length * 10 + (latestBeat ? 5 : 0) + (positiveFiling ? 5 : 0));

  return { thesis, supportingEvidence, keyDrivers, upsideScenarios, bullScore };
}

function buildUpsideScenarios(
  facts: FactItem[],
  earnings: { id: string; epsActual: number | null; epsEstimate: number | null }[],
  _ticker: string
): UpsideScenario[] {
  const scenarios: UpsideScenario[] = [];
  const epsGrowth = getNum(facts, "EPS Growth (YoY)");
  const revGrowth = getNum(facts, "Revenue Growth (YoY)");
  const roic = getNum(facts, "ROIC");
  const grossMargin = getNum(facts, "Gross Margin");

  if (epsGrowth != null && epsGrowth >= 15) {
    scenarios.push({
      scenario: `Sustained EPS growth (${epsGrowth}%+) compresses the forward P/E as earnings catch up to the current multiple`,
      condition: `EPS growth ${epsGrowth}% sustains for 2–3 fiscal years — consistent with recent trajectory`,
      probability: epsGrowth >= 25 ? "high" : "medium",
    });
  } else if (revGrowth != null && revGrowth >= 10) {
    scenarios.push({
      scenario: `Revenue momentum (${revGrowth}%) converts to earnings as operating costs scale slower than revenue`,
      condition: `Revenue growth ${revGrowth}% continues and operating margin expands 200–400bps on fixed-cost leverage`,
      probability: revGrowth >= 20 ? "medium" : "low",
    });
  }

  if (grossMargin != null && grossMargin >= 50 && roic != null && roic >= 15) {
    scenarios.push({
      scenario: "Margin expansion unlocks additional operating leverage as product mix improves toward higher-margin lines",
      condition: `Gross margin (${grossMargin}%) expands further — business at scale has structural fixed-cost advantages`,
      probability: "medium",
    });
  }

  const beatCount = earnings.filter(e => e.epsActual != null && e.epsEstimate != null && e.epsActual > e.epsEstimate * 1.03).length;
  if (beatCount >= 2) {
    scenarios.push({
      scenario: "Consistent earnings beats force street models higher, creating a positive estimate revision cycle",
      condition: `${beatCount}/${earnings.length} recent quarters beat estimates — management guidance is systematically conservative`,
      probability: "medium",
    });
  }

  const gapScore = getNum(facts, "Allocation Gap Score");
  if (gapScore != null && gapScore >= 60) {
    scenarios.push({
      scenario: "Closing the allocation gap executes a pre-committed strategic decision at current prices",
      condition: "Allocation plan already specifies this position — deployment is executing an approved decision, not introducing a new bet",
      probability: "high",
    });
  }

  if (scenarios.length === 0) {
    scenarios.push({
      scenario: "Business quality exceeds market pricing if fundamental assumptions are confirmed",
      condition: "Requires FMP fundamental data confirmation — current evidence is limited to universe tier",
      probability: "low",
    });
  }

  return scenarios.slice(0, 3);
}

// ─── 2. Bear Analyst ──────────────────────────────────────────────────────────

function buildBearCase(
  facts: FactItem[],
  interpretations: InterpretationItem[],
  filings: { id: string; filingType: string; filingDate: Date | string; thesisImpacts: { impactLevel: string; reasoning: string }[] }[],
  earnings: { id: string; fiscalPeriod: string | null; epsActual: number | null; epsEstimate: number | null }[],
  investmentThesis: { killCriteria: string } | null,
  ticker: string
): BearCase {
  const negative = interpretations.filter(i => i.direction === "negative");
  const strongNeg = negative.filter(i => i.strength === "strong");
  const moderateNeg = negative.filter(i => i.strength === "moderate");
  const topBear = [...strongNeg.slice(0, 2), ...moderateNeg.slice(0, 1)];

  const thesis =
    topBear.length >= 2
      ? `The investment thesis for ${ticker} faces material challenges. ${topBear[0].claim}. ${topBear.slice(1).map(t => t.claim).join(". ")}. These risks must be explicitly acknowledged before capital is deployed.`
      : topBear.length === 1
        ? `${ticker} carries meaningful downside risk: ${topBear[0].claim}. Additional scrutiny is required before commitment.`
        : `${ticker} shows strong fundamentals but carries execution, valuation, and macro risks inherent to all equities. Premium-quality businesses rarely trade cheaply; multiple compression can occur regardless of business strength.`;

  const seenIds = new Set<string>();
  const contradictingEvidence: EvidenceRef[] = topBear.flatMap(interp =>
    interp.evidenceIds.slice(0, 2).flatMap(id => {
      if (seenIds.has(id)) return [];
      seenIds.add(id);
      const fact = facts.find(f => f.id === id);
      return fact ? [{ id: fact.id, type: "fact" as const, label: fact.metric, value: fact.value }] : [];
    })
  );

  const latestMiss = earnings.find(e => e.epsActual != null && e.epsEstimate != null && e.epsActual < e.epsEstimate * 0.95);
  if (latestMiss) {
    contradictingEvidence.push({
      id: latestMiss.id,
      type: "earnings",
      label: `EPS Miss — ${latestMiss.fiscalPeriod ?? "Recent Quarter"}`,
      value: `$${latestMiss.epsActual!.toFixed(2)} vs est $${latestMiss.epsEstimate!.toFixed(2)}`,
    });
  }

  const redFlags = buildRedFlags(facts, negative, filings, investmentThesis, earnings);
  const failureScenarios = buildFailureScenarios(facts, filings, earnings, investmentThesis, ticker);

  const bearScore = Math.min(100,
    redFlags.filter(r => r.severity === "critical").length * 30 +
    redFlags.filter(r => r.severity === "high").length * 20 +
    redFlags.filter(r => r.severity === "medium").length * 8 +
    strongNeg.length * 10 +
    (latestMiss ? 8 : 0)
  );

  return { thesis, contradictingEvidence, failureScenarios, redFlags, bearScore };
}

function buildRedFlags(
  facts: FactItem[],
  negativeInterps: InterpretationItem[],
  filings: { id: string; filingType: string; filingDate: Date | string; thesisImpacts: { impactLevel: string; reasoning: string }[] }[],
  investmentThesis: { killCriteria: string } | null,
  earnings: { id: string; epsActual: number | null; epsEstimate: number | null }[]
): RedFlag[] {
  const flags: RedFlag[] = [];

  const roic = getNum(facts, "ROIC");
  const roicFact = getFact(facts, "ROIC");
  if (roic != null && roic < 0) {
    flags.push({ flag: `Negative ROIC (${roic}%) — business is destroying shareholder value at current capital allocation`, severity: "critical", evidenceIds: roicFact ? [roicFact.id] : [] });
  } else if (roic != null && roic < 5) {
    flags.push({ flag: `Very low ROIC (${roic}%) — materially below the ~8–10% cost of capital; value destruction risk`, severity: "high", evidenceIds: roicFact ? [roicFact.id] : [] });
  }

  const epsGrowth = getNum(facts, "EPS Growth (YoY)");
  const epsGrowthFact = getFact(facts, "EPS Growth (YoY)");
  if (epsGrowth != null && epsGrowth < -10) {
    flags.push({ flag: `EPS declining sharply (${epsGrowth}% YoY) — earnings deterioration suggests structural or cyclical headwinds`, severity: "high", evidenceIds: epsGrowthFact ? [epsGrowthFact.id] : [] });
  }

  const dte = getNum(facts, "Debt/Equity");
  const dteFact = getFact(facts, "Debt/Equity");
  if (dte != null && dte > 2.0) {
    flags.push({ flag: `High leverage (${dte}x D/E) — above 2x; significant solvency risk in a rate shock or recession scenario`, severity: "high", evidenceIds: dteFact ? [dteFact.id] : [] });
  } else if (dte != null && dte > 1.0) {
    flags.push({ flag: `Elevated leverage (${dte}x D/E) — exceeds the 1.0x quality limit set by the investment framework`, severity: "medium", evidenceIds: dteFact ? [dteFact.id] : [] });
  }

  // Negative interpretations not yet captured
  for (const interp of negativeInterps) {
    if (flags.length >= 5) break;
    const alreadyMapped = flags.some(f => interp.evidenceIds.some(id => f.evidenceIds.includes(id)));
    if (!alreadyMapped) {
      flags.push({ flag: interp.claim, severity: interp.strength === "strong" ? "high" : "medium", evidenceIds: interp.evidenceIds });
    }
  }

  // Filing-based signals — only include the single most recent adverse signal
  const adverseFiling = filings.find(f => {
    const lvl = f.thesisImpacts[0]?.impactLevel;
    return lvl === "kill_criteria_triggered" || lvl === "weakened";
  });
  if (adverseFiling && flags.length < 7) {
    const impact = adverseFiling.thesisImpacts[0];
    const label = impact.impactLevel === "kill_criteria_triggered"
      ? "Filing risk signal"
      : "Thesis weakened";
    flags.push({
      flag: `${label} — ${adverseFiling.filingType} (${new Date(adverseFiling.filingDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}): ${impact.reasoning.slice(0, 120)}`,
      severity: "medium",
      evidenceIds: [adverseFiling.id],
    });
  }

  // Kill criteria from investment thesis record
  if (investmentThesis?.killCriteria && investmentThesis.killCriteria.length > 20) {
    flags.push({
      flag: `Active kill criteria on record: "${investmentThesis.killCriteria.slice(0, 130)}${investmentThesis.killCriteria.length > 130 ? "..." : ""}"`,
      severity: "medium",
      evidenceIds: [],
    });
  }

  // Earnings miss pattern
  const misses = earnings.filter(e => e.epsActual != null && e.epsEstimate != null && e.epsActual < e.epsEstimate * 0.97);
  if (misses.length >= 2) {
    flags.push({
      flag: `${misses.length}/${earnings.length} recent quarters missed EPS estimates — systematic execution risk pattern`,
      severity: "high",
      evidenceIds: misses.map(e => e.id),
    });
  }

  if (flags.length === 0) {
    const oppFact = getFact(facts, "Opportunity Score");
    flags.push({
      flag: "Valuation premium risk — high-quality businesses command premium multiples; multiple compression can occur in risk-off regimes regardless of business strength",
      severity: "medium",
      evidenceIds: oppFact ? [oppFact.id] : [],
    });
  }

  return flags.slice(0, 7);
}

function buildFailureScenarios(
  facts: FactItem[],
  filings: { id: string; filingType: string; filingDate: Date | string; thesisImpacts: { impactLevel: string; reasoning: string }[] }[],
  earnings: { id: string; epsActual: number | null; epsEstimate: number | null }[],
  investmentThesis: { killCriteria: string } | null,
  _ticker: string
): FailureScenario[] {
  const scenarios: FailureScenario[] = [];
  const revGrowth = getNum(facts, "Revenue Growth (YoY)");
  const grossMargin = getNum(facts, "Gross Margin");
  const dte = getNum(facts, "Debt/Equity");

  if (revGrowth != null && revGrowth >= 10) {
    scenarios.push({
      scenario: `Revenue growth decelerates below ${Math.round(revGrowth * 0.4)}%, triggering multiple compression from growth to value multiples`,
      trigger: `Current revenue growth (${revGrowth}%) depends on continued market share gains or TAM expansion — neither is guaranteed`,
      probability: "medium",
    });
  }

  if (grossMargin != null && grossMargin >= 40) {
    scenarios.push({
      scenario: "Competitive pricing pressure erodes gross margins, removing the operating leverage that justifies the current multiple",
      trigger: `Gross margin (${grossMargin}%) compresses as competition intensifies, input costs rise, or product pricing power diminishes`,
      probability: "low",
    });
  }

  if (dte != null && dte > 0.6) {
    scenarios.push({
      scenario: "Interest rate environment increases financing costs, reducing FCF available for reinvestment or shareholder returns",
      trigger: `D/E of ${dte}x creates sensitivity to rate environment — refinancing at higher rates reduces earnings and constrains capital allocation`,
      probability: dte > 1.2 ? "medium" : "low",
    });
  }

  if (investmentThesis?.killCriteria && investmentThesis.killCriteria.length > 20) {
    scenarios.push({
      scenario: "Stated kill criteria are triggered, requiring immediate position exit",
      trigger: investmentThesis.killCriteria.slice(0, 200),
      probability: "low",
    });
  }

  const missCount = earnings.filter(e => e.epsActual != null && e.epsEstimate != null && e.epsActual < e.epsEstimate * 0.95).length;
  if (missCount >= 2) {
    scenarios.push({
      scenario: "Persistent earnings misses erode confidence in management guidance, causing sustained multiple de-rating",
      trigger: `${missCount}/${earnings.length} recent quarters missed EPS estimates — management credibility risk`,
      probability: "medium",
    });
  }

  const killFiling = filings.find(f => f.thesisImpacts[0]?.impactLevel === "kill_criteria_triggered");
  if (killFiling) {
    scenarios.push({
      scenario: "Filing risk signal warrants deeper investigation — rules-based analyzer flagged a potential thesis challenge",
      trigger: `${killFiling.filingType} (${new Date(killFiling.filingDate).toLocaleDateString()}): ${killFiling.thesisImpacts[0].reasoning.slice(0, 100)} (verify manually)`,
      probability: "medium",
    });
  }

  if (scenarios.length === 0) {
    scenarios.push({
      scenario: "Macro-driven multiple compression during risk-off environments",
      trigger: "High-quality, high-multiple stocks experience disproportionate drawdowns when market risk appetite contracts",
      probability: "medium",
    });
  }

  return scenarios.slice(0, 4);
}

// ─── 3. Risk Manager ──────────────────────────────────────────────────────────

function buildRiskAssessment(
  ticker: string,
  sector: string | null,
  positions: { ticker: string; sector: string | null; currentValueUsd: number | null; allocationPct: number | null }[],
  allocationTarget: { targetPct: number; targetUsd: number } | null,
  facts: FactItem[]
): RiskAssessment {
  const totalUsd = positions.reduce((s, p) => s + (p.currentValueUsd ?? 0), 0);
  const sectorPeers = sector
    ? positions.filter(p => p.sector === sector && p.ticker !== ticker)
    : [];
  const sectorValue = sectorPeers.reduce((s, p) => s + (p.currentValueUsd ?? 0), 0);
  const sectorPct = totalUsd > 0 ? (sectorValue / totalUsd) * 100 : 0;
  const correlatedTickers = sectorPeers.map(p => p.ticker);

  const targetPct = allocationTarget?.targetPct ?? 5;
  const projectedSectorPct = sectorPct + targetPct;

  const concentrationLevel: "high" | "medium" | "low" =
    projectedSectorPct > 40 ? "high" : projectedSectorPct > 25 ? "medium" : "low";
  const correlationLevel: "high" | "medium" | "low" =
    correlatedTickers.length >= 3 ? "high" : correlatedTickers.length >= 1 ? "medium" : "low";

  const divScore = getNum(facts, "Diversification Score");
  const diversificationPositive = divScore != null ? divScore >= 50 : sectorPct < 15;

  const maxPct = Math.min(targetPct * 1.5, 15);
  const suggestedPct = Math.round((concentrationLevel === "high" ? targetPct * 0.6 : targetPct) * 10) / 10;
  const starterPct = Math.round(suggestedPct * 0.4 * 10) / 10;

  const portfolioRiskScore = Math.min(100,
    (concentrationLevel === "high" ? 40 : concentrationLevel === "medium" ? 20 : 5) +
    (correlationLevel === "high" ? 25 : correlationLevel === "medium" ? 12 : 0) +
    (targetPct > 10 ? 15 : targetPct > 7 ? 8 : 0) +
    (!diversificationPositive ? 15 : 0) +
    (correlatedTickers.length * 3)
  );

  return {
    portfolioRiskScore: Math.min(100, Math.round(portfolioRiskScore)),
    positionSizeRecommendation: {
      maxPct: Math.round(maxPct * 10) / 10,
      suggestedPct,
      starterPct,
      rationale: concentrationLevel === "high"
        ? `Reduced to ${suggestedPct}% (60% of target) — ${sector ?? "sector"} concentration would reach ${projectedSectorPct.toFixed(1)}% after entry`
        : `Standard allocation: ${suggestedPct}% aligned with the investment plan (target: ${targetPct}%)`,
    },
    concentrationRisk: {
      level: concentrationLevel,
      reasoning: `${sector ?? "Unclassified sector"} currently ${sectorPct.toFixed(1)}% of portfolio. Adding ${targetPct}% for ${ticker} projects sector to ~${projectedSectorPct.toFixed(1)}%.`,
      sectorExposure: `${sectorPct.toFixed(1)}% → ${projectedSectorPct.toFixed(1)}% after ${ticker}`,
    },
    correlationRisk: {
      level: correlationLevel,
      correlatedTickers,
      reasoning: correlatedTickers.length > 0
        ? `Existing ${sector ?? "sector"} holdings: ${correlatedTickers.join(", ")}. These positions tend to move together during sector rotations.`
        : `No existing ${sector ?? "sector"} positions — ${ticker} would be the first in this sector, reducing correlation risk.`,
    },
    diversificationImpact: {
      positive: diversificationPositive,
      reasoning: diversificationPositive
        ? `${ticker} (${sector ?? "diverse sector"}) improves portfolio diversification — sector is currently underrepresented at ${sectorPct.toFixed(1)}%.`
        : `${sector ?? "This sector"} is already well-represented. Adding ${ticker} increases concentration without a clear diversification benefit.`,
    },
  };
}

// ─── 4. Thesis Auditor ────────────────────────────────────────────────────────

function buildThesisAudit(bullCase: BullCase, bearCase: BearCase, facts: FactItem[]): ThesisAudit {
  const unsupportedClaims: ThesisAudit["unsupportedClaims"] = [];
  const missingEvidence: string[] = [];
  const confidenceAdjustments: ThesisAudit["confidenceAdjustments"] = [];

  for (const driver of bullCase.keyDrivers) {
    if (driver.evidenceIds.length === 0) {
      unsupportedClaims.push({ claim: driver.driver, source: "bull", issue: "No fact ID cited — claim cannot be independently verified from the evidence layer" });
    }
  }

  for (const flag of bearCase.redFlags) {
    if (flag.evidenceIds.length === 0 && flag.severity !== "medium") {
      unsupportedClaims.push({ claim: flag.flag, source: "bear", issue: `${flag.severity} severity flag has no evidence reference — severity should be medium until verified` });
    }
  }

  const expectedMetrics = ["ROIC", "Gross Margin", "EPS Growth (YoY)", "Revenue Growth (YoY)", "Debt/Equity", "Free Cash Flow"];
  const presentMetrics = new Set(facts.filter(f => f.numericValue != null).map(f => f.metric));

  for (const metric of expectedMetrics) {
    if (!presentMetrics.has(metric)) {
      missingEvidence.push(`${metric}: not in FMP data — claims referencing this metric are inferred, not measured`);
      confidenceAdjustments.push({ metric, adjustment: -2, reason: `Missing ${metric} — inferences based on this metric carry lower confidence` });
    }
  }

  const hasFundamentals = facts.some(f => f.category === "Fundamentals" && f.numericValue != null);
  if (!hasFundamentals) {
    missingEvidence.push("All fundamental metrics missing — FMP data not yet ingested; financial claims rely on universe tier proxy only");
    confidenceAdjustments.push({ metric: "Fundamentals Coverage", adjustment: -8, reason: "Zero fundamental data — all financial analysis is speculative without FMP ingestion" });
  }

  if (!facts.some(f => ["filing", "Filing"].includes(f.source))) {
    const hasFilingCategory = facts.some(f => f.category === "Research" && f.source !== "Universe");
    if (!hasFilingCategory) {
      missingEvidence.push("No SEC filing evidence — EDGAR data not ingested; regulatory and disclosure risks assessed from defaults only");
      confidenceAdjustments.push({ metric: "Filing Coverage", adjustment: -3, reason: "No SEC filing data — regulatory risks may be under-assessed" });
    }
  }

  const totalClaims = bullCase.keyDrivers.length + bearCase.redFlags.length;
  const supportedCount = totalClaims - unsupportedClaims.length;
  const auditScore = totalClaims > 0 ? Math.round((supportedCount / totalClaims) * 100) : 50;

  const overallVerdict: ThesisAudit["overallVerdict"] =
    auditScore >= 80 && missingEvidence.length <= 2 ? "well-supported" :
    auditScore >= 60 ? "partially-supported" : "evidence-gaps";

  return { auditScore, unsupportedClaims, missingEvidence, confidenceAdjustments, overallVerdict };
}

// ─── 5. Portfolio Manager ─────────────────────────────────────────────────────

function buildFinalDecision(
  bullCase: BullCase,
  bearCase: BearCase,
  riskAssessment: RiskAssessment,
  thesisAudit: ThesisAudit,
  allocationTarget: { targetPct: number; targetUsd: number } | null,
  totalPortfolioUsd: number,
  isInPortfolio: boolean
): FinalDecision {
  const auditPenalty = ((100 - thesisAudit.auditScore) / 100) * 15;
  const riskPenalty = (riskAssessment.portfolioRiskScore / 100) * 10;

  const adjustedBull = Math.max(0, bullCase.bullScore - auditPenalty - riskPenalty);
  const adjustedBear = Math.min(100, bearCase.bearScore + riskPenalty * 0.5);
  const bullScore = Math.round(adjustedBull);
  const bearScore = Math.round(adjustedBear);

  let recommendation: DecisionState;
  let convictionLevel: number;

  if (isInPortfolio) {
    if (bearScore > 60) { recommendation = "Pass"; convictionLevel = 3; }
    else if (bearScore > 40) { recommendation = "Watch"; convictionLevel = 5; }
    else { recommendation = "Hold"; convictionLevel = 6; }
  } else {
    const ratio = adjustedBear > 0 ? adjustedBull / adjustedBear : 99;
    if (adjustedBull >= 75 && adjustedBear < 30 && ratio >= 2.5) {
      recommendation = "Strong Buy";
      convictionLevel = Math.min(10, 8 + Math.round((adjustedBull - 75) / 12));
    } else if (adjustedBull >= 55 && adjustedBear < 45 && ratio >= 1.5) {
      recommendation = "Buy";
      convictionLevel = Math.min(8, Math.round(5 + (adjustedBull - 55) / 15));
    } else if (adjustedBull >= 35 || ratio >= 0.9) {
      recommendation = "Watch";
      convictionLevel = Math.min(5, Math.round(3 + adjustedBull / 50));
    } else {
      recommendation = "Pass";
      convictionLevel = Math.max(1, Math.round(2 - (adjustedBear - 40) / 30));
    }
  }

  convictionLevel = Math.max(1, Math.min(10, convictionLevel));

  const suggestedPct = riskAssessment.positionSizeRecommendation.suggestedPct;
  const suggestedUsd = Math.round((suggestedPct / 100) * totalPortfolioUsd);

  const summaryReasoning = buildSummaryReasoning(recommendation, bullCase, bearCase, riskAssessment, thesisAudit, bullScore, bearScore);

  const keyRisksAcknowledged = bearCase.redFlags.slice(0, 3).map(f => f.flag.length > 90 ? f.flag.slice(0, 90) + "..." : f.flag);

  return {
    recommendation,
    suggestedAllocation: {
      pct: suggestedPct,
      usd: suggestedUsd,
      rationale: riskAssessment.positionSizeRecommendation.rationale,
    },
    convictionLevel,
    bullScore,
    bearScore,
    summaryReasoning,
    keyRisksAcknowledged,
    committeeSplit: {
      bullStrength: bullScore,
      bearStrength: bearScore,
      reasoning: `Bull ${bullScore} vs Bear ${bearScore} after audit adjustment (${thesisAudit.auditScore}% evidence coverage) and risk adjustment (risk score ${riskAssessment.portfolioRiskScore})`,
    },
  };
}

function buildSummaryReasoning(
  rec: DecisionState,
  bullCase: BullCase,
  bearCase: BearCase,
  risk: RiskAssessment,
  audit: ThesisAudit,
  bull: number,
  bear: number
): string {
  const topDriver = bullCase.keyDrivers[0]?.driver ?? "fundamental strength";
  const topRisk = bearCase.redFlags[0]?.flag ?? "valuation risk";
  switch (rec) {
    case "Strong Buy":
      return `Strong Buy — Bull score ${bull} significantly outweighs Bear score ${bear}. Primary driver: ${topDriver.slice(0, 80)}. Risk Manager approves up to ${risk.positionSizeRecommendation.maxPct}% position. Evidence is ${audit.overallVerdict}. Start at ${risk.positionSizeRecommendation.starterPct}%, scale to ${risk.positionSizeRecommendation.suggestedPct}% on confirmation.`;
    case "Buy":
      return `Buy — Evidence favors initiation (Bull ${bull}, Bear ${bear}). Primary driver: ${topDriver.slice(0, 70)}. Key risk to monitor: ${topRisk.slice(0, 60)}. Initiate at ${risk.positionSizeRecommendation.starterPct}% starter and scale to ${risk.positionSizeRecommendation.suggestedPct}% as thesis confirms.`;
    case "Watch":
      return `Watch — Committee signals are balanced (Bull ${bull}, Bear ${bear}). ${audit.overallVerdict === "evidence-gaps" ? "Evidence gaps prevent high-conviction initiation — gather fundamental data first." : "Thesis is interesting but risk/reward is not yet compelling enough to act."}`;
    case "Hold":
      return `Hold — Current position is supported by available evidence (Bull ${bull}, Bear ${bear}). ${topDriver.slice(0, 80)}. No action required unless kill criteria are triggered.`;
    case "Pass":
      return `Pass — Bear score ${bear} outweighs Bull score ${bull}. Primary concern: ${topRisk.slice(0, 80)}. Do not deploy capital until the identified risks are resolved.`;
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function runCommitteeSession(ticker: string): Promise<CommitteeSessionData> {
  const upper = ticker.toUpperCase();
  const { universe, dossier, filings, earnings, investmentThesis, positions, allocationTarget } =
    await loadTickerData(upper);

  // Prefer pre-computed dossier evidence; fall back to building from raw data
  let facts: FactItem[] = dossier ? safe<FactItem[]>(dossier.facts, []) : [];
  let interpretations: InterpretationItem[] = dossier ? safe<InterpretationItem[]>(dossier.interpretation, []) : [];

  if (facts.length === 0 || interpretations.length === 0) {
    const entry = buildMinimalEntry(upper, universe as any, allocationTarget, positions as any[]);
    if (facts.length === 0) facts = collectFacts(entry as any);
    if (interpretations.length === 0) interpretations = generateInterpretations(facts, entry as any);
  }

  const totalPortfolioUsd = positions.reduce((s, p) => s + ((p as any).currentValueUsd ?? 0), 0);
  const isInPortfolio = positions.some(p => p.ticker === upper);

  const bullCase = buildBullCase(facts, interpretations, filings as any[], earnings as any[], upper);
  const bearCase = buildBearCase(facts, interpretations, filings as any[], earnings as any[], investmentThesis, upper);
  const riskAssessment = buildRiskAssessment(upper, universe.sector, positions as any[], allocationTarget, facts);
  const thesisAudit = buildThesisAudit(bullCase, bearCase, facts);
  const finalDecision = buildFinalDecision(bullCase, bearCase, riskAssessment, thesisAudit, allocationTarget, totalPortfolioUsd, isInPortfolio);

  return {
    ticker: upper,
    companyName: universe.companyName,
    sector: universe.sector,
    universeTier: universe.universeTier,
    bullCase,
    bearCase,
    riskAssessment,
    thesisAudit,
    finalDecision,
    conviction: finalDecision.recommendation,
    evidenceCount: facts.length,
  };
}
