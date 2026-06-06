// One-shot universe refresh + validation report.
// Usage: npm run refresh:universe

import { PrismaClient } from "@prisma/client";
import { ingestUniverse, buildCoverageReport, IngestionResult } from "../src/lib/ingestion";

const db = new PrismaClient();

function bar(pct: number, width = 12): string {
  const filled = Math.round(pct / 100 * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function fmt(n: number | null | undefined, suffix = ""): string {
  if (n == null) return "—";
  return n.toFixed(1) + suffix;
}

async function main() {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey || apiKey.length < 8) {
    console.error("FMP_API_KEY not set in .env");
    process.exit(1);
  }

  console.log("\n━━━ Investment Universe Refresh — Live FMP Data ━━━\n");
  console.log(`API Key: ${apiKey.slice(0, 4)}${"*".repeat(apiKey.length - 8)}${apiKey.slice(-4)}`);
  console.log(`Started: ${new Date().toLocaleString()}\n`);

  // ── 1. Run universe ingestion ─────────────────────────────────────────────
  console.log("Running universe refresh…\n");

  let done = 0;
  const summary = await ingestUniverse(apiKey, (result, d, total) => {
    done = d;
    const icon = result.status === "success" ? "✓" :
                 result.status === "partial" ? "~" :
                 result.status === "skipped" ? "○" : "✗";
    const detail = result.status === "skipped"
      ? "ETF — skipped"
      : result.status === "failed"
      ? `FAILED: ${result.errorMessage ?? "unknown"}`
      : `${result.fieldsUpdated.length}/8 fields · ${result.durationMs}ms`;
    console.log(`  [${d}/${total}] ${icon} ${result.ticker.padEnd(6)} ${detail}`);
  });

  console.log(`\nRefresh complete in ${(summary.totalMs / 1000).toFixed(1)}s`);
  console.log(`  Success: ${summary.successCount}  Partial: ${summary.partialCount}  Failed: ${summary.failedCount}  Skipped: ${summary.skippedCount}`);

  // ── 2. Coverage report ────────────────────────────────────────────────────
  const report = await buildCoverageReport();

  console.log("\n━━━ Coverage Report ━━━\n");
  console.log(`Universe: ${report.universeSize} total  |  ${report.equityCount} equity  |  ${report.universeSize - report.equityCount} ETF`);
  console.log(`Fundamentals: ${report.withFundamentals}/${report.equityCount} equities  |  Scored: ${report.withScores}/${report.equityCount}`);

  console.log("\nField coverage (equity tickers):");
  for (const [field, { count, pct }] of Object.entries(report.fieldCoverage)) {
    console.log(`  ${field.padEnd(20)} ${bar(pct)} ${count}/${report.equityCount} (${pct}%)`);
  }

  // ── 3. Failures & missing fields ──────────────────────────────────────────
  const failures = summary.results.filter(r => r.status === "failed");
  const partials  = summary.results.filter(r => r.status === "partial");

  const restricted402 = failures.filter(f => f.errorMessage?.includes("HTTP 402"));
  const unexpectedFails = failures.filter(f => !f.errorMessage?.includes("HTTP 402"));

  if (restricted402.length > 0) {
    console.log("\n━━━ FMP Plan Restricted (seed data preserved) ━━━\n");
    console.log(`  ${restricted402.map(f => f.ticker).join(", ")}`);
    console.log(`  These ${restricted402.length} tickers require a paid FMP plan. Seed fundamentals are preserved.`);
  }

  if (unexpectedFails.length > 0) {
    console.log("\n━━━ Unexpected Ingestion Failures ━━━\n");
    for (const f of unexpectedFails) {
      console.log(`  ✗ ${f.ticker}: ${f.errorMessage ?? "unknown error"}`);
    }
  } else if (restricted402.length === 0) {
    console.log("\n  No ingestion failures.");
  }

  if (partials.length > 0) {
    console.log("\n━━━ Partial Data (missing fields) ━━━\n");
    for (const p of partials) {
      console.log(`  ~ ${p.ticker.padEnd(6)} missing: ${p.fieldsMissing.join(", ")}`);
    }
  }

  const missingEntries = report.tickerStatus.filter(t => t.assetType !== "etf" && t.fieldsMissing.length > 0);
  if (missingEntries.length > 0 && partials.length === 0) {
    console.log("\n━━━ Remaining Missing Fields ━━━\n");
    for (const t of missingEntries) {
      console.log(`  ${t.ticker.padEnd(6)} missing: ${t.fieldsMissing.join(", ")}`);
    }
  }

  // ── 4. Rankings ───────────────────────────────────────────────────────────
  const entries = await db.universe.findMany({
    where: { status: "active" },
    include: {
      fundamentals: true,
      scores: { orderBy: { scoredAt: "desc" }, take: 1 },
    },
    orderBy: { ticker: "asc" },
  });

  const ranked = entries
    .filter(e => e.scores.length > 0)
    .sort((a, b) => (b.scores[0].totalScore) - (a.scores[0].totalScore));

  function printRanking(label: string, items: typeof ranked, n = 10) {
    console.log(`\n  ${label}`);
    console.log(`  ${"─".repeat(70)}`);
    console.log(`  ${"#".padEnd(3)} ${"Ticker".padEnd(7)} ${"Company".padEnd(28)} ${"Score".padEnd(6)} ${"Quality".padEnd(8)} ${"Growth".padEnd(8)} ${"FinStr".padEnd(8)} CA`);
    console.log(`  ${"─".repeat(70)}`);
    const top = items.slice(0, n);
    if (top.length === 0) { console.log("  (no scored entries)"); return; }
    top.forEach((e, i) => {
      const s = e.scores[0];
      const name = e.companyName.slice(0, 27);
      console.log(
        `  ${String(i + 1).padEnd(3)} ${e.ticker.padEnd(7)} ${name.padEnd(28)} ` +
        `${s.totalScore.toFixed(1).padEnd(6)} ${s.businessQuality.toFixed(1).padEnd(8)} ` +
        `${s.growth.toFixed(1).padEnd(8)} ${s.financialStrength.toFixed(1).padEnd(8)} ${s.capitalAllocation.toFixed(1)}`
      );
    });
  }

  console.log("\n━━━ Rankings (live data) ━━━");
  printRanking("Top Ranked Overall", ranked, 10);
  printRanking("Large Cap (Tier 1)", ranked.filter(e => e.universeTier === "tier1"), 10);
  printRanking("Mid Cap  (Tier 2)", ranked.filter(e => e.universeTier === "tier2"), 5);
  printRanking("Small Cap (Tier 3)", ranked.filter(e => e.universeTier === "tier3"), 5);

  // ETFs don't have scores — list them by ticker
  const etfs = entries.filter(e => e.assetType === "etf");
  console.log(`\n  ETF Universe (Tier 4) — ${etfs.length} entries (no fundamental scoring)`);
  console.log(`  ${"─".repeat(50)}`);
  etfs.forEach((e, i) => console.log(`  ${String(i + 1).padEnd(3)} ${e.ticker.padEnd(7)} ${e.companyName}`));

  printRanking("International (Tier 5)", ranked.filter(e => e.universeTier === "tier5"), 6);

  // ── 5. Key fundamentals snapshot ─────────────────────────────────────────
  console.log("\n━━━ Fundamental Snapshot (equity, top 15 by score) ━━━\n");
  console.log(`  ${"Ticker".padEnd(7)} ${"GrossM%".padEnd(9)} ${"OpM%".padEnd(7)} ${"RevG%".padEnd(8)} ${"EPSG%".padEnd(8)} ${"FCF$M".padEnd(10)} ${"D/E".padEnd(6)} ${"ROIC%".padEnd(7)} SharesM`);
  console.log(`  ${"─".repeat(72)}`);
  for (const e of ranked.slice(0, 15)) {
    const f = e.fundamentals;
    if (!f) continue;
    console.log(
      `  ${e.ticker.padEnd(7)} ` +
      `${fmt(f.grossMargin, "%").padEnd(9)} ` +
      `${fmt(f.operatingMargin, "%").padEnd(7)} ` +
      `${fmt(f.revenueGrowth, "%").padEnd(8)} ` +
      `${fmt(f.epsGrowth, "%").padEnd(8)} ` +
      `${(f.freeCashFlow != null ? Math.round(f.freeCashFlow).toLocaleString() : "—").padEnd(10)} ` +
      `${fmt(f.debtToEquity).padEnd(6)} ` +
      `${fmt(f.roic, "%").padEnd(7)} ` +
      `${f.sharesOutstanding != null ? Math.round(f.sharesOutstanding).toLocaleString() : "—"}`
    );
  }

  // ── 6. API quota usage ────────────────────────────────────────────────────
  const totalCalls = summary.results.reduce((s, r) => s + r.apiCallCount, 0);
  console.log("\n━━━ API Quota Usage ━━━\n");
  console.log(`  Calls this run:  ${totalCalls}`);
  console.log(`  Equity tickers:  ${summary.successCount + summary.partialCount + summary.failedCount}`);
  console.log(`  Calls per ticker: ${summary.successCount + summary.partialCount > 0 ? (totalCalls / (summary.successCount + summary.partialCount + summary.failedCount)).toFixed(1) : "—"} avg`);
  console.log(`  FMP free quota:  250 req/day`);
  console.log(`  Remaining:       ~${250 - totalCalls} (estimated, resets daily)`);
  console.log(`  Full refresh cost: ~${report.equityCount * 3} calls`);

  // 402 errors are FMP free-tier restrictions, not system bugs — only fail on unexpected errors
  const allPassed = unexpectedFails.length === 0;
  console.log(`\n━━━ Validation: ${allPassed ? "PASSED" : "FAILED (unexpected errors)"} ━━━`);
  if (restricted402.length > 0) {
    console.log(`  Note: ${restricted402.length} tickers restricted by FMP plan — upgrade to paid plan for full coverage.`);
  }
  console.log();
  if (!allPassed) process.exit(1);
}

main()
  .catch(e => { console.error("\nFatal:", e.message); process.exit(1); })
  .finally(() => db.$disconnect());
