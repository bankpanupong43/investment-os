"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

interface Position {
  id: string;
  ticker: string;
  name: string;
  sector: string | null;
  industry: string | null;
  assetClass: string;
  shares: number | null;
  avgCost: number | null;
  entryDate: string | null;
  status: string;
  notes: string | null;
  currentValueUsd: number | null;
  currentValueThb: number | null;
  allocationPct: number | null;
  unrealizedReturnPct: number | null;
  costBasisUsd: number | null;
  thesis: {
    healthStatus: string | null;
    healthScore: number | null;
    entryConfidence: number;
    holdingPeriod: string | null;
  } | null;
  killConditions: Array<{ id: string; status: string; description: string }>;
  recommendations: Array<{ id: string; action: string; urgency: string }>;
}

const HEALTH_STYLE: Record<string, string> = {
  intact: "text-[#2d7d46] bg-[#eef7f1] border-[#c3e6cf]",
  weakening: "text-[#b45309] bg-[#fffbeb] border-[#fde68a]",
  broken: "text-[#c0392b] bg-[#fdf0ee] border-[#f5c6c1]",
  monitoring: "text-[#3E6AE1] bg-[#EEF3FD] border-[#bfcffd]",
};

const STATUS_STYLE: Record<string, string> = {
  active: "text-[#2d7d46] bg-[#eef7f1] border-[#c3e6cf]",
  closed: "text-[#5C5E62] bg-[#F4F4F4] border-[#EEEEEE]",
  trimmed: "text-[#b45309] bg-[#fffbeb] border-[#fde68a]",
};

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtShort(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(1) + "K";
  return fmt(n);
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}

function positionCostBasis(p: Pick<Position, "costBasisUsd" | "shares" | "avgCost">): number | null {
  if (p.costBasisUsd != null) return p.costBasisUsd;
  if (p.shares != null && p.avgCost != null) return p.shares * p.avgCost;
  return null;
}

const SELECT_CLS = "bg-white border border-[#EEEEEE] text-[#393C41] text-sm rounded px-3 py-1.5 focus:outline-none focus:border-[#3E6AE1]";

