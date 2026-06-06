// Research Dossier Engine — generates structured investment research from existing data.
//
// Inputs:  Universe + Fundamentals + OpportunityEngine + Portfolio context + FMP Profile
// Output:  ResearchDossierData with 7 narrative sections + suggested allocation
//
// All generation is rules-based / template-driven; no AI API calls required.

import { db } from "./db";
import { computeOpportunities, type OpportunityEntry } from "./opportunity-engine";
import { fetchCompanyProfile, type FMPProfile } from "./fmp-client";
import {
  collectFacts, generateInterpretations, generateRecommendation, buildEvidenceSummary,
  type FactItem, type InterpretationItem, type RecommendationSection, type EvidenceSummary,
} from "./evidence-engine";
import fs from "fs";
import path from "path";

// ─── Re-export evidence types for API routes ──────────────────────────────────

export type { FactItem, InterpretationItem, RecommendationSection, EvidenceSummary } from "./evidence-engine";

// ─── Exported types ────────────────────────────────────────────────────────────

export interface WhyBuyReason {
  reason: string;
  evidence: string;
  strength: "strong" | "moderate" | "weak";
}

export interface RiskItem {
  risk: string;
  severity: "high" | "medium" | "low";
}

export interface RiskSections {
  businessRisks: RiskItem[];
  financialRisks: RiskItem[];
  portfolioRisks: RiskItem[];
}

export interface PortfolioFit {
  summary: string;
  diversificationImpact: string;
  allocationImpact: string;
  relatedHoldings: string[];
}

export interface ThesisDraft {
  whyOwn: string;
  keyDrivers: string[];
  risks: string[];
  killCriteria: string[];
  confidence: number; // 1–10
  holdingPeriod: string;
}

export interface InvestmentSummary {
  ticker: string;
  companyName: string;
  sector: string | null;
  industry: string | null;
  marketCapM: number | null;
  universeTier: string;
  opportunityScore: number;
  companyScore: number;
  brainAlignmentScore: number;
  inPortfolio: boolean;
  inWatchlist: boolean;
  positionAction: "initiate" | "add" | "hold";
}

export interface BusinessOverview {
  description: string;
  revenueDrivers: string[];
  businessModel: string;
}

export interface ResearchDossierData {
  ticker: string;
  companyName: string;
  generatedAt: string;
  opportunityScore: number;
  companyScore: number;
  investmentSummary: InvestmentSummary;
  businessOverview: BusinessOverview;
  whyBuy: WhyBuyReason[];
  risks: RiskSections;
  portfolioFit: PortfolioFit;
  thesisDraft: ThesisDraft;
  suggestedAllocation: {
    starterPct: number;
    starterUsd: number;
    targetPct: number;
    targetUsd: number;
    maxPct: number;
    maxUsd: number;
  };
  // Evidence layer (Phase 5D.5)
  facts: FactItem[];
  interpretation: InterpretationItem[];
  recommendation: RecommendationSection;
  evidenceSummary: EvidenceSummary;
}

// ─── Sector-specific content ───────────────────────────────────────────────────

const SECTOR_REVENUE_DRIVERS: Record<string, string[]> = {
  "Technology": [
    "Software subscriptions and cloud services (recurring revenue)",
    "Hardware product sales and ecosystem lock-in",
    "Advertising and data monetization",
    "Enterprise solutions and professional services",
  ],
  "Communication Services": [
    "Digital advertising revenue (search, social, video)",
    "Subscription-based streaming and content services",
    "Cloud and enterprise communications",
    "Gaming and virtual platforms",
  ],
  "Consumer Discretionary": [
    "Direct-to-consumer retail and e-commerce",
    "Brand premium and licensing fees",
    "International market expansion",
    "Services and subscription models",
  ],
  "Consumer Staples": [
    "High-volume branded product sales",
    "Pricing power from brand loyalty",
    "Geographic diversification across markets",
    "New product development and portfolio expansion",
  ],
  "Health Care": [
    "Pharmaceutical product sales (patented drugs)",
    "Medical device and equipment revenue",
    "Clinical pipeline and licensing income",
    "Healthcare services and managed care",
  ],
  "Financials": [
    "Transaction processing fees and interchange revenue",
    "Interest income from loans and credit",
    "Asset management and advisory fees",
    "Insurance premiums and underwriting",
  ],
  "Industrials": [
    "Defense contracts and government procurement",
    "Industrial equipment sales and aftermarket services",
    "Infrastructure and engineering projects",
    "Maintenance, repair, and overhaul services",
  ],
  "Energy": [
    "Commodity production and sale (oil, gas, renewables)",
    "Midstream infrastructure and transportation fees",
    "Refining and downstream product margins",
    "Exploration and reserve development",
  ],
  "Materials": [
    "Raw material extraction and processing",
    "Specialty chemical manufacturing",
    "Commodity pricing and volume leverage",
    "End-market diversification across industries",
  ],
  "Real Estate": [
    "Rental income from property portfolio",
    "Property development and sales",
    "Management fees and service income",
    "Cap rate arbitrage and portfolio optimization",
  ],
  "Utilities": [
    "Regulated electricity and gas distribution",
    "Renewable energy generation",
    "Transmission infrastructure fees",
    "Rate-of-return regulation and rate case filings",
  ],
};

