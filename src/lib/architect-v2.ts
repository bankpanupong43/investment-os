// Portfolio Architect v2 — Phase 12C
//
// Extends architect-engine.ts with:
//   1. Portfolio Capacity (max 20 holdings, Core/Growth/Speculative/ETF)
//   2. Overexposure Detection (sector, theme, country, single stock)
//   3. Buy Candidate Ranking (Discovery + Committee + Opportunity, top 10)
//   4. Sell Flag Review (weakened thesis, oversized, better alternative, exceeds max)
//   5. Variable Capital Allocation (user inputs $500 / $1000 / $5000)

import { db } from "./db";
import { DISCOVERY_THEMES } from "./radar-engine";

// ─── Position classifier ──────────────────────────────────────────────────────

const CORE_TICKERS = new Set(["AAPL", "MSFT", "JNJ", "V", "MA", "KO", "PG", "JPM", "BRK"]);
const GROWTH_TICKERS = new Set(["NVDA", "GOOG", "GOOGL", "AMZN", "META", "TSLA", "AMD", "SMCI", "CRWD", "NET", "SNOW", "PLTR"]);
const ETF_SUFFIXES = ["ETF", "ITA", "GLDM", "GLD", "IAU", "BND", "SHY", "TLT", "QQQ", "SPY", "IWM", "VTI", "GDX"];

type PositionClass = "Core" | "Growth" | "Speculative" | "ETF";

function classifyPosition(ticker: string, sector: string | null, assetClass: string): PositionClass {
  if (assetClass === "etf" || ETF_SUFFIXES.some(e => ticker === e || ticker.startsWith(e))) return "ETF";
  if (CORE_TICKERS.has(ticker) || sector === "Healthcare" || sector === "Consumer Staples") return "Core";
  if (GROWTH_TICKERS.has(ticker) || sector === "Technology" || sector === "Communication Services") return "Growth";
  return "Speculative";
}

// ─── Portfolio Capacity ───────────────────────────────────────────────────────

export interface PositionSlot {
  ticker: string;
  name: string;
  classification: PositionClass;
  allocationPct: number;
  maxPct: number;
  isOverweight: boolean;
}

export interface PortfolioCapacity {
  currentCount: number;
  maxPositions: number;
  availableSlots: number;
  utilizationPct: number;
  breakdown: { core: number; growth: number; speculative: number; etf: number };
  positions: PositionSlot[];
  recommendation: string;
}

export async function buildCapacity(): Promise<PortfolioCapacity> {
  const MAX_POSITIONS = 20;
  const MAX_SINGLE_STOCK_PCT = 12;

  const positions = await db.position.findMany({
    where: { status: "active" },
    select: { ticker: true, name: true, sector: true, assetClass: true, currentValueUsd: true, allocationPct: true },
  });

  const nonCash = positions.filter(p => p.ticker !== "CASH");
  const totalUsd = nonCash.reduce((s, p) => s + (p.currentValueUsd ?? 0), 0);

  const slots: PositionSlot[] = nonCash.map(p => {
    const pct = totalUsd > 0 ? ((p.currentValueUsd ?? 0) / totalUsd) * 100 : (p.allocationPct ?? 0);
    const cls = classifyPosition(p.ticker, p.sector, p.assetClass);
    return {
      ticker: p.ticker,
      name: p.name,
      classification: cls,
      allocationPct: Math.round(pct * 10) / 10,
      maxPct: cls === "Speculative" ? 5 : cls === "ETF" ? 15 : MAX_SINGLE_STOCK_PCT,
      isOverweight: pct > (cls === "Speculative" ? 5 : MAX_SINGLE_STOCK_PCT),
    };
  }).sort((a, b) => b.allocationPct - a.allocationPct);

  const count = nonCash.length;
  const available = Math.max(0, MAX_POSITIONS - count);

  const breakdown = {
    core:        slots.filter(s => s.classification === "Core").length,
    growth:      slots.filter(s => s.classification === "Growth").length,
    speculative: slots.filter(s => s.classification === "Speculative").length,
    etf:         slots.filter(s => s.classification === "ETF").length,
  };

  const overweighted = slots.filter(s => s.isOverweight);
  const recommendation = count >= MAX_POSITIONS
    ? `Portfolio at capacity (${count}/${MAX_POSITIONS}). No new positions until an existing one is exited.`
    : count >= MAX_POSITIONS * 0.85
      ? `Near capacity (${count}/${MAX_POSITIONS} positions). ${available} slot${available !== 1 ? "s" : ""} remain — be selective.`
      : overweighted.length > 0
        ? `${available} slot${available !== 1 ? "s" : ""} available. ${overweighted.length} position${overweighted.length !== 1 ? "s are" : " is"} overweight — trim before adding new.`
        : `${available} slot${available !== 1 ? "s" : ""} available for new positions.`;

  return {
    currentCount: count,
    maxPositions: MAX_POSITIONS,
    availableSlots: available,
    utilizationPct: Math.round((count / MAX_POSITIONS) * 100),
    breakdown,
    positions: slots,
    recommendation,
  };
}

