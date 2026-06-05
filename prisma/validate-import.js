const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const EXPECTED_TICKERS   = ['AAPL','NVDA','GOOG','AMZN','ITA','GLDM','DIME_USD','DIME_SAVE','FCD_USD'];
const EXPECTED_WATCHLIST = ['MSFT','META','IJH','VTWO'];
const SNAPSHOT_DATE      = '2026-06-03';
const EXCHANGE_RATE      = 32.65;

function pct(n) { return n != null ? `${n > 0 ? '+' : ''}${n.toFixed(2)}%` : 'n/a'; }
function usd(n) { return n != null ? `$${n.toLocaleString(undefined, {maximumFractionDigits:2})}` : 'n/a'; }

async function validate() {
  const positions = await prisma.position.findMany({ orderBy: { allocationPct: 'desc' } });
  const watchlist = await prisma.watchlist.findMany({ orderBy: { ticker: 'asc' } });

  let pass = 0, fail = 0;
  const failures = [];

  function check(label, condition, detail = '') {
    if (condition) {
      pass++;
      console.log(`  ✓  ${label}`);
    } else {
      fail++;
      failures.push(label + (detail ? ' — ' + detail : ''));
      console.log(`  ✗  ${label}${detail ? ' — ' + detail : ''}`);
    }
  }

  console.log('\n════════════════════════════════════════════════════════');
  console.log('  Post-Import Validation Report');
  console.log(`  Database : dev.db`);
  console.log(`  Date     : ${new Date().toISOString().slice(0,10)}`);
  console.log('════════════════════════════════════════════════════════\n');

  // ── Counts ────────────────────────────────────────────────────────────────
  console.log('[ Counts ]');
  check('Positions count = 9', positions.length === 9, `got ${positions.length}`);
  check('Watchlist count = 4', watchlist.length === 4, `got ${watchlist.length}`);

  // ── No seed duplicates ────────────────────────────────────────────────────
  console.log('\n[ Deduplication ]');
  const tickerCounts = {};
  for (const p of positions) tickerCounts[p.ticker] = (tickerCounts[p.ticker] || 0) + 1;
  for (const [t, c] of Object.entries(tickerCounts)) {
    check(`No duplicate: ${t}`, c === 1, `count=${c}`);
  }

  // ── No fake fields ─────────────────────────────────────────────────────────
  console.log('\n[ No invented data ]');
  const withShares    = positions.filter(p => p.shares != null);
  const withAvgCost   = positions.filter(p => p.avgCost != null);
  const withEntryDate = positions.filter(p => p.entryDate != null);
  check('shares = null for all positions',    withShares.length    === 0, `${withShares.map(p=>p.ticker).join(', ')}`);
  check('avgCost = null for all positions',   withAvgCost.length   === 0, `${withAvgCost.map(p=>p.ticker).join(', ')}`);
  check('entryDate = null for all positions', withEntryDate.length === 0, `${withEntryDate.map(p=>p.ticker).join(', ')}`);

  // ── Snapshot fields populated ─────────────────────────────────────────────
  console.log('\n[ Snapshot field coverage ]');
  const equities = positions.filter(p => ['equity','etf','commodity'].includes(p.assetClass));
  const withReturn = equities.filter(p => p.unrealizedReturnPct != null);
  const withCost   = equities.filter(p => p.costBasisUsd != null);
  check(`unrealizedReturnPct set for all equity/ETF (${equities.length})`, withReturn.length === equities.length);
  check(`costBasisUsd derived for all equity/ETF (${equities.length})`,    withCost.length   === equities.length);
  check('allocationPct set for all positions', positions.every(p => p.allocationPct != null));
  check('dataSource set for all positions',    positions.every(p => p.dataSource != null));
  check('confidence set for all positions',    positions.every(p => p.confidence != null));
  check('snapshotDate set for all positions',  positions.every(p => p.snapshotDate != null));

  // ── Tickers present ───────────────────────────────────────────────────────
  console.log('\n[ Expected tickers ]');
  const presentTickers = new Set(positions.map(p => p.ticker));
  for (const t of EXPECTED_TICKERS) {
    check(`Position: ${t}`, presentTickers.has(t));
  }

  // ── Watchlist tickers ─────────────────────────────────────────────────────
  console.log('\n[ Watchlist ]');
  const presentWatch = new Set(watchlist.map(w => w.ticker));
  for (const t of EXPECTED_WATCHLIST) {
    check(`Watchlist: ${t}`, presentWatch.has(t));
  }
  const noFakeWatch = watchlist.every(w => w.interestReason && w.interestReason.length > 10);
  check('All watchlist entries have interestReason', noFakeWatch);

  // ── Cost basis math spot-check ─────────────────────────────────────────────
  console.log('\n[ Cost basis derivation ]');
  const checks = [
    { ticker: 'AAPL', expectedCostBasis: 1989.97, tol: 1.0 },
    { ticker: 'NVDA', expectedCostBasis: 1614.07, tol: 1.0 },
    { ticker: 'GOOG', expectedCostBasis: 1382.61, tol: 1.0 },
    { ticker: 'GLDM', expectedCostBasis: 3951.96, tol: 0.05 },
  ];
  for (const c of checks) {
    const p = positions.find(p => p.ticker === c.ticker);
    if (!p) { check(`${c.ticker} cost basis`, false, 'position missing'); continue; }
    const diff = Math.abs(p.costBasisUsd - c.expectedCostBasis);
    check(`${c.ticker} costBasis ≈ ${usd(c.expectedCostBasis)} (got ${usd(p.costBasisUsd)})`, diff <= c.tol);
  }

  // ── Allocation total ──────────────────────────────────────────────────────
  console.log('\n[ Allocation sanity ]');
  const totalAlloc = positions.reduce((s, p) => s + (p.allocationPct || 0), 0);
  check(`Allocation total ≈ 100% (got ${totalAlloc.toFixed(2)}%)`, Math.abs(totalAlloc - 100) < 5.0);

  // ── Full position table ───────────────────────────────────────────────────
  console.log('\n[ Position detail ]\n');
  console.log('  Ticker     Class      CurrVal(USD)  Alloc%    Return%   CostBasis   Conf   Source');
  console.log('  ' + '─'.repeat(95));
  for (const p of positions) {
    const val   = p.currentValueUsd != null ? usd(p.currentValueUsd) : `฿${p.currentValueThb?.toLocaleString()}`;
    const ret   = pct(p.unrealizedReturnPct);
    const cost  = p.costBasisUsd != null ? usd(p.costBasisUsd) : 'n/a';
    const alloc = `${p.allocationPct?.toFixed(2)}%`;
    const src   = (p.dataSource || '').split('+')[0].trim().slice(0, 18);
    console.log(`  ${p.ticker.padEnd(10)} ${p.assetClass.padEnd(10)} ${val.padStart(12)}  ${alloc.padStart(7)}  ${ret.padStart(8)}  ${cost.padStart(10)}  ${(p.confidence||'').padEnd(6)}  ${src}`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════════════');
  if (fail === 0) {
    console.log(`  RESULT: ALL ${pass} CHECKS PASSED`);
  } else {
    console.log(`  RESULT: ${pass} passed, ${fail} FAILED`);
    console.log('\n  Failures:');
    for (const f of failures) console.log(`    • ${f}`);
  }
  console.log('════════════════════════════════════════════════════════\n');

  await prisma.$disconnect();
  return fail === 0;
}

validate().then(ok => process.exit(ok ? 0 : 1))
  .catch(e => { console.error('VALIDATION ERROR:', e.message); process.exit(1); });
