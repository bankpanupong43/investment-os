import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/portfolio-snapshots
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100"), 500);

  const snapshots = await db.portfolioSnapshot.findMany({
    orderBy: { snapshotDate: "asc" },
    take: limit,
  });

  return NextResponse.json({ snapshots, total: snapshots.length });
}

// POST /api/portfolio-snapshots
// Creates a snapshot for a given date. Reads live position data if portfolioValueUsd
// is not provided (auto-snapshot mode).
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { snapshotDate, portfolioValueUsd, cashValueUsd, investedValueUsd, netDepositsUsd, source, note } = body;

  if (!snapshotDate) {
    return NextResponse.json({ error: "snapshotDate required" }, { status: 400 });
  }

  const date = new Date(snapshotDate);
  date.setUTCHours(0, 0, 0, 0);

  // Resolve portfolio value — use provided or sum from live positions
  let portValue = portfolioValueUsd != null ? parseFloat(portfolioValueUsd) : null;
  let cashVal = cashValueUsd != null ? parseFloat(cashValueUsd) : 0;
  let investedVal = investedValueUsd != null ? parseFloat(investedValueUsd) : 0;

  if (portValue == null) {
    const positions = await db.position.findMany({
      where: { status: "active" },
      select: { ticker: true, currentValueUsd: true },
    });
    portValue = positions.reduce((s, p) => s + (p.currentValueUsd ?? 0), 0);
    const cashPos = positions.find(p => p.ticker === "CASH");
    cashVal = cashPos?.currentValueUsd ?? 0;
    investedVal = portValue - cashVal;
  }

  // Resolve net deposits — use provided or sum from cash_flows table
  let netDep = netDepositsUsd != null ? parseFloat(netDepositsUsd) : null;
  if (netDep == null) {
    const flows = await db.cashFlow.findMany({
      where: { date: { lte: date } },
    });
    netDep = flows.reduce((s, f) => f.type === "deposit" ? s + f.amountUsd : s - f.amountUsd, 0);
  }

  const gain = portValue - netDep;
  const returnPct = netDep > 0 ? (gain / netDep) * 100 : 0;

  // Compute TWR sub-period factor relative to previous snapshot
  const prevSnapshot = await db.portfolioSnapshot.findFirst({
    where: { snapshotDate: { lt: date } },
    orderBy: { snapshotDate: "desc" },
  });

  // Between prev snapshot and this one, net flow = netDep - prevNetDep
  const prevNetDep = prevSnapshot?.netDepositsUsd ?? 0;
  const prevValue = prevSnapshot?.portfolioValueUsd ?? netDep;
  const cashFlowBetween = netDep - prevNetDep;
  // Modified Dietz denominator: previous value + weighted cash flow (assume mid-period)
  const twrDenominator = prevValue + cashFlowBetween * 0.5;
  const twrFactor = twrDenominator > 0 ? portValue / twrDenominator : 1;

  const snapshot = await db.portfolioSnapshot.upsert({
    where: { snapshotDate: date },
    create: {
      snapshotDate: date,
      portfolioValueUsd: portValue,
      cashValueUsd: cashVal,
      investedValueUsd: investedVal,
      netDepositsUsd: netDep,
      unrealizedGainUsd: gain,
      totalReturnPct: returnPct,
      twrFactor,
      source: source ?? "manual",
    },
    update: {
      portfolioValueUsd: portValue,
      cashValueUsd: cashVal,
      investedValueUsd: investedVal,
      netDepositsUsd: netDep,
      unrealizedGainUsd: gain,
      totalReturnPct: returnPct,
      twrFactor,
      source: source ?? "manual",
    },
  });

  return NextResponse.json(snapshot, { status: 201 });
}
