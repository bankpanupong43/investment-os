// Discovery Intelligence Engine — Phase 28B.2
//
// Aggregates CompanyMention records into ranked DiscoverySignal objects.
// Computes a composite discovery score from mention momentum, source diversity,
// sentiment, theme alignment, and opportunity context.
//
// Three exports:
//   generateDiscoverySignals()   — bulk aggregation → sorted DiscoverySignal[]
//   buildDiscoveryCandidates()   — upserts DiscoveryCandidate + Watchlist (score ≥ 65)
//   getDiscoveryLeaderboard()    — formatted leaderboard for API / Copilot

import { db } from "./db";
import { getActivePortfolioPositions } from "./portfolio-value-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DiscoverySignal {
  ticker:               string;
  companyName:          string;
  mentionCount7d:       number;
  mentionCount30d:      number;
  mentionCount90d:      number;
  sourceDiversity:      number;       // 1–3 unique sourceTypes
  sourceDiversityScore: number;       // 0–100
  positiveMentions:     number;
  negativeMentions:     number;
  neutralMentions:      number;
  sentimentScore:       number;       // –1.0 → +1.0
  sentimentNormalized:  number;       // 0–100
  trend:                "Rising" | "Stable" | "Falling";
  momentumScore:        number;       // 0–100
  themeScore:           number;       // 0–100 (from ThemeScout)
  opportunityScore:     number;       // 0–100 (from OpportunityScore table)
  discoveryScore:       number;       // 0–100 composite
  noveltyScore:         number;       // 0–100 (7d acceleration vs 30d baseline)
  sourceBreakdown:      Record<string, number>;
  isOwned:              boolean;
  inWatchlist:          boolean;
}

export interface DiscoveryLeaderboard {
  signals:           DiscoverySignal[];
  generatedAt:       string;
  totalTickers:      number;
  risingCount:       number;
  crossSourceCount:  number;  // ≥ 2 source types
  autoPromotedCount: number;  // discoveryScore ≥ 65
}

