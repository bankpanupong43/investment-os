/**
 * Creates a PortfolioSnapshot from live position data.
 * Run nightly: npm run snapshot:create
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function createDailySnapshot() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const [positions, flows] = await Promise.all([
    db.position.findMany({
      where: { status: "active" },
      select: { ticker: true, currentValueUsd: true },
    }),
    db.cashFlow.findMany({ where: { date: { lte: today } } }),
  ]);

  const portfolioValueUsd = positions.reduce((s, p) => s + (p.currentValueUsd ?? 0), 0);
  const cashValueUsd = positions.find(p => p.ticker === "CASH")?.currentValueUsd ?? 0;
  const investedValueUsd = portfolioValueUsd - cashValueUsd;
  const netDepositsUsd = flows.reduce((s, f) => f.type === "deposit" ? s + f.amountUsd : s - f.amountUsd, 0);
  const unrealizedGainUsd = portfolioValueUsd - netDepositsUsd;
  const totalReturnPct = netDepositsUsd > 0 ? (unrealizedGainUsd / netDepositsUsd) * 100 : 0;

  const prevSnapshot = await db.portfolioSnapshot.findFirst({
    where: { snapshotDate: { lt: today } },
    orderBy: { snapshotDate: "desc" },
  });

  const prevNetDep = prevSnapshot?.netDepositsUsd ?? 0;
  const prevValue = prevSnapshot?.portfolioValueUsd ?? netDepositsUsd;
  const cashFlowBetween = netDepositsUsd - prevNetDep;
  const twrDenominator = prevValue + cashFlowBetween * 0.5;
  const twrFactor = twrDenominator > 0 ? portfolioValueUsd / twrDenominator : 1;

  const snapshot = await db.portfolioSnapshot.upsert({
    where: { snapshotDate: today },
    create: { snapshotDate: today, portfolioValueUsd, cashValueUsd, investedValueUsd, netDepositsUsd, unrealizedGainUsd, totalReturnPct, twrFactor, source: "auto" },
    update: { portfolioValueUsd, cashValueUsd, investedValueUsd, netDepositsUsd, unrealizedGainUsd, totalReturnPct, twrFactor, source: "auto" },
  });

  console.log(`Snapshot created: ${today.toISOString().slice(0, 10)}`);
  console.log(`  Portfolio: $${portfolioValueUsd.toFixed(2)}`);
  console.log(`  Net Deps:  $${netDepositsUsd.toFixed(2)}`);
  console.log(`  Gain:      $${unrealizedGainUsd.toFixed(2)}`);
  console.log(`  Return:    ${totalReturnPct.toFixed(2)}%`);

  await db.$disconnect();
  return snapshot;
}

createDailySnapshot().catch(e => { console.error(e); process.exit(1); });