const SECTOR_BUSINESS_RISKS: Record<string, RiskItem[]> = {
  "Technology": [
    { risk: "Technology disruption — rapid innovation cycles could obsolete current products or platforms", severity: "medium" },
    { risk: "Regulatory risk — antitrust scrutiny and data privacy regulations increasing globally", severity: "medium" },
    { risk: "Talent competition — high demand for AI/engineering talent drives cost inflation", severity: "low" },
  ],
  "Communication Services": [
    { risk: "Platform regulation — social media and digital advertising under regulatory scrutiny", severity: "high" },
    { risk: "Content moderation risk — reputational and legal exposure from user-generated content", severity: "medium" },
    { risk: "Advertiser concentration — revenue dependent on advertising market cyclicality", severity: "medium" },
  ],
  "Consumer Discretionary": [
    { risk: "Consumer cyclicality — spending contracts sharply in economic downturns", severity: "high" },
    { risk: "Brand erosion risk — consumer preferences can shift quickly toward competing brands", severity: "medium" },
    { risk: "Supply chain concentration — manufacturing dependencies create operational risk", severity: "medium" },
  ],
  "Health Care": [
    { risk: "Drug approval risk — FDA rejection or clinical trial failure can destroy pipeline value", severity: "high" },
    { risk: "Patent cliff — loss of exclusivity exposes key products to generic competition", severity: "high" },
    { risk: "Healthcare pricing pressure — government price controls and payer negotiations compress margins", severity: "medium" },
  ],
  "Financials": [
    { risk: "Credit cycle risk — loan defaults rise during economic downturns", severity: "medium" },
    { risk: "Regulatory capital requirements — Basel/reserve requirements constrain growth", severity: "medium" },
    { risk: "Fintech disruption — digital-native competitors threaten traditional revenue streams", severity: "medium" },
  ],
  "Industrials": [
    { risk: "Government procurement risk — defense budget cycles affect contract awards", severity: "medium" },
    { risk: "Commodity input costs — raw material prices impact margin stability", severity: "medium" },
    { risk: "Geopolitical risk — export controls and defense policy shifts affect demand", severity: "medium" },
  ],
};

function getSectorRisks(sector: string | null): RiskItem[] {
  if (!sector) {
    return [
      { risk: "Market risk — general economic conditions affect business performance", severity: "medium" },
      { risk: "Competitive intensity — market position could erode if superior alternatives emerge", severity: "medium" },
    ];
  }
  const known = SECTOR_BUSINESS_RISKS[sector];
  if (known) return known;
  return [
    { risk: `${sector} sector cyclicality — industry-specific demand cycles affect revenue`, severity: "medium" },
    { risk: "Competitive intensity — market position could erode if superior alternatives emerge", severity: "medium" },
    { risk: "Execution risk — growth initiatives may underdeliver relative to expectations", severity: "low" },
  ];
}

function getBusinessModel(grossMargin: number | null, assetType: string, sector: string | null): string {
  if (assetType === "etf") {
    return "Passive investment vehicle providing diversified market exposure with low-cost management.";
  }
  if (grossMargin == null) {
    return `${sector ?? "Established"} business with diversified revenue streams across core markets.`;
  }
  if (grossMargin >= 70) {
    return "Software/platform business model — extremely high gross margins (~" + Math.round(grossMargin) + "%) reflect near-zero marginal cost of delivery and strong pricing power. Revenue compounds with minimal incremental capital requirements.";
  }
  if (grossMargin >= 50) {
    return "Premium product/service model — " + Math.round(grossMargin) + "% gross margins demonstrate differentiated offerings that command pricing power above commodity competitors.";
  }
  if (grossMargin >= 30) {
    return "Balanced product and services business — " + Math.round(grossMargin) + "% gross margins reflect competitive positioning with growth levers in higher-margin service mix.";
  }
  return "Volume-driven model — competitive pricing balanced with operational scale efficiency and cost discipline.";
}

// ─── Section generators ────────────────────────────────────────────────────────

