/**
 * Real portfolio import — seeds from หุ้น.xlsx + portlab/portfolio_seed.json
 * Source data as of 2026-06-03 (latest Sheet2 snapshot entry).
 *
 * Rules:
 *  - No invented shares / avgCost / entryDate
 *  - costBasisUsd is derived: currentValueUsd / (1 + unrealizedReturnPct/100)
 *  - Returns only stored where the source explicitly provided them
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const SNAPSHOT_DATE = new Date('2026-06-03T00:00:00.000Z');

// ---------------------------------------------------------------------------
// Source: หุ้น.xlsx (Sheet1) + portfolio_seed.json (for return %)
// ---------------------------------------------------------------------------
const POSITIONS = [
  // ── Equities ──────────────────────────────────────────────────────────────
  {
    ticker: 'AAPL',
    name: 'Apple Inc.',
    sector: 'Technology',
    industry: 'Consumer Electronics',
    assetClass: 'equity',
    currentValueUsd: 2597,
    currentValueThb: 84792.05,
    allocationPct: 5.876,
    unrealizedReturnPct: 30.52,   // source: portfolio_seed.json
    // costBasis = 2597 / 1.3052 = 1990.00
    dataSource: 'หุ้น.xlsx + portlab/portfolio_seed.json',
    confidence: 'high',
  },
  {
    ticker: 'NVDA',
    name: 'NVIDIA Corporation',
    sector: 'Technology',
    industry: 'Semiconductors',
    assetClass: 'equity',
    currentValueUsd: 2418,
    currentValueThb: 78947.70,
    allocationPct: 5.471,
    unrealizedReturnPct: 49.82,   // source: portfolio_seed.json
    // costBasis = 2418 / 1.4982 = 1614.07
    dataSource: 'หุ้น.xlsx + portlab/portfolio_seed.json',
    confidence: 'high',
  },
  {
    ticker: 'GOOG',
    name: 'Alphabet Inc.',
    sector: 'Technology',
    industry: 'Internet Services',
    assetClass: 'equity',
    currentValueUsd: 2332,
    currentValueThb: 76139.80,
    allocationPct: 5.277,
    unrealizedReturnPct: 68.68,   // source: portfolio_seed.json
    // costBasis = 2332 / 1.6868 = 1382.61
    dataSource: 'หุ้น.xlsx + portlab/portfolio_seed.json',
    confidence: 'high',
  },
  {
    ticker: 'AMZN',
    name: 'Amazon.com, Inc.',
    sector: 'Technology',
    industry: 'E-Commerce & Cloud',
    assetClass: 'equity',
    currentValueUsd: 2372,
    currentValueThb: 77445.80,
    allocationPct: 5.367,
    unrealizedReturnPct: 22.32,   // source: portfolio_seed.json
    // costBasis = 2372 / 1.2232 = 1938.48
    dataSource: 'หุ้น.xlsx + portlab/portfolio_seed.json',
    confidence: 'high',
  },
  {
    ticker: 'ITA',
    name: 'iShares U.S. Aerospace & Defense ETF',
    sector: 'Industrials',
    industry: 'Aerospace & Defense',
    assetClass: 'etf',
    currentValueUsd: 4115,
    currentValueThb: 134354.75,
    allocationPct: 9.311,
    unrealizedReturnPct: 9.43,    // source: portfolio_seed.json
    // costBasis = 4115 / 1.0943 = 3760.33
    dataSource: 'หุ้น.xlsx + portlab/portfolio_seed.json',
    confidence: 'high',
  },
  {
    ticker: 'GLDM',
    name: 'SPDR Gold MiniShares',
    sector: 'Commodities',
    industry: 'Gold',
    assetClass: 'commodity',
    currentValueUsd: 3784,
    currentValueThb: 123547.60,
    allocationPct: 8.562,
    unrealizedReturnPct: -4.25,   // source: portfolio_seed.json
    // costBasis = 3784 / 0.9575 = 3950.78
    dataSource: 'หุ้น.xlsx + portlab/portfolio_seed.json',
    confidence: 'high',
  },

  // ── Cash / Savings (breakdown from portlab/portfolio_seed.json) ────────────
  // Excel CASH row (฿867,762) = DIME_USD + DIME_SAVE + FCD_USD ✓
  {
    ticker: 'DIME_USD',
    name: 'Dime App — USD Holdings',
    sector: 'Cash & Equivalents',
    industry: null,
    assetClass: 'cash',
    currentValueUsd: 13993,
    currentValueThb: 456882,
    allocationPct: 31.64,
    unrealizedReturnPct: null,    // savings account — no return data
    dataSource: 'portlab/portfolio_seed.json',
    confidence: 'medium',
  },
  {
    ticker: 'DIME_SAVE',
    name: 'Dime App — THB Savings',
    sector: 'Cash & Equivalents',
    industry: null,
    assetClass: 'cash',
    currentValueUsd: null,
    currentValueThb: 339001,
    allocationPct: 23.49,
    unrealizedReturnPct: null,
    dataSource: 'portlab/portfolio_seed.json',
    confidence: 'medium',
  },
  {
    ticker: 'FCD_USD',
    name: 'Foreign Currency Deposit (USD)',
    sector: 'Cash & Equivalents',
    industry: null,
    assetClass: 'cash',
    currentValueUsd: 2202,
    currentValueThb: 71881,
    allocationPct: 4.98,
    unrealizedReturnPct: null,
    dataSource: 'portlab/portfolio_seed.json',
    confidence: 'medium',
  },
];

// ---------------------------------------------------------------------------
// Watchlist — specified by user; confirmed zero-allocation in หุ้น.xlsx plan
// ---------------------------------------------------------------------------
const WATCHLIST = [
  {
    ticker: 'MSFT',
    name: 'Microsoft Corporation',
    interestReason: 'Target for Growth (60%) allocation bucket. Currently 0% — earmarked as the primary large-cap growth addition once conviction builds.',
  },
  {
    ticker: 'META',
    name: 'Meta Platforms, Inc.',
    interestReason: 'Target for Defensive allocation (10%). Excel plan shows 0% current weight. Watching for re-entry opportunity.',
  },
  {
    ticker: 'IJH',
    name: 'iShares Core S&P Mid-Cap ETF',
    interestReason: 'Target for Mid-cap (10%) allocation. Currently 0% — the mid-cap sleeve of the portfolio is unfilled.',
  },
  {
    ticker: 'VTWO',
    name: 'Vanguard Russell 2000 ETF',
    interestReason: 'Target for Small-cap (10%) allocation. Currently 0% — the small-cap sleeve of the portfolio is unfilled.',
  },
];

function deriveCostBasis(currentValueUsd, unrealizedReturnPct) {
  if (currentValueUsd == null || unrealizedReturnPct == null) return null;
  return Math.round((currentValueUsd / (1 + unrealizedReturnPct / 100)) * 100) / 100;
}

async function run() {
  console.log('=== Real Portfolio Import ===\n');

  // ── 1. Purge all seed data ──────────────────────────────────────────────
  console.log('Purging seed data...');

  // Delete in order to satisfy FK constraints (children before parents)
  const deletedKill     = await prisma.killCondition.deleteMany();
  const deletedEval     = await prisma.thesisEvaluation.deleteMany();
  const deletedVer      = await prisma.thesisVersion.deleteMany();
  const deletedUpd      = await prisma.thesisUpdate.deleteMany();
  const deletedThesis   = await prisma.thesis.deleteMany();
  const deletedJournal  = await prisma.journalEntry.deleteMany();
  const deletedRec      = await prisma.recommendation.deleteMany();
  const deletedNews     = await prisma.newsItem.deleteMany();
  const deletedEarnings = await prisma.earningsEvent.deleteMany();
  const deletedPos      = await prisma.position.deleteMany();
  const deletedWatch    = await prisma.watchlist.deleteMany();

  console.log(`  Deleted ${deletedPos.count} positions`);
  console.log(`  Deleted ${deletedWatch.count} watchlist entries`);
  console.log(`  Deleted ${deletedJournal.count} journal entries`);
  console.log(`  Deleted ${deletedThesis.count} theses + ${deletedKill.count} kill conditions`);
  console.log('  Purge complete.\n');

  // ── 2. Import positions ─────────────────────────────────────────────────
  console.log('Importing positions...');
  const created = [];

  for (const p of POSITIONS) {
    const costBasisUsd = deriveCostBasis(p.currentValueUsd, p.unrealizedReturnPct);
    const pos = await prisma.position.create({
      data: {
        ticker:              p.ticker,
        name:                p.name,
        sector:              p.sector,
        industry:            p.industry ?? null,
        assetClass:          p.assetClass,
        shares:              null,
        avgCost:             null,
        entryDate:           null,
        status:              'active',
        currentValueUsd:     p.currentValueUsd ?? null,
        currentValueThb:     p.currentValueThb ?? null,
        allocationPct:       p.allocationPct,
        unrealizedReturnPct: p.unrealizedReturnPct ?? null,
        costBasisUsd:        costBasisUsd,
        dataSource:          p.dataSource,
        confidence:          p.confidence,
        snapshotDate:        SNAPSHOT_DATE,
      },
    });
    created.push(pos);
    const retStr = p.unrealizedReturnPct != null
      ? `${p.unrealizedReturnPct > 0 ? '+' : ''}${p.unrealizedReturnPct}%`
      : 'n/a';
    const valStr = p.currentValueUsd != null ? `$${p.currentValueUsd}` : `฿${p.currentValueThb}`;
    console.log(`  [OK] ${pos.ticker.padEnd(10)} ${valStr.padStart(9)}  alloc=${p.allocationPct.toFixed(2)}%  return=${retStr}`);
  }

  // ── 3. Import watchlist ─────────────────────────────────────────────────
  console.log('\nImporting watchlist...');
  for (const w of WATCHLIST) {
    await prisma.watchlist.create({ data: w });
    console.log(`  [OK] ${w.ticker}`);
  }

  // ── 4. Summary ──────────────────────────────────────────────────────────
  console.log('\n=== Import complete ===');
  const totalUsd = created
    .filter(p => p.currentValueUsd)
    .reduce((s, p) => s + p.currentValueUsd, 0);
  const totalThbCash = created
    .filter(p => !p.currentValueUsd && p.currentValueThb)
    .reduce((s, p) => s + p.currentValueThb, 0);
  console.log(`  Positions created : ${created.length}`);
  console.log(`  Total USD value   : $${totalUsd.toLocaleString()}`);
  console.log(`  THB-only cash     : ฿${totalThbCash.toLocaleString()}`);

  await prisma.$disconnect();
}

run().catch(e => {
  console.error('IMPORT FAILED:', e.message);
  prisma.$disconnect();
  process.exit(1);
});
