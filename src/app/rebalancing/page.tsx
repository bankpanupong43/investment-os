"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { AllocationResponse, AllocationEntry } from "@/app/api/allocation/route";

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtK(n: number): string {
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(1) + "K";
  return fmt(n);
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Style maps ───────────────────────────────────────────────────────────────

const BUCKET_COLOR: Record<string, string> = {
  growth:    "text-[#2d7d46] bg-[#eef7f1] border-[#c3e6cf]",
  core:      "text-[#3E6AE1] bg-[#EEF3FD] border-[#bfcffd]",
  small:     "text-[#b45309] bg-[#fffbeb] border-[#fde68a]",
  defensive: "text-[#5C5E62] bg-[#F4F4F4] border-[#EEEEEE]",
  value:     "text-[#6d28d9] bg-[#f5f3ff] border-[#ddd6fe]",
};

const BUCKET_BAR: Record<string, string> = {
  growth:    "#2d7d46",
  core:      "#3E6AE1",
  small:     "#b45309",
  defensive: "#8E8E8E",
  value:     "#6d28d9",
};

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bg-[#EEEEEE] rounded-xl animate-pulse ${className}`} />;
}

function MetricCard({
  label, value, sub, color = "text-[#171A20]",
}: {
  label: string; value: string; sub: string; color?: string;
}) {
  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl p-5">
      <div className="text-xs text-[#8E8E8E] font-medium mb-2">{label}</div>
      <div className={`text-2xl font-medium tabular-nums ${color}`}>{value}</div>
      <div className="text-xs text-[#8E8E8E] mt-1">{sub}</div>
    </div>
  );
}

// ─── Allocation Row ───────────────────────────────────────────────────────────

