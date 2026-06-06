// Validation script for Phase 5A: Investment Universe & Screener
// Run: npx tsx scripts/validate-screener.ts

import { PrismaClient } from "@prisma/client";
import { computeScores } from "../src/lib/scoring-engine";
import { applyFilters, buildResearchQueue, DEFAULT_FILTERS } from "../src/lib/screener-pipeline";

const db = new PrismaClient();

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

async function main() {
  console.log("\n━━━ Phase 5A Validation: Investment Universe & Screener ━━━\n");

  // ── 1. Schema: Universe model ──────────────────────────────────────────────
  console.log("1. Universe model");
  const universeCount = await db.universe.count();
  check("Universe table exists and is queryable", true);
  check("Universe has entries", universeCount > 0, `found ${universeCount}`);

  const byTier: Record<string, number> = {};
  const entries = await db.universe.findMany({ include: { fundamentals: true, scores: { take: 1 } } });
  for (const e of entries) byTier[e.universeTier] = (byTier[e.universeTier] ?? 0) + 1;

  for (const tier of ["tier1","tier2","tier3","tier4","tier5"]) {
    check(`Tier ${tier} has entries`, (byTier[tier] ?? 0) > 0, `found ${byTier[tier] ?? 0}`);
  }

  // ── 2. Schema: Fundamental model ──────────────────────────────────────────
  console.log("\n2. Fundamental model");
  const fundCount = await db.fundamental.count();
  check("Fundamental table exists", true);
  check("Fundamentals linked to universe entries", fundCount > 0, `found ${fundCount}`);

  const sampleFund = await db.fundamental.findFirst({
    include: { universe: true },
  });
  if (sampleFund) {
    check("Fundamental has revenueGrowth field", "revenueGrowth" in sampleFund);
    check("Fundamental has grossMargin field", "grossMargin" in sampleFund);
    check("Fundamental has roic field", "roic" in sampleFund);
    check("Fundamental has debtToEquity field", "debtToEquity" in sampleFund);
    check("Fundamental linked to universe", sampleFund.universe != null);
  }

  // ── 3. Schema: UniverseScore model ────────────────────────────────────────
  console.log("\n3. UniverseScore model");
  const scoreCount = await db.universeScore.count();
  check("UniverseScore table exists", true);
  check("Scores have been computed", scoreCount > 0, `found ${scoreCount}`);

  const sampleScore = await db.universeScore.findFirst({ include: { universe: true } });
  if (sampleScore) {
    check("Score has businessQuality (0-100)", sampleScore.businessQuality >= 0 && sampleScore.businessQuality <= 100);
    check("Score has growth (0-100)", sampleScore.growth >= 0 && sampleScore.growth <= 100);
    check("Score has financialStrength (0-100)", sampleScore.financialStrength >= 0 && sampleScore.financialStrength <= 100);
    check("Score has capitalAllocation (0-100)", sampleScore.capitalAllocation >= 0 && sampleScore.capitalAllocation <= 100);
    check("Score has totalScore (0-100)", sampleScore.totalScore >= 0 && sampleScore.totalScore <= 100);
  }

  // ── 4. Scoring Engine ─────────────────────────────────────────────────────
  console.log("\n4. Scoring Engine");

  const highQuality = computeScores({ grossMargin: 80, operatingMargin: 40, roic: 40, revenueGrowth: 30, epsGrowth: 50, debtToEquity: 0, freeCashFlow: 50000 });
  const lowQuality  = computeScores({ grossMargin: 5,  operatingMargin: 2,  roic: 5,  revenueGrowth: -5, epsGrowth: -20, debtToEquity: 5.0, freeCashFlow: -1000 });
  const noData      = computeScores(null);

  check("High-quality company scores > 70", highQuality.totalScore > 70, `got ${highQuality.totalScore}`);
  check("Low-quality company scores < 50", lowQuality.totalScore < 50, `got ${lowQuality.totalScore}`);
  check("Null fundamentals returns 0 total", noData.totalScore === 0, `got ${noData.totalScore}`);
  check("All category scores in 0-100 range", [highQuality, lowQuality].every(s =>
    [s.businessQuality, s.growth, s.financialStrength, s.capitalAllocation, s.valuation, s.totalScore]
      .every(v => v >= 0 && v <= 100)
  ));
  check("Valuation placeholder is 50", highQuality.valuation === 50 && lowQuality.valuation === 50);

  // ── 5. Screening Pipeline ─────────────────────────────────────────────────
  console.log("\n5. Screening Pipeline");

  const rawEntries = await db.universe.findMany({
    where: { status: "active" },
    include: { fundamentals: true, scores: { orderBy: { scoredAt: "desc" }, take: 1 } },
  });

  const mockEntries = rawEntries.map(u => ({
    id: u.id, ticker: u.ticker, companyName: u.companyName,
    exchange: u.exchange, sector: u.sector, industry: u.industry,
    marketCap: u.marketCap, universeTier: u.universeTier, country: u.country,
    assetType: u.assetType, status: u.status,
    fundamentals: u.fundamentals ? { ...u.fundamentals, updatedAt: u.fundamentals.updatedAt.toISOString() } : null,
    latestScore: u.scores[0] ? { ...u.scores[0], scoredAt: u.scores[0].scoredAt.toISOString() } : null,
    inPortfolio: false, inWatchlist: false,
  }));

  const passed_ = applyFilters(mockEntries, DEFAULT_FILTERS);
  const queue   = buildResearchQueue(passed_);

  check("applyFilters returns subset of universe", passed_.length <= mockEntries.length);
  check("Research queue excludes portfolio holdings", queue.every(e => !e.inPortfolio));
  check("Research queue sorted by totalScore desc", queue.length < 2 || queue[0].latestScore!.totalScore >= queue[queue.length - 1].latestScore!.totalScore);
  check("Tier filter works", applyFilters(mockEntries, { tiers: ["tier1"] }).every(e => e.universeTier === "tier1"));
  check("ETFs pass filter without fundamentals", applyFilters(mockEntries, {}).some(e => e.assetType === "etf"));

  // ── 6. API Routes exist ───────────────────────────────────────────────────
  console.log("\n6. API Route files");
  const { existsSync } = await import("fs");
  const base = "src/app/api";
  for (const path of [
    `${base}/universe/route.ts`,
    `${base}/universe/[ticker]/route.ts`,
    `${base}/universe/[ticker]/fundamentals/route.ts`,
    `${base}/universe/[ticker]/score/route.ts`,
    `${base}/screener/route.ts`,
  ]) {
    check(`${path} exists`, existsSync(path));
  }

  // ── 7. Rankings Page ─────────────────────────────────────────────────────
  console.log("\n7. Rankings page");
  check("src/app/screener/page.tsx exists", existsSync("src/app/screener/page.tsx"));
  check("Sidebar has /screener entry", (() => {
    const { readFileSync } = require("fs");
    const content = readFileSync("src/components/layout/Sidebar.tsx", "utf8");
    return content.includes('href: "/screener"');
  })());

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n━━━ Results: ${passed} passed, ${failed} failed ━━━\n`);
  if (failed > 0) process.exit(1);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
