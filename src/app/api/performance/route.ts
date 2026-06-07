import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// TWR = product of all sub-period return factors - 1
function computeTWR(snapshots: { twrFactor: number }[]): number {
  if (snapshots.length === 0) return 0;
  const product = snapshots.reduce((p, s) => p * s.twrFactor, 1);
  return (product - 1) * 100;
}

// MWR / XIRR via Newton-Raphson on IRR equation.
// cashFlows: array of { date: Date, amount: number }
// amount is negative for outflows (deposits) and positive for inflows (terminal value).
function computeXIRR(cashFlows: { date: Date; amount: number }[]): number | null {
  if (cashFlows.length < 2) return null;
  const t0 = cashFlows[0].date.getTime();

  function npv(rate: number): number {
    return cashFlows.reduce((s, cf) => {
      const years = (cf.date.getTime() - t0) / (365.25 * 24 * 3600 * 1000);
      return s + cf.amount / Math.pow(1 + rate, years);
    }, 0);
  }

  function npvDerivative(rate: number): number {
    return cashFlows.reduce((s, cf) => {
      const years = (cf.date.getTime() - t0) / (365.25 * 24 * 3600 * 1000);
      if (years === 0) return s;
      return s - years * cf.amount / Math.pow(1 + rate, years + 1);
    }, 0);
  }

  let rate = 0.1;
  for (let i = 0; i < 100; i++) {
    const f = npv(rate);
    const df = npvDerivative(rate);
    if (Math.abs(df) < 1e-10) break;
    const newRate = rate - f / df;
    if (Math.abs(newRate - rate) < 1e-8) {
      rate = newRate;
      break;
    }
    rate = newRate;
    if (rate < -0.999) rate = -0.999;
  }

  if (!isFinite(rate) || isNaN(rate)) return null;
  return rate * 100;
}

// GET /api/performance — since-inception performance metrics
export async function GET() {
  const [flows, snapshots, positions] = await Promise.all([
    db.cashFlow.findMany({ orderBy: { date: "asc" } }),
    db.portfolioSnapshot.findMany({ orderBy: { snapshotDate: "asc" } }),
    db.position.findMany({
      where: { status: "active" },
      select: { ticker: true, currentValueUsd: true },
    }),
  ]);

  // Current portfolio value from live positions
  const currentValueUsd = positions.reduce((s, p) => s + (p.currentValueUsd ?? 0), 0);
  const cashValueUsd = positions.find(p => p.ticker === "CASH")?.currentValueUsd ?? 0;
  const investedValueUsd = currentValueUsd - cashValueUsd;

  // Net deposits = sum of all cash flows
  const netDepositsUsd = flows.reduce((s, f) => f.type === "deposit" ? s + f.amountUsd : s - f.amountUsd, 0);

  // Simple inception return
  const gainUsd = currentValueUsd - netDepositsUsd;
  const totalReturnPct = netDepositsUsd > 0 ? (gainUsd / netDepositsUsd) * 100 : 0;

  // TWR from snapshot chain
  const twrPct = computeTWR(snapshots);

  // MWR (XIRR): deposits are outflows (-), current value is terminal inflow (+)
  let mwrPct: number | null = null;
  if (flows.length > 0) {
    const xirrFlows = flows.map(f => ({
      date: f.date,
      amount: f.type === "deposit" ? -f.amountUsd : f.amountUsd,
    }));
    xirrFlows.push({ date: new Date(), amount: currentValueUsd });
    mwrPct = computeXIRR(xirrFlows);
  }

  // Snapshot for last 30 days of data points
  const inceptionDate = snapshots[0]?.snapshotDate ?? flows[0]?.date ?? null;
  const latestSnapshot = snapshots.at(-1) ?? null;

  return NextResponse.json({
    currentValueUsd,
    cashValueUsd,
    investedValueUsd,
    netDepositsUsd,
    gainUsd,
    totalReturnPct,
    twrPct,
    mwrPct,
    inceptionDate: inceptionDate?.toISOString() ?? null,
    snapshotCount: snapshots.length,
    cashFlowCount: flows.length,
    latestSnapshot: latestSnapshot
      ? {
          snapshotDate: latestSnapshot.snapshotDate.toISOString(),
          portfolioValueUsd: latestSnapshot.portfolioValueUsd,
          netDepositsUsd: latestSnapshot.netDepositsUsd,
          totalReturnPct: latestSnapshot.totalReturnPct,
        }
      : null,
  });
}
