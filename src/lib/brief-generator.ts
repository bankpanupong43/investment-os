// BriefGenerator — Phase 12A / 12A.1: Daily CIO Brief + Quality Layer
//
// Builds a full 8-section CIO brief from MorningBriefData plus:
//   - Evidence & confidence tags on every major statement
//   - Portfolio impact scores (0–5) on macro topics, geo risks, radar
//   - Noise reduction (filters impact-0 items, deduplication)
//   - Decision Board (Act Now / Monitor / Ignore)
//   - Quality Metrics (read time, evidence coverage, confidence breakdown)

import { db } from "./db";
import type { MorningBriefData } from "./morning-brief-engine";

// ─── Sector sets for impact scoring ──────────────────────────────────────────

const TECH_GROWTH = new Set(["NVDA", "GOOG", "GOOGL", "MSFT", "META", "AMZN", "AMD"]);
const SEMIS       = new Set(["NVDA", "TSM", "AMD", "ASML", "SMCI"]);
const DEFENSE     = new Set(["ITA", "LMT", "RTX", "NOC", "GD"]);
const GOLD_SET    = new Set(["GLDM", "GLD", "IAU", "GDX"]);
const CHINA_TAIWAN = new Set(["TSM", "NVDA", "AAPL", "AMZN", "GOOG", "GOOGL", "META"]);
const MID_EAST    = new Set(["ITA", "LMT", "RTX", "NOC"]);

// ─── Evidence & confidence types ──────────────────────────────────────────────

export type Confidence = "High" | "Medium" | "Low";

export interface EvidenceTag {
  confidence: Confidence;
  evidenceCount: number;
  sources: string[];
}

// ─── Enriched section types ───────────────────────────────────────────────────

export interface EnrichedMacroTopic {
  topic: string;
  signal: "positive" | "neutral" | "negative";
  insight: string;
  value?: string;
  source?: string;
  timestamp?: string;
  impactScore: number;   // 0–5
  evidence: EvidenceTag;
}

export interface EnrichedGeoRisk {
  region: string;
  level: "high" | "medium" | "low";
  portfolioExposure: string;
  insight: string;
  latestEvent?: string;
  eventSource?: string;
  eventDate?: string;
  impactScore: number;   // 0–5
  evidence: EvidenceTag;
  filtered: boolean;     // true = noise-removed (impact ≤ 1)
}

export interface EnrichedThesisStatus {
  ticker: string;
  name: string;
  status: "strengthened" | "unchanged" | "weakened";
  evidence: string;
  impactScore: number;
  evidenceTag: EvidenceTag;
}

export interface EnrichedRadarEntry {
  ticker: string;
  score: number;
  whyNow: string;
  keyRisk: string;
  impactScore: number;
  evidence: EvidenceTag;
}

// ─── Decision Board ────────────────────────────────────────────────────────────

export interface DecisionItem {
  item: string;
  reason: string;
  ticker?: string | null;
  impactScore?: number;
}

export interface DecisionBoard {
  actNow: DecisionItem[];
  monitor: DecisionItem[];
  ignoreCount: number;
}

// ─── Quality Metrics ──────────────────────────────────────────────────────────

export interface SectionReadTime {
  section: string;
  minutes: number;
}

export interface BriefQualityMetrics {
  estimatedReadTimeMin: number;
  readTimePerSection: SectionReadTime[];
  evidenceCoveragePercent: number;
  highConfidenceCount: number;
  mediumConfidenceCount: number;
  lowConfidenceCount: number;
  portfolioRelevantEvents: number;
  noiseRemovedCount: number;
  externalSourcesCount: number;
  internalSourcesCount: number;
  autoSummarized: boolean;
}

// ─── Allocation types ─────────────────────────────────────────────────────────

export interface BucketAllocation {
  bucket: string;
  currentPct: number;
  targetPct: number;
  drift: number;
}

// ─── CIO Brief Document ───────────────────────────────────────────────────────

export interface CIOBriefDocument {
  date: string;
  generatedAt: string;

  // Section 1 — Executive Summary
  executiveSummary: string[];

  // Section 2 — Market Regime
  marketRegime: string;
  marketRegimeEvidence: string[];
  marketMetrics: { label: string; value: string; signal: string }[];
  assetClassImpact: { asset: string; impact: string; detail: string }[];

  // Section 3 — Macro & Geopolitics (enriched)
  macroTopics: EnrichedMacroTopic[];
  macroStance: string;
  geoRisks: EnrichedGeoRisk[];     // includes filtered items; filter on filtered===false for display
  geoStance: string;

  // Section 4 — Portfolio Health
  portfolioHealth: {
    buckets: BucketAllocation[];
    cashUsd: number;
    totalCapitalUsd: number;
    totalDeployedPct: number;
    summary: string;
  };

  // Section 5 — Watchlist & Opportunity Radar (enriched)
  highConviction: EnrichedRadarEntry[];
  disagreement: EnrichedRadarEntry[];
  emerging: EnrichedRadarEntry[];

  // Section 6 — Thesis Monitoring (enriched)
  thesisMonitoring: EnrichedThesisStatus[];

  // Section 7 — Today's Actions
  todaysActions: Array<{
    priority: number;
    action: string;
    reason: string;
    urgency: string;
    ticker: string | null;
  }>;

  // Section 8 — Sources
  sources: string[];

  // Quality Layer
  decisionBoard: DecisionBoard;
  qualityMetrics: BriefQualityMetrics;