function generateBusinessOverview(
  entry: OpportunityEntry,
  profile: FMPProfile | null
): BusinessOverview {
  const sectorDrivers = SECTOR_REVENUE_DRIVERS[entry.sector ?? ""] ?? [
    "Core product and service sales in primary markets",
    "Geographic expansion and international revenue",
    "Recurring subscription or contract revenue",
  ];

  const description = profile?.description
    ? profile.description.slice(0, 600).trim()
    : `${entry.companyName} is a ${entry.sector ?? "diversified"} company listed on the investment universe.`;

  const revenueDrivers = sectorDrivers.slice(0, 3);

  const businessModel = getBusinessModel(
    entry.fundamentals?.grossMargin ?? null,
    entry.assetType,
    entry.sector
  );

  return { description, revenueDrivers, businessModel };
}

function generateWhyBuy(entry: OpportunityEntry): WhyBuyReason[] {
  const reasons: WhyBuyReason[] = [];
  const f = entry.fundamentals;

  // 1. ROIC — quality signal
  if (f?.roic != null) {
    if (f.roic >= 30) {
      reasons.push({
        reason: "Exceptional capital allocation efficiency",
        evidence: `${f.roic}% ROIC is top-tier capital efficiency, achievable only with durable competitive advantages. Management consistently compounds shareholder wealth at an above-market rate — a core Buffett/Lynch quality criterion.`,
        strength: "strong",
      });
    } else if (f.roic >= 20) {
      reasons.push({
        reason: "High-quality compounder above hurdle rate",
        evidence: `${f.roic}% ROIC significantly exceeds the 10% quality threshold. Demonstrates strong capital allocation discipline and durable competitive positioning in core markets.`,
        strength: "strong",
      });
    } else if (f.roic >= 10) {
      reasons.push({
        reason: "Quality business earning above cost of capital",
        evidence: `${f.roic}% ROIC clears the Buffett/Lynch quality threshold. Business earns above its cost of capital, creating value for long-term shareholders on every dollar deployed.`,
        strength: "moderate",
      });
    }
  }

  // 2. Allocation gap — capital deployment opportunity
  if (entry.allocationTarget && entry.allocationGapScore >= 60) {
    const gap = entry.allocationTarget.targetUsd - (entry.currentValue?.usd ?? 0);
    const pctFunded = Math.max(0, 100 - entry.allocationGapScore);
    reasons.push({
      reason: "Portfolio alignment — planned capital deployment opportunity",
      evidence: `Currently ${Math.round(pctFunded)}% deployed toward a ${entry.allocationTarget.targetPct}% allocation target. The $${Math.round(gap).toLocaleString()} gap represents a concrete, plan-aligned deployment opportunity — buying the shortfall is the execution of a pre-made investment decision.`,
      strength: entry.allocationGapScore >= 80 ? "strong" : "moderate",
    });
  }

  // 3. Gross margin — pricing power / moat
  if (f?.grossMargin != null && f.grossMargin >= 50) {
    reasons.push({
      reason: "Durable pricing power and competitive moat",
      evidence: `${f.grossMargin}% gross margins demonstrate customers pay premium prices, signaling a defensible competitive position. High-margin businesses are significantly more resilient in economic downturns and compound better over time.`,
      strength: f.grossMargin >= 65 ? "strong" : "moderate",
    });
  }

  // 4. Earnings growth
  if (f?.epsGrowth != null && f.epsGrowth >= 10) {
    reasons.push({
      reason: "Compounding earnings trajectory",
      evidence: `${f.epsGrowth}% EPS growth YoY${f.epsGrowth >= 20 ? " — well above the 15% fast-grower threshold" : " — solid earnings expansion"}. Sustained EPS growth compounding over a 3-5 year horizon creates substantial per-share value, regardless of near-term multiple fluctuations.`,
      strength: f.epsGrowth >= 20 ? "strong" : "moderate",
    });
  } else if (f?.revenueGrowth != null && f.revenueGrowth >= 12) {
    reasons.push({
      reason: "Strong revenue growth trajectory",
      evidence: `${f.revenueGrowth}% revenue growth YoY demonstrates expanding market demand and business momentum. Revenue growth at scale is a leading indicator of future earnings power.`,
      strength: f.revenueGrowth >= 20 ? "strong" : "moderate",
    });
  }

  // 5. Watchlist conviction
  if (entry.inWatchlist) {
    reasons.push({
      reason: "Pre-researched watchlist conviction — ready to deploy",
      evidence: "Already on the investment watchlist, indicating prior research and conviction. Converting watchlist interest into capital deployment is a deliberate, high-signal action that avoids analysis paralysis.",
      strength: "moderate",
    });
  }

  // 6. FCF generation
  if (f?.freeCashFlow != null && f.freeCashFlow > 500) {
    reasons.push({
      reason: "Substantial free cash flow generation",
      evidence: `$${Math.round(f.freeCashFlow).toLocaleString()}M annual free cash flow. FCF-generative businesses self-fund growth, return capital through buybacks/dividends, and navigate economic downturns without dilutive financing.`,
      strength: f.freeCashFlow > 10000 ? "strong" : "moderate",
    });
  }

  // 7. Portfolio diversification
  if (entry.diversificationScore >= 70 && entry.sector && entry.assetType !== "etf") {
    reasons.push({
      reason: "Portfolio diversification — underrepresented sector",
      evidence: `${entry.sector} exposure is limited in the current portfolio. Adding this position reduces single-sector concentration risk and improves overall portfolio resilience across economic cycles.`,
      strength: entry.diversificationScore >= 85 ? "strong" : "moderate",
    });
  }

  // 8. Balance sheet strength
  if (f?.debtToEquity != null && f.debtToEquity < 0.3 && reasons.length < 3) {
    reasons.push({
      reason: "Fortress balance sheet — financial flexibility",
      evidence: `${f.debtToEquity} D/E ratio is well below the 1.0 quality threshold. Low leverage provides financial flexibility to fund growth, make acquisitions, and weather downturns without equity dilution.`,
      strength: "moderate",
    });
  }

  return reasons.slice(0, 5);
}

