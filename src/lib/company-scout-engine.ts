// Company Scout Engine — Phase 28C
//
// Consumes the Discovery Intelligence layer and ranks companies the investor
// is NOT currently paying attention to. Primary input: CompanyMention →
// DiscoverySignal → scoutScore. Secondary inputs: ThemeScout, Watchlist, Portfolio.
//
// Three exports:
//   scanCompanies()              — builds ranked ScoutCandidate[]
//   rankCompanies(candidates)    — sort by scoutScore DESC
//   generateCompanyScoutReport() — full report + wiki + auto-queue + DB upserts

import * as fs   from "fs";
import * as path from "path";
import { db }    from "./db";
import { generateDiscoverySignals, type DiscoverySignal } from "./discovery-intelligence-engine";
import { resolveBrainOsPath } from "./shared-paths";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScoutCategory = "Emerging" | "Accelerating" | "Consensus" | "Hidden Gem" | "Monitoring";

export interface ScoutCandidate {
  ticker:               string;
  companyName:          string;
  scoutScore:           number;          // 0–100 composite
  scoutCategory:        ScoutCategory;
  discoveryScore:       number;
  noveltyScore:         number;
  sourceDiversity:      number;
  sourceDiversityScore: number;
  mentionCount7d:       number;
  mentionCount30d:      number;
  sentimentScore:       number;
  trend:                "Rising" | "Stable" | "Falling";
  themeScore:           number;
  isOwned:              boolean;
  inWatchlist:          boolean;
}

export interface CoverageAudit {
  totalTracked:  number;
  owned:         number;
  watchlist:     number;
  newCompanies:  number;
  ownedPctTop10: number;
  biasDetected:  boolean;  // ownedPctTop10 > 80
}