export default function HoldingsPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [sectorFilter, setSectorFilter] = useState("all");
  const [assetFilter, setAssetFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"costBasis" | "ticker" | "entryDate" | "health">("costBasis");

  useEffect(() => {
    fetch("/api/positions")
      .then(r => r.json())
      .then(d => setPositions(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, []);

  const sectors = ["all", ...Array.from(new Set(positions.map(p => p.sector).filter(Boolean))) as string[]];
  const assets = ["all", ...Array.from(new Set(positions.map(p => p.assetClass)))];

  const filtered = positions
    .filter(p => sectorFilter === "all" || p.sector === sectorFilter)
    .filter(p => assetFilter === "all" || p.assetClass === assetFilter)
    .sort((a, b) => {
      if (sortBy === "ticker") return a.ticker.localeCompare(b.ticker);
      if (sortBy === "costBasis") return (positionCostBasis(b) ?? 0) - (positionCostBasis(a) ?? 0);
      if (sortBy === "entryDate") return (b.entryDate ? new Date(b.entryDate).getTime() : 0) - (a.entryDate ? new Date(a.entryDate).getTime() : 0);
      if (sortBy === "health") {
        const order: Record<string, number> = { intact: 0, monitoring: 1, weakening: 2, broken: 3 };
        return (order[a.thesis?.healthStatus ?? ""] ?? 4) - (order[b.thesis?.healthStatus ?? ""] ?? 4);
      }
      return 0;
    });

  const totalInvested = filtered.reduce((s, p) => s + (positionCostBasis(p) ?? 0), 0);
  const largestPosition = filtered.reduce((max, p) => Math.max(max, positionCostBasis(p) ?? 0), 0);

  if (loading) {
    return (
      <div className="p-6 lg:p-8 space-y-4 max-w-7xl">
        <div className="h-7 w-48 bg-[#EEEEEE] rounded animate-pulse" />
        <div className="h-10 bg-[#EEEEEE] rounded animate-pulse" />
        <div className="h-96 bg-[#EEEEEE] rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-5 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium text-[#171A20]">Holdings</h1>
          <p className="text-[#8E8E8E] text-sm mt-0.5">
            {filtered.length} position{filtered.length !== 1 ? "s" : ""} · {fmtShort(totalInvested)} total invested
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#8E8E8E] font-medium">Sector</span>
          <select value={sectorFilter} onChange={e => setSectorFilter(e.target.value)} className={SELECT_CLS}>
            {sectors.map(s => <option key={s} value={s}>{s === "all" ? "All Sectors" : s}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#8E8E8E] font-medium">Asset</span>
          <select value={assetFilter} onChange={e => setAssetFilter(e.target.value)} className={SELECT_CLS}>
            {assets.map(a => <option key={a} value={a}>{a === "all" ? "All Assets" : a}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#8E8E8E] font-medium">Sort</span>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} className={SELECT_CLS}>
            <option value="costBasis">Cost Basis ↓</option>
            <option value="ticker">Ticker A–Z</option>
            <option value="entryDate">Entry Date</option>
            <option value="health">Thesis Health</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#EEEEEE] bg-[#F4F4F4]">
                <th className="px-5 py-3 text-left text-xs text-[#8E8E8E] font-medium">Ticker</th>
                <th className="px-5 py-3 text-left text-xs text-[#8E8E8E] font-medium hidden lg:table-cell">Sector</th>
                <th className="px-5 py-3 text-left text-xs text-[#8E8E8E] font-medium hidden md:table-cell">Asset</th>
                <th className="px-5 py-3 text-right text-xs text-[#8E8E8E] font-medium">Shares</th>
                <th className="px-5 py-3 text-right text-xs text-[#8E8E8E] font-medium">Avg Cost</th>
                <th className="px-5 py-3 text-right text-xs text-[#8E8E8E] font-medium">Cost Basis</th>
                <th className="px-5 py-3 text-right text-xs text-[#8E8E8E] font-medium hidden md:table-cell">Weight</th>
                <th className="px-5 py-3 text-left text-xs text-[#8E8E8E] font-medium hidden sm:table-cell">Entry</th>
                <th className="px-5 py-3 text-left text-xs text-[#8E8E8E] font-medium">Thesis</th>
                <th className="px-5 py-3 text-left text-xs text-[#8E8E8E] font-medium hidden lg:table-cell">Alerts</th>
                <th className="px-5 py-3 text-left text-xs text-[#8E8E8E] font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-5 py-12 text-center text-[#8E8E8E]">
                    No positions found. Run{" "}
                    <code className="bg-[#F4F4F4] px-1.5 py-0.5 rounded text-[#5C5E62]">npm run db:seed</code>
                    {" "}to add sample data.
                  </td>
                </tr>
              ) : (
                filtered.map((p, idx) => {
                  const costBasis = positionCostBasis(p);
                  const weight = totalInvested > 0 && costBasis != null ? costBasis / totalInvested : null;
                  const barWidth = largestPosition > 0 && costBasis != null ? (costBasis / largestPosition) * 100 : 0;
                  const triggeredKills = p.killConditions.filter(k => k.status === "triggered").length;
                  return (
                    <tr
                      key={p.id}
                      style={{ transition: "background-color 0.33s" }}
                      className={`hover:bg-[#F4F4F4] group ${idx < filtered.length - 1 ? "border-b border-[#EEEEEE]" : ""}`}
                    >
                      <td className="px-5 py-3.5">
                        <Link href={`/positions/${p.id}`} className="block">
                          <div style={{ transition: "color 0.33s" }} className="font-medium text-[#171A20] group-hover:text-[#3E6AE1]">{p.ticker}</div>
                          <div className="text-xs text-[#8E8E8E] truncate max-w-[150px]">{p.name}</div>
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 hidden lg:table-cell">
                        <span className="text-xs text-[#5C5E62]">{p.sector ?? "—"}</span>
                      </td>
                      <td className="px-5 py-3.5 hidden md:table-cell">
                        <span className="text-xs text-[#8E8E8E] capitalize">{p.assetClass}</span>
                      </td>
                      <td className="px-5 py-3.5 text-right tabular-nums text-[#393C41]">
                        {p.shares != null ? p.shares.toLocaleString() : <span className="text-[#D0D1D2]">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-right tabular-nums text-[#393C41]">{fmt(p.avgCost)}</td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="tabular-nums font-medium text-[#171A20]">{fmtShort(costBasis)}</div>
                        <div className="mt-1.5 h-0.5 bg-[#EEEEEE] rounded-full overflow-hidden w-20 ml-auto">
                          <div className="h-full bg-[#3E6AE1] rounded-full" style={{ width: `${barWidth}%` }} />
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right tabular-nums text-[#8E8E8E] text-xs hidden md:table-cell">
                        {weight != null ? `${(weight * 100).toFixed(1)}%` : <span className="text-[#D0D1D2]">—</span>}
                      </td>
                      <td className="px-5 py-3.5 hidden sm:table-cell">
                        <span className="text-xs text-[#8E8E8E]">{fmtDate(p.entryDate)}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        {p.thesis?.healthStatus ? (
                          <div>
                            <span className={`text-xs px-2 py-0.5 rounded border capitalize ${HEALTH_STYLE[p.thesis.healthStatus] ?? "text-[#5C5E62] bg-[#F4F4F4] border-[#EEEEEE]"}`}>
                              {p.thesis.healthStatus}
                            </span>
                            {p.thesis.healthScore != null && (
                              <div className="text-xs text-[#8E8E8E] mt-0.5 tabular-nums">{p.thesis.healthScore.toFixed(1)}/10</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-[#D0D1D2] text-xs">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 hidden lg:table-cell">
                        {triggeredKills > 0 && (
                          <span className="text-xs text-[#c0392b] font-medium">{triggeredKills} kill triggered</span>
                        )}
                        {p.recommendations.length > 0 && triggeredKills === 0 && (
                          <span className="text-xs text-[#b45309]">{p.recommendations.length} pending</span>
                        )}
                        {triggeredKills === 0 && p.recommendations.length === 0 && (
                          <span className="text-[#D0D1D2] text-xs">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`text-xs px-2 py-0.5 rounded border capitalize ${STATUS_STYLE[p.status] ?? "text-[#5C5E62] bg-[#F4F4F4] border-[#EEEEEE]"}`}>
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-[#EEEEEE] bg-[#F4F4F4] flex items-center justify-between text-xs text-[#8E8E8E]">
            <span>{filtered.length} position{filtered.length !== 1 ? "s" : ""}</span>
            <span className="tabular-nums font-medium text-[#393C41]">Total: {fmtShort(totalInvested)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