// ─── Overexposure Detection ───────────────────────────────────────────────────

export interface OverexposureItem {
  dimension: "sector" | "theme" | "single_stock";
  name: string;
  exposurePct: number;
  threshold: number;
  severity: "critical" | "high" | "watch";
  recommendation: string;
  tickers: string[];
}

export interface OverexposureResult {
  items: OverexposureItem[];
  aiExposurePct: number;
  sectorConcentration: { sector: string; pct: number }[];
  summary: string;
}

export async function buildOverexposure(): Promise<OverexposureResult> {
  const positions = await db.position.findMany({
    where: { status: "active" },
    select: { ticker: true, name: true, sector: true, currentValueUsd: true, allocationPct: true },
  });

  const nonCash = positions.filter(p => p.ticker !== "CASH");
  const totalUsd = nonCash.reduce((s, p) => s + (p.currentValueUsd ?? 0), 0);

  const getPct = (p: typeof nonCash[0]) =>
    totalUsd > 0 ? ((p.currentValueUsd ?? 0) / totalUsd) * 100 : (p.allocationPct ?? 0);

  const items: OverexposureItem[] = [];

  // ── Sector exposure ─────────────────────────────────────────────────────────
  const sectorMap = new Map<string, { pct: number; tickers: string[] }>();
  for (const p of nonCash) {
    const sector = p.sector ?? "Unknown";
    const pct = getPct(p);
    const entry = sectorMap.get(sector) ?? { pct: 0, tickers: [] };
    entry.pct += pct;
    entry.tickers.push(p.ticker);
    sectorMap.set(sector, entry);
  }

  const SECTOR_THRESHOLDS: Record<string, number> = {
    Technology: 40, "Communication Services": 35, Healthcare: 30,
    Industrials: 25, Energy: 20, Financials: 20, "Consumer Discretionary": 25,
  };

  for (const [sector, data] of sectorMap) {
    if (sector === "Unknown") continue;
    const threshold = SECTOR_THRESHOLDS[sector] ?? 25;
    if (data.pct > threshold) {
      const severity: OverexposureItem["severity"] =
        data.pct > threshold * 1.5 ? "critical" : data.pct > threshold * 1.2 ? "high" : "watch";
      items.push({
        dimension: "sector",
        name: sector,
        exposurePct: Math.round(data.pct * 10) / 10,
        threshold,
        severity,
        recommendation: `${sector} sector at ${data.pct.toFixed(1)}% exceeds ${threshold}% guideline. No new ${sector.toLowerCase()} positions recommended.`,
        tickers: data.tickers,
      });
    }
  }

  // ── Theme exposure ──────────────────────────────────────────────────────────
  const portfolioTickerMap = new Map(nonCash.map(p => [p.ticker, getPct(p)]));
  const THEME_THRESHOLD = 30;

  for (const [theme, def] of Object.entries(DISCOVERY_THEMES)) {
    let themePct = 0;
    const exposedTickers: string[] = [];
    for (const tk of def.tickers) {
      const pct = portfolioTickerMap.get(tk) ?? 0;
      if (pct > 0) {
        themePct += pct;
        exposedTickers.push(tk);
      }
    }
    if (themePct > THEME_THRESHOLD && exposedTickers.length > 0) {
      const severity: OverexposureItem["severity"] =
        themePct > 50 ? "critical" : themePct > 40 ? "high" : "watch";
      items.push({
        dimension: "theme",
        name: theme,
        exposurePct: Math.round(themePct * 10) / 10,
        threshold: THEME_THRESHOLD,
        severity,
        recommendation: `${theme} exposure at ${themePct.toFixed(1)}% — no new ${theme} positions recommended until rebalanced.`,
        tickers: exposedTickers,
      });
    }
  }

  // ── Single stock concentration ───────────────────────────────────────────────
  const SINGLE_STOCK_THRESHOLD = 15;
  for (const p of nonCash) {
    const pct = getPct(p);
    if (pct > SINGLE_STOCK_THRESHOLD) {
      const severity: OverexposureItem["severity"] = pct > 25 ? "critical" : pct > 20 ? "high" : "watch";
      items.push({
        dimension: "single_stock",
        name: `${p.ticker} concentration`,
        exposurePct: Math.round(pct * 10) / 10,
        threshold: SINGLE_STOCK_THRESHOLD,
        severity,
        recommendation: `${p.ticker} at ${pct.toFixed(1)}% — above ${SINGLE_STOCK_THRESHOLD}% single-stock guideline. Consider trimming on strength.`,
        tickers: [p.ticker],
      });
    }
  }

  // Sort: critical → high → watch
  items.sort((a, b) => {
    const sev = { critical: 0, high: 1, watch: 2 };
    return sev[a.severity] - sev[b.severity];
  });

  // AI exposure (special metric)
  const AI_TICKERS = new Set(["NVDA", "GOOG", "GOOGL", "META", "AMZN", "MSFT", "AMD", "SMCI", "TSM"]);
  const aiExposurePct = nonCash
    .filter(p => AI_TICKERS.has(p.ticker))
    .reduce((s, p) => s + getPct(p), 0);

  const sectorConcentration = [...sectorMap.entries()]
    .map(([sector, d]) => ({ sector, pct: Math.round(d.pct * 10) / 10 }))
    .sort((a, b) => b.pct - a.pct);

  const criticalCount = items.filter(i => i.severity === "critical").length;
  const summary = criticalCount > 0
    ? `${criticalCount} critical overexposure${criticalCount > 1 ? "s" : ""} detected. Review before adding new positions.`
    : items.length > 0
      ? `${items.length} exposure warning${items.length > 1 ? "s" : ""} — monitor concentration levels.`
      : "No significant overexposure detected. Portfolio concentration is within guidelines.";

  return { items, aiExposurePct: Math.round(aiExposurePct * 10) / 10, sectorConcentration, summary };
}

