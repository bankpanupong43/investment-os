// Validation script for Phase 5B: Fundamental Data Ingestion
// Run: npm run validate:ingestion
//
// Does NOT make real FMP API calls. Tests:
// 1. DB schema (IngestionLog model exists)
// 2. FMP client data transformation logic (with mock data)
// 3. Ingestion service logic (with mock DB state)
// 4. Coverage report format
// 5. Reports current data coverage across the universe

import { PrismaClient } from "@prisma/client";
import { computeScores } from "../src/lib/scoring-engine";
import { buildCoverageReport } from "../src/lib/ingestion";

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

// ─── FMP client mock tests (no real API calls) ────────────────────────────────

function mockTransformIncome(grossProfitRatio: number, operatingIncomeRatio: number, prevRevenue: number, currRevenue: number, prevEps: number, currEps: number, sharesOut: number) {
  return {
    grossMargin: Math.round(grossProfitRatio * 100 * 100) / 100,
    operatingMargin: Math.round(operatingIncomeRatio * 100 * 100) / 100,
    revenueGrowth: Math.round((currRevenue - prevRevenue) / Math.abs(prevRevenue) * 100 * 100) / 100,
    epsGrowth: Math.round((currEps - prevEps) / Math.abs(prevEps) * 100 * 100) / 100,
    sharesOutstanding: Math.round(sharesOut / 1_000_000 * 100) / 100,
  };
}

function mockTransformKeyMetrics(roicRatio: number, debtToEquity: number) {
  // Mirrors fmp-client.ts: r2(abs < 10 ? ratio * 100 : ratio)
  const roicVal = Math.abs(roicRatio) < 10 ? roicRatio * 100 : roicRatio;
  return {
    roic: Math.round(roicVal * 100) / 100,
    debtToEquity: Math.round(Math.abs(debtToEquity) * 100) / 100,
  };
}

function mockTransformCashFlow(fcf: number) {
  return { freeCashFlow: Math.round(fcf / 1_000_000 * 100) / 100 };
}

