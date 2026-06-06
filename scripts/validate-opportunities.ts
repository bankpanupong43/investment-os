// Validation script for Phase 5C: Opportunity Engine.
// Usage: npx tsx scripts/validate-opportunities.ts

import { PrismaClient } from "@prisma/client";
import { computeOpportunities, saveOpportunityScores } from "../src/lib/opportunity-engine";

const db = new PrismaClient();

function bar(score: number, width = 12): string {
  const filled = Math.round((score / 100) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function fmt(n: number | null | undefined, suffix = ""): string {
  if (n == null) return "—";
  return n.toFixed(1) + suffix;
}

type Check = { name: string; pass: boolean; note?: string };

async function main() {
  console.log("\n━━━ Phase 5C: Opportunity Engine Validation ━━━\n");

  // ── 1. Compute opportunities ─────────────────────────────────────────────
  console.log("Computing opportunity scores...\n");
  const result = await computeOpportunities();
  const { entries, summary } = result;

  console.log(`Universe scored: ${summary.totalScored}`);
  console.log(`New positions available: ${summary.newPositions}`);
  console.log(`Add candidates: ${summary.addCandidates}`);
  console.log(`On watchlist: ${summary.onWatchlist}`);
  console.log(`Total capital: $${summary.totalCapitalUsd.toLocaleString()}`);
  console.log(`Available cash: $${summary.availableCashUsd.toLocaleString()}`);

  // ── 2. Top 10 opportunities ───────────────────────────────────────────────
  console.log("\n━━━ Top 10 Opportunities ━━━\n");
  const header = `${"#".padEnd(3)} ${"Ticker".padEnd(7)} ${"Company".padEnd(28)} ${"OppSc".padEnd(7)} ${"Co".padEnd(6)} ${"Alloc".padEnd(7)} ${"Div".padEnd(6)} ${"WL".padEnd(5)} ${"Brain".padEnd(6)} ${"Action"}`;
  console.log(`  ${header}`);
  console.log(`  ${"─".repeat(header.length)}`);

  for (const [i, e] of entries.slice(0, 10).entries()) {
    const action = e.reasoning.positionType === "initiate" ? "OPEN" :
                   e.reasoning.positionType === "add" ? "ADD+" : "hold";
    console.log(
      `  ${String(i + 1).padEnd(3)} ${e.ticker.padEnd(7)} ${e.companyName.slice(0, 27).padEnd(28)} ` +
      `${e.opportunityScore.toFixed(1).padEnd(7)} ${e.companyScore.toFixed(0).padEnd(6)} ` +
      `${e.allocationGapScore.toFixed(0).padEnd(7)} ${e.diversificationScore.toFixed(0).padEnd(6)} ` +
      `${e.watchlistScore.toFixed(0).padEnd(5)} ${e.brainAlignmentScore.toFixed(0).padEnd(6)} ${action}`
    );
  }

  // ── 3. Allocation targets (score by gap) ──────────────────────────────────
  console.log("\n━━━ Targeted Positions — Allocation Gaps ━━━\n");
  const targeted = entries
    .filter(e => e.allocationTarget != null)
    .sort((a, b) => b.allocationGapScore - a.allocationGapScore);

  for (const e of targeted) {
    const cur = e.currentValue?.usd ?? 0;
    const tgt = e.allocationTarget!.targetUsd;
    const pctFunded = tgt > 0 ? (cur / tgt) * 100 : 0;
    console.log(
      `  ${e.ticker.padEnd(7)} ${bar(pctFunded)} ${pctFunded.toFixed(0)}% funded` +
      `  Gap: $${Math.max(0, tgt - cur).toLocaleString("en-US", { maximumFractionDigits: 0 })}` +
      `  Target: ${e.allocationTarget!.targetPct.toFixed(1)}%`
    );
  }

  // ── 4. Score distribution ─────────────────────────────────────────────────
  const scoresAbove60 = entries.filter(e => e.opportunityScore >= 60).length;
  const scoresAbove70 = entries.filter(e => e.opportunityScore >= 70).length;
  const scoresAbove80 = entries.filter(e => e.opportunityScore >= 80).length;
  const avgScore = entries.reduce((s, e) => s + e.opportunityScore, 0) / entries.length;

  console.log("\n━━━ Score Distribution ━━━\n");
  console.log(`  Average opportunity score: ${avgScore.toFixed(1)}`);
  console.log(`  Scores ≥ 80: ${scoresAbove80} (${((scoresAbove80 / entries.length) * 100).toFixed(0)}%)`);
  console.log(`  Scores ≥ 70: ${scoresAbove70} (${((scoresAbove70 / entries.length) * 100).toFixed(0)}%)`);
  console.log(`  Scores ≥ 60: ${scoresAbove60} (${((scoresAbove60 / entries.length) * 100).toFixed(0)}%)`);

  // ── 5. Dimension coverage ─────────────────────────────────────────────────
  const withFundamentals = entries.filter(e => e.fundamentals != null).length;
  const withTarget = entries.filter(e => e.allocationTarget != null).length;
  const inPortfolio = entries.filter(e => e.inPortfolio).length;
  const onWatchlist = entries.filter(e => e.inWatchlist).length;

  console.log("\n━━━ Data Coverage ━━━\n");
  console.log(`  With fundamentals: ${withFundamentals}/${entries.length}`);
  console.log(`  With allocation target: ${withTarget}/${entries.length}`);
  console.log(`  In portfolio: ${inPortfolio}/${entries.length}`);
  console.log(`  On watchlist: ${onWatchlist}/${entries.length}`);

  // ── 6. Save snapshot ──────────────────────────────────────────────────────
  console.log("\n━━━ Saving Snapshot to DB ━━━\n");
  await saveOpportunityScores(entries);
  const count = await db.opportunityScore.count();
  console.log(`  Saved ${entries.length} opportunity scores. Total DB records: ${count}`);

  // ── 7. Validation checks ──────────────────────────────────────────────────
  const checks: Check[] = [
    {
      name: "Engine returns entries for all universe tickers",
      pass: entries.length > 0,
      note: `${entries.length} entries`,
    },
    {
      name: "All scores are 0-100",
      pass: entries.every(e =>
        [e.companyScore, e.allocationGapScore, e.diversificationScore, e.watchlistScore, e.brainAlignmentScore, e.opportunityScore]
          .every(s => s >= 0 && s <= 100)
      ),
    },
    {
      name: "Opportunity score is weighted composite",
      pass: entries.every(e => {
        const expected = e.companyScore * 0.40 + e.allocationGapScore * 0.25 +
          e.diversificationScore * 0.15 + e.watchlistScore * 0.10 + e.brainAlignmentScore * 0.10;
        return Math.abs(e.opportunityScore - Math.round(expected * 10) / 10) < 0.2;
      }),
    },
    {
      name: "Watchlist items score 100 on watchlist dimension",
      pass: entries.filter(e => e.inWatchlist).every(e => e.watchlistScore === 100),
    },
    {
      name: "Non-watchlist items score 0 on watchlist dimension",
      pass: entries.filter(e => !e.inWatchlist).every(e => e.watchlistScore === 0),
    },
    {
      name: "ETFs score 50 on brain alignment",
      pass: entries.filter(e => e.assetType === "etf").every(e => e.brainAlignmentScore === 50),
    },
    {
      name: "Top opportunity has highest opportunity score",
      pass: summary.topOpportunity === entries[0]?.ticker,
    },
    {
      name: "Entries sorted by opportunityScore descending",
      pass: entries.every((e, i) => i === 0 || e.opportunityScore <= entries[i - 1].opportunityScore),
    },
    {
      name: "All entries have reasoning text",
      pass: entries.every(e =>
        e.reasoning.whyBuy.length > 10 &&
        e.reasoning.whyNow.length > 10 &&
        e.reasoning.portfolioImpact.length > 5
      ),
    },
    {
      name: "All entries have suggested allocation",
      pass: entries.every(e =>
        e.suggestedAllocation.starterPct > 0 &&
        e.suggestedAllocation.targetPct > 0 &&
        e.suggestedAllocation.maxPct > 0
      ),
    },
    {
      name: "Starter ≤ Target ≤ Max",
      pass: entries.every(e =>
        e.suggestedAllocation.starterPct <= e.suggestedAllocation.targetPct &&
        e.suggestedAllocation.targetPct <= e.suggestedAllocation.maxPct
      ),
    },
    {
      name: "Scores saved to DB",
      pass: count >= entries.length,
      note: `${count} records`,
    },
  ];

  console.log("\n━━━ Validation Checks ━━━\n");
  let passed = 0;
  let failed = 0;
  for (const c of checks) {
    const icon = c.pass ? "✓" : "✗";
    const detail = c.note ? ` (${c.note})` : "";
    console.log(`  ${icon} ${c.name}${detail}`);
    if (c.pass) passed++; else failed++;
  }

  console.log(`\n  ${passed}/${checks.length} checks passed`);

  if (failed > 0) {
    console.log("\n━━━ Validation: FAILED ━━━\n");
    process.exit(1);
  } else {
    console.log("\n━━━ Validation: PASSED ━━━\n");
  }
}

main()
  .catch(e => { console.error("\nFatal:", e.message); process.exit(1); })
  .finally(() => db.$disconnect());