function generateRisks(entry: OpportunityEntry): RiskSections {
  const businessRisks = getSectorRisks(entry.sector);
  const financialRisks: RiskItem[] = [];
  const portfolioRisks: RiskItem[] = [];
  const f = entry.fundamentals;

  // Financial risks
  if (f?.debtToEquity != null && f.debtToEquity > 1) {
    financialRisks.push({
      risk: `Elevated leverage (${f.debtToEquity} D/E) — above the 1.0 quality threshold. Higher leverage amplifies downside in a downturn.`,
      severity: f.debtToEquity > 2 ? "high" : "medium",
    });
  }
  if (f == null && entry.assetType !== "etf") {
    financialRisks.push({
      risk: "Fundamental data unavailable — quality metrics unverified. Cannot assess ROIC, margins, or growth without data.",
      severity: "medium",
    });
  }
  if (f?.freeCashFlow != null && f.freeCashFlow < 0) {
    financialRisks.push({
      risk: `Negative free cash flow ($${Math.round(f.freeCashFlow).toLocaleString()}M). Business requires external financing for operations — increases dilution risk.`,
      severity: "high",
    });
  }
  if (f?.epsGrowth != null && f.epsGrowth < 0) {
    financialRisks.push({
      risk: `EPS declined ${Math.abs(f.epsGrowth)}% YoY — earnings compression may indicate deteriorating business conditions.`,
      severity: "high",
    });
  }
  if (entry.fundamentals?.grossMargin != null && entry.fundamentals.grossMargin < 20) {
    financialRisks.push({
      risk: `Low gross margins (${entry.fundamentals.grossMargin}%) leave limited room for error — cost pressure or competition could compress earnings significantly.`,
      severity: "medium",
    });
  }
  if (financialRisks.length === 0) {
    financialRisks.push({
      risk: "Valuation risk — quality businesses often trade at premium multiples; a multiple compression event could produce near-term negative returns despite fundamental strength.",
      severity: "low",
    });
  }

  // Portfolio risks
  if (entry.suggestedAllocation.targetPct >= 10) {
    portfolioRisks.push({
      risk: `Large single-position (${entry.suggestedAllocation.targetPct}% target) — concentrated bet; idiosyncratic risk becomes material to overall portfolio returns.`,
      severity: "medium",
    });
  }
  if (entry.universeTier === "tier5") {
    portfolioRisks.push({
      risk: "Currency risk — international company; USD/local-currency fluctuations affect USD-denominated returns directly.",
      severity: "medium",
    });
    portfolioRisks.push({
      risk: "Geopolitical risk — cross-border exposure to trade policy, sanctions, or foreign market disruptions.",
      severity: "medium",
    });
  }
  const existingPortfolioPositions = ["AAPL", "NVDA", "GOOGL", "AMZN", "ITA", "GLDM"]; // static for now
  if (existingPortfolioPositions.includes(entry.ticker)) {
    portfolioRisks.push({
      risk: "Concentration risk — already in portfolio; adding more increases per-ticker risk exposure.",
      severity: "low",
    });
  }
  if (portfolioRisks.length === 0) {
    portfolioRisks.push({
      risk: "Opportunity cost — capital deployed here cannot be deployed elsewhere; ensure this is the best use of available cash.",
      severity: "low",
    });
  }

  return { businessRisks, financialRisks, portfolioRisks };
}