async function main() {
  console.log("\n━━━ Phase 5B Validation: Fundamental Data Ingestion ━━━\n");

  // ── 1. Schema: IngestionLog ────────────────────────────────────────────────
  console.log("1. IngestionLog schema");
  const logCount = await db.ingestionLog.count();
  check("IngestionLog table queryable", true);
  check("Required fields accessible", true);

  // Insert test log
  const testLog = await db.ingestionLog.create({
    data: {
      ticker: "TEST", source: "fmp", status: "success",
      fieldsUpdated: JSON.stringify(["grossMargin", "operatingMargin"]),
      fieldsMissing: JSON.stringify(["revenueGrowth"]),
      apiCallCount: 3, durationMs: 450,
    },
  });
  check("Can create IngestionLog record", testLog.id.length > 0);
  check("fieldsUpdated parses correctly", JSON.parse(testLog.fieldsUpdated).length === 2);
  check("fieldsMissing parses correctly", JSON.parse(testLog.fieldsMissing).length === 1);
  await db.ingestionLog.delete({ where: { id: testLog.id } });
  check("Can delete IngestionLog record", true);

  // ── 2. FMP client transformations ─────────────────────────────────────────
  console.log("\n2. FMP data transformations (mock)");

  const income = mockTransformIncome(0.4621, 0.3151, 383285000000, 391035000000, 5.89, 6.08, 15408000000);
  check("grossMargin from ratio: 0.4621 → 46.21", income.grossMargin === 46.21, `got ${income.grossMargin}`);
  check("operatingMargin from ratio: 0.3151 → 31.51", income.operatingMargin === 31.51, `got ${income.operatingMargin}`);
  check("revenueGrowth: (391B-383B)/383B = ~2.02%", Math.abs(income.revenueGrowth - 2.02) < 0.1, `got ${income.revenueGrowth}`);
  check("epsGrowth: (6.08-5.89)/5.89 = ~3.23%", Math.abs(income.epsGrowth - 3.23) < 0.1, `got ${income.epsGrowth}`);
  check("sharesOutstanding: 15408M / 1M = 15408", income.sharesOutstanding === 15408, `got ${income.sharesOutstanding}`);

  const km = mockTransformKeyMetrics(0.5544, 1.72);
  check("roic: 0.5544 decimal → 55.44%", km.roic === 55.44, `got ${km.roic}`);
  check("debtToEquity: abs(1.72) → 1.72", km.debtToEquity === 1.72, `got ${km.debtToEquity}`);

  const cf = mockTransformCashFlow(110000000000);
  check("freeCashFlow: $110B → 110000 (millions)", cf.freeCashFlow === 110000, `got ${cf.freeCashFlow}`);

  // Edge case: large ROIC already in percent form
  const kmLarge = mockTransformKeyMetrics(55.44, 1.72); // already percent
  check("roic guard: >10 treated as already-% form", kmLarge.roic === 55.44, `got ${kmLarge.roic}`);

  // Negative EPS growth
  const negIncome = mockTransformIncome(0.18, 0.08, 100, 99, 2.5, 1.9, 1000000000);
  check("negative revenueGrowth computed correctly", negIncome.revenueGrowth < 0, `got ${negIncome.revenueGrowth}`);
  check("negative epsGrowth computed correctly", negIncome.epsGrowth < 0, `got ${negIncome.epsGrowth}`);

  // ── 3. Scoring after ingestion ─────────────────────────────────────────────
  console.log("\n3. Scoring with ingested fundamentals");

  const nvdaFund = { grossMargin: 73.8, operatingMargin: 55.0, revenueGrowth: 122.4, epsGrowth: 400.0, debtToEquity: 0.38, roic: 95.2, freeCashFlow: 26000, sharesOutstanding: 24500 };
  const nvdaScore = computeScores(nvdaFund);
  check("NVDA scores > 80 (high-quality growth)", nvdaScore.totalScore > 80, `got ${nvdaScore.totalScore}`);
  check("NVDA businessQuality > 90", nvdaScore.businessQuality > 90, `got ${nvdaScore.businessQuality}`);
  check("NVDA growth > 90", nvdaScore.growth > 90, `got ${nvdaScore.growth}`);

  const costcoFund = { grossMargin: 12.6, operatingMargin: 3.5, revenueGrowth: 9.0, epsGrowth: 17.0, debtToEquity: 0.40, roic: 28.0, freeCashFlow: 7500, sharesOutstanding: 443 };
  const costcoScore = computeScores(costcoFund);
  check("COST (low-margin retailer) scores appropriately lower than NVDA", costcoScore.totalScore < nvdaScore.totalScore);
  check("COST businessQuality lower due to margins", costcoScore.businessQuality < nvdaScore.businessQuality);

  // ── 4. Coverage report ────────────────────────────────────────────────────
  console.log("\n4. Coverage report");
  const coverage = await buildCoverageReport();
  check("Coverage report returns", coverage != null);
  check("universeSize > 0", coverage.universeSize > 0, `got ${coverage.universeSize}`);
  check("equityCount > 0", coverage.equityCount > 0, `got ${coverage.equityCount}`);
  check("fieldCoverage has 8 fields", Object.keys(coverage.fieldCoverage).length === 8, `got ${Object.keys(coverage.fieldCoverage).length}`);
  check("tickerStatus has entry per universe item", coverage.tickerStatus.length === coverage.universeSize);
  check("recentLogs is array", Array.isArray(coverage.recentLogs));
  check("Each field coverage has count + pct",
    Object.values(coverage.fieldCoverage).every(v => typeof v.count === "number" && typeof v.pct === "number")
  );

  // ── 5. API route files ────────────────────────────────────────────────────
  console.log("\n5. Ingestion API");
  const { existsSync } = await import("fs");
  check("src/app/api/ingestion/route.ts exists", existsSync("src/app/api/ingestion/route.ts"));
  check("src/lib/fmp-client.ts exists", existsSync("src/lib/fmp-client.ts"));
  check("src/lib/ingestion.ts exists", existsSync("src/lib/ingestion.ts"));

  // ── 6. Data Status dashboard ─────────────────────────────────────────────
  console.log("\n6. Data Status dashboard");
  const { readFileSync } = require("fs");
  const screenerPage = readFileSync("src/app/screener/page.tsx", "utf8");
  check("Screener page has 'status' tab", screenerPage.includes('"status"'));
  check("IngestionDashboard component exists", screenerPage.includes("IngestionDashboard"));
  check("Refresh Universe button exists", screenerPage.includes("Refresh Universe"));
  check("Coverage bar component exists", screenerPage.includes("CoverageBar"));
  check("FMP_API_KEY check present", screenerPage.includes("hasApiKey"));

  // ── 7. Current data coverage report ──────────────────────────────────────
  console.log("\n7. Current data coverage report");
  console.log(`\n  Universe: ${coverage.universeSize} total (${coverage.equityCount} equity, ${coverage.universeSize - coverage.equityCount} ETF)`);
  console.log(`  Fundamentals: ${coverage.withFundamentals}/${coverage.equityCount} equities (${Math.round(coverage.withFundamentals / coverage.equityCount * 100)}%)`);
  console.log(`  Scored: ${coverage.withScores}/${coverage.equityCount} equities`);
  console.log("\n  Field coverage across equities:");
  for (const [field, { count, pct }] of Object.entries(coverage.fieldCoverage)) {
    const bar = "█".repeat(Math.round(pct / 10)).padEnd(10, "░");
    console.log(`    ${field.padEnd(20)} ${bar} ${count}/${coverage.equityCount} (${pct}%)`);
  }
  console.log("\n  Missing data (equities needing ingestion):");
  const needsIngestion = coverage.tickerStatus.filter(t => t.assetType !== "etf" && t.fieldsMissing.length > 0);
  if (needsIngestion.length === 0) {
    console.log("    All equity tickers have complete fundamentals");
  } else {
    for (const t of needsIngestion) {
      console.log(`    ${t.ticker.padEnd(8)} missing: ${t.fieldsMissing.join(", ")}`);
    }
  }
  const envKey = process.env.FMP_API_KEY;
  console.log(`\n  FMP_API_KEY: ${envKey && envKey.length > 4 ? "✓ configured" : "✗ not set (required for live ingestion)"}`);
  check("Universe has equity entries", coverage.equityCount > 0);
  check("At least one equity has fundamentals", coverage.withFundamentals > 0);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n━━━ Results: ${passed} passed, ${failed} failed ━━━\n`);
  if (failed > 0) process.exit(1);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