// ─── Buy Candidate Ranking ────────────────────────────────────────────────────

export interface BuyCandidate {
  rank: number;
  ticker: string;
  companyName: string;
  compositeScore: number;
  discoveryScore: number | null;
  opportunityScore: number | null;
  committeeConviction: string | null;
  inResearchQueue: boolean;
  suggestedStarterPct: number;
  reasons: string[];
}

export async function buildBuyRanking(): Promise<BuyCandidate[]> {
  const [positions, watchlist, committee, opportunities, radarCandidates] = await Promise.all([
    db.position.findMany({ where: { status: "active" }, select: { ticker: true } }),
    db.watchlist.findMany({ select: { ticker: true, status: true } }),
    db.committeeSession.findMany({
      orderBy: { createdAt: "desc" }, take: 100,
      select: { ticker: true, conviction: true },
    }),
    db.opportunityScore.findMany({
      orderBy: { opportunityScore: "desc" }, take: 50,
      select: { ticker: true, opportunityScore: true },
    }),
    db.discoveryCandidate.findMany({
      where: { status: "active" }, orderBy: { radarScore: "desc" },
      select: { ticker: true, companyName: true, radarScore: true },
    }),
  ]);

  const ownedTickers = new Set(positions.map(p => p.ticker));
  const watchlistMap = new Map(watchlist.map(w => [w.ticker, w.status]));
  const committeeMap = new Map<string, string>();
  for (const s of committee) {
    if (!committeeMap.has(s.ticker)) committeeMap.set(s.ticker, s.conviction);
  }
  const oppMap = new Map(opportunities.map(o => [o.ticker, o.opportunityScore]));
  const radarMap = new Map(radarCandidates.map(r => [r.ticker, { score: r.radarScore, name: r.companyName }]));

  // Universe name lookup
  const allTickers = [...new Set([
    ...committee.map(s => s.ticker),
    ...opportunities.map(o => o.ticker),
    ...radarCandidates.map(r => r.ticker),
  ])].filter(t => !ownedTickers.has(t));

  const universeNames = await db.universe.findMany({
    where: { ticker: { in: allTickers } },
    select: { ticker: true, companyName: true },
  });
  const nameMap = new Map(universeNames.map(u => [u.ticker, u.companyName]));

  // Combine all candidate tickers not in portfolio
  const candidateSet = new Set(allTickers);
  const scored: { ticker: string; score: number; reasons: string[]; companyName: string }[] = [];

  const CONVICTION_SCORE: Record<string, number> = {
    "Strong Buy": 40, "Buy": 30, "Watch": 10, "Hold": 0,
  };

  for (const ticker of candidateSet) {
    const reasons: string[] = [];
    let score = 0;

    // Committee conviction (max 40 pts)
    const conviction = committeeMap.get(ticker);
    if (conviction) {
      const pts = CONVICTION_SCORE[conviction] ?? 0;
      score += pts;
      if (pts > 0) reasons.push(`Committee ${conviction}`);
    }

    // Opportunity score (max 30 pts)
    const opp = oppMap.get(ticker);
    if (opp != null) {
      const pts = Math.round((opp / 100) * 30);
      score += pts;
      reasons.push(`Opportunity score ${opp.toFixed(0)}/100`);
    }

    // Discovery radar (max 30 pts)
    const radar = radarMap.get(ticker);
    if (radar) {
      const pts = Math.round((radar.score / 100) * 30);
      score += pts;
      if (radar.score >= 80) reasons.push("Discovery Tier A");
      else if (radar.score >= 65) reasons.push("Discovery Tier B");
      else reasons.push(`Discovery score ${radar.score}/100`);
    }

    // Research queue bonus
    const wlStatus = watchlistMap.get(ticker);
    if (wlStatus === "researching" || wlStatus === "high_conviction") {
      score += 5;
      reasons.push("In research queue");
    }

    if (score >= 10) {
      const companyName = nameMap.get(ticker) ?? radar?.name ?? ticker;
      scored.push({ ticker, score: Math.min(100, score), reasons, companyName });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, 10).map((c, i) => {
    const conviction = committeeMap.get(c.ticker);
    const isStrongBuy = conviction === "Strong Buy";
    return {
      rank: i + 1,
      ticker: c.ticker,
      companyName: c.companyName,
      compositeScore: c.score,
      discoveryScore: radarMap.get(c.ticker)?.score ?? null,
      opportunityScore: oppMap.get(c.ticker) ?? null,
      committeeConviction: conviction ?? null,
      inResearchQueue: watchlistMap.has(c.ticker),
      suggestedStarterPct: isStrongBuy ? 4 : 2,
      reasons: c.reasons,
    };
  });
}

// ─── Sell Flag Review ─────────────────────────────────────────────────────────

export interface SellFlag {
  ticker: string;
  name: string;
  currentPct: number;
  flags: {
    type: "weakened_thesis" | "oversized" | "better_alternative" | "exceeds_max";
    severity: "high" | "medium";
    detail: string;
  }[];
  recommendation: string;
}

export async function buildSellReview(): Promise<SellFlag[]> {
  const since60d = new Date(Date.now() - 60 * 86400 * 1000);

  const [positions, thesisImpacts, committee, topOpps] = await Promise.all([
    db.position.findMany({
      where: { status: "active" },
      select: { ticker: true, name: true, currentValueUsd: true, allocationPct: true },
    }),
    db.thesisImpactRecord.findMany({
      where: { createdAt: { gte: since60d }, impactLevel: "weakened" },
      select: { ticker: true, reasoning: true },
    }),
    db.committeeSession.findMany({
      orderBy: { createdAt: "desc" }, take: 100,
      select: { ticker: true, conviction: true },
    }),
    db.opportunityScore.findMany({
      orderBy: { opportunityScore: "desc" }, take: 5,
      select: { ticker: true, opportunityScore: true },
    }),
  ]);

  const nonCash = positions.filter(p => p.ticker !== "CASH");
  const totalUsd = nonCash.reduce((s, p) => s + (p.currentValueUsd ?? 0), 0);
  const getPct = (p: typeof nonCash[0]) =>
    totalUsd > 0 ? ((p.currentValueUsd ?? 0) / totalUsd) * 100 : (p.allocationPct ?? 0);

  const weakenedTickers = new Set(thesisImpacts.map(t => t.ticker));
  const weakenedReason = new Map(thesisImpacts.map(t => [t.ticker, t.reasoning]));
  const committeeMap = new Map<string, string>();
  for (const s of committee) {
    if (!committeeMap.has(s.ticker)) committeeMap.set(s.ticker, s.conviction);
  }
  const topOppTickers = new Set(topOpps.map(o => o.ticker));
  const MAX_SINGLE = 15;

  const flags: SellFlag[] = [];

  for (const p of nonCash) {
    const pct = getPct(p);
    const posFlags: SellFlag["flags"] = [];
    const conviction = committeeMap.get(p.ticker);

    // Weakened thesis
    if (weakenedTickers.has(p.ticker)) {
      posFlags.push({
        type: "weakened_thesis",
        severity: "high",
        detail: `Thesis weakened in last 60d. ${weakenedReason.get(p.ticker) ?? "Review thesis validity."}`,
      });
    }

    // Position oversized
    if (pct > MAX_SINGLE) {
      posFlags.push({
        type: "exceeds_max",
        severity: pct > 20 ? "high" : "medium",
        detail: `Position at ${pct.toFixed(1)}% — exceeds ${MAX_SINGLE}% single-stock guideline.`,
      });
    }

    // Committee downgrade or no conviction
    if (conviction === "Sell" || conviction === "Reduce") {
      posFlags.push({
        type: "weakened_thesis",
        severity: "high",
        detail: `Committee verdict: ${conviction}. Consider reducing.`,
      });
    }

    // Better alternative exists (top opportunity not in portfolio)
    if (topOppTickers.has(p.ticker) === false && pct > 5 && posFlags.length > 0) {
      const topAlt = topOpps[0];
      if (topAlt && !nonCash.find(pos => pos.ticker === topAlt.ticker)) {
        posFlags.push({
          type: "better_alternative",
          severity: "medium",
          detail: `${topAlt.ticker} ranked higher in opportunity engine — consider rotation.`,
        });
      }
    }

    if (posFlags.length > 0) {
      const hasCritical = posFlags.some(f => f.severity === "high");
      flags.push({
        ticker: p.ticker,
        name: p.name,
        currentPct: Math.round(pct * 10) / 10,
        flags: posFlags,
        recommendation: hasCritical
          ? "Review for reduction — multiple high-severity flags raised."
          : "Monitor — consider partial trim if thesis does not improve.",
      });
    }
  }

  // Sort: most flags first, then by pct
  return flags.sort((a, b) =>
    b.flags.filter(f => f.severity === "high").length - a.flags.filter(f => f.severity === "high").length ||
    b.currentPct - a.currentPct
  );
}

// ─── Variable Capital Allocation ──────────────────────────────────────────────

export interface CapitalDeployment {
  amountUsd: number;
  allocations: {
    ticker: string;
    companyName: string;
    dollarAmount: number;
    pct: number;
    committeeConviction: string | null;
    compositeScore: number;
    reason: string;
  }[];
  unallocated: number;
  summary: string;
}

export async function computeCapitalDeployment(amountUsd: number): Promise<CapitalDeployment> {
  const candidates = await buildBuyRanking();

  if (candidates.length === 0) {
    return {
      amountUsd,
      allocations: [],
      unallocated: amountUsd,
      summary: "No buy candidates found. Run Discovery and committee sessions to populate rankings.",
    };
  }

  // Weight top candidates: Rank 1 gets 3x weight, Rank 2 gets 2x, rest get 1x
  const top = candidates.slice(0, 5);
  const weights = top.map((_, i) => Math.max(1, 4 - i));
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  const allocations = top.map((c, i) => {
    const pct = (weights[i] / totalWeight) * 100;
    const dollar = Math.round((pct / 100) * amountUsd);
    return {
      ticker: c.ticker,
      companyName: c.companyName,
      dollarAmount: dollar,
      pct: Math.round(pct * 10) / 10,
      committeeConviction: c.committeeConviction,
      compositeScore: c.compositeScore,
      reason: c.reasons.slice(0, 2).join(" · "),
    };
  });

  // Adjust for rounding — add remainder to top candidate
  const allocated = allocations.reduce((s, a) => s + a.dollarAmount, 0);
  if (allocations.length > 0) allocations[0].dollarAmount += amountUsd - allocated;

  const topTicker = allocations[0].ticker;
  const topPct = allocations[0].pct.toFixed(0);
  const summary = `$${amountUsd.toLocaleString()} → ${topPct}% to ${topTicker}${allocations.length > 1 ? `, split across ${allocations.length} positions` : ""}. Based on committee conviction + opportunity + discovery scores.`;

  return { amountUsd, allocations, unallocated: 0, summary };
}
