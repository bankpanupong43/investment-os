// Discovery Radar — Phase 12B
//
// Wraps radar-engine.ts and adds:
//   1. Tier A/B/C classification (A=80+, B=65-79, C=50-64)
//   2. Discovery Category labels (Small Cap Compounder, Mid Cap Compounder, etc.)
//   3. Portfolio Gap Detection (bucket gaps + theme gaps)
//   4. Research Queue Integration (Tier A → Watchlist status=researching)
//   5. DiscoveryRadarResult for /api/discovery and CIO Brief

import { db } from "./db";
import {
  generateRadarCandidates,
  saveRadarCandidates,
  deserializeCandidate,
  buildThemeSummaries,
  DISCOVERY_THEMES,
  type DiscoveryCandidateData,
  type ThemeSummary,
} from "./radar-engine";

// ─── Tier ─────────────────────────────────────────────────────────────────────

export type DiscoveryTier = "A" | "B" | "C";

export function classifyTier(score: number): DiscoveryTier {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  return "C";
}

// ─── Discovery Category Labels ────────────────────────────────────────────────

export type DiscoveryCategoryLabel =
  | "Small Cap Compounder"
  | "Mid Cap Compounder"
  | "Emerging Leader"
  | "Turnaround"
  | "Theme Beneficiary"
  | "Quality Compounder"
  | "Discovery";

export function deriveDiscoveryCategoryLabel(c: DiscoveryCandidateData): DiscoveryCategoryLabel {
  const { category, themes, signals, sources } = c;

  if (
    themes.length > 0 &&
    sources.includes("theme_momentum") &&
    !sources.includes("opportunity_engine")
  ) return "Theme Beneficiary";

  if (category === "small_cap") {
    const hasGrowth = signals.some(s => s.label === "Revenue Growth" || s.label === "EPS Growth");
    const hasQuality = signals.some(s => s.label === "ROIC" || s.label === "Gross Margin");
    if (hasGrowth && hasQuality) return "Small Cap Compounder";
    return "Emerging Leader";
  }

  if (category === "mid_cap") {
    const hasQuality = signals.some(s => s.label === "Gross Margin" || s.label === "ROIC");
    if (hasQuality) return "Mid Cap Compounder";
    const hasGrowth = signals.some(s => s.label === "Revenue Growth" || s.label === "EPS Growth");
    if (hasGrowth) return "Emerging Leader";
    return "Quality Compounder";
  }

  if (sources.includes("sec_filings") && category === "special_situation") return "Turnaround";

  if (signals.some(s => s.label === "Earnings beat" || s.label === "Filing strengthened thesis")) {
    return "Emerging Leader";
  }

  return "Discovery";
}

// ─── Tiered Candidate ─────────────────────────────────────────────────────────

export interface TieredCandidate extends DiscoveryCandidateData {
  id: string;
  tier: DiscoveryTier;
  discoveryCategory: DiscoveryCategoryLabel;
  status: string;
  promotedAt: string | null;
  lastRefreshedAt: string;
  createdAt: string;
}

// ─── Portfolio Gap ─────────────────────────────────────────────────────────────

export interface PortfolioGap {
  type: "bucket" | "theme";
  name: string;
  description: string;
  severity: "high" | "medium" | "low";
  currentPct: number;
  targetPct: number;
  drift: number;
  suggestedTickers: string[];
}

// ─── Result ───────────────────────────────────────────────────────────────────

export interface DiscoveryRadarResult {
  tierA: TieredCandidate[];
  tierB: TieredCandidate[];
  tierC: TieredCandidate[];
  themes: ThemeSummary[];
  portfolioGaps: PortfolioGap[];
  summary: {
    totalCandidates: number;
    tierACount: number;
    tierBCount: number;
    tierCCount: number;
    newThisWeek: number;
    topTheme: string | null;
    generatedAt: string;
    researchQueueAdded: number;
  };
}

// ─── Portfolio Gap Detection ──────────────────────────────────────────────────