  // Discovery Radar (Phase 12B — optional, populated when candidates exist)
  discoveryRadar?: {
    tierA: Array<{
      ticker: string;
      companyName: string;
      discoveryCategory: string;
      radarScore: number;
      discoveryReason: string;
      themes: string[];
    }>;
    topThemes: string[];
    portfolioGapCount: number;
    totalCandidates: number;
  };
}

// ─── Main builder ─────────────────────────────────────────────────────────────

export async function buildCIOBrief(briefData: MorningBriefData): Promise<CIOBriefDocument> {
  const since30d = new Date(Date.now() - 30 * 86400 * 1000);

  const [
    portfolioSettings,
    allocationTargets,
    positions,
    opportunityScores,
    committeeHistory,
    thesisImpacts,
    activeTheses,
    universeEntries,
  ] = await Promise.all([
    db.portfolioSettings.findFirst(),
    db.allocationTarget.findMany({ orderBy: { priority: "asc" } }),
    db.position.findMany({
      where: { status: "active" },
      select: { ticker: true, name: true, currentValueUsd: true },
    }),
    db.opportunityScore.findMany({
      orderBy: { opportunityScore: "desc" },
      take: 30,
      select: { ticker: true, opportunityScore: true, reasoning: true },
    }),
    db.committeeSession.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { ticker: true, conviction: true },
    }),
    db.thesisImpactRecord.findMany({
      where: { createdAt: { gte: since30d } },
      orderBy: { createdAt: "desc" },
      select: { ticker: true, impactLevel: true, reasoning: true },
    }),
    db.investmentThesis.findMany({
      where: { status: "active" },
      select: { ticker: true, title: true, confidenceScore: true },
    }),
    db.universe.findMany({
      where: { status: "active", universeTier: { in: ["tier1", "tier2"] } },
      select: { ticker: true },
      take: 50,
    }),
  ]);

  const positionTickers = new Set(
    positions.filter(p => p.ticker !== "CASH").map(p => p.ticker)
  );
  const latestCommittee = committeeHistory.reduce((acc, s) => {
    if (!acc.has(s.ticker)) acc.set(s.ticker, s.conviction);
    return acc;
  }, new Map<string, string>());

  // ── Build enriched sections ───────────────────────────────────────────────
  const portfolioHealth = buildPortfolioHealth(portfolioSettings, allocationTargets, positions);
  const macroTopics = enrichMacroTopics(briefData.macroSummary.topics, positionTickers);
  const geoRisks    = enrichGeoRisks(briefData.geopoliticalSummary.risks, positionTickers);
  const { highConviction, disagreement, emerging } = buildWatchlistRadar(
    opportunityScores, positionTickers, latestCommittee, universeEntries.map(u => u.ticker),
  );
  const thesisMonitoring = buildThesisMonitoring(positions, thesisImpacts, activeTheses, positionTickers);
  const marketMetrics    = buildMarketMetrics(briefData);
  const assetClassImpact = buildAssetClassImpact(briefData.marketRegime, briefData.macroSummary);
  const sources          = buildSources(briefData);

  // Noise counts
  const noiseRemovedCount = geoRisks.filter(r => r.filtered).length;

  // ── Apply auto-summarize if read time > 15 min ────────────────────────────
  let hc = highConviction, dis = disagreement, emg = emerging;
  let autoSummarized = false;
  const preRt = estimateReadTime(
    [], macroTopics, geoRisks.filter(r => !r.filtered),
    portfolioHealth.buckets, hc, dis, emg, thesisMonitoring,
    briefData.recommendedActions.slice(0, 3),
  );
  if (preRt.total > 15) {
    hc  = hc.slice(0, 2);
    dis = dis.slice(0, 2);
    emg = emg.slice(0, 2);
    autoSummarized = true;
  }

  const executiveSummary = buildExecutiveSummary(
    briefData, portfolioHealth, thesisMonitoring, geoRisks,
  );

  const rtResult = estimateReadTime(
    executiveSummary, macroTopics, geoRisks.filter(r => !r.filtered),
    portfolioHealth.buckets, hc, dis, emg, thesisMonitoring,
    briefData.recommendedActions.slice(0, 3),
  );

  // ── Quality metrics ───────────────────────────────────────────────────────
  const allEvidence: EvidenceTag[] = [
    ...macroTopics.map(t => t.evidence),
    ...geoRisks.filter(r => !r.filtered).map(r => r.evidence),
    ...thesisMonitoring.map(t => t.evidenceTag),
    ...hc.map(e => e.evidence),
    ...dis.map(e => e.evidence),
    ...emg.map(e => e.evidence),
  ];
  const highC   = allEvidence.filter(e => e.confidence === "High").length;
  const medC    = allEvidence.filter(e => e.confidence === "Medium").length;
  const lowC    = allEvidence.filter(e => e.confidence === "Low").length;
  const covered = allEvidence.filter(e => e.confidence !== "Low").length;
  const evidenceCoverage = allEvidence.length > 0
    ? Math.round((covered / allEvidence.length) * 100)
    : 0;

  const portfolioRelevantEvents = [
    ...macroTopics.filter(t => t.impactScore >= 3),
    ...geoRisks.filter(r => !r.filtered && r.impactScore >= 3),
  ].length;

  const externalSrc = new Set(
    [...(briefData.dataSources?.macro ?? []), ...(briefData.dataSources?.market ?? []), ...(briefData.dataSources?.geo ?? [])],
  ).size;
  const internalSrc = (briefData.dataSources?.portfolio ?? []).length;

  const qualityMetrics: BriefQualityMetrics = {
    estimatedReadTimeMin: Math.round(rtResult.total * 10) / 10,
    readTimePerSection: rtResult.sections,
    evidenceCoveragePercent: evidenceCoverage,
    highConfidenceCount: highC,
    mediumConfidenceCount: medC,
    lowConfidenceCount: lowC,
    portfolioRelevantEvents,
    noiseRemovedCount,
    externalSourcesCount: externalSrc,
    internalSourcesCount: internalSrc,
    autoSummarized,
  };

  // ── Decision board ────────────────────────────────────────────────────────
  const decisionBoard = buildDecisionBoard(
    briefData.recommendedActions.slice(0, 3),
    geoRisks,
    thesisMonitoring,
    macroTopics,
  );

  // ── Discovery Radar (Phase 12B) ───────────────────────────────────────────
  const discoveryRadar = await buildBriefDiscoverySection();

  const today = new Date();
  return {
    date: today.toISOString().split("T")[0],
    generatedAt: today.toISOString(),
    executiveSummary,
    marketRegime: briefData.marketRegime,
    marketRegimeEvidence: briefData.marketRegimeEvidence,
    marketMetrics,
    assetClassImpact,
    macroTopics,
    macroStance: briefData.macroSummary.overallStance,
    geoRisks,
    geoStance: briefData.geopoliticalSummary.overallStance,
    portfolioHealth,
    highConviction: hc,
    disagreement: dis,
    emerging: emg,
    thesisMonitoring,
    todaysActions: briefData.recommendedActions.slice(0, 3),
    sources,
    decisionBoard,
    qualityMetrics,
    discoveryRadar,
  };
}