function generatePortfolioFit(
  entry: OpportunityEntry,
  portfolioSectors: string[]
): PortfolioFit {
  const relatedHoldings = portfolioSectors.filter(s => s.split(":")[0] === entry.sector).map(s => s.split(":")[1]);

  let diversificationImpact: string;
  if (entry.assetType === "etf") {
    diversificationImpact = "ETFs provide inherent diversification across many holdings — reduces single-stock concentration.";
  } else if (entry.diversificationScore >= 70) {
    diversificationImpact = `${entry.sector ?? "This"} sector is underrepresented in the current portfolio. Adding ${entry.ticker} meaningfully reduces sector concentration and improves resilience across economic cycles.`;
  } else if (relatedHoldings.length > 0) {
    diversificationImpact = `Portfolio already holds ${relatedHoldings.join(", ")} in ${entry.sector}. Adding ${entry.ticker} increases quality within the sector but concentrates ${entry.sector} exposure further.`;
  } else {
    diversificationImpact = "Neutral-to-positive diversification impact — modest sector overlap with existing holdings.";
  }

  const currentUsd = entry.currentValue?.usd ?? 0;
  const targetUsd = entry.allocationTarget?.targetUsd ?? 0;
  let allocationImpact: string;
  if (entry.allocationTarget && targetUsd > 0) {
    const gap = Math.max(0, targetUsd - currentUsd);
    const pctFunded = Math.min(100, (currentUsd / targetUsd) * 100);
    allocationImpact = `${Math.round(pctFunded)}% of ${entry.allocationTarget.targetPct}% target funded. A starter position of $${entry.suggestedAllocation.starterUsd.toLocaleString()} begins closing the $${Math.round(gap).toLocaleString()} gap; full target requires $${Math.round(gap).toLocaleString()} from available cash ($${Math.round(entry.suggestedAllocation.maxUsd).toLocaleString()} is the hard maximum).`;
  } else {
    allocationImpact = `No existing allocation target. Starter position of ${entry.suggestedAllocation.starterPct}% ($${entry.suggestedAllocation.starterUsd.toLocaleString()}) adds exposure with defined risk; scale to ${entry.suggestedAllocation.targetPct}% if conviction builds.`;
  }

  const qualityFit =
    entry.brainAlignmentScore >= 70
      ? "Strong fit with quality-compounder philosophy — ROIC, margins, and growth meet Buffett/Lynch criteria."
      : entry.brainAlignmentScore >= 50
      ? "Moderate fit — some quality metrics are present but full Brain OS alignment is not achieved."
      : "Weaker fit — does not fully satisfy quality-compounder criteria; consider as a diversifier rather than core conviction.";

  const summary = `${entry.ticker} ${entry.reasoning.positionType === "initiate" ? "initiates" : "adds to"} the portfolio as a ${entry.sector ?? entry.assetType} position. ${qualityFit} Opportunity score of ${entry.opportunityScore}/100 ranks it ${entry.opportunityScore >= 75 ? "highly" : entry.opportunityScore >= 55 ? "moderately" : "lower"} across quality, allocation, and portfolio fit dimensions.`;

  return { summary, diversificationImpact, allocationImpact, relatedHoldings };
}

function generateThesisDraft(entry: OpportunityEntry, whyBuy: WhyBuyReason[], description: string): ThesisDraft {
  const f = entry.fundamentals;

  const metrics: string[] = [];
  if (f?.roic != null) metrics.push(`${f.roic}% ROIC`);
  if (f?.grossMargin != null) metrics.push(`${f.grossMargin}% gross margin`);
  if (f?.epsGrowth != null) metrics.push(`${f.epsGrowth}% EPS growth`);
  if (f?.debtToEquity != null) metrics.push(`${f.debtToEquity} D/E`);
  const metricStr = metrics.length > 0 ? ` — backed by ${metrics.join(", ")}` : "";

  const whyOwn = [
    `${entry.companyName} is a ${entry.sector ?? "quality"} business scoring ${entry.companyScore}/100 on the company ranking model${metricStr}.`,
    entry.allocationTarget
      ? ` It holds a ${entry.allocationTarget.targetPct}% allocation target in the investment plan, with ${Math.round(100 - entry.allocationGapScore)}% of capital currently deployed toward that goal.`
      : ` No allocation target set — initiate at conviction-appropriate sizing.`,
    entry.inWatchlist
      ? " Pre-researched watchlist entry — research conviction already established."
      : "",
    entry.brainAlignmentScore >= 70
      ? " Meets Buffett/Lynch quality-compounder criteria for ROIC, margins, and growth."
      : "",
  ].filter(Boolean).join("");

  const keyDrivers = whyBuy.map(r => r.reason);
  if (keyDrivers.length === 0) keyDrivers.push("Business quality and long-term compounding potential");

  const risks = [
    entry.sector ? `${entry.sector} sector-specific headwinds` : "Market and competitive risks",
    f?.debtToEquity != null && f.debtToEquity > 1
      ? `Leverage (${f.debtToEquity} D/E) above quality threshold`
      : "Valuation multiple compression in risk-off environments",
    "Execution risk on stated growth initiatives",
  ];

  const killCriteria = [
    "ROIC drops below 10% for two consecutive reporting periods",
    "Debt/Equity ratio exceeds 1.5 without a clear, credible deleveraging plan",
    "Revenue growth turns negative for two consecutive years without structural explanation",
    "Management integrity breach or fraudulent accounting",
    "Core thesis-invalidating competitive disruption confirmed",
  ];

  if (entry.universeTier === "tier5") {
    killCriteria.push("Geopolitical escalation that directly impairs operations or creates USD conversion restriction");
  }

  // Confidence: based on brain alignment score mapped to 1–10
  const confidence = Math.max(5, Math.min(9, Math.round(5 + (entry.brainAlignmentScore / 100) * 4)));

  return {
    whyOwn,
    keyDrivers,
    risks,
    killCriteria,
    confidence,
    holdingPeriod: "3–5 years",
  };
}

