/**
 * Seeds cash_flows and portfolio_snapshots from Sheet2 of หุ้น.xlsx.
 *
 * Sheet2 layout (verified via openpyxl):
 *   B: วัน/เดือน/ปี   – snapshot date
 *   C: ราคาปัจจุบัน   – portfolio value (USD)
 *   D: กำไร           – gain (USD) = value - net deposits
 *   E: ต้นทุน         – net deposits / cost basis (USD)
 *   F: (unnamed)      – return % as decimal fraction
 *
 * Deposits inferred from delta in ต้นทุน between consecutive snapshots.
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// Data extracted directly by openpyxl — authoritative source
const SHEET2_ROWS = [
  { date: "2025-06-09", portfolioValueUsd: 17330.77,           gainUsd: 908.94,            netDepositsUsd: 16421.83,           returnPct: 5.534949515370698 },
  { date: "2025-06-11", portfolioValueUsd: 18996.24,           gainUsd: 1347.32,           netDepositsUsd: 17648.920000000002, returnPct: 7.634008199935178 },
  { date: "2025-06-23", portfolioValueUsd: 18599.04,           gainUsd: 950.11,            netDepositsUsd: 17648.93,           returnPct: 5.3833858483205494 },
  { date: "2025-08-05", portfolioValueUsd: 20267.49,           gainUsd: 2618.57,           netDepositsUsd: 17648.920000000002, returnPct: 14.836998524555609 },
  { date: "2025-08-29", portfolioValueUsd: 21108.96,           gainUsd: 3306.58,           netDepositsUsd: 17802.379999999997, returnPct: 18.57380867052608 },
  { date: "2025-09-10", portfolioValueUsd: 21313.76,           gainUsd: 3511.38,           netDepositsUsd: 17802.379999999997, returnPct: 19.724216649683925 },
  { date: "2025-09-23", portfolioValueUsd: 22014.66,           gainUsd: 4055.69,           netDepositsUsd: 17958.97,           returnPct: 22.583088005603884 },
  { date: "2025-10-23", portfolioValueUsd: 22609.24,           gainUsd: 4096.01,           netDepositsUsd: 18513.230000000003, returnPct: 22.124772392499846 },
  { date: "2025-11-11", portfolioValueUsd: 22842.2741194487,   gainUsd: 4613.593874425727, netDepositsUsd: 18228.680245022973, returnPct: 25.309533177452 },
  { date: "2026-01-23", portfolioValueUsd: 23443.364777947932, gainUsd: 3724.8247779479316,netDepositsUsd: 19718.54,           returnPct: 18.889962329604177 },
  { date: "2026-01-29", portfolioValueUsd: 24643.115160796326, gainUsd: 4224.575160796325, netDepositsUsd: 20418.54,           returnPct: 20.689898302211247 },
  { date: "2026-02-10", portfolioValueUsd: 22918.25237366003,  gainUsd: 3729.2823736600294,netDepositsUsd: 19188.97,           returnPct: 19.4345104174952 },
  { date: "2026-02-17", portfolioValueUsd: 20181.362633996938, gainUsd: 3071.002633996937, netDepositsUsd: 17110.36,           returnPct: 17.94820584719981 },
  { date: "2026-02-24", portfolioValueUsd: 29674.166309341505, gainUsd: 3465.514303215932, netDepositsUsd: 26208.652006125572, returnPct: 13.222787278055966 },
  { date: "2026-04-06", portfolioValueUsd: 32115.31393568147,  gainUsd: 3180.7813782542144,netDepositsUsd: 28934.532557427257, returnPct: 10.99302838897162 },
  { date: "2026-05-07", portfolioValueUsd: 39865.85911179173,  gainUsd: 6184.006493108733, netDepositsUsd: 33681.852618683,    returnPct: 18.360054487259777 },
  { date: "2026-06-03", portfolioValueUsd: 44206.73813169985,  gainUsd: 6114.472036753454, netDepositsUsd: 38092.2660949464,   returnPct: 16.051741373203956 },
] as const;

async function importHistory() {
  console.log(`\nImporting ${SHEET2_ROWS.length} rows from Sheet2\n`);

  // ── Step 1: infer cash flows from ต้นทุน deltas ───────────────────────────
  const cashFlowsToCreate: Array<{
    date: Date;
    type: "deposit" | "withdrawal";
    amountUsd: number;
    note: string;
  }> = [];

  let prevNetDep = 0;
  for (const row of SHEET2_ROWS) {
    const delta = row.netDepositsUsd - prevNetDep;
    const absDelta = Math.abs(delta);

    if (absDelta > 0.50) {
      cashFlowsToCreate.push({
        date: new Date(row.date + "T00:00:00Z"),
        type: delta > 0 ? "deposit" : "withdrawal",
        amountUsd: absDelta,
        note: `Excel Sheet2 import — ต้นทุน delta on ${row.date}`,
      });
    }
    prevNetDep = row.netDepositsUsd;
  }

  console.log(`Derived ${cashFlowsToCreate.length} cash flow events:`);
  cashFlowsToCreate.forEach(cf => {
    const sign = cf.type === "deposit" ? "+" : "-";
    console.log(`  ${sign}$${cf.amountUsd.toFixed(2).padStart(10)}  ${cf.type.padEnd(12)}  ${cf.date.toISOString().slice(0, 10)}`);
  });

  // ── Step 2: upsert cash flows ──────────────────────────────────────────────
  // Delete existing imports first to allow re-running cleanly
  const deleted = await db.cashFlow.deleteMany({ where: { source: "import" } });
  if (deleted.count > 0) console.log(`\nCleared ${deleted.count} existing imported cash flows`);

  for (const cf of cashFlowsToCreate) {
    await db.cashFlow.create({ data: { ...cf, source: "import" } });
  }
  console.log(`\nCash flows created: ${cashFlowsToCreate.length}`);

  // ── Step 3: upsert portfolio snapshots ────────────────────────────────────
  const snapDeleted = await db.portfolioSnapshot.deleteMany({ where: { source: "import" } });
  if (snapDeleted.count > 0) console.log(`Cleared ${snapDeleted.count} existing imported snapshots`);

  for (let i = 0; i < SHEET2_ROWS.length; i++) {
    const row = SHEET2_ROWS[i];
    const prev = i > 0 ? SHEET2_ROWS[i - 1] : null;

    let twrFactor = 1.0;
    if (prev) {
      const cashFlowBetween = row.netDepositsUsd - prev.netDepositsUsd;
      const denominator = prev.portfolioValueUsd + cashFlowBetween * 0.5;
      twrFactor = denominator > 0 ? row.portfolioValueUsd / denominator : 1;
    }

    const date = new Date(row.date + "T00:00:00Z");

    await db.portfolioSnapshot.upsert({
      where: { snapshotDate: date },
      create: {
        snapshotDate:      date,
        portfolioValueUsd: row.portfolioValueUsd,
        cashValueUsd:      0,
        investedValueUsd:  row.portfolioValueUsd,
        netDepositsUsd:    row.netDepositsUsd,
        unrealizedGainUsd: row.gainUsd,
        totalReturnPct:    row.returnPct,
        twrFactor,
        source:            "import",
      },
      update: {
        portfolioValueUsd: row.portfolioValueUsd,
        cashValueUsd:      0,
        investedValueUsd:  row.portfolioValueUsd,
        netDepositsUsd:    row.netDepositsUsd,
        unrealizedGainUsd: row.gainUsd,
        totalReturnPct:    row.returnPct,
        twrFactor,
        source:            "import",
      },
    });
  }
  console.log(`Portfolio snapshots upserted: ${SHEET2_ROWS.length}`);

  // ── Validation ────────────────────────────────────────────────────────────
  console.log("\n── Validation (vs Excel Sheet2 last row) ──────────────────────────");
  const lastRow = SHEET2_ROWS[SHEET2_ROWS.length - 1];
  const flows = await db.cashFlow.findMany({ orderBy: { date: "asc" } });
  const netDep = flows.reduce((s, f) => f.type === "deposit" ? s + f.amountUsd : s - f.amountUsd, 0);
  const gain = lastRow.portfolioValueUsd - netDep;
  const returnPctActual = netDep > 0 ? (gain / netDep) * 100 : 0;

  const excelReturn = lastRow.returnPct;
  console.log(`  Date:               ${lastRow.date}`);
  console.log(`  Excel Net Deposits: $${lastRow.netDepositsUsd.toFixed(2)}`);
  console.log(`  DB Net Deposits:    $${netDep.toFixed(2)}`);
  console.log(`  Excel Portfolio:    $${lastRow.portfolioValueUsd.toFixed(2)}`);
  console.log(`  Excel Gain:         $${lastRow.gainUsd.toFixed(2)}`);
  console.log(`  DB Gain:            $${gain.toFixed(2)}`);
  console.log(`  Excel Return:       ${excelReturn.toFixed(2)}%`);
  console.log(`  DB Return:          ${returnPctActual.toFixed(2)}%`);

  const depDiff = Math.abs(netDep - lastRow.netDepositsUsd);
  const retDiff = Math.abs(returnPctActual - excelReturn);
  console.log(`\n  Net Deposits match (< $1.00): ${depDiff < 1.0 ? `✓ (diff $${depDiff.toFixed(4)})` : `✗ diff $${depDiff.toFixed(4)}`}`);
  console.log(`  Return % match (< 0.10%):     ${retDiff < 0.1 ? `✓ (diff ${retDiff.toFixed(4)}%)` : `✗ diff ${retDiff.toFixed(4)}%`}`);

  await db.$disconnect();
  console.log("\nDone.\n");
}

importHistory().catch(e => {
  console.error(e);
  process.exit(1);
});