// ─── Discovery Radar brief section ────────────────────────────────────────────

async function buildBriefDiscoverySection(): Promise<CIOBriefDocument["discoveryRadar"]> {
  try {
    const { buildDiscoveryRadarResult } = await import("./discovery-radar");
    const result = await buildDiscoveryRadarResult();

    if (result.tierA.length === 0 && result.tierB.length === 0) return undefined;

    const tierA = result.tierA.slice(0, 5).map(c => ({
      ticker: c.ticker,
      companyName: c.companyName,
      discoveryCategory: c.discoveryCategory,
      radarScore: Math.round(c.radarScore),
      discoveryReason: c.discoveryReason,
      themes: c.themes.slice(0, 3),
    }));

    const topThemes = result.themes.slice(0, 3).map(t => t.theme);

    return {
      tierA,
      topThemes,
      portfolioGapCount: result.portfolioGaps.length,
      totalCandidates: result.summary.totalCandidates,
    };
  } catch {
    return undefined;
  }
}

// ─── Enrichment: Macro Topics ─────────────────────────────────────────────────

function enrichMacroTopics(
  topics: MorningBriefData["macroSummary"]["topics"],
  positionTickers: Set<string>,
): EnrichedMacroTopic[] {
  return topics.map(t => ({
    topic: t.topic,
    signal: t.signal,
    insight: t.insight,
    value: t.value,
    source: t.source,
    timestamp: t.timestamp,
    impactScore: scoreMacroImpact(t.topic, positionTickers),
    evidence: macroEvidence(t),
  }));
}

function scoreMacroImpact(topic: string, tickers: Set<string>): number {
  const hasTech    = overlap(TECH_GROWTH, tickers);
  const hasGold    = overlap(GOLD_SET, tickers);
  const hasDefense = overlap(DEFENSE, tickers);
  switch (topic) {
    case "Inflation":         return hasTech ? 4 : 2;
    case "Interest Rates":    return hasTech ? 4 : hasGold ? 3 : 2;
    case "Treasury Yields":   return hasGold ? 4 : hasTech ? 3 : 2;
    case "Employment & Growth": return hasTech ? 3 : hasDefense ? 2 : 2;
    default:                  return 2;
  }
}

function macroEvidence(t: { value?: string; source?: string }): EvidenceTag {
  if (t.value && t.source) {
    return { confidence: "High", evidenceCount: 1, sources: [t.source] };
  }
  if (t.source) {
    return { confidence: "Medium", evidenceCount: 1, sources: [t.source] };
  }
  return { confidence: "Low", evidenceCount: 0, sources: [] };
}

// ─── Enrichment: Geo Risks ────────────────────────────────────────────────────

function enrichGeoRisks(
  risks: MorningBriefData["geopoliticalSummary"]["risks"],
  positionTickers: Set<string>,
): EnrichedGeoRisk[] {
  return risks.map(r => {
    const impactScore = scoreGeoImpact(r.region, positionTickers);
    return {
      region: r.region,
      level: r.level,
      portfolioExposure: r.portfolioExposure,
      insight: r.insight,
      latestEvent: r.latestEvent,
      eventSource: r.eventSource,
      eventDate: r.eventDate,
      impactScore,
      evidence: geoEvidence(r),
      filtered: impactScore <= 1,
    };
  });
}

function scoreGeoImpact(region: string, tickers: Set<string>): number {
  const hasSemis   = overlap(SEMIS, tickers);
  const hasCT      = overlap(CHINA_TAIWAN, tickers);
  const hasDefense = overlap(DEFENSE, tickers);
  switch (region) {
    case "China/Taiwan":
      return hasSemis ? 5 : hasCT ? 4 : 2;
    case "Middle East":
      return hasDefense ? 4 : 2;
    case "Russia/Ukraine":
      return hasDefense ? 3 : 2;
    default:
      return 2;
  }
}

function geoEvidence(r: { latestEvent?: string; eventSource?: string }): EvidenceTag {
  if (r.latestEvent && r.eventSource) {
    return { confidence: "Medium", evidenceCount: 1, sources: [r.eventSource] };
  }
  if (r.latestEvent) {
    return { confidence: "Medium", evidenceCount: 1, sources: ["News"] };
  }
  return { confidence: "Low", evidenceCount: 0, sources: [] };
}