// ─── Main engine entry point ──────────────────────────────────────────────────

export async function generateDossier(ticker: string, apiKey: string): Promise<ResearchDossierData> {
  // 1. Get opportunity data for this ticker
  const oppResult = await computeOpportunities();
  const entry = oppResult.entries.find(e => e.ticker === ticker);
  if (!entry) {
    throw new Error(`Ticker ${ticker} not found in active universe`);
  }

  // 2. Fetch company profile from FMP (best-effort — fallback gracefully)
  const profile = apiKey ? await fetchCompanyProfile(ticker, apiKey) : null;

  // 3. Build portfolio sector context for diversification narrative
  const positions = await db.position.findMany({ where: { status: "active" } });
  const portfolioSectors = positions
    .filter(p => p.ticker !== "CASH" && p.sector)
    .map(p => `${p.sector}:${p.ticker}`);

  // 4. Generate all sections
  const businessOverview = generateBusinessOverview(entry, profile);
  const whyBuy = generateWhyBuy(entry);
  const risks = generateRisks(entry);
  const portfolioFit = generatePortfolioFit(entry, portfolioSectors);
  const thesisDraft = generateThesisDraft(entry, whyBuy, businessOverview.description);

  const investmentSummary: InvestmentSummary = {
    ticker: entry.ticker,
    companyName: entry.companyName,
    sector: profile?.sector ?? entry.sector,
    industry: profile?.industry ?? null,
    marketCapM: profile?.mktCap != null ? Math.round(profile.mktCap / 1_000_000) : null,
    universeTier: entry.universeTier,
    opportunityScore: entry.opportunityScore,
    companyScore: entry.companyScore,
    brainAlignmentScore: entry.brainAlignmentScore,
    inPortfolio: entry.inPortfolio,
    inWatchlist: entry.inWatchlist,
    positionAction: entry.reasoning.positionType,
  };

  // 5. Build evidence layer
  const facts = collectFacts(entry);
  const interpretation = generateInterpretations(facts, entry);
  const recommendation = generateRecommendation(facts, interpretation, entry);
  const evidenceSummary = buildEvidenceSummary(facts, interpretation, entry);

  return {
    ticker: entry.ticker,
    companyName: entry.companyName,
    generatedAt: new Date().toISOString(),
    opportunityScore: entry.opportunityScore,
    companyScore: entry.companyScore,
    investmentSummary,
    businessOverview,
    whyBuy,
    risks,
    portfolioFit,
    thesisDraft,
    suggestedAllocation: entry.suggestedAllocation,
    facts,
    interpretation,
    recommendation,
    evidenceSummary,
  };
}