export async function detectPortfolioGaps(): Promise<PortfolioGap[]> {
  const [positions, targets, settings, activeCandidates] = await Promise.all([
    db.position.findMany({
      where: { status: "active" },
      select: { ticker: true, sector: true, industry: true, currentValueUsd: true },
    }),
    db.allocationTarget.findMany(),
    db.portfolioSettings.findFirst(),
    db.discoveryCandidate.findMany({
      where: { status: "active" },
      orderBy: { radarScore: "desc" },
      take: 100,
      select: { ticker: true, radarScore: true, themes: true },
    }),
  ]);

  const gaps: PortfolioGap[] = [];
  const totalCapital = settings?.totalCapitalUsd ?? 0;

  // ── Bucket gaps ─────────────────────────────────────────────────────────────
  if (totalCapital > 0 && targets.length > 0) {
    const tickerToBucket = new Map(targets.map(t => [t.ticker, t.bucket]));

    // Sum target pct per bucket
    const bucketTargetPct = new Map<string, number>();
    for (const t of targets) {
      bucketTargetPct.set(t.bucket, (bucketTargetPct.get(t.bucket) ?? 0) + t.targetPct);
    }

    // Sum current value per bucket
    const bucketCurrentUsd = new Map<string, number>();
    for (const pos of positions) {
      const bucket = tickerToBucket.get(pos.ticker);
      if (bucket && pos.currentValueUsd) {
        bucketCurrentUsd.set(bucket, (bucketCurrentUsd.get(bucket) ?? 0) + pos.currentValueUsd);
      }
    }

    for (const [bucket, targetPct] of bucketTargetPct.entries()) {
      const currentUsd = bucketCurrentUsd.get(bucket) ?? 0;
      const currentPct = (currentUsd / totalCapital) * 100;
      const drift = currentPct - targetPct;

      if (drift < -5) {
        const label = `${bucket.charAt(0).toUpperCase()}${bucket.slice(1)}`;
        const severity: PortfolioGap["severity"] =
          drift < -15 ? "high" : drift < -8 ? "medium" : "low";
        const themed = activeCandidates.slice(0, 3).map(c => c.ticker);

        gaps.push({
          type: "bucket",
          name: `${label} allocation`,
          description: `${label} bucket is ${Math.abs(drift).toFixed(1)}% below target. Consider adding ${label.toLowerCase()} positions.`,
          severity,
          currentPct,
          targetPct,
          drift,
          suggestedTickers: themed,
        });
      }
    }
  }

  // ── Theme gaps ──────────────────────────────────────────────────────────────
  const portfolioTickers = new Set(positions.map(p => p.ticker));
  const portfolioSectors = new Set(positions.map(p => p.sector).filter(Boolean) as string[]);
  const portfolioIndustries = new Set(positions.map(p => p.industry).filter(Boolean) as string[]);

  for (const [theme, def] of Object.entries(DISCOVERY_THEMES)) {
    const hasTickerExposure = def.tickers.some(t => portfolioTickers.has(t));
    const hasSectorExposure = def.sectors.some(s =>
      [...portfolioSectors].some(ps => ps.includes(s) || s.includes(ps))
    );
    const hasIndustryExposure = def.industries.some(i =>
      [...portfolioIndustries].some(pi => pi.includes(i) || i.includes(pi))
    );

    if (hasTickerExposure || hasSectorExposure || hasIndustryExposure) continue;

    // Suggest top radar candidates matching this theme
    const themeCandidates = activeCandidates
      .filter(c => {
        try { return (JSON.parse(c.themes) as string[]).includes(theme); }
        catch { return false; }
      })
      .slice(0, 3)
      .map(c => c.ticker);

    gaps.push({
      type: "theme",
      name: theme,
      description: `No portfolio exposure to ${theme}. Consider a position to capture this structural trend.`,
      severity: "medium",
      currentPct: 0,
      targetPct: 0,
      drift: 0,
      suggestedTickers: themeCandidates,
    });
  }

  // Sort: high → medium → low, bucket gaps first
  return gaps.sort((a, b) => {
    const sev = { high: 0, medium: 1, low: 2 };
    const type = { bucket: 0, theme: 1 };
    return sev[a.severity] - sev[b.severity] || type[a.type] - type[b.type];
  });
}