// ─── Section 4: Portfolio Health ──────────────────────────────────────────────

function buildPortfolioHealth(
  settings: { totalCapitalUsd: number } | null,
  targets: { ticker: string; bucket: string; targetPct: number }[],
  positions: { ticker: string; currentValueUsd: number | null }[],
): CIOBriefDocument["portfolioHealth"] {
  const totalCapitalUsd = settings?.totalCapitalUsd ?? 0;
  const posMap = new Map(positions.map(p => [p.ticker, p.currentValueUsd ?? 0]));

  const bucketMap = new Map<string, { target: number; current: number }>();
  for (const t of targets) {
    const existing = bucketMap.get(t.bucket) ?? { target: 0, current: 0 };
    existing.target += t.targetPct;
    const currentUsd = posMap.get(t.ticker) ?? 0;
    existing.current += totalCapitalUsd > 0 ? (currentUsd / totalCapitalUsd) * 100 : 0;
    bucketMap.set(t.bucket, existing);
  }

  const buckets: BucketAllocation[] = [...bucketMap.entries()].map(([bucket, { target, current }]) => ({
    bucket,
    currentPct: Math.round(current * 10) / 10,
    targetPct: Math.round(target * 10) / 10,
    drift: Math.round((current - target) * 10) / 10,
  }));

  const cashUsd = posMap.get("CASH") ?? 0;
  const totalDeployedUsd = [...posMap.entries()]
    .filter(([t]) => t !== "CASH")
    .reduce((s, [, v]) => s + v, 0);
  const totalDeployedPct = totalCapitalUsd > 0 ? (totalDeployedUsd / totalCapitalUsd) * 100 : 0;

  const drifted = buckets.filter(b => Math.abs(b.drift) >= 3);
  const summary = drifted.length > 0
    ? `Drift: ${drifted.map(b => `${b.bucket} ${b.drift > 0 ? "over" : "under"} ${Math.abs(b.drift).toFixed(1)}%`).join("; ")}. Review rebalancing.`
    : "Allocation on target. No rebalancing required.";

  return { buckets, cashUsd, totalCapitalUsd, totalDeployedPct, summary };
}

// ─── Section 5: Watchlist Radar ───────────────────────────────────────────────

function buildWatchlistRadar(
  scores: { ticker: string; opportunityScore: number; reasoning: string }[],
  positionTickers: Set<string>,
  latestCommittee: Map<string, string>,
  universeTickers: string[],
): { highConviction: EnrichedRadarEntry[]; disagreement: EnrichedRadarEntry[]; emerging: EnrichedRadarEntry[] } {
  const used = new Set<string>();
  const universeSet = new Set(universeTickers);

  const toEntry = (s: { ticker: string; opportunityScore: number; reasoning: string }): EnrichedRadarEntry => {
    let whyNow = "Quantitative score indicates favorable entry conditions.";
    let keyRisk = "Monitor macro and earnings developments.";
    try {
      const r = JSON.parse(s.reasoning) as { whyNow?: string };
      if (r.whyNow) whyNow = r.whyNow;
    } catch { /* use defaults */ }
    const impactScore = scoreRadarImpact(s.ticker, positionTickers, latestCommittee, s.opportunityScore);
    const evidence = radarEvidence(s.opportunityScore, latestCommittee.get(s.ticker));
    return { ticker: s.ticker, score: Math.round(s.opportunityScore), whyNow, keyRisk, impactScore, evidence };
  };

  const highConviction = scores
    .filter(s => !positionTickers.has(s.ticker) && !used.has(s.ticker))
    .filter(s => { const c = latestCommittee.get(s.ticker); return c === "Strong Buy" || c === "Buy"; })
    .slice(0, 3)
    .map(s => { used.add(s.ticker); return toEntry(s); });

  const disagreement = scores
    .filter(s => s.opportunityScore >= 65 && !used.has(s.ticker) && !positionTickers.has(s.ticker))
    .filter(s => { const c = latestCommittee.get(s.ticker); return !c || c === "Pass" || c === "Watch"; })
    .slice(0, 3)
    .map(s => { used.add(s.ticker); return toEntry(s); });

  const emerging = scores
    .filter(s => universeSet.has(s.ticker) && !used.has(s.ticker))
    .slice(0, 3)
    .map(s => { used.add(s.ticker); return toEntry(s); });

  return { highConviction, disagreement, emerging };
}

function scoreRadarImpact(
  ticker: string,
  positionTickers: Set<string>,
  committee: Map<string, string>,
  score: number,
): number {
  if (positionTickers.has(ticker)) return 4;
  const conviction = committee.get(ticker);
  if (conviction === "Strong Buy") return 4;
  if (conviction === "Buy") return 3;
  if (score >= 80) return 3;
  return 2;
}

function radarEvidence(score: number, conviction: string | undefined): EvidenceTag {
  const sources = ["Opportunity Engine"];
  if (conviction === "Strong Buy" || conviction === "Buy") sources.push("Committee");
  const confidence: Confidence = score >= 80 ? "High" : score >= 65 ? "Medium" : "Low";
  return { confidence, evidenceCount: sources.length, sources };
}

// ─── Section 6: Thesis Monitoring ─────────────────────────────────────────────