export async function saveDossier(data: ResearchDossierData): Promise<void> {
  const evidenceFields = {
    facts: JSON.stringify(data.facts ?? []),
    interpretation: JSON.stringify(data.interpretation ?? []),
    recommendation: JSON.stringify(data.recommendation ?? {}),
    evidenceSummary: JSON.stringify(data.evidenceSummary ?? {}),
  };

  await db.researchDossier.upsert({
    where: { ticker: data.ticker },
    update: {
      companyName: data.companyName,
      opportunityScore: data.opportunityScore,
      companyScore: data.companyScore,
      investmentSummary: JSON.stringify(data.investmentSummary),
      businessOverview: JSON.stringify(data.businessOverview),
      whyBuy: JSON.stringify(data.whyBuy),
      risks: JSON.stringify(data.risks),
      portfolioFit: JSON.stringify(data.portfolioFit),
      thesisDraft: JSON.stringify(data.thesisDraft),
      suggestedAllocation: JSON.stringify(data.suggestedAllocation),
      generatedAt: new Date(),
      ...evidenceFields,
    },
    create: {
      ticker: data.ticker,
      companyName: data.companyName,
      opportunityScore: data.opportunityScore,
      companyScore: data.companyScore,
      investmentSummary: JSON.stringify(data.investmentSummary),
      businessOverview: JSON.stringify(data.businessOverview),
      whyBuy: JSON.stringify(data.whyBuy),
      risks: JSON.stringify(data.risks),
      portfolioFit: JSON.stringify(data.portfolioFit),
      thesisDraft: JSON.stringify(data.thesisDraft),
      suggestedAllocation: JSON.stringify(data.suggestedAllocation),
      ...evidenceFields,
    },
  });

  // Persist evidence facts to the normalized Evidence table for queryability
  if (data.facts && data.facts.length > 0) {
    await db.evidence.createMany({
      data: data.facts.map(f => ({
        ticker: data.ticker,
        factId: f.id,
        category: f.category,
        metric: f.metric,
        value: f.value,
        numericValue: f.numericValue,
        unit: f.unit,
        source: f.source,
        sourceDate: f.sourceDate,
        confidence: f.confidence,
      })),
    });
  }
}

export function parseDossierRow(row: {
  id: string; ticker: string; companyName: string; opportunityScore: number; companyScore: number;
  investmentSummary: string; businessOverview: string; whyBuy: string;
  risks: string; portfolioFit: string; thesisDraft: string; suggestedAllocation: string;
  facts?: string; interpretation?: string; recommendation?: string; evidenceSummary?: string;
  generatedAt: Date;
}): ResearchDossierData {
  return {
    ticker: row.ticker,
    companyName: row.companyName,
    generatedAt: row.generatedAt.toISOString(),
    opportunityScore: row.opportunityScore,
    companyScore: row.companyScore,
    investmentSummary: JSON.parse(row.investmentSummary),
    businessOverview: JSON.parse(row.businessOverview),
    whyBuy: JSON.parse(row.whyBuy),
    risks: JSON.parse(row.risks),
    portfolioFit: JSON.parse(row.portfolioFit),
    thesisDraft: JSON.parse(row.thesisDraft),
    suggestedAllocation: JSON.parse(row.suggestedAllocation),
    facts: JSON.parse(row.facts ?? "[]"),
    interpretation: JSON.parse(row.interpretation ?? "[]"),
    recommendation: JSON.parse(row.recommendation ?? "{}"),
    evidenceSummary: JSON.parse(row.evidenceSummary ?? "{}"),
  };
}

// ─── Brain OS Export ──────────────────────────────────────────────────────────

const BRAIN_OS_ROOT = "G:\\คอมพิวเตอร์เครื่องอื่นๆ\\คอมพิวเตอร์ของฉัน\\Shared\\Brain OS";
const RESEARCH_EXPORT_DIR = path.join(BRAIN_OS_ROOT, "07 Investment", "Investment OS", "Research");

