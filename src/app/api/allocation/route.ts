import { NextResponse } from "next/server";
import { db } from "@/lib/db";

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
  currentPct: number;   // current value as % of totalCapitalUsd
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
  currentUsd: number;
  currentPct: number;
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
    totalDeployedUsd: number;  // sum of current values for targeted positions
    totalUntrackedUsd: number; // sum of current values for untracked positions
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
  const [settings, allocationTargets, positions] = await Promise.all([
    db.portfolioSettings.findFirst(),
    db.allocationTarget.findMany({ orderBy: { priority: "asc" } }),
    db.position.findMany({
      where: { status: "active" },
      select: {
        id: true,
        ticker: true,
        name: true,
        sector: true,
        assetClass: true,
        currentValueUsd: true,
        snapshotDate: true,
      },
    }),
  ]);

  if (!settings) {
    return NextResponse.json({ error: "Portfolio settings not found. Run db:seed-targets." }, { status: 404 });
  }

  const posMap = new Map(positions.map(p => [p.ticker, p]));
  const targetTickers = new Set(allocationTargets.map(t => t.ticker));

  // Build allocation entries
  const targets: AllocationEntry[] = allocationTargets.map(t => {
    const pos        = posMap.get(t.ticker);
    const currentUsd = pos?.currentValueUsd ?? 0;
    const gapUsd     = t.targetUsd - currentUsd;
    const pctFunded  = t.targetUsd > 0 ? (currentUsd / t.targetUsd) * 100 : 0;
    const gapPct     = t.targetUsd > 0 ? (gapUsd / t.targetUsd) * 100 : 0;
    const currentPct = settings.totalCapitalUsd > 0 ? (currentUsd / settings.totalCapitalUsd) * 100 : 0;

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
      snapshotDate: pos?.snapshotDate?.toISOString() ?? null,
    };
  });

  // Untracked positions (held but not in target allocation, excluding CASH)
  const untracked: UntrackedPosition[] = positions
    .filter(p => !targetTickers.has(p.ticker) && p.ticker !== "CASH")
    .map(p => ({
      positionId:   p.id,
      ticker:       p.ticker,
      name:         p.name,
      sector:       p.sector,
      assetClass:   p.assetClass,
      currentUsd:   p.currentValueUsd ?? 0,
      currentPct:   settings.totalCapitalUsd > 0 ? ((p.currentValueUsd ?? 0) / settings.totalCapitalUsd) * 100 : 0,
    }));

  // Summary
  const totalTargetUsd    = targets.reduce((s, t) => s + t.targetUsd, 0);
  const totalDeployedUsd  = targets.reduce((s, t) => s + t.currentUsd, 0);
  const totalUntrackedUsd = untracked.reduce((s, u) => s + u.currentUsd, 0);
  const cashPos           = posMap.get("CASH");
  const cashUsd           = cashPos?.currentValueUsd ?? 0;
  const totalGapUsd       = totalTargetUsd - totalDeployedUsd;
  const pctFunded         = totalTargetUsd > 0 ? (totalDeployedUsd / totalTargetUsd) * 100 : 0;
  const canFullyFund      = cashUsd >= totalGapUsd;
  const shortfallUsd      = Math.max(0, totalGapUsd - cashUsd);

  const latestSnapshot = positions
    .map(p => p.snapshotDate)
    .filter(Boolean)
    .sort()
    .at(-1);

  const response: AllocationResponse = {
    settings: {
      label:           settings.label,
      totalCapitalUsd: settings.totalCapitalUsd,
      totalCapitalThb: settings.totalCapitalThb,
      exchangeRate:    settings.exchangeRate,
      source:          settings.source,
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
      snapshotDate: latestSnapshot?.toISOString() ?? null,
    },
    targets,
    untracked,
  };

  return NextResponse.json(response);
}