function buildThesisMonitoring(
  positions: { ticker: string; name: string }[],
  impacts: { ticker: string; impactLevel: string; reasoning: string }[],
  theses: { ticker: string; title: string }[],
  positionTickers: Set<string>,
): EnrichedThesisStatus[] {
  const thesisSet = new Set(theses.map(t => t.ticker));
  const impactMap = impacts.reduce((acc, i) => {
    if (!acc.has(i.ticker)) acc.set(i.ticker, i);
    return acc;
  }, new Map<string, typeof impacts[0]>());

  return positions
    .filter(p => p.ticker !== "CASH")
    .map(pos => {
      const impact = impactMap.get(pos.ticker);

      if (!impact) {
        return {
          ticker: pos.ticker,
          name: pos.name,
          status: "unchanged" as const,
          evidence: thesisSet.has(pos.ticker)
            ? "No recent filing impact. Thesis intact."
            : "No thesis on file for this position.",
          impactScore: 2,
          evidenceTag: { confidence: "Low" as Confidence, evidenceCount: 0, sources: [] },
        };
      }

      const status =
        impact.impactLevel === "strengthened" ? "strengthened" as const
        : impact.impactLevel === "weakened" || impact.impactLevel === "kill_criteria_triggered"
          ? "weakened" as const
          : "unchanged" as const;

      const impactScore = status === "weakened" ? 4 : status === "strengthened" ? 3 : 2;

      return {
        ticker: pos.ticker,
        name: pos.name,
        status,
        evidence: impact.reasoning.slice(0, 150),
        impactScore,
        evidenceTag: { confidence: "High" as Confidence, evidenceCount: 1, sources: ["SEC Filing"] },
      };
    });
}

// ─── Section 2 helpers ────────────────────────────────────────────────────────

function buildMarketMetrics(briefData: MorningBriefData): CIOBriefDocument["marketMetrics"] {
  const findTopic = (t: string) => briefData.macroSummary.topics.find(x => x.topic === t);
  const metrics: CIOBriefDocument["marketMetrics"] = [];

  const yieldTopic = findTopic("Treasury Yields");
  const rateTopic  = findTopic("Interest Rates");
  const cpiTopic   = findTopic("Inflation");

  if (yieldTopic?.value) metrics.push({ label: "US 10Y Yield",   value: yieldTopic.value, signal: yieldTopic.signal });
  if (rateTopic?.value)  metrics.push({ label: "Fed Funds Rate", value: rateTopic.value,  signal: rateTopic.signal });
  if (cpiTopic?.value)   metrics.push({ label: "CPI (YoY)",      value: cpiTopic.value,   signal: cpiTopic.signal });

  const vixEvidence = briefData.marketRegimeEvidence.find(e => e.toLowerCase().includes("vix"));
  if (vixEvidence) {
    const match = vixEvidence.match(/VIX\s+(\d+\.?\d*)/i);
    if (match) {
      const vix = parseFloat(match[1]);
      metrics.push({
        label: "VIX",
        value: match[1],
        signal: vix < 20 ? "positive" : vix < 30 ? "neutral" : "negative",
      });
    }
  }
  return metrics;
}

function buildAssetClassImpact(
  regime: string,
  macroSummary: MorningBriefData["macroSummary"],
): CIOBriefDocument["assetClassImpact"] {
  const rateTopic = macroSummary.topics.find(t => t.topic === "Interest Rates");
  const highRates = rateTopic?.signal === "negative";
  const riskOn    = regime === "Risk On";
  const riskOff   = regime === "Risk Off";
  return [
    {
      asset: "Growth",
      impact: riskOn ? "Favorable" : riskOff ? "Caution" : "Neutral",
      detail: riskOn
        ? "AI capex cycle and enterprise spending support growth thesis."
        : riskOff ? "Risk-off pressures high-multiple names; reduce exposure."
        : "Mixed signals — maintain sizing, await clarity.",
    },
    {
      asset: "Mid Cap",
      impact: highRates ? "Cautious" : riskOn ? "Favorable" : "Neutral",
      detail: highRates
        ? "Elevated rates increase refinancing risk; favor profitable mid-caps."
        : "Mid-cap improving as rate environment normalizes.",
    },
    {
      asset: "Small Cap",
      impact: riskOff ? "Underweight" : highRates ? "Cautious" : "Moderate",
      detail: riskOff
        ? "Small caps most vulnerable in risk-off; reduce or avoid."
        : "Rate-sensitive; prefer quality names with strong balance sheets.",
    },
    {
      asset: "Defensive / Hedge",
      impact: riskOff ? "Favorable" : riskOn ? "Underweight" : "Hold",
      detail: riskOff
        ? "Defensive assets provide downside protection; increase allocation."
        : riskOn ? "Underperform in risk-on; hold minimum hedge."
        : "Maintain as tail-risk insurance.",
    },
  ];
}

// ─── Section 1: Executive Summary ────────────────────────────────────────────