function AllocationRow({ t, rank }: { t: AllocationEntry; rank?: number }) {
  const needsBuy    = t.gapUsd > 0.01;
  const isOverfund  = t.gapUsd < -0.01;
  const barFilled   = Math.min(t.pctFunded, 100);
  const barTarget   = 100;

  return (
    <tr className="border-b border-[#EEEEEE] hover:bg-[#F4F4F4]" style={{ transition: "background-color 0.2s" }}>
      {/* Rank */}
      <td className="px-5 py-3.5 hidden lg:table-cell">
        {rank != null && (
          <span className="text-xs font-medium text-[#8E8E8E] tabular-nums">{rank}</span>
        )}
      </td>

      {/* Ticker + Bucket */}
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-2">
          {t.positionId ? (
            <Link href={`/positions/${t.positionId}`} className="font-medium text-[#171A20] hover:text-[#3E6AE1]" style={{ transition: "color 0.2s" }}>
              {t.ticker}
            </Link>
          ) : (
            <span className="font-medium text-[#8E8E8E]">{t.ticker}</span>
          )}
          <span className={`text-xs px-1.5 py-0.5 rounded border capitalize hidden sm:inline ${BUCKET_COLOR[t.bucket] ?? "text-[#5C5E62] bg-[#F4F4F4] border-[#EEEEEE]"}`}>
            {t.bucket}
          </span>
        </div>
        <div className="text-xs text-[#8E8E8E] mt-0.5 truncate max-w-[160px]">{t.name}</div>
      </td>

      {/* Target */}
      <td className="px-5 py-3.5 text-right tabular-nums">
        <div className="text-[#171A20] font-medium">{fmtK(t.targetUsd)}</div>
        <div className="text-xs text-[#8E8E8E]">{t.targetPct.toFixed(0)}%</div>
      </td>

      {/* Current */}
      <td className="px-5 py-3.5 text-right tabular-nums">
        <div className={t.currentUsd > 0 ? "text-[#171A20] font-medium" : "text-[#D0D1D2]"}>
          {t.currentUsd > 0 ? fmtK(t.currentUsd) : "—"}
        </div>
        {t.currentUsd > 0 && (
          <div className="text-xs text-[#8E8E8E]">{t.currentPct.toFixed(1)}%</div>
        )}
      </td>

      {/* Progress bar + funded % */}
      <td className="px-5 py-3.5 hidden md:table-cell">
        <div className="flex items-center gap-2">
          <div className="relative w-24 h-1.5 bg-[#EEEEEE] rounded-full overflow-hidden">
            <div
              className="absolute left-0 top-0 h-full rounded-full"
              style={{
                width: `${barFilled}%`,
                backgroundColor: BUCKET_BAR[t.bucket] ?? "#8E8E8E",
                transition: "width 0.4s ease",
              }}
            />
            {/* Target tick mark */}
            <div
              className="absolute top-0 h-full w-0.5 bg-[#171A20] opacity-30"
              style={{ left: `${barTarget}%`, transform: "translateX(-50%)" }}
            />
          </div>
          <span className="text-xs tabular-nums text-[#8E8E8E] w-10 shrink-0">
            {t.pctFunded.toFixed(0)}%
          </span>
        </div>
      </td>

      {/* Gap */}
      <td className="px-5 py-3.5 text-right tabular-nums">
        {needsBuy && (
          <div className="text-[#b45309] font-medium">−{fmt(t.gapUsd)}</div>
        )}
        {isOverfund && (
          <div className="text-[#2d7d46] font-medium">+{fmt(Math.abs(t.gapUsd))}</div>
        )}
        {!needsBuy && !isOverfund && (
          <span className="text-[#2d7d46] text-xs font-medium">✓ met</span>
        )}
      </td>

      {/* Action */}
      <td className="px-5 py-3.5">
        {needsBuy && (
          <span className="text-xs px-2 py-0.5 rounded font-medium uppercase text-[#b45309] bg-[#fffbeb] border border-[#fde68a]">
            buy
          </span>
        )}
        {isOverfund && (
          <span className="text-xs px-2 py-0.5 rounded font-medium uppercase text-[#5C5E62] bg-[#F4F4F4] border border-[#EEEEEE]">
            hold
          </span>
        )}
        {!needsBuy && !isOverfund && (
          <span className="text-xs px-2 py-0.5 rounded font-medium uppercase text-[#2d7d46] bg-[#eef7f1] border border-[#c3e6cf]">
            funded
          </span>
        )}
      </td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RebalancingPage() {
  const [data, setData]     = useState<AllocationResponse | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/allocation")
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setData(d as AllocationResponse);
      })
      .catch(() => setError("Failed to load allocation data."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-6 lg:p-8 space-y-6 max-w-7xl">
        <Skeleton className="h-8 w-56" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 lg:p-8">
        <div className="bg-white border border-[#EEEEEE] rounded-xl p-8 text-center">
          <p className="text-[#c0392b] text-sm mb-3">{error ?? "No allocation data"}</p>
          <code className="bg-[#F4F4F4] px-2 py-1 rounded text-xs text-[#5C5E62]">
            npm run db:seed-targets
          </code>
        </div>
      </div>
    );
  }

  const { settings, summary, targets, untracked } = data;

  // Sorted buy candidates (only those with a gap > 0)
  const buyCandidates = [...targets]
    .filter(t => t.gapUsd > 0.01)
    .sort((a, b) => b.gapUsd - a.gapUsd);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-medium text-[#171A20]">Rebalancing</h1>
          <p className="text-[#8E8E8E] text-sm mt-0.5">
            Snapshot {fmtDate(summary.snapshotDate)} · {settings.exchangeRate} THB/USD · source: {settings.source ?? "—"}
          </p>
        </div>
        <Link
          href="/holdings"
          style={{ transition: "background-color 0.33s" }}
          className="shrink-0 bg-[#3E6AE1] hover:bg-[#2d5bc7] text-white px-5 py-2 rounded text-sm font-medium"
        >
          View Holdings
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Target Capital"
          value={fmtK(settings.totalCapitalUsd)}
          sub={`฿${(settings.totalCapitalThb / 1000).toFixed(0)}K allocated plan`}
        />
        <MetricCard
          label="Currently Deployed"
          value={fmtK(summary.totalDeployedUsd)}
          sub={`${summary.pctFunded.toFixed(1)}% of target funded`}
        />
        <MetricCard
          label="Available Cash"
          value={fmtK(summary.cashUsd)}
          sub={summary.canFullyFund ? "sufficient to fund all gaps" : `shortfall ${fmtK(summary.shortfallUsd)}`}
          color={summary.canFullyFund ? "text-[#2d7d46]" : "text-[#b45309]"}
        />
        <MetricCard
          label="Total Gap"
          value={fmtK(summary.totalGapUsd)}
          sub={`${buyCandidates.length} position${buyCandidates.length !== 1 ? "s" : ""} need buying`}
          color={summary.totalGapUsd > 0 ? "text-[#c0392b]" : "text-[#2d7d46]"}
        />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Allocation table — 2/3 width */}
        <div className="lg:col-span-2 bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#EEEEEE]">
            <h2 className="font-medium text-[#171A20] text-sm">Target Allocation</h2>
            <p className="text-xs text-[#8E8E8E] mt-0.5">
              {targets.length} target positions · ฿{(settings.totalCapitalThb / 1000).toFixed(0)}K total plan
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#EEEEEE] bg-[#F4F4F4]">
                  <th className="px-5 py-3 text-left text-xs text-[#8E8E8E] font-medium hidden lg:table-cell">#</th>
                  <th className="px-5 py-3 text-left text-xs text-[#8E8E8E] font-medium">Ticker</th>
                  <th className="px-5 py-3 text-right text-xs text-[#8E8E8E] font-medium">Target</th>
                  <th className="px-5 py-3 text-right text-xs text-[#8E8E8E] font-medium">Current</th>
                  <th className="px-5 py-3 text-left text-xs text-[#8E8E8E] font-medium hidden md:table-cell">Progress</th>
                  <th className="px-5 py-3 text-right text-xs text-[#8E8E8E] font-medium">Gap</th>
                  <th className="px-5 py-3 text-left text-xs text-[#8E8E8E] font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {targets.map((t, i) => (
                  <AllocationRow key={t.ticker} t={t} rank={i + 1} />
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-[#F4F4F4] border-t border-[#EEEEEE]">
                  <td className="hidden lg:table-cell" />
                  <td className="px-5 py-3 text-xs text-[#8E8E8E] font-medium">
                    TOTAL ({targets.length} positions)
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-xs font-medium text-[#171A20]">
                    {fmtK(summary.totalTargetUsd)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-xs font-medium text-[#171A20]">
                    {fmtK(summary.totalDeployedUsd)}
                  </td>
                  <td className="hidden md:table-cell px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="relative w-24 h-1.5 bg-[#EEEEEE] rounded-full overflow-hidden">
                        <div
                          className="absolute left-0 top-0 h-full bg-[#3E6AE1] rounded-full"
                          style={{ width: `${Math.min(summary.pctFunded, 100)}%`, transition: "width 0.4s ease" }}
                        />
                      </div>
                      <span className="text-xs tabular-nums text-[#8E8E8E] w-10 shrink-0">
                        {summary.pctFunded.toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-xs font-medium text-[#c0392b]">
                    −{fmtK(summary.totalGapUsd)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">

          {/* Next buy candidates */}
          <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#EEEEEE]">
              <h2 className="font-medium text-[#171A20] text-sm">Next Buy Candidates</h2>
              <p className="text-xs text-[#8E8E8E] mt-0.5">ranked by gap size · cash {fmtK(summary.cashUsd)}</p>
            </div>
            {buyCandidates.length === 0 ? (
              <div className="px-5 py-6 text-center text-[#8E8E8E] text-sm">All targets funded</div>
            ) : (
              buyCandidates.map((t, i) => (
                <div key={t.ticker} className={`px-5 py-3.5 ${i < buyCandidates.length - 1 ? "border-b border-[#EEEEEE]" : ""}`}>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#8E8E8E] tabular-nums w-4">{i + 1}.</span>
                      {t.positionId ? (
                        <Link href={`/positions/${t.positionId}`} className="font-medium text-[#171A20] hover:text-[#3E6AE1] text-sm" style={{ transition: "color 0.2s" }}>
                          {t.ticker}
                        </Link>
                      ) : (
                        <span className="font-medium text-[#171A20] text-sm">{t.ticker}</span>
                      )}
                      <span className={`text-xs px-1.5 py-0.5 rounded border capitalize ${BUCKET_COLOR[t.bucket] ?? "text-[#5C5E62] bg-[#F4F4F4] border-[#EEEEEE]"}`}>
                        {t.bucket}
                      </span>
                    </div>
                    <span className="text-sm font-medium text-[#b45309] tabular-nums shrink-0">
                      −{fmtK(t.gapUsd)}
                    </span>
                  </div>
                  {/* Mini progress bar */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-[#EEEEEE] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(t.pctFunded, 100)}%`,
                          backgroundColor: BUCKET_BAR[t.bucket] ?? "#8E8E8E",
                          transition: "width 0.4s ease",
                        }}
                      />
                    </div>
                    <span className="text-xs text-[#8E8E8E] tabular-nums shrink-0 w-10 text-right">
                      {t.pctFunded.toFixed(0)}%
                    </span>
                  </div>
                  <div className="text-xs text-[#8E8E8E] mt-1">
                    {fmtK(t.currentUsd)} of {fmtK(t.targetUsd)} target
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Untracked positions */}
          {untracked.length > 0 && (
            <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#EEEEEE]">
                <h2 className="font-medium text-[#171A20] text-sm">Untracked Holdings</h2>
                <p className="text-xs text-[#8E8E8E] mt-0.5">held positions not in target plan</p>
              </div>
              {untracked.map((u, i) => (
                <div key={u.ticker} className={`px-5 py-3.5 flex items-center justify-between ${i < untracked.length - 1 ? "border-b border-[#EEEEEE]" : ""}`}>
                  <div>
                    <Link href={`/positions/${u.positionId}`} className="font-medium text-[#171A20] hover:text-[#3E6AE1] text-sm" style={{ transition: "color 0.2s" }}>
                      {u.ticker}
                    </Link>
                    <div className="text-xs text-[#8E8E8E] mt-0.5">{u.sector ?? u.assetClass}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-sm tabular-nums text-[#171A20]">{fmtK(u.currentUsd)}</div>
                    <div className="text-xs text-[#8E8E8E] tabular-nums">{u.currentPct.toFixed(1)}% of plan</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Cash */}
          <div className="bg-white border border-[#EEEEEE] rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-medium text-[#171A20] text-sm">Cash Available</h2>
              <span className={`text-xs px-2 py-0.5 rounded border font-medium ${summary.canFullyFund ? "text-[#2d7d46] bg-[#eef7f1] border-[#c3e6cf]" : "text-[#b45309] bg-[#fffbeb] border-[#fde68a]"}`}>
                {summary.canFullyFund ? "sufficient" : "insufficient"}
              </span>
            </div>
            <div className="text-2xl font-medium tabular-nums text-[#171A20] mb-1">
              {fmtK(summary.cashUsd)}
            </div>
            <div className="text-xs text-[#8E8E8E] space-y-0.5">
              <div className="flex justify-between">
                <span>Gap to fill</span>
                <span className="tabular-nums font-medium text-[#c0392b]">−{fmtK(summary.totalGapUsd)}</span>
              </div>
              {!summary.canFullyFund && (
                <div className="flex justify-between">
                  <span>Shortfall</span>
                  <span className="tabular-nums font-medium text-[#b45309]">−{fmtK(summary.shortfallUsd)}</span>
                </div>
              )}
              {summary.canFullyFund && (
                <div className="flex justify-between">
                  <span>Remaining after deploy</span>
                  <span className="tabular-nums text-[#2d7d46]">+{fmtK(summary.cashUsd - summary.totalGapUsd)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