export interface BuildResult {
  processed:  number;
  promoted:   number;
  queued:     number;
  errors:     number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseJsonSafe<T>(s: string | null | undefined, fallback: T): T {
  try { return JSON.parse(s ?? "") as T; } catch { return fallback; }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// ─── Core aggregation ─────────────────────────────────────────────────────────

export async function generateDiscoverySignals(): Promise<DiscoverySignal[]> {
  const now  = Date.now();
  const d7   = new Date(now - 7  * 86_400_000);
  const d30  = new Date(now - 30 * 86_400_000);
  const d90  = new Date(now - 90 * 86_400_000);

  type MentionRow = { ticker: string; companyName: string; sourceType: string; sentiment: string; mentionDate: Date };

  // Single bulk query for 90d mentions
  const mentions: MentionRow[] = await db.companyMention.findMany({
    where: { mentionDate: { gte: d90 } },
    select: { ticker: true, companyName: true, sourceType: true, sentiment: true, mentionDate: true },
  }).catch(() => []);

  if (mentions.length === 0) return [];

  // In-memory aggregation per ticker
  type Agg = {
    ticker:         string;
    companyName:    string;
    count90d:       number;
    count30d:       number;
    count7d:        number;
    sources:        Set<string>;
    sourceBreakdown: Record<string, number>;
    positive:       number;
    negative:       number;
    neutral:        number;
  };

  const aggMap = new Map<string, Agg>();
  for (const m of mentions) {
    if (!aggMap.has(m.ticker)) {
      aggMap.set(m.ticker, {
        ticker:          m.ticker,
        companyName:     m.companyName,
        count90d:        0,
        count30d:        0,
        count7d:         0,
        sources:         new Set(),
        sourceBreakdown: {},
        positive:        0,
        negative:        0,
        neutral:         0,
      });
    }
    const agg = aggMap.get(m.ticker)!;
    agg.count90d++;
    if (m.mentionDate >= d30) agg.count30d++;
    if (m.mentionDate >= d7)  agg.count7d++;
    agg.sources.add(m.sourceType);
    agg.sourceBreakdown[m.sourceType] = (agg.sourceBreakdown[m.sourceType] ?? 0) + 1;
    if (m.sentiment === "positive")      agg.positive++;
    else if (m.sentiment === "negative") agg.negative++;
    else                                  agg.neutral++;
  }

  // Supporting data in parallel
  const [themeScoutRows, activePositions, watchlistItems] = await Promise.all([
    db.themeScout.findMany({
      select: { candidates: true, researchPriority: true },
    }).catch(() => [] as { candidates: string; researchPriority: number }[]),
    getActivePortfolioPositions().catch(() => []),
    db.watchlist.findMany({ select: { ticker: true } }).catch(() => [] as { ticker: string }[]),
  ]);

  // OpportunityScore — best-effort (table may not exist in all environments)
  const oppScores = new Map<string, number>();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opps = await (db as any).opportunityScore.findMany({
      orderBy: { generatedAt: "desc" },
      take: 500,
      select: { ticker: true, opportunityScore: true },
    }) as { ticker: string; opportunityScore: number }[];
    for (const o of opps) {
      if (!oppScores.has(o.ticker)) oppScores.set(o.ticker, o.opportunityScore);
    }
  } catch { /* opportunityScore table may not exist */ }

  // ThemeScout: ticker → max researchPriority across themes containing it
  const themeScoreMap = new Map<string, number>();
  for (const row of themeScoutRows) {
    const candidates = parseJsonSafe<{ ticker: string }[]>(row.candidates, []);
    for (const c of candidates) {
      const prev = themeScoreMap.get(c.ticker) ?? 0;
      if (row.researchPriority > prev) themeScoreMap.set(c.ticker, row.researchPriority);
    }
  }

  const ownedTickers     = new Set(activePositions.map(p => p.ticker));
  const watchlistTickers = new Set(watchlistItems.map(w => w.ticker));

  // Score each ticker
  const signals: DiscoverySignal[] = [];

  for (const [ticker, agg] of aggMap) {
    if (agg.count30d === 0) continue; // no activity in 30d window

    // Trend: compare 7d daily rate vs 30d daily rate
    const rate7d  = agg.count7d  / 7;
    const rate30d = agg.count30d / 30;
    const trend: "Rising" | "Stable" | "Falling" =
      rate7d > rate30d * 1.5 ? "Rising"  :
      rate7d < rate30d * 0.5 ? "Falling" :
      "Stable";

    // Momentum score (0–100): raw count base × trend multiplier
    const momentumBase  = Math.min(100, agg.count30d * 10);
    const trendMult     = trend === "Rising" ? 1.0 : trend === "Stable" ? 0.70 : 0.35;
    const momentumScore = Math.round(momentumBase * trendMult);

    // Source diversity score
    const sourceDiversity      = agg.sources.size;
    const sourceDiversityScore = sourceDiversity >= 3 ? 100 : sourceDiversity === 2 ? 67 : 33;

    // Sentiment score
    const totalCount         = agg.positive + agg.negative + agg.neutral;
    const rawSentiment       = totalCount > 0 ? (agg.positive - agg.negative) / totalCount : 0;
    const sentimentNormalized = Math.round((rawSentiment + 1) / 2 * 100);

    // Theme and opportunity context
    const themeScore       = themeScoreMap.get(ticker)  ?? 0;
    const opportunityScore = oppScores.get(ticker)       ?? 0;

    // Composite discovery score
    const discoveryScore = clamp(Math.round(
      momentumScore        * 0.30 +
      sourceDiversityScore * 0.25 +
      sentimentNormalized  * 0.15 +
      themeScore           * 0.15 +
      opportunityScore     * 0.15
    ), 0, 100);

    // Novelty: % of 30d mentions that occurred in last 7d (acceleration indicator)
    const noveltyScore = clamp(Math.round(agg.count7d / Math.max(agg.count30d, 1) * 100), 0, 100);

    signals.push({
      ticker,
      companyName:          agg.companyName,
      mentionCount7d:       agg.count7d,
      mentionCount30d:      agg.count30d,
      mentionCount90d:      agg.count90d,
      sourceDiversity,
      sourceDiversityScore,
      positiveMentions:     agg.positive,
      negativeMentions:     agg.negative,
      neutralMentions:      agg.neutral,
      sentimentScore:       Math.round(rawSentiment * 100) / 100,
      sentimentNormalized,
      trend,
      momentumScore,
      themeScore,
      opportunityScore,
      discoveryScore,
      noveltyScore,
      sourceBreakdown:      { ...agg.sourceBreakdown },
      isOwned:              ownedTickers.has(ticker),
      inWatchlist:          watchlistTickers.has(ticker),
    });
  }

  return signals.sort((a, b) => b.discoveryScore - a.discoveryScore);
}

// ─── Candidate builder ────────────────────────────────────────────────────────

export async function buildDiscoveryCandidates(): Promise<BuildResult> {
  const signals = await generateDiscoverySignals();
  let promoted = 0, queued = 0, errors = 0;

  for (const sig of signals) {
    if (sig.discoveryScore < 65) continue;

    const confidence  = sig.discoveryScore >= 80 ? "high" : "medium";
    const reason      = `${sig.trend} mention momentum across ${sig.sourceDiversity} source type${sig.sourceDiversity !== 1 ? "s" : ""}`;
    const signalsList = [
      `${sig.mentionCount30d} mentions/30d`,
      sig.trend,
      sig.sourceDiversity >= 2 ? `${sig.sourceDiversity} source types` : undefined,
      sig.sentimentScore > 0.3 ? "positive sentiment" : sig.sentimentScore < -0.3 ? "negative sentiment" : undefined,
    ].filter((s): s is string => Boolean(s));

    try {
      await db.discoveryCandidate.upsert({
        where:  { ticker: sig.ticker },
        create: {
          ticker:          sig.ticker,
          companyName:     sig.companyName,
          category:        "equity",
          discoveryReason: reason,
          radarScore:      sig.discoveryScore,
          confidence,
          themes:          JSON.stringify([]),
          signals:         JSON.stringify(signalsList),
          sources:         JSON.stringify(Object.keys(sig.sourceBreakdown)),
          noveltyScore:    sig.noveltyScore,
          sourceCount:     sig.sourceDiversity,
          status:          "active",
          lastRefreshedAt: new Date(),
        },
        update: {
          companyName:     sig.companyName,
          discoveryReason: reason,
          radarScore:      sig.discoveryScore,
          confidence,
          signals:         JSON.stringify(signalsList),
          sources:         JSON.stringify(Object.keys(sig.sourceBreakdown)),
          noveltyScore:    sig.noveltyScore,
          sourceCount:     sig.sourceDiversity,
          lastRefreshedAt: new Date(),
        },
      });
      promoted++;
    } catch {
      errors++;
      continue;
    }

    // Auto-add to Watchlist when score > 75 and not already tracked
    if (sig.discoveryScore > 75 && !sig.isOwned && !sig.inWatchlist) {
      try {
        await db.watchlist.upsert({
          where:  { ticker: sig.ticker },
          create: {
            ticker:         sig.ticker,
            name:           sig.companyName,
            interestReason: `Cross-source attention acceleration (discovery score: ${sig.discoveryScore})`,
            status:         "researching",
            notes:          `Auto-added: ${sig.mentionCount30d} mentions/30d across ${sig.sourceDiversity} source type${sig.sourceDiversity !== 1 ? "s" : ""}`,
          },
          update: {},
        });
        queued++;
      } catch { /* watchlist upsert failed — non-fatal */ }
    }
  }

  return { processed: signals.length, promoted, queued, errors };
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────

export async function getDiscoveryLeaderboard(): Promise<DiscoveryLeaderboard> {
  const signals = await generateDiscoverySignals();

  return {
    signals:           signals.slice(0, 20),
    generatedAt:       new Date().toISOString(),
    totalTickers:      signals.length,
    risingCount:       signals.filter(s => s.trend === "Rising").length,
    crossSourceCount:  signals.filter(s => s.sourceDiversity >= 2).length,
    autoPromotedCount: signals.filter(s => s.discoveryScore >= 65).length,
  };
}
