/**
 * Seed allocation targets from หุ้น.xlsx Sheet 1 (audited).
 * Run after db:seed:  tsx prisma/seed-targets.ts
 *
 * Source data:
 *   Total capital  ฿1,300,000 = $39,816.22 @ 32.65 THB/USD
 *   MSFT  60%  ฿780,000   $23,889.74  Growth bucket
 *   AAPL  10%  ฿130,000    $3,981.62  Core bucket
 *   NVDA  10%  ฿130,000    $3,981.62  Small-cap bucket
 *   META  10%  ฿130,000    $3,981.62  Defensive bucket
 *   AMZN  10%  ฿130,000    $3,981.62  Value bucket
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// ─── Config (from หุ้น.xlsx Sheet 1) ─────────────────────────────────────────

const EXCHANGE_RATE     = 32.65;        // THB/USD at snapshot time
const TOTAL_CAPITAL_THB = 1_300_000.0;  // ฿1,300,000
const TOTAL_CAPITAL_USD = TOTAL_CAPITAL_THB / EXCHANGE_RATE; // 39,816.22

// ─── Target Positions ────────────────────────────────────────────────────────

const TARGETS = [
  {
    ticker:    "MSFT",
    name:      "Microsoft Corporation",
    targetPct: 60.0,
    targetThb: 780_000.0,
    bucket:    "growth",
    priority:  1,
    notes:     "Growth flagship — Azure AI + M365 Copilot + OpenAI partnership",
  },
  {
    ticker:    "META",
    name:      "Meta Platforms, Inc.",
    targetPct: 10.0,
    targetThb: 130_000.0,
    bucket:    "defensive",
    priority:  2,
    notes:     "Defensive — 3.5B+ DAP distribution moat; monitoring for entry",
  },
  {
    ticker:    "AMZN",
    name:      "Amazon.com, Inc.",
    targetPct: 10.0,
    targetThb: 130_000.0,
    bucket:    "value",
    priority:  3,
    notes:     "Value — AWS hyperscaler + Amazon Ads compounder",
  },
  {
    ticker:    "NVDA",
    name:      "NVIDIA Corporation",
    targetPct: 10.0,
    targetThb: 130_000.0,
    bucket:    "small",
    priority:  4,
    notes:     "Small-cap growth — CUDA moat AI infrastructure thesis",
  },
  {
    ticker:    "AAPL",
    name:      "Apple Inc.",
    targetPct: 10.0,
    targetThb: 130_000.0,
    bucket:    "core",
    priority:  5,
    notes:     "Core — consumer hardware + services ecosystem",
  },
] as const;

async function main() {
  console.log("Seeding allocation targets from หุ้น.xlsx Sheet 1...");
  console.log("");

  // ── Portfolio Settings ───────────────────────────────────────────────────

  await db.portfolioSettings.deleteMany();
  await db.portfolioSettings.create({
    data: {
      label:           "Main Portfolio",
      totalCapitalThb: TOTAL_CAPITAL_THB,
      totalCapitalUsd: TOTAL_CAPITAL_USD,
      exchangeRate:    EXCHANGE_RATE,
      source:          "หุ้น.xlsx Sheet 1 (audited 2026-06-05)",
    },
  });

  // ── Allocation Targets ───────────────────────────────────────────────────

  await db.allocationTarget.deleteMany();

  for (const t of TARGETS) {
    const targetUsd = t.targetThb / EXCHANGE_RATE;
    await db.allocationTarget.create({
      data: {
        ticker:    t.ticker,
        name:      t.name,
        targetPct: t.targetPct,
        targetUsd,
        targetThb: t.targetThb,
        bucket:    t.bucket,
        priority:  t.priority,
        notes:     t.notes,
      },
    });
  }

  // ── Validation Report ────────────────────────────────────────────────────

  // Load current position values
  const positions = await db.position.findMany({
    where:  { status: "active" },
    select: { ticker: true, name: true, sector: true, currentValueUsd: true },
  });

  const posMap = new Map(positions.map(p => [p.ticker, p]));

  const targets = await db.allocationTarget.findMany({
    orderBy: { priority: "asc" },
  });

  const settings = await db.portfolioSettings.findFirst();
  if (!settings) throw new Error("PortfolioSettings not found");

  type GapRow = {
    bucket: string;
    ticker: string;
    targetUsd: number;
    currentUsd: number;
    gapUsd: number;
    pctFunded: number;
    gapPct: number;
  };

  let totalTargetUsd  = 0;
  let totalCurrentUsd = 0;
  const rows: GapRow[] = [];

  for (const t of targets) {
    const current    = posMap.get(t.ticker)?.currentValueUsd ?? 0;
    const gapUsd     = t.targetUsd - current;
    const pctFunded  = current / t.targetUsd * 100;
    const gapPct     = Math.abs(gapUsd) / t.targetUsd * 100;
    totalTargetUsd  += t.targetUsd;
    totalCurrentUsd += current;
    rows.push({ bucket: t.bucket, ticker: t.ticker, targetUsd: t.targetUsd, currentUsd: current, gapUsd, pctFunded, gapPct });
  }

  const totalGapUsd  = totalTargetUsd - totalCurrentUsd;
  const cashPos      = posMap.get("CASH");
  const cashUsd      = cashPos?.currentValueUsd ?? 0;
  const shortfall    = Math.max(0, totalGapUsd - cashUsd);
  const canFullyFund = cashUsd >= totalGapUsd;

  const untracked = positions.filter(
    p => !targets.some(t => t.ticker === p.ticker) && p.ticker !== "CASH"
  );

  console.log("══════════════════════════════════════════════════════════════");
  console.log("  ALLOCATION TARGET VALIDATION REPORT");
  console.log("══════════════════════════════════════════════════════════════");
  console.log(`  Source:         หุ้น.xlsx Sheet 1 (audited 2026-06-05)`);
  console.log(`  Capital:        ฿${settings.totalCapitalThb.toLocaleString()} = $${settings.totalCapitalUsd.toFixed(2)} @ ${settings.exchangeRate} THB/USD`);
  console.log("");
  console.log("  ALLOCATION TARGETS:");
  console.log("  ────────────────────────────────────────────────────────────");
  console.log("  #  Bucket      Ticker   Target $     Target %");
  for (const t of targets) {
    console.log(
      `  ${t.priority}  ${t.bucket.padEnd(10)} ${t.ticker.padEnd(6)}  $${t.targetUsd.toFixed(2).padStart(10)}   ${t.targetPct.toFixed(1)}%`
    );
  }
  const totalPct = targets.reduce((s, t) => s + t.targetPct, 0);
  console.log("  ────────────────────────────────────────────────────────────");
  console.log(
    `     ${"TOTAL".padEnd(17)}  $${totalTargetUsd.toFixed(2).padStart(10)}  ${totalPct.toFixed(1)}%`
  );

  console.log("");
  console.log("  CURRENT PORTFOLIO GAP (vs Dime snapshot 2026-06-05):");
  console.log("  ────────────────────────────────────────────────────────────");
  console.log("  Bucket      Ticker   Target $    Current $     Gap $    Funded");
  for (const r of rows) {
    const gap = r.gapUsd <= 0
      ? `-${Math.abs(r.gapUsd).toFixed(2).padStart(10)}`
      : `+${r.gapUsd.toFixed(2).padStart(10)}`;
    console.log(
      `  ${r.bucket.padEnd(10)} ${r.ticker.padEnd(6)}  ${r.targetUsd.toFixed(2).padStart(9)}   ${r.currentUsd.toFixed(2).padStart(9)}  ${gap}  ${r.pctFunded.toFixed(1).padStart(5)}%`
    );
  }
  console.log("  ────────────────────────────────────────────────────────────");
  const totalGapStr = totalGapUsd >= 0
    ? `-${totalGapUsd.toFixed(2).padStart(10)}`
    : `+${Math.abs(totalGapUsd).toFixed(2).padStart(10)}`;
  console.log(
    `  ${"TOTAL".padEnd(17)}  ${totalTargetUsd.toFixed(2).padStart(9)}   ${totalCurrentUsd.toFixed(2).padStart(9)}  ${totalGapStr}  ${(totalCurrentUsd / totalTargetUsd * 100).toFixed(1).padStart(5)}%`
  );

  console.log("");
  console.log(`  Cash available:  $${cashUsd.toFixed(2)}`);
  console.log(`  Gap to fill:     $${totalGapUsd.toFixed(2)}`);
  if (canFullyFund) {
    console.log(`  Status:          CASH SUFFICIENT to fund all gaps`);
  } else {
    console.log(`  Shortfall:       $${shortfall.toFixed(2)}  (need additional capital)`);
  }

  console.log("");
  console.log("  NEXT BUY CANDIDATES (ranked by priority):");
  const buyCandidates = rows
    .filter(r => r.gapUsd > 0)
    .sort((a, b) => b.gapUsd - a.gapUsd);
  for (let i = 0; i < buyCandidates.length; i++) {
    const r = buyCandidates[i];
    console.log(
      `  ${i + 1}. ${r.ticker.padEnd(6)}  buy $${r.gapUsd.toFixed(2).padStart(9)}  (${r.bucket}, ${r.pctFunded.toFixed(1)}% funded, ${r.gapPct.toFixed(1)}% gap)`
    );
  }

  if (untracked.length > 0) {
    console.log("");
    console.log("  UNTRACKED POSITIONS (not in target allocation):");
    for (const p of untracked) {
      console.log(`  ${p.ticker.padEnd(6)}  $${(p.currentValueUsd ?? 0).toFixed(2).padStart(9)}  ${p.sector ?? p.name}`);
    }
  }

  console.log("══════════════════════════════════════════════════════════════");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
