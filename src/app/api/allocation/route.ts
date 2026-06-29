export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { computePortfolioValue } from "@/lib/portfolio-value-engine";

export interface AllocationEntry {
  ticker: string;
  name: string;
  bucket: string;
  priority: number;
  notes: string | null;
  targetUsd: number;
  targetThb: number;
  targetPct: number;
  currentUsd: number;
  currentPct: number;   // current value as % of live portfolio total
  gapUsd: number;       // positive = under-allocated (need to buy)
  gapPct: number;       // gapUsd as % of targetUsd (0–100)
  pctFunded: number;    // currentUsd / targetUsd * 100
  positionId: string | null;
  snapshotDate: string | null;
}

export interface UntrackedPosition {
  positionId: string;
  ticker: string;
  name: string;
  sector: string | null;
  assetClass: string;
  bucket: string;
  currentUsd: number;
  currentPct: number;
}

function inferBucket(assetClass: string, sector: string | null): string {
  const ac = (assetClass ?? "").toLowerCase();
  if (ac === "cash") return "defensive";
  if (ac.includes("bond") || ac.includes("fixed")) return "defensive";
  if (ac.includes("commodity")) return "value";
  const s = (sector ?? "").toLowerCase();
  if (s.includes("technolog") || s.includes("semiconduct") || s.includes("software")) return "growth";
  if (s.includes("communication") || s.includes("media") || s.includes("internet")) return "growth";
  if (s.includes("consumer discret") || s.includes("retail") || s.includes("e-commerce")) return "growth";
  if (s.includes("health") || s.includes("pharma") || s.includes("biotech")) return "defensive";
  if (s.includes("consumer stapl") || s.includes("utilit") || s.includes("real estate")) return "defensive";
  if (s.includes("financ") || s.includes("bank") || s.includes("insurance")) return "core";
  if (s.includes("industri") || s.includes("aerospace") || s.includes("defense")) return "core";
  if (s.includes("material") || s.includes("mining") || s.includes("energy")) return "value";
  if (s.includes("small") || s.includes("mid")) return "small";
  return "growth";
}

export interface AllocationResponse {
  settings: {
    label: string;
    totalCapitalUsd: number;
    totalCapitalThb: number;
    exchangeRate: number;
    source: string | null;
  };
  summary: {
    totalTargetUsd: number;
    totalDeployedUsd: number;
    totalUntrackedUsd: number;
    cashUsd: number;
    totalGapUsd: number;
    pctFunded: number;
    canFullyFund: boolean;
    shortfallUsd: number;
    snapshotDate: string | null;
  };
  targets: AllocationEntry[];
  untracked: UntrackedPosition[];
}

export async function GET(): Promise<NextResponse> {
  const [allocationTargets, snapshot, posMeta] = await Promise.all([
    db.allocationTarget.findMany({ orderBy: { priority: "asc" } }),
    computePortfolioValue(),
    db.position.findMany({
      where: { status: "active" },
      select: { id: true, ticker: true, name: true, sector: true, assetClass: true },
    }),
  ]);

  const usdthb       = snapshot.usdthb ?? 35;
  const totalLiveUsd = snapshot.totalValueThb / usdthb;
  const cashUsd      = snapshot.totalCashThb / usdthb;

  // Live market value per ticker from PortfolioHolding
  const holdingMap = new Map(snapshot.holdings.map(h => [h.ticker, h.marketValueUsd ?? 0]));

  // Position metadata for names, sectors, IDs
  const posMap      = new Map(posMeta.map(p => [p.ticker, p]));
  const targetTickers = new Set(allocationTargets.map(t => t.ticker));

  const targets: AllocationEntry[] = allocationTargets.map(t => {
    const pos        = posMap.get(t.ticker);
    const currentUsd = holdingMap.get(t.ticker) ?? 0;
    const gapUsd     = t.targetUsd - currentUsd;
    const pctFunded  = t.targetUsd > 0 ? (currentUsd / t.targetUsd) * 100 : 0;
    const gapPct     = t.targetUsd > 0 ? (gapUsd / t.targetUsd) * 100 : 0;
    const currentPct = totalLiveUsd > 0 ? (currentUsd / totalLiveUsd) * 100 : 0;

    return {
      ticker:       t.ticker,
      name:         t.name,
      bucket:       t.bucket,
      priority:     t.priority,
      notes:        t.notes,
      targetUsd:    t.targetUsd,
      targetThb:    t.targetThb,
      targetPct:    t.targetPct,
      currentUsd,
      currentPct,
      gapUsd,
      gapPct,
      pctFunded,
      positionId:   pos?.id ?? null,
      snapshotDate: snapshot.priceDate,
    };
  });

  // Untracked: in PortfolioHolding but not in AllocationTarget
  const untracked: UntrackedPosition[] = snapshot.holdings
    .filter(h => !targetTickers.has(h.ticker))
    .map(h => {
      const pos = posMap.get(h.ticker);
      return {
        positionId: pos?.id ?? h.ticker,
        ticker:     h.ticker,
        name:       pos?.name ?? h.ticker,
        sector:     pos?.sector ?? null,
        assetClass: pos?.assetClass ?? "equity",
        bucket:     inferBucket(pos?.assetClass ?? "equity", pos?.sector ?? null),
        currentUsd: h.marketValueUsd ?? 0,
        currentPct: h.allocationPct ?? 0,
      };
    });

  const totalTargetUsd    = targets.reduce((s, t) => s + t.targetUsd, 0);
  const totalDeployedUsd  = targets.reduce((s, t) => s + t.currentUsd, 0);
  const totalUntrackedUsd = untracked.reduce((s, u) => s + u.currentUsd, 0);
  const totalGapUsd       = totalTargetUsd - totalDeployedUsd;
  const pctFunded         = totalTargetUsd > 0 ? (totalDeployedUsd / totalTargetUsd) * 100 : 0;
  const canFullyFund      = cashUsd >= totalGapUsd;
  const shortfallUsd      = Math.max(0, totalGapUsd - cashUsd);

  const response: AllocationResponse = {
    settings: {
      label:           "Live Portfolio",
      totalCapitalUsd: totalLiveUsd,
      totalCapitalThb: snapshot.totalValueThb,
      exchangeRate:    usdthb,
      source:          snapshot.priceDate ? `Live · ${snapshot.priceDate}` : "Live Prices",
    },
    summary: {
      totalTargetUsd,
      totalDeployedUsd,
      totalUntrackedUsd,
      cashUsd,
      totalGapUsd,
      pctFunded,
      canFullyFund,
      shortfallUsd,
      snapshotDate: snapshot.priceDate,
    },
    targets,
    untracked,
  };

  return NextResponse.json(response);
}