// ─── Build Result from DB ─────────────────────────────────────────────────────

export async function buildDiscoveryRadarResult(): Promise<DiscoveryRadarResult> {
  const [rawCandidates, themes, portfolioGaps] = await Promise.all([
    db.discoveryCandidate.findMany({
      where: { status: "active" },
      orderBy: { radarScore: "desc" },
    }),
    buildThemeSummaries(),
    detectPortfolioGaps(),
  ]);

  const since7d = new Date(Date.now() - 7 * 86400 * 1000);
  let newThisWeek = 0;

  const tierA: TieredCandidate[] = [];
  const tierB: TieredCandidate[] = [];
  const tierC: TieredCandidate[] = [];

  for (const raw of rawCandidates) {
    const deserialized = deserializeCandidate(raw);
    const tier = classifyTier(deserialized.radarScore);

    if (new Date(raw.createdAt) >= since7d) newThisWeek++;

    const tiered: TieredCandidate = {
      ...deserialized,
      tier,
      discoveryCategory: deriveDiscoveryCategoryLabel(deserialized),
    };

    if (tier === "A") tierA.push(tiered);
    else if (tier === "B") tierB.push(tiered);
    else if (raw.radarScore >= 50) tierC.push(tiered);
  }

  return {
    tierA,
    tierB,
    tierC,
    themes,
    portfolioGaps,
    summary: {
      totalCandidates: rawCandidates.length,
      tierACount: tierA.length,
      tierBCount: tierB.length,
      tierCCount: tierC.length,
      newThisWeek,
      topTheme: themes[0]?.theme ?? null,
      generatedAt: new Date().toISOString(),
      researchQueueAdded: 0,
    },
  };
}

// ─── Research Queue Integration ───────────────────────────────────────────────

export async function promoteToResearchQueue(tierACandidates: TieredCandidate[]): Promise<number> {
  if (tierACandidates.length === 0) return 0;

  const [positions, watchlistItems] = await Promise.all([
    db.position.findMany({ where: { status: "active" }, select: { ticker: true } }),
    db.watchlist.findMany({ select: { ticker: true, status: true } }),
  ]);

  const ownedTickers = new Set(positions.map(p => p.ticker));
  const watchlistMap = new Map(watchlistItems.map(w => [w.ticker, w.status]));

  let added = 0;
  for (const c of tierACandidates) {
    if (ownedTickers.has(c.ticker)) continue;
    const existingStatus = watchlistMap.get(c.ticker);
    if (existingStatus === "high_conviction" || existingStatus === "rejected" || existingStatus === "owned") continue;

    await db.watchlist.upsert({
      where: { ticker: c.ticker },
      create: {
        ticker: c.ticker,
        name: c.companyName,
        status: "researching",
        interestReason: `Discovery Radar Tier A — ${c.discoveryReason} (Score: ${c.radarScore}/100)`,
        notes: `Auto-added by Discovery Radar. Category: ${c.discoveryCategory}. Themes: ${c.themes.join(", ") || "none"}.`,
      },
      update: {
        status: existingStatus === "watching" ? "researching" : (existingStatus ?? "researching"),
        notes: `Auto-updated by Discovery Radar. Category: ${c.discoveryCategory}. Score: ${c.radarScore}/100. Themes: ${c.themes.join(", ") || "none"}.`,
      },
    });
    added++;
  }

  return added;
}

// ─── Full Refresh ─────────────────────────────────────────────────────────────

export async function runDiscoveryRefresh(): Promise<DiscoveryRadarResult> {
  const candidates = await generateRadarCandidates();
  await saveRadarCandidates(candidates);

  const result = await buildDiscoveryRadarResult();
  const researchQueueAdded = await promoteToResearchQueue(result.tierA);

  return {
    ...result,
    summary: { ...result.summary, researchQueueAdded },
  };
}