function buildExecutiveSummary(
  briefData: MorningBriefData,
  portfolioHealth: CIOBriefDocument["portfolioHealth"],
  thesisMonitoring: EnrichedThesisStatus[],
  geoRisks: EnrichedGeoRisk[],
): string[] {
  const bullets: string[] = [];

  const topEvidence = briefData.marketRegimeEvidence[0] ?? "";
  bullets.push(`Market regime: ${briefData.marketRegime}. ${topEvidence}`.slice(0, 130));

  const techStance = briefData.technologySummary.overallStance;
  if (techStance) bullets.push(techStance.slice(0, 130));

  const highGeo = geoRisks.find(r => r.level === "high" && !r.filtered);
  if (highGeo) {
    bullets.push(`${highGeo.region} risk elevated (Impact ${highGeo.impactScore}/5). Monitor closely.`);
  } else {
    const geoStance = briefData.geopoliticalSummary.overallStance;
    if (geoStance) bullets.push(geoStance.slice(0, 120));
  }

  const drifted = portfolioHealth.buckets.filter(b => Math.abs(b.drift) >= 3);
  const cashK = (portfolioHealth.cashUsd / 1000).toFixed(0);
  bullets.push(
    drifted.length > 0
      ? `Portfolio drift in ${drifted.map(b => b.bucket).join(", ")}. Cash $${cashK}K.`
      : `Portfolio allocation on target. Cash $${cashK}K available.`
  );

  const highUrgency = briefData.recommendedActions.filter(a => a.urgency === "high");
  const weakened    = thesisMonitoring.filter(t => t.status === "weakened");
  if (highUrgency.length > 0) {
    bullets.push(`${highUrgency.length} high-priority action${highUrgency.length > 1 ? "s" : ""} required: ${highUrgency[0].action.slice(0, 80)}.`);
  } else if (weakened.length > 0) {
    bullets.push(`${weakened.length} thesis${weakened.length > 1 ? "es" : ""} weakened (${weakened.map(t => t.ticker).join(", ")}). Review recommended.`);
  } else {
    bullets.push("No portfolio actions required today.");
  }

  return bullets.slice(0, 5);
}

// ─── Decision Board ───────────────────────────────────────────────────────────

function buildDecisionBoard(
  actions: CIOBriefDocument["todaysActions"],
  geoRisks: EnrichedGeoRisk[],
  thesisMonitoring: EnrichedThesisStatus[],
  macroTopics: EnrichedMacroTopic[],
): DecisionBoard {
  const actNow: DecisionItem[]  = [];
  const monitor: DecisionItem[] = [];
  let ignoreCount = 0;

  // Act Now: high-urgency actions
  for (const a of actions) {
    if (a.urgency === "high") {
      actNow.push({ item: a.action, reason: a.reason, ticker: a.ticker, impactScore: 5 });
    } else if (a.urgency === "medium") {
      monitor.push({ item: a.action, reason: a.reason, ticker: a.ticker, impactScore: 3 });
    }
  }

  // Act Now: geo events with impact >= 5
  for (const r of geoRisks.filter(x => !x.filtered)) {
    if (r.impactScore >= 5 && r.level === "high") {
      actNow.push({
        item: `Review ${r.region} exposure`,
        reason: r.latestEvent ?? r.portfolioExposure,
        impactScore: r.impactScore,
      });
    } else if (r.impactScore >= 3) {
      monitor.push({
        item: `Monitor ${r.region} developments`,
        reason: r.portfolioExposure,
        impactScore: r.impactScore,
      });
    } else {
      ignoreCount++;
    }
  }
  ignoreCount += geoRisks.filter(r => r.filtered).length;

  // Act Now / Monitor: weakened theses
  for (const t of thesisMonitoring) {
    if (t.status === "weakened" && t.impactScore >= 4) {
      if (!actNow.some(a => a.ticker === t.ticker)) {
        actNow.push({ item: `Review ${t.ticker} thesis`, reason: t.evidence.slice(0, 80), ticker: t.ticker, impactScore: t.impactScore });
      }
    } else if (t.status === "weakened") {
      if (!monitor.some(a => a.ticker === t.ticker)) {
        monitor.push({ item: `Monitor ${t.ticker} thesis`, reason: t.evidence.slice(0, 80), ticker: t.ticker, impactScore: t.impactScore });
      }
    }
  }

  // Monitor: negative macro topics with high impact
  for (const m of macroTopics) {
    if (m.signal === "negative" && m.impactScore >= 4) {
      if (!monitor.some(x => x.item.includes(m.topic))) {
        monitor.push({ item: `Monitor ${m.topic}`, reason: m.insight.slice(0, 80), impactScore: m.impactScore });
      }
    } else if (m.impactScore < 2) {
      ignoreCount++;
    }
  }

  return {
    actNow: actNow.slice(0, 5),
    monitor: monitor.slice(0, 5),
    ignoreCount,
  };
}

// ─── Read time estimation ─────────────────────────────────────────────────────

function estimateReadTime(
  execBullets: string[],
  macroTopics: EnrichedMacroTopic[],
  activeGeo: EnrichedGeoRisk[],
  buckets: BucketAllocation[],
  hc: EnrichedRadarEntry[],
  dis: EnrichedRadarEntry[],
  emg: EnrichedRadarEntry[],
  thesis: EnrichedThesisStatus[],
  actions: CIOBriefDocument["todaysActions"],
): { total: number; sections: SectionReadTime[] } {
  const sections: SectionReadTime[] = [
    { section: "Executive Summary",         minutes: Math.max(0.5, execBullets.length * 0.1)  },
    { section: "Market Regime",             minutes: 1.5                                        },
    { section: "Macro",                     minutes: macroTopics.length * 0.4                  },
    { section: "Geopolitics",               minutes: activeGeo.length * 0.35                   },
    { section: "Portfolio Health",          minutes: buckets.length > 0 ? 0.75 : 0.25          },
    { section: "Watchlist & Radar",         minutes: (hc.length + dis.length + emg.length) * 0.3 },
    { section: "Thesis Monitoring",         minutes: thesis.length * 0.2                       },
    { section: "Today's Actions",           minutes: Math.max(0.3, actions.length * 0.15)      },
    { section: "Decision Board",            minutes: 0.4                                        },
  ];
  const total = sections.reduce((s, x) => s + x.minutes, 0);
  return { total: Math.round(total * 10) / 10, sections: sections.map(s => ({ ...s, minutes: Math.round(s.minutes * 10) / 10 })) };
}

// ─── Sources ──────────────────────────────────────────────────────────────────