function dossiersToMarkdown(data: ResearchDossierData): string {
  const fmtPct = (n: number) => `${n.toFixed(1)}%`;
  const fmtUsd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  const { investmentSummary: is, businessOverview: bo, whyBuy, risks, portfolioFit: pf, thesisDraft: td, suggestedAllocation: sa } = data;
  const tierLabel = { tier1: "Large Cap", tier2: "Mid Cap", tier3: "Small Cap", tier4: "ETF", tier5: "International" }[is.universeTier] ?? is.universeTier;

  const strengthIcon = (s: "strong" | "moderate" | "weak") => s === "strong" ? "🟢" : s === "moderate" ? "🟡" : "🔴";
  const sevIcon = (s: "high" | "medium" | "low") => s === "high" ? "🔴" : s === "medium" ? "🟡" : "🟢";

  const ev = data.evidenceSummary;
  const factById = new Map((data.facts ?? []).map(f => [f.id, f]));
  const getMetrics = (ids: string[]) => ids.map(id => factById.get(id)?.metric).filter(Boolean).join(", ");

  const dirSymbol = (d: string) => d === "positive" ? "+" : d === "negative" ? "−" : "○";

  return `---
ticker: ${data.ticker}
company: "${data.companyName}"
sector: ${is.sector ?? "Unknown"}
tier: ${tierLabel}
opportunity_score: ${data.opportunityScore}
company_score: ${data.companyScore}
confidence: ${data.recommendation?.confidence ?? td.confidence}/10
generated: ${data.generatedAt.slice(0, 10)}
tags: [research, ${is.sector?.toLowerCase().replace(/\s+/g, "-") ?? "equity"}, ${is.inWatchlist ? "watchlist" : "universe"}]
---

# ${data.ticker} — Research Dossier

> **Opportunity Score: ${data.opportunityScore}/100** | Company Score: ${data.companyScore}/100 | Confidence: ${data.recommendation?.confidence ?? td.confidence}/10

## Investment Summary

| Field | Value |
|---|---|
| Ticker | ${data.ticker} |
| Company | ${data.companyName} |
| Sector | ${is.sector ?? "—"} |
| Industry | ${is.industry ?? "—"} |
| Tier | ${tierLabel} |
| Market Cap | ${is.marketCapM != null ? fmtUsd(is.marketCapM) + "M" : "—"} |
| Opportunity Score | **${data.opportunityScore}/100** |
| Company Score | ${data.companyScore}/100 |
| Brain OS Alignment | ${is.brainAlignmentScore}/100 |
| In Portfolio | ${is.inPortfolio ? "Yes" : "No"} |
| On Watchlist | ${is.inWatchlist ? "Yes" : "No"} |
| Action | **${data.recommendation?.positionAction ?? is.positionAction}** |

## Facts (${ev?.evidenceCount ?? 0} total — ${ev?.highConfidenceCount ?? 0} high confidence)

${(data.facts ?? []).filter(f => f.category === "Fundamentals").map(f => `- **${f.metric}:** ${f.value} _(${f.source})_`).join("\n") || "_No fundamental data available_"}

### Portfolio Context
${(data.facts ?? []).filter(f => f.category === "Portfolio" && f.numericValue != null).map(f => `- **${f.metric}:** ${f.value}`).join("\n") || "_No portfolio data_"}

### Brain OS Criteria
${(data.facts ?? []).filter(f => f.category === "BrainContext").map(f => `- **${f.metric}:** ${f.value}`).join("\n")}

## Interpretation

${(data.interpretation ?? []).map(i => `### ${dirSymbol(i.direction)} ${i.claim}\n\n${i.context}\n\n_Evidence: ${getMetrics(i.evidenceIds) || "—"}_`).join("\n\n")}

## Recommendation

**Action: ${data.recommendation?.positionAction?.toUpperCase() ?? "HOLD"} — Confidence ${data.recommendation?.confidence ?? td.confidence}/10**

${data.recommendation?.summary ?? ""}

### Why Buy
${(data.recommendation?.whyBuy ?? []).map((r, i) => `${i + 1}. ${r.reason}\n   _Evidence: ${getMetrics(r.evidenceIds) || "—"}_`).join("\n")}

### Risk Factors
${(data.recommendation?.whyNotBuy ?? []).map((r, i) => `${i + 1}. ${r.reason}\n   _Evidence: ${getMetrics(r.evidenceIds) || "—"}_`).join("\n")}

### Suggested Position Size

| Position | % | USD |
|---|---|---|
| Starter | ${fmtPct(sa.starterPct)} | ${fmtUsd(sa.starterUsd)} |
| Target | ${fmtPct(sa.targetPct)} | ${fmtUsd(sa.targetUsd)} |
| Maximum | ${fmtPct(sa.maxPct)} | ${fmtUsd(sa.maxUsd)} |

## Legacy Narrative Sections

### Business Overview
${bo.description}

**Revenue Drivers:**
${bo.revenueDrivers.map(d => `- ${d}`).join("\n")}

### Thesis Draft
${td.whyOwn}

**Kill Criteria:**
${td.killCriteria.map(k => `- [ ] ${k}`).join("\n")}

---
*Generated by Investment OS on ${data.generatedAt.slice(0, 10)} · ${ev?.evidenceCount ?? 0} facts · ${ev?.missingMetrics?.length ?? 0} missing metrics*
`;
}

export function exportDossierToBrainOS(data: ResearchDossierData): { success: boolean; path: string; error?: string } {
  try {
    if (!fs.existsSync(BRAIN_OS_ROOT)) {
      return { success: false, path: RESEARCH_EXPORT_DIR, error: "Brain OS vault not accessible at " + BRAIN_OS_ROOT };
    }
    fs.mkdirSync(RESEARCH_EXPORT_DIR, { recursive: true });
    const filePath = path.join(RESEARCH_EXPORT_DIR, `${data.ticker}.md`);
    fs.writeFileSync(filePath, dossiersToMarkdown(data), "utf-8");
    return { success: true, path: filePath };
  } catch (e) {
    return { success: false, path: RESEARCH_EXPORT_DIR, error: e instanceof Error ? e.message : String(e) };
  }
}