export interface CompanyScoutReport {
  emerging:       ScoutCandidate[];  // not owned, discovery score ≥ 65
  accelerating:   ScoutCandidate[];  // Rising trend, 7d count > 50% of 30d
  consensus:      ScoutCandidate[];  // 3+ source types, score ≥ 70
  hiddenGems:     ScoutCandidate[];  // score ≥ 60, below-median count, 2+ sources
  allRanked:      ScoutCandidate[];  // full list sorted by scoutScore
  topNew:         ScoutCandidate[];  // top non-portfolio candidates regardless of threshold
  generatedAt:    string;
  autoQueued:     number;
  coverageAudit:  CoverageAudit;
  wikiPath:       string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function parseJsonSafe<T>(s: string | null | undefined, fallback: T): T {
  try { return JSON.parse(s ?? "") as T; } catch { return fallback; }
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid    = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ─── Category assignment ──────────────────────────────────────────────────────

function assignCategory(
  sig:          DiscoverySignal,
  medianCount:  number,
): ScoutCategory {
  // Consensus: strongest cross-source conviction
  if (sig.sourceDiversity >= 3 && sig.discoveryScore >= 70) return "Consensus";

  // Hidden Gem: quality attention before mass coverage
  if (
    sig.discoveryScore >= 60 &&
    sig.mentionCount30d < medianCount &&
    sig.sourceDiversity >= 2
  ) return "Hidden Gem";

  // Emerging: brand-new discovery outside portfolio
  if (!sig.isOwned && !sig.inWatchlist && sig.discoveryScore >= 65) return "Emerging";

  // Accelerating: 7d count > 50% of 30d (momentum surge)
  const mentionGrowth = sig.mentionCount30d > 0
    ? sig.mentionCount7d / sig.mentionCount30d
    : 0;
  if (sig.trend === "Rising" && mentionGrowth > 0.5) return "Accelerating";

  return "Monitoring";
}

// ─── Scout Score ──────────────────────────────────────────────────────────────

function computeScoutScore(sig: DiscoverySignal): number {
  return clamp(Math.round(
    sig.discoveryScore       * 0.40 +
    sig.noveltyScore         * 0.25 +
    sig.sourceDiversityScore * 0.20 +
    sig.themeScore           * 0.15
  ), 0, 100);
}

// ─── Core scan ────────────────────────────────────────────────────────────────

export async function scanCompanies(): Promise<ScoutCandidate[]> {
  const signals = await generateDiscoverySignals();
  if (signals.length === 0) return [];

  const counts     = signals.map(s => s.mentionCount30d);
  const medianCnt  = median(counts);

  return signals.map(sig => ({
    ticker:               sig.ticker,
    companyName:          sig.companyName,
    scoutScore:           computeScoutScore(sig),
    scoutCategory:        assignCategory(sig, medianCnt),
    discoveryScore:       sig.discoveryScore,
    noveltyScore:         sig.noveltyScore,
    sourceDiversity:      sig.sourceDiversity,
    sourceDiversityScore: sig.sourceDiversityScore,
    mentionCount7d:       sig.mentionCount7d,
    mentionCount30d:      sig.mentionCount30d,
    sentimentScore:       sig.sentimentScore,
    trend:                sig.trend,
    themeScore:           sig.themeScore,
    isOwned:              sig.isOwned,
    inWatchlist:          sig.inWatchlist,
  }));
}

export function rankCompanies(candidates: ScoutCandidate[]): ScoutCandidate[] {
  return [...candidates].sort((a, b) => b.scoutScore - a.scoutScore);
}

// ─── Wiki writer ──────────────────────────────────────────────────────────────

function writeScoutWiki(
  report: Omit<CompanyScoutReport, "wikiPath">,
  date:   string,
): string | null {
  const brainOs = resolveBrainOsPath();
  if (!brainOs) return null;

  const dir = path.join(brainOs, "07 Investment", "Wiki", "Company Scout");
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    return null;
  }

  const filePath = path.join(dir, `${date}-Scout.md`);

  const audit = report.coverageAudit;
  const fmtRow = (c: ScoutCandidate) =>
    `| ${c.ticker} | ${c.scoutScore} | ${c.discoveryScore} | ${c.mentionCount30d} | ${c.sourceDiversity} | ${c.sentimentScore.toFixed(2)} | ${c.trend} | ${c.scoutCategory} | ${c.isOwned ? "Yes" : "-"} |`;

  const sections: string[] = [
    `# Company Scout Report — ${date}`,
    "",
    `## Discovery Coverage Audit`,
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total Tracked | ${audit.totalTracked} |`,
    `| Owned Positions | ${audit.owned} (${(audit.owned / audit.totalTracked * 100).toFixed(0)}%) |`,
    `| Watchlist | ${audit.watchlist} |`,
    `| New Companies | ${audit.newCompanies} (${(audit.newCompanies / audit.totalTracked * 100).toFixed(0)}%) |`,
    `| Top-10 Owned % | ${audit.ownedPctTop10.toFixed(0)}% |`,
    `| Bias Detected | ${audit.biasDetected ? "YES — AUTO-PROMOTION DISABLED" : "No"} |`,
    "",
    `## Top New Companies (Non-Portfolio)`,
    "",
    `| Ticker | Scout | Discovery | 30d | Sources | Sentiment | Trend | Category |`,
    `|--------|-------|-----------|-----|---------|-----------|-------|----------|`,
    ...report.topNew.slice(0, 10).map(c =>
      `| ${c.ticker} | ${c.scoutScore} | ${c.discoveryScore} | ${c.mentionCount30d} | ${c.sourceDiversity} | ${c.sentimentScore.toFixed(2)} | ${c.trend} | ${c.scoutCategory} |`
    ),
  ];

  if (report.consensus.length > 0) {
    sections.push("", "## Consensus", "", "| Ticker | Scout | Discovery | 30d | Src | Sent | Trend | Category | Owned |", "|--------|-------|-----------|-----|-----|------|-------|----------|-------|");
    report.consensus.forEach(c => sections.push(fmtRow(c)));
  }
  if (report.hiddenGems.length > 0) {
    sections.push("", "## Hidden Gems", "", "| Ticker | Scout | Discovery | 30d | Src | Sent | Trend | Category | Owned |", "|--------|-------|-----------|-----|-----|------|-------|----------|-------|");
    report.hiddenGems.forEach(c => sections.push(fmtRow(c)));
  }
  if (report.emerging.length > 0) {
    sections.push("", "## Emerging", "", "| Ticker | Scout | Discovery | 30d | Src | Sent | Trend | Category | Owned |", "|--------|-------|-----------|-----|-----|------|-------|----------|-------|");
    report.emerging.forEach(c => sections.push(fmtRow(c)));
  }
  if (report.accelerating.length > 0) {
    sections.push("", "## Accelerating", "", "| Ticker | Scout | Discovery | 30d | Src | Sent | Trend | Category | Owned |", "|--------|-------|-----------|-----|-----|------|-------|----------|-------|");
    report.accelerating.slice(0, 15).forEach(c => sections.push(fmtRow(c)));
  }

  if (report.autoQueued > 0) {
    sections.push("", `## Auto Research Queue Additions`, "", `${report.autoQueued} company/companies added to watchlist (Research Queue) this run.`);
  }

  sections.push(
    "",
    "---",
    `*Generated by Company Scout Engine — Phase 28C — ${new Date().toISOString()}*`
  );

  try {
    fs.writeFileSync(filePath, sections.join("\n"), "utf-8");
    return filePath;
  } catch {
    return null;
  }
}

// ─── Full report ──────────────────────────────────────────────────────────────

export async function generateCompanyScoutReport(): Promise<CompanyScoutReport> {
  const candidates = await scanCompanies();
  const ranked     = rankCompanies(candidates);

  // Coverage audit
  const top10        = ranked.slice(0, 10);
  const ownedTop10   = top10.filter(c => c.isOwned).length;
  const ownedPct10   = top10.length > 0 ? ownedTop10 / top10.length * 100 : 0;
  const biasDetected = ownedPct10 > 80;

  const coverageAudit: CoverageAudit = {
    totalTracked:  candidates.length,
    owned:         candidates.filter(c => c.isOwned).length,
    watchlist:     candidates.filter(c => c.inWatchlist).length,
    newCompanies:  candidates.filter(c => !c.isOwned && !c.inWatchlist).length,
    ownedPctTop10: ownedPct10,
    biasDetected,
  };

  // Partition by category
  const emerging     = ranked.filter(c => c.scoutCategory === "Emerging");
  const accelerating = ranked.filter(c => c.scoutCategory === "Accelerating");
  const consensus    = ranked.filter(c => c.scoutCategory === "Consensus");
  const hiddenGems   = ranked.filter(c => c.scoutCategory === "Hidden Gem");

  // Top new companies regardless of category threshold
  const topNew = ranked.filter(c => !c.isOwned && !c.inWatchlist).slice(0, 10);

  // Auto-queue: scoutScore >= 75, not owned, not already in watchlist
  // Only if no bias detected
  let autoQueued = 0;
  if (!biasDetected) {
    const toQueue = ranked.filter(c => c.scoutScore >= 75 && !c.isOwned && !c.inWatchlist);
    for (const c of toQueue) {
      try {
        await db.watchlist.upsert({
          where:  { ticker: c.ticker },
          create: {
            ticker:         c.ticker,
            name:           c.companyName,
            interestReason: `Company Scout High Conviction (scout score: ${c.scoutScore}, category: ${c.scoutCategory})`,
            status:         "researching",
            notes:          `Auto-added by Company Scout: ${c.mentionCount30d} mentions/30d, ${c.sourceDiversity} source type${c.sourceDiversity !== 1 ? "s" : ""}`,
          },
          update: {},
        });
        autoQueued++;
      } catch { /* non-fatal */ }
    }
  }

  // Upsert DiscoveryCandidate with scout data
  const now = new Date();
  for (const c of ranked.slice(0, 20)) {
    try {
      await db.discoveryCandidate.upsert({
        where: { ticker: c.ticker },
        create: {
          ticker:          c.ticker,
          companyName:     c.companyName,
          category:        "equity",
          discoveryReason: `${c.scoutCategory} — Company Scout`,
          radarScore:      c.discoveryScore,
          confidence:      c.scoutScore >= 70 ? "high" : c.scoutScore >= 50 ? "medium" : "low",
          themes:          JSON.stringify([]),
          signals:         JSON.stringify([`Scout: ${c.scoutScore}`, c.scoutCategory, `${c.mentionCount30d} mentions`]),
          sources:         JSON.stringify([]),
          noveltyScore:    c.noveltyScore,
          sourceCount:     c.sourceDiversity,
          scoutScore:      c.scoutScore,
          scoutCategory:   c.scoutCategory,
          lastScoutDate:   now,
          status:          "active",
          lastRefreshedAt: now,
        },
        update: {
          scoutScore:      c.scoutScore,
          scoutCategory:   c.scoutCategory,
          lastScoutDate:   now,
        },
      });
    } catch { /* non-fatal */ }
  }

  // Write wiki
  const date   = now.toISOString().slice(0, 10);
  const partial = { emerging, accelerating, consensus, hiddenGems, allRanked: ranked, topNew, generatedAt: now.toISOString(), autoQueued, coverageAudit };
  const wikiPath = writeScoutWiki(partial, date);

  return { ...partial, wikiPath };
}