function buildSources(briefData: MorningBriefData): string[] {
  const all = [
    ...(briefData.dataSources?.macro ?? []),
    ...(briefData.dataSources?.market ?? []),
    ...(briefData.dataSources?.geo ?? []),
    ...(briefData.dataSources?.portfolio ?? []),
  ];
  return [...new Set(all)];
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

export function renderCIOBriefMarkdown(doc: CIOBriefDocument): string {
  const date = new Date(doc.date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const time = new Date(doc.generatedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const qm = doc.qualityMetrics;
  const lines: string[] = [];

  lines.push(`# Daily CIO Brief — ${date}`);
  lines.push("");
  lines.push(`*Generated: ${time} | Regime: ${doc.marketRegime} | Read: ~${qm.estimatedReadTimeMin} min | Evidence: ${qm.evidenceCoveragePercent}% covered*`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // Quality Summary
  lines.push("## Brief Quality Summary");
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Estimated Read Time | ${qm.estimatedReadTimeMin} min |`);
  lines.push(`| Evidence Coverage | ${qm.evidenceCoveragePercent}% |`);
  lines.push(`| High Confidence Items | ${qm.highConfidenceCount} |`);
  lines.push(`| Medium Confidence | ${qm.mediumConfidenceCount} |`);
  lines.push(`| Low Confidence | ${qm.lowConfidenceCount} |`);
  lines.push(`| Portfolio-Relevant Events | ${qm.portfolioRelevantEvents} |`);
  lines.push(`| Noise Removed | ${qm.noiseRemovedCount} |`);
  if (qm.autoSummarized) lines.push(`| Auto-Summarized | Yes (content trimmed to meet 15-min target) |`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // Section 1
  lines.push("## 1. Executive Summary");
  lines.push("");
  for (const b of doc.executiveSummary) lines.push(`- ${b}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // Section 2
  lines.push(`## 2. Market Regime: ${doc.marketRegime}`);
  lines.push("");
  if (doc.marketMetrics.length > 0) {
    lines.push("| Metric | Value | Signal |");
    lines.push("|--------|-------|--------|");
    for (const m of doc.marketMetrics) lines.push(`| ${m.label} | ${m.value} | ${cap(m.signal)} |`);
    lines.push("");
  }
  lines.push("**Evidence:**");
  for (const e of doc.marketRegimeEvidence) lines.push(`- ${e}`);
  lines.push("");
  lines.push("**Asset Class Impact:**");
  for (const a of doc.assetClassImpact) lines.push(`- **${a.asset}**: ${a.impact} — ${a.detail}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // Section 3
  lines.push("## 3. Macro & Geopolitics");
  lines.push("");
  if (doc.macroStance) { lines.push(`> ${doc.macroStance}`); lines.push(""); }
  for (const t of doc.macroTopics) {
    lines.push(`### ${t.topic} | Impact: ${t.impactScore}/5 | ${t.evidence.confidence} Confidence`);
    const meta: string[] = [];
    if (t.value) meta.push(`Value: **${t.value}**`);
    if (t.source) meta.push(`Source: *${t.source}*`);
    if (meta.length) lines.push(meta.join(" | "));
    lines.push(t.insight);
    lines.push(`*Evidence: ${t.evidence.evidenceCount} fact(s) · Sources: ${t.evidence.sources.join(", ") || "N/A"}*`);
    lines.push("");
  }
  const activeGeo = doc.geoRisks.filter(r => !r.filtered);
  if (activeGeo.length > 0) {
    lines.push(`**Geopolitical Stance:** ${doc.geoStance}`);
    lines.push("");
    for (const r of activeGeo) {
      lines.push(`### ${r.region} — ${r.level.toUpperCase()} | Impact: ${r.impactScore}/5 | ${r.evidence.confidence} Confidence`);
      lines.push(`*Portfolio exposure:* ${r.portfolioExposure}`);
      lines.push(r.insight);
      if (r.latestEvent) lines.push(`*Latest: ${r.latestEvent}${r.eventSource ? ` (${r.eventSource})` : ""}*`);
      lines.push(`*Evidence: ${r.evidence.evidenceCount} fact(s) · Sources: ${r.evidence.sources.join(", ") || "N/A"}*`);
      lines.push("");
    }
  }
  if (doc.qualityMetrics.noiseRemovedCount > 0) {
    lines.push(`*Noise filter: ${doc.qualityMetrics.noiseRemovedCount} low-relevance geo event(s) removed.*`);
    lines.push("");
  }
  lines.push("---");
  lines.push("");

  // Section 4
  lines.push("## 4. Portfolio Health");
  lines.push("");
  lines.push(`> ${doc.portfolioHealth.summary}`);
  lines.push("");
  if (doc.portfolioHealth.buckets.length > 0) {
    lines.push("| Category | Current | Target | Drift | Status |");
    lines.push("|----------|---------|--------|-------|--------|");
    for (const b of doc.portfolioHealth.buckets) {
      const abs = Math.abs(b.drift);
      const status = abs >= 5 ? "Drift" : abs >= 3 ? "Minor Drift" : "On Target";
      const driftStr = b.drift > 0 ? `+${b.drift.toFixed(1)}%` : `${b.drift.toFixed(1)}%`;
      lines.push(`| ${cap(b.bucket)} | ${b.currentPct.toFixed(1)}% | ${b.targetPct.toFixed(1)}% | ${driftStr} | ${status} |`);
    }
    if (doc.portfolioHealth.cashUsd > 0) {
      const cashPct = doc.portfolioHealth.totalCapitalUsd > 0
        ? ((doc.portfolioHealth.cashUsd / doc.portfolioHealth.totalCapitalUsd) * 100).toFixed(1) : "—";
      lines.push(`| Cash | ${cashPct}% | — | — | Available |`);
    }
  }
  lines.push("");
  lines.push("---");
  lines.push("");

  // Section 5
  lines.push("## 5. Watchlist & Opportunity Radar");
  lines.push("");
  const renderRadarGroup = (label: string, desc: string, entries: EnrichedRadarEntry[]) => {
    if (entries.length === 0) return;
    lines.push(`### ${label}`);
    if (desc) lines.push(`*${desc}*`);
    lines.push("");
    for (const e of entries) {
      lines.push(`**${e.ticker}** — Score: ${e.score}/100 | Impact: ${e.impactScore}/5 | ${e.evidence.confidence} Confidence`);
      lines.push(`- Why now: ${e.whyNow}`);
      lines.push(`- Key risk: ${e.keyRisk}`);
      lines.push(`- *Evidence: ${e.evidence.evidenceCount} fact(s) · Sources: ${e.evidence.sources.join(", ")}*`);
      lines.push("");
    }
  };
  renderRadarGroup("A. High Conviction", "", doc.highConviction);
  renderRadarGroup("B. Disagreement Opportunities", "System rates highly — no or contrarian committee verdict.", doc.disagreement);
  renderRadarGroup("C. Emerging", "", doc.emerging);
  if (!doc.highConviction.length && !doc.disagreement.length && !doc.emerging.length) {
    lines.push("*No entries. Run opportunity_refresh.*");
    lines.push("");
  }
  lines.push("---");
  lines.push("");

  // Section 6
  lines.push("## 6. Thesis Monitoring");
  lines.push("");
  for (const status of ["strengthened", "unchanged", "weakened"] as const) {
    const group = doc.thesisMonitoring.filter(t => t.status === status);
    if (!group.length) continue;
    lines.push(`### ${cap(status)}`);
    for (const t of group) {
      lines.push(`- **${t.ticker}** (${t.name}) | Impact: ${t.impactScore}/5 | ${t.evidenceTag.confidence} Confidence`);
      lines.push(`  ${t.evidence}`);
      lines.push(`  *Sources: ${t.evidenceTag.sources.join(", ") || "N/A"}*`);
    }
    lines.push("");
  }
  if (!doc.thesisMonitoring.length) { lines.push("*No active holdings.*"); lines.push(""); }
  lines.push("---");
  lines.push("");

  // Section 7
  lines.push("## 7. Today's Actions");
  lines.push("");
  if (doc.todaysActions.length === 0) {
    lines.push("- No action required today.");
  } else {
    for (const a of doc.todaysActions) {
      lines.push(`${a.priority}. **[${a.urgency.toUpperCase()}]** ${a.action}`);
      lines.push(`   *${a.reason}*`);
      lines.push("");
    }
  }
  lines.push("---");
  lines.push("");

  // Decision Board
  lines.push("## Decision Board");
  lines.push("");
  if (doc.decisionBoard.actNow.length > 0) {
    lines.push("### Act Now");
    for (const d of doc.decisionBoard.actNow) {
      lines.push(`- **${d.item}**${d.impactScore ? ` (Impact ${d.impactScore}/5)` : ""}: ${d.reason}`);
    }
    lines.push("");
  }
  if (doc.decisionBoard.monitor.length > 0) {
    lines.push("### Monitor");
    for (const d of doc.decisionBoard.monitor) {
      lines.push(`- ${d.item}${d.impactScore ? ` (Impact ${d.impactScore}/5)` : ""}: ${d.reason}`);
    }
    lines.push("");
  }
  if (doc.decisionBoard.ignoreCount > 0) {
    lines.push(`### Ignored`);
    lines.push(`*${doc.decisionBoard.ignoreCount} low-relevance item(s) filtered — not portfolio-relevant.*`);
    lines.push("");
  }
  lines.push("---");
  lines.push("");

  // Discovery Radar
  if (doc.discoveryRadar && (doc.discoveryRadar.tierA.length > 0 || doc.discoveryRadar.portfolioGapCount > 0)) {
    lines.push("## Discovery Radar");
    lines.push("");
    lines.push(`*${doc.discoveryRadar.totalCandidates} candidates active · ${doc.discoveryRadar.portfolioGapCount} portfolio gap(s) detected*`);
    lines.push("");
    if (doc.discoveryRadar.tierA.length > 0) {
      lines.push("### Tier A — Research Now");
      lines.push("");
      for (const c of doc.discoveryRadar.tierA) {
        const themes = c.themes.length > 0 ? ` · ${c.themes.join(", ")}` : "";
        lines.push(`**${c.ticker}** — ${c.discoveryCategory} (Score: ${c.radarScore}/100${themes})`);
        lines.push(`> ${c.discoveryReason}`);
        lines.push("");
      }
    }
    if (doc.discoveryRadar.topThemes.length > 0) {
      lines.push("### Top Themes");
      lines.push(doc.discoveryRadar.topThemes.map(t => `- ${t}`).join("\n"));
      lines.push("");
    }
    lines.push("---");
    lines.push("");
  }

  // Section 8
  lines.push("## 8. Sources");
  lines.push("");
  lines.push(`External: ${qm.externalSourcesCount} | Internal: ${qm.internalSourcesCount}`);
  lines.push("");
  const srcs = doc.sources.length > 0 ? doc.sources : ["Portfolio database"];
  for (const s of srcs) lines.push(`- ${s}`);
  lines.push("");

  return lines.join("\n");
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function overlap(set: Set<string>, tickers: Set<string>): boolean {
  for (const t of tickers) if (set.has(t)) return true;
  return false;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
