"use client";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import type { AllocationEntry, UntrackedPosition } from "@/app/api/allocation/route";

// ─── Shared helpers ───────────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toFixed(1) + "%";
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bg-[#EEEEEE] rounded-xl animate-pulse ${className}`} />;
}

type TabId = "holdings" | "allocation" | "history" | "reviews";
const TABS: { id: TabId; label: string }[] = [
  { id: "holdings",   label: "Holdings" },
  { id: "allocation", label: "Allocation" },
  { id: "history",    label: "History" },
  { id: "reviews",    label: "Reviews" },
];

// ─── Holdings tab ─────────────────────────────────────────────────────────────

interface Position {
  id: string;
  ticker: string;
  name: string;
  sector: string | null;
  assetClass: string;
  status: string;
  currentValueUsd: number | null;
  currentValueThb: number | null;
  allocationPct: number | null;
  unrealizedReturnPct: number | null;
  costBasisUsd: number | null;
  notes: string | null;
}

const HEALTH_STYLE: Record<string, string> = {
  intact:     "text-[#2d7d46] bg-[#eef7f1] border-[#c3e6cf]",
  weakening:  "text-[#b45309] bg-[#fffbeb] border-[#fde68a]",
  broken:     "text-[#c0392b] bg-[#fdf0ee] border-[#f5c6c1]",
  monitoring: "text-[#3E6AE1] bg-[#EEF3FD] border-[#bfcffd]",
};

function HoldingsTab() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/positions")
      .then(r => r.json())
      .then(d => setPositions(d.positions ?? d ?? []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const active = useMemo(() => positions.filter(p => p.status === "active" && p.ticker !== "CASH"), [positions]);
  const cash = useMemo(() => positions.find(p => p.ticker === "CASH"), [positions]);
  const totalUsd = useMemo(() => active.reduce((s, p) => s + (p.currentValueUsd ?? 0), 0) + (cash?.currentValueUsd ?? 0), [active, cash]);

  if (loading) return <div className="py-12 text-center text-sm text-[#8E8E8E]">Loading holdings…</div>;
  if (error) return <div className="text-sm text-[#DC2626] py-4">{error}</div>;

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Portfolio Value", value: fmt(totalUsd) },
          { label: "Positions", value: active.length.toString() },
          { label: "Cash", value: fmt(cash?.currentValueUsd) },
          { label: "Cash %", value: fmtPct(cash?.allocationPct) },
        ].map(m => (
          <div key={m.label} className="bg-white border border-[#EEEEEE] rounded-xl p-3">
            <div className="text-xs text-[#8E8E8E] mb-1">{m.label}</div>
            <div className="text-lg font-semibold text-[#171A20]">{m.value}</div>
          </div>
        ))}
      </div>

      {/* Holdings table */}
      <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#EEEEEE] text-xs text-[#8E8E8E]">
              <th className="text-left px-4 py-3 font-medium">Ticker</th>
              <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Sector</th>
              <th className="text-right px-4 py-3 font-medium">Value</th>
              <th className="text-right px-4 py-3 font-medium">Alloc %</th>
              <th className="text-right px-4 py-3 font-medium hidden md:table-cell">Return</th>
            </tr>
          </thead>
          <tbody>
            {active.map(p => {
              const ret = p.unrealizedReturnPct;
              const retColor = ret == null ? "#8E8E8E" : ret >= 0 ? "#15803D" : "#DC2626";
              return (
                <tr key={p.id} className="border-b border-[#EEEEEE] last:border-0 hover:bg-[#F4F4F4] transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-[#171A20]">{p.ticker}</div>
                    <div className="text-[11px] text-[#8E8E8E] truncate max-w-[120px]">{p.name}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#5C5E62] hidden md:table-cell">{p.sector ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-medium text-[#171A20]">{fmt(p.currentValueUsd)}</td>
                  <td className="px-4 py-3 text-right text-[#5C5E62]">{fmtPct(p.allocationPct)}</td>
                  <td className="px-4 py-3 text-right font-medium hidden md:table-cell" style={{ color: retColor }}>
                    {ret == null ? "—" : (ret >= 0 ? "+" : "") + ret.toFixed(1) + "%"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {active.length === 0 && (
        <p className="text-center text-sm text-[#8E8E8E] py-8">No active positions.</p>
      )}
    </div>
  );
}

// ─── Allocation tab ───────────────────────────────────────────────────────────

// Mirrors the actual shape returned by GET /api/allocation
interface AllocationResponse {
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

const BUCKET_BAR: Record<string, string> = {
  growth:    "#2d7d46",
  core:      "#3E6AE1",
  small:     "#b45309",
  defensive: "#8E8E8E",
  value:     "#6d28d9",
};

function AllocationTab() {
  const [data, setData] = useState<AllocationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/allocation")
      .then(async r => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
        return json as AllocationResponse;
      })
      .then(d => setData(d))
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load allocation"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="py-12 text-center text-sm text-[#8E8E8E]">Loading allocation…</div>;
  if (error) return <div className="text-sm text-[#DC2626] py-4">{error}</div>;
  if (!data) return null;

  const targets = data.targets ?? [];
  const { totalCapitalUsd } = data.settings;
  const { totalDeployedUsd, totalGapUsd, pctFunded } = data.summary;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Capital", value: fmt(totalCapitalUsd) },
          { label: "Deployed", value: fmt(totalDeployedUsd) },
          { label: "Gap", value: fmt(totalGapUsd) },
          { label: "% Funded", value: Math.round(pctFunded) + "%" },
        ].map(m => (
          <div key={m.label} className="bg-white border border-[#EEEEEE] rounded-xl p-3">
            <div className="text-xs text-[#8E8E8E] mb-1">{m.label}</div>
            <div className="text-lg font-semibold text-[#171A20]">{m.value}</div>
          </div>
        ))}
      </div>

      {/* Allocation targets */}
      <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
        {targets.map(e => {
          const barColor = BUCKET_BAR[e.bucket] ?? "#8E8E8E";
          const pct = Math.min(100, e.pctFunded);
          const gapBadge = e.gapUsd > 0 ? `${fmt(e.gapUsd)} gap` : "Fully funded";
          return (
            <div key={e.ticker} className="flex items-center gap-4 px-4 py-3 border-b border-[#EEEEEE] last:border-0">
              <div className="w-14 font-semibold text-[#171A20]">{e.ticker}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-[#5C5E62] truncate">{e.name}</span>
                  <span className="text-xs text-[#8E8E8E] ml-2 shrink-0">{e.pctFunded.toFixed(0)}%</span>
                </div>
                <div className="h-1.5 bg-[#EEEEEE] rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-medium text-[#171A20]">{fmt(e.currentUsd)}</div>
                <div className="text-[11px] text-[#8E8E8E]">{gapBadge}</div>
              </div>
            </div>
          );
        })}
        {targets.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-[#8E8E8E]">No allocation targets set.</div>
        )}
      </div>
    </div>
  );
}

// ─── Reviews tab ──────────────────────────────────────────────────────────────

interface ReviewSummary {
  id: string;
  generatedAt: string;
  overallSeverity: string;
  brainContextReport?: string;
}

const SEV_STYLE: Record<string, { bg: string; text: string }> = {
  critical: { bg: "#FEF2F2", text: "#991B1B" },
  high:     { bg: "#FFF7ED", text: "#92400E" },
  medium:   { bg: "#FFFBEB", text: "#78350F" },
  low:      { bg: "#F0FDF4", text: "#14532D" },
  info:     { bg: "#EEF3FD", text: "#1E40AF" },
};

function ReviewsTab() {
  const [reviews, setReviews] = useState<ReviewSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/portfolio-review")
      .then(r => r.json())
      .then(d => setReviews(d.reviews ?? d ?? []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function runReview() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio-review", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Review failed");
      setReviews(prev => [data, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to run review");
    } finally {
      setRunning(false);
    }
  }

  if (loading) return <div className="py-12 text-center text-sm text-[#8E8E8E]">Loading reviews…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#5C5E62]">{reviews.length} portfolio review{reviews.length !== 1 ? "s" : ""} on record.</p>
        <button
          onClick={runReview}
          disabled={running}
          className="text-sm font-medium px-4 py-2 rounded-lg text-white transition-opacity"
          style={{ backgroundColor: "#3E6AE1", opacity: running ? 0.6 : 1 }}
        >
          {running ? "Generating…" : "Run Review"}
        </button>
      </div>

      {error && <div className="text-sm text-[#DC2626] bg-[#FEF2F2] border border-[#FECACA] rounded-lg px-4 py-2">{error}</div>}

      <div className="space-y-2">
        {reviews.map(r => {
          const sev = SEV_STYLE[r.overallSeverity] ?? SEV_STYLE.info;
          const date = new Date(r.generatedAt).toLocaleDateString("en-US", {
            month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
          });
          return (
            <Link
              key={r.id}
              href={`/review?id=${r.id}`}
              className="flex items-center justify-between bg-white border border-[#EEEEEE] rounded-xl px-4 py-3 hover:bg-[#F4F4F4] transition-colors"
            >
              <div>
                <div className="text-sm font-medium text-[#171A20]">{date}</div>
                <div className="text-xs text-[#8E8E8E] mt-0.5">Portfolio Review</div>
              </div>
              <span
                className="text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded"
                style={{ backgroundColor: sev.bg, color: sev.text }}
              >
                {r.overallSeverity}
              </span>
            </Link>
          );
        })}
        {reviews.length === 0 && (
          <div className="text-center py-12 text-sm text-[#8E8E8E]">
            No reviews yet. Click "Run Review" to generate one.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── History tab (Overview · Charts · Cash Flows) ─────────────────────────────

interface PerfData {
  currentValueUsd: number;
  cashValueUsd: number;
  investedValueUsd: number;
  netDepositsUsd: number;
  gainUsd: number;
  totalReturnPct: number;
  twrPct: number;
  mwrPct: number | null;
  inceptionDate: string | null;
  snapshotCount: number;
}

interface Snapshot {
  snapshotDate: string;
  portfolioValueUsd: number;
  netDepositsUsd: number;
  unrealizedGainUsd: number;
  totalReturnPct: number;
  source: string;
}

// ── SVG chart helpers ─────────────────────────────────────────────────────────

function niceMax(v: number): number {
  if (v <= 0) return 10;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / exp) * exp;
}

function pts(arr: { x: number; y: number }[]): string {
  return arr.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

// Portfolio Value vs Net Deposits — stacked area chart
function GrowthChart({ snapshots }: { snapshots: Snapshot[] }) {
  if (snapshots.length < 2) return (
    <div className="flex items-center justify-center h-40 text-sm text-[#AAAAAA]">Not enough data points</div>
  );

  const VW = 680, VH = 200, PL = 64, PR = 12, PT = 12, PB = 32;
  const iW = VW - PL - PR, iH = VH - PT - PB;

  const times = snapshots.map(s => new Date(s.snapshotDate).getTime());
  const t0 = times[0], t1 = times[times.length - 1];
  const rawMax = Math.max(...snapshots.map(s => s.portfolioValueUsd));
  const yMax = niceMax(rawMax * 1.06);

  const xp = (t: number) => PL + ((t - t0) / (t1 - t0)) * iW;
  const yp = (v: number) => PT + (1 - v / yMax) * iH;
  const bottom = PT + iH;

  const valuePoints = snapshots.map((s, i) => ({ x: xp(times[i]), y: yp(s.portfolioValueUsd) }));
  const depositPoints = snapshots.map((s, i) => ({ x: xp(times[i]), y: yp(s.netDepositsUsd) }));

  // Area between portfolio line and deposit line (profit zone — green)
  const profitArea = [
    `M${valuePoints[0].x.toFixed(1)},${valuePoints[0].y.toFixed(1)}`,
    ...valuePoints.slice(1).map(p => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`),
    ...[...depositPoints].reverse().map(p => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`),
    "Z",
  ].join(" ");

  // Area below deposit line to axis bottom (deposit zone — blue-gray)
  const depositArea = [
    `M${depositPoints[0].x.toFixed(1)},${bottom}`,
    ...depositPoints.map(p => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`),
    `L${depositPoints[depositPoints.length - 1].x.toFixed(1)},${bottom}`,
    "Z",
  ].join(" ");

  // Y axis ticks (5 steps)
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => yMax * f);

  // X axis labels — pick at most 6 evenly-spaced snapshots
  const step = Math.max(1, Math.floor(snapshots.length / 5));
  const xLabels = snapshots.filter((_, i) => i % step === 0 || i === snapshots.length - 1);

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full" style={{ display: "block" }}>
      {/* Grid lines */}
      {yTicks.map((v, i) => (
        <line key={i} x1={PL} y1={yp(v)} x2={PL + iW} y2={yp(v)}
          stroke="#F0F0F0" strokeWidth={1} />
      ))}

      {/* Deposit area (contributed capital) */}
      <path d={depositArea} fill="#DBEAFE" fillOpacity={0.7} />

      {/* Profit area (market return) */}
      <path d={profitArea} fill="#DCFCE7" fillOpacity={0.8} />

      {/* Deposit line */}
      <polyline points={pts(depositPoints)} fill="none" stroke="#93C5FD" strokeWidth={1.5} strokeDasharray="4 2" />

      {/* Portfolio value line */}
      <polyline points={pts(valuePoints)} fill="none" stroke="#3E6AE1" strokeWidth={2.5} />

      {/* Data point dots */}
      {valuePoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} fill="white" stroke="#3E6AE1" strokeWidth={1.5} />
      ))}

      {/* Y axis labels */}
      {yTicks.map((v, i) => (
        <text key={i} x={PL - 6} y={yp(v)} textAnchor="end" dominantBaseline="middle"
          fontSize={10} fill="#AAAAAA">
          ${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}
        </text>
      ))}

      {/* X axis labels */}
      {xLabels.map((s, i) => (
        <text key={i} x={xp(new Date(s.snapshotDate).getTime())} y={VH - 6}
          textAnchor="middle" fontSize={10} fill="#AAAAAA">
          {new Date(s.snapshotDate).toLocaleDateString("en-US", { month: "short", year: "2-digit" })}
        </text>
      ))}

      {/* Legend */}
      <rect x={PL} y={PT} width={10} height={10} fill="#DCFCE7" stroke="#86EFAC" strokeWidth={1} rx={2} />
      <text x={PL + 14} y={PT + 5} dominantBaseline="middle" fontSize={10} fill="#15803D">Profit</text>
      <rect x={PL + 60} y={PT} width={10} height={10} fill="#DBEAFE" stroke="#93C5FD" strokeWidth={1} rx={2} />
      <text x={PL + 74} y={PT + 5} dominantBaseline="middle" fontSize={10} fill="#3B82F6">Deposits</text>
    </svg>
  );
}

// Profit/Loss + Return % over time
function ProfitChart({ snapshots }: { snapshots: Snapshot[] }) {
  if (snapshots.length < 2) return null;

  const VW = 680, VH = 150, PL = 64, PR = 12, PT = 12, PB = 28;
  const iW = VW - PL - PR, iH = VH - PT - PB;

  const times = snapshots.map(s => new Date(s.snapshotDate).getTime());
  const t0 = times[0], t1 = times[times.length - 1];
  const gains = snapshots.map(s => s.unrealizedGainUsd);
  const rawMax = Math.max(...gains, 1);
  const rawMin = Math.min(...gains, 0);
  const yMax = niceMax(rawMax * 1.1);
  const yMin = rawMin < 0 ? -niceMax(-rawMin * 1.1) : 0;
  const yRange = yMax - yMin;

  const xp = (t: number) => PL + ((t - t0) / (t1 - t0)) * iW;
  const yp = (v: number) => PT + (1 - (v - yMin) / yRange) * iH;
  const yZero = yp(0);

  const gainPoints = snapshots.map((s, i) => ({ x: xp(times[i]), y: yp(s.unrealizedGainUsd) }));

  const gainArea = [
    `M${gainPoints[0].x.toFixed(1)},${yZero.toFixed(1)}`,
    ...gainPoints.map(p => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`),
    `L${gainPoints[gainPoints.length - 1].x.toFixed(1)},${yZero.toFixed(1)}`,
    "Z",
  ].join(" ");

  const step = Math.max(1, Math.floor(snapshots.length / 5));
  const xLabels = snapshots.filter((_, i) => i % step === 0 || i === snapshots.length - 1);
  const yTicks = [yMin, yMin + yRange * 0.5, yMax];

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full" style={{ display: "block" }}>
      {yTicks.map((v, i) => (
        <line key={i} x1={PL} y1={yp(v)} x2={PL + iW} y2={yp(v)} stroke="#F0F0F0" strokeWidth={1} />
      ))}
      {/* Zero line */}
      <line x1={PL} y1={yZero} x2={PL + iW} y2={yZero} stroke="#DDDDDD" strokeWidth={1} strokeDasharray="3 2" />

      <path d={gainArea} fill="#DCFCE7" fillOpacity={0.7} />
      <polyline points={pts(gainPoints)} fill="none" stroke="#15803D" strokeWidth={2} />

      {gainPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="white" stroke="#15803D" strokeWidth={1.5} />
      ))}

      {yTicks.map((v, i) => (
        <text key={i} x={PL - 6} y={yp(v)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="#AAAAAA">
          ${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v >= 0 ? v.toFixed(0) : `-${Math.abs(v).toFixed(0)}`}
        </text>
      ))}

      {xLabels.map((s, i) => (
        <text key={i} x={xp(new Date(s.snapshotDate).getTime())} y={VH - 4}
          textAnchor="middle" fontSize={10} fill="#AAAAAA">
          {new Date(s.snapshotDate).toLocaleDateString("en-US", { month: "short", year: "2-digit" })}
        </text>
      ))}
    </svg>
  );
}

// Return % over time — simple line
function ReturnChart({ snapshots }: { snapshots: Snapshot[] }) {
  if (snapshots.length < 2) return null;

  const VW = 680, VH = 120, PL = 48, PR = 12, PT = 8, PB = 28;
  const iW = VW - PL - PR, iH = VH - PT - PB;

  const times = snapshots.map(s => new Date(s.snapshotDate).getTime());
  const t0 = times[0], t1 = times[times.length - 1];
  const rets = snapshots.map(s => s.totalReturnPct);
  const yMax = Math.max(...rets, 5) * 1.1;
  const yMin = Math.min(...rets, 0);
  const yRange = yMax - yMin;

  const xp = (t: number) => PL + ((t - t0) / (t1 - t0)) * iW;
  const yp = (v: number) => PT + (1 - (v - yMin) / yRange) * iH;

  const retPoints = snapshots.map((s, i) => ({ x: xp(times[i]), y: yp(s.totalReturnPct) }));
  const step = Math.max(1, Math.floor(snapshots.length / 5));
  const xLabels = snapshots.filter((_, i) => i % step === 0 || i === snapshots.length - 1);

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full" style={{ display: "block" }}>
      <line x1={PL} y1={PT} x2={PL} y2={PT + iH} stroke="#EEEEEE" strokeWidth={1} />
      <line x1={PL} y1={PT + iH} x2={PL + iW} y2={PT + iH} stroke="#EEEEEE" strokeWidth={1} />

      <polyline points={pts(retPoints)} fill="none" stroke="#3E6AE1" strokeWidth={2} strokeLinejoin="round" />

      {retPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="white" stroke="#3E6AE1" strokeWidth={1.5} />
      ))}

      <text x={PL - 4} y={yp(yMax)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="#AAAAAA">
        {yMax.toFixed(0)}%
      </text>
      <text x={PL - 4} y={yp(yMin)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="#AAAAAA">
        {yMin.toFixed(0)}%
      </text>

      {xLabels.map((s, i) => (
        <text key={i} x={xp(new Date(s.snapshotDate).getTime())} y={VH - 4}
          textAnchor="middle" fontSize={10} fill="#AAAAAA">
          {new Date(s.snapshotDate).toLocaleDateString("en-US", { month: "short", year: "2-digit" })}
        </text>
      ))}
    </svg>
  );
}

// ── History tab ───────────────────────────────────────────────────────────────

interface CashFlowRecord {
  id: string;
  date: string;
  type: "deposit" | "withdrawal";
  amountUsd: number;
  note: string | null;
  source: string;
}

type HistoryTab = "overview" | "charts" | "cashflows";
const HISTORY_TABS: { id: HistoryTab; label: string }[] = [
  { id: "overview",  label: "Overview" },
  { id: "charts",    label: "Charts" },
  { id: "cashflows", label: "Cash Flows" },
];

function HistoryTab() {
  const [inner, setInner] = useState<HistoryTab>("overview");
  const [perf, setPerf] = useState<PerfData | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [flows, setFlows] = useState<CashFlowRecord[]>([]);
  const [netDepositsUsd, setNetDepositsUsd] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), type: "deposit", amountUsd: "", note: "" });
  const [showForm, setShowForm] = useState(false);

  function loadFlows() {
    return fetch("/api/cash-flows").then(r => r.json())
      .then(d => { setFlows(d.flows ?? []); setNetDepositsUsd(d.netDepositsUsd ?? 0); });
  }

  useEffect(() => {
    Promise.all([
      fetch("/api/performance").then(r => r.json()),
      fetch("/api/portfolio-snapshots").then(r => r.json()),
      fetch("/api/cash-flows").then(r => r.json()),
    ])
      .then(([p, snap, cf]) => {
        setPerf(p);
        setSnapshots(snap.snapshots ?? []);  // oldest-first for charts
        setFlows(cf.flows ?? []);
        setNetDepositsUsd(cf.netDepositsUsd ?? 0);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch("/api/cash-flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, amountUsd: parseFloat(form.amountUsd) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      await loadFlows();
      setForm({ date: new Date().toISOString().slice(0, 10), type: "deposit", amountUsd: "", note: "" });
      setShowForm(false);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="py-12 text-center text-sm text-[#8E8E8E]">Loading history…</div>;
  if (error) return <div className="text-sm text-[#DC2626] py-3">{error}</div>;

  const gainColor = (perf?.gainUsd ?? 0) >= 0 ? "#15803D" : "#DC2626";
  const inceptionStr = perf?.inceptionDate
    ? new Date(perf.inceptionDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  const deposits = flows.filter(f => f.type === "deposit").reduce((s, f) => s + f.amountUsd, 0);
  const withdrawals = flows.filter(f => f.type === "withdrawal").reduce((s, f) => s + f.amountUsd, 0);

  // snapshots newest-first for the table
  const snapshotsDesc = [...snapshots].reverse();

  return (
    <div className="space-y-4">
      {/* Inner tab bar */}
      <div className="flex border-b border-[#EEEEEE] -mx-4 px-4 md:-mx-0 md:px-0">
        {HISTORY_TABS.map(t => (
          <button key={t.id} onClick={() => setInner(t.id)}
            className="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
            style={inner === t.id
              ? { borderColor: "#3E6AE1", color: "#3E6AE1" }
              : { borderColor: "transparent", color: "#8E8E8E" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {inner === "overview" && (
        <div className="space-y-5">
          {/* 4-question hero */}
          {perf && (
            <div className="bg-[#F4F4F4] rounded-xl p-5">
              {inceptionStr && (
                <div className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest mb-4">
                  Since Inception · {inceptionStr}
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                <div>
                  <div className="text-xs text-[#8E8E8E] mb-1">Total Deposited</div>
                  <div className="text-2xl font-bold text-[#171A20]">{fmt(perf.netDepositsUsd)}</div>
                  <div className="text-[11px] text-[#8E8E8E] mt-1">how much I put in</div>
                </div>
                <div>
                  <div className="text-xs text-[#8E8E8E] mb-1">Portfolio Value</div>
                  <div className="text-2xl font-bold text-[#171A20]">{fmt(perf.currentValueUsd)}</div>
                  <div className="text-[11px] text-[#8E8E8E] mt-1">what it is worth today</div>
                </div>
                <div>
                  <div className="text-xs text-[#8E8E8E] mb-1">Total Profit / Loss</div>
                  <div className="text-2xl font-bold" style={{ color: gainColor }}>
                    {perf.gainUsd >= 0 ? "+" : ""}{fmt(perf.gainUsd)}
                  </div>
                  <div className="text-[11px] text-[#8E8E8E] mt-1">profit from market</div>
                </div>
                <div>
                  <div className="text-xs text-[#8E8E8E] mb-1">Return Since Inception</div>
                  <div className="text-2xl font-bold" style={{ color: gainColor }}>
                    {perf.totalReturnPct >= 0 ? "+" : ""}{perf.totalReturnPct.toFixed(2)}%
                  </div>
                  <div className="text-[11px] text-[#8E8E8E] mt-1">profit ÷ deposited</div>
                </div>
              </div>
            </div>
          )}

          {/* Return methods */}
          {perf && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white border border-[#EEEEEE] rounded-xl p-4">
                <div className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest mb-2">Simple Return</div>
                <div className="text-xl font-semibold" style={{ color: gainColor }}>
                  {perf.totalReturnPct >= 0 ? "+" : ""}{perf.totalReturnPct.toFixed(2)}%
                </div>
                <div className="text-xs text-[#8E8E8E] mt-1">profit ÷ net deposits</div>
              </div>
              <div className="bg-white border border-[#EEEEEE] rounded-xl p-4">
                <div className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest mb-2">TWR</div>
                <div className="text-xl font-semibold text-[#171A20]">
                  {snapshots.length < 2 ? "—" : `${perf.twrPct >= 0 ? "+" : ""}${perf.twrPct.toFixed(2)}%`}
                </div>
                <div className="text-xs text-[#8E8E8E] mt-1">time-weighted return</div>
              </div>
              <div className="bg-white border border-[#EEEEEE] rounded-xl p-4">
                <div className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest mb-2">MWR / XIRR</div>
                <div className="text-xl font-semibold text-[#171A20]">
                  {perf.mwrPct == null ? "—" : `${perf.mwrPct >= 0 ? "+" : ""}${perf.mwrPct.toFixed(2)}%`}
                </div>
                <div className="text-xs text-[#8E8E8E] mt-1">annualised IRR</div>
              </div>
            </div>
          )}

          {/* Snapshot table — mirrors Sheet2 layout */}
          {snapshotsDesc.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide mb-2">
                Snapshot History · {snapshotsDesc.length} records
              </div>
              <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-x-auto">
                <table className="w-full text-sm min-w-[520px]">
                  <thead>
                    <tr className="border-b border-[#EEEEEE] bg-[#F4F4F4] text-xs text-[#8E8E8E]">
                      <th className="text-left px-4 py-2.5 font-medium">Date</th>
                      <th className="text-right px-4 py-2.5 font-medium">Portfolio Value</th>
                      <th className="text-right px-4 py-2.5 font-medium">Net Deposits</th>
                      <th className="text-right px-4 py-2.5 font-medium">Profit / Loss</th>
                      <th className="text-right px-4 py-2.5 font-medium">Return %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshotsDesc.map(s => {
                      const ret = s.totalReturnPct;
                      const rc = ret >= 0 ? "#15803D" : "#DC2626";
                      const gc = s.unrealizedGainUsd >= 0 ? "#15803D" : "#DC2626";
                      return (
                        <tr key={s.snapshotDate} className="border-b border-[#EEEEEE] last:border-0 hover:bg-[#F9F9F9]">
                          <td className="px-4 py-2.5 text-xs text-[#5C5E62]">
                            {new Date(s.snapshotDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </td>
                          <td className="px-4 py-2.5 text-right font-medium text-[#171A20]">{fmt(s.portfolioValueUsd)}</td>
                          <td className="px-4 py-2.5 text-right text-[#5C5E62]">{fmt(s.netDepositsUsd)}</td>
                          <td className="px-4 py-2.5 text-right font-medium" style={{ color: gc }}>
                            {s.unrealizedGainUsd >= 0 ? "+" : ""}{fmt(s.unrealizedGainUsd)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold" style={{ color: rc }}>
                            {ret >= 0 ? "+" : ""}{ret.toFixed(2)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {snapshots.length === 0 && (
            <div className="text-center py-8 text-sm text-[#8E8E8E]">
              No snapshots yet.{" "}
              <code className="bg-[#F4F4F4] px-1 py-0.5 rounded">npm run import:excel-history</code>
            </div>
          )}
        </div>
      )}

      {/* ── Charts ── */}
      {inner === "charts" && (
        <div className="space-y-6">
          <div className="bg-white border border-[#EEEEEE] rounded-xl p-4">
            <div className="text-sm font-semibold text-[#171A20] mb-1">Portfolio Value vs Net Deposits</div>
            <div className="text-xs text-[#8E8E8E] mb-4">
              <span className="inline-flex items-center gap-1 mr-4">
                <span className="w-3 h-3 rounded-sm" style={{ background: "#DCFCE7", border: "1px solid #86EFAC", display: "inline-block" }} />
                Profit (market return)
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm" style={{ background: "#DBEAFE", border: "1px solid #93C5FD", display: "inline-block" }} />
                Deposits (contributed capital)
              </span>
            </div>
            <GrowthChart snapshots={snapshots} />
          </div>

          <div className="bg-white border border-[#EEEEEE] rounded-xl p-4">
            <div className="text-sm font-semibold text-[#171A20] mb-1">Profit / Loss over Time</div>
            <div className="text-xs text-[#8E8E8E] mb-3">Absolute dollar gain at each snapshot</div>
            <ProfitChart snapshots={snapshots} />
          </div>

          <div className="bg-white border border-[#EEEEEE] rounded-xl p-4">
            <div className="text-sm font-semibold text-[#171A20] mb-1">Return % over Time</div>
            <div className="text-xs text-[#8E8E8E] mb-3">Profit ÷ net deposits at each snapshot</div>
            <ReturnChart snapshots={snapshots} />
          </div>
        </div>
      )}

      {/* ── Cash Flows ── */}
      {inner === "cashflows" && (
        <div className="space-y-4">
          {/* Summary strip */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white border border-[#EEEEEE] rounded-xl p-4">
              <div className="text-xs text-[#8E8E8E] mb-1">Total Deposits</div>
              <div className="text-lg font-semibold text-[#15803D]">{fmt(deposits)}</div>
            </div>
            <div className="bg-white border border-[#EEEEEE] rounded-xl p-4">
              <div className="text-xs text-[#8E8E8E] mb-1">Total Withdrawals</div>
              <div className="text-lg font-semibold text-[#DC2626]">{fmt(withdrawals)}</div>
            </div>
            <div className="bg-white border border-[#EEEEEE] rounded-xl p-4">
              <div className="text-xs text-[#8E8E8E] mb-1">Net Deposits</div>
              <div className="text-lg font-semibold text-[#171A20]">{fmt(netDepositsUsd)}</div>
            </div>
          </div>

          {/* Add buttons + form */}
          {!showForm ? (
            <div className="flex gap-2">
              <button onClick={() => { setForm(f => ({ ...f, type: "deposit" })); setShowForm(true); }}
                className="px-4 py-2 text-sm font-medium rounded-lg text-white bg-[#15803D] hover:bg-[#166534] transition-colors">
                + Add Deposit
              </button>
              <button onClick={() => { setForm(f => ({ ...f, type: "withdrawal" })); setShowForm(true); }}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-[#DC2626] text-[#DC2626] hover:bg-[#FEF2F2] transition-colors">
                − Add Withdrawal
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="bg-white border border-[#EEEEEE] rounded-xl p-4 space-y-3">
              <div className="text-sm font-semibold text-[#171A20] capitalize">{form.type}</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#8E8E8E] mb-1 block">Date</label>
                  <input type="date" value={form.date} required
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-[#EEEEEE] rounded focus:outline-none focus:border-[#3E6AE1]" />
                </div>
                <div>
                  <label className="text-xs text-[#8E8E8E] mb-1 block">Amount (USD)</label>
                  <input type="number" step="0.01" min="0.01" placeholder="0.00" value={form.amountUsd} required
                    onChange={e => setForm(f => ({ ...f, amountUsd: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-[#EEEEEE] rounded focus:outline-none focus:border-[#3E6AE1]" />
                </div>
              </div>
              <div>
                <label className="text-xs text-[#8E8E8E] mb-1 block">Note (optional)</label>
                <input type="text" placeholder="e.g. Monthly contribution" value={form.note}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-[#EEEEEE] rounded focus:outline-none focus:border-[#3E6AE1]" />
              </div>
              {formError && <div className="text-xs text-[#DC2626]">{formError}</div>}
              <div className="flex gap-2">
                <button type="submit" disabled={submitting}
                  className="px-4 py-2 text-sm font-medium rounded-lg text-white bg-[#3E6AE1] disabled:opacity-60 transition-colors">
                  {submitting ? "Saving…" : "Save"}
                </button>
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-[#EEEEEE] text-[#5C5E62] hover:bg-[#F4F4F4]">
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Timeline */}
          {flows.length === 0 ? (
            <div className="text-center py-8 text-sm text-[#8E8E8E]">No cash flows yet.</div>
          ) : (
            <div className="relative">
              <div className="absolute left-[19px] top-0 bottom-0 w-px bg-[#EEEEEE]" />
              <div className="space-y-0">
                {flows.map((f, i) => {
                  const isDeposit = f.type === "deposit";
                  const runningNet = flows.slice(0, i + 1).reduce((s, x) => x.type === "deposit" ? s + x.amountUsd : s - x.amountUsd, 0);
                  return (
                    <div key={f.id} className="flex gap-4 relative pb-4 last:pb-0">
                      <div className={`w-9 h-9 rounded-full border-2 flex items-center justify-center shrink-0 z-10 text-sm font-bold
                        ${isDeposit ? "bg-[#F0FDF4] border-[#86EFAC] text-[#15803D]" : "bg-[#FEF2F2] border-[#FCA5A5] text-[#DC2626]"}`}>
                        {isDeposit ? "+" : "−"}
                      </div>
                      <div className="flex-1 pt-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <span className={`text-sm font-semibold ${isDeposit ? "text-[#15803D]" : "text-[#DC2626]"}`}>
                              {isDeposit ? "+" : "−"}{fmt(f.amountUsd)}
                            </span>
                            <span className="text-xs text-[#8E8E8E] ml-2 capitalize">{f.type}</span>
                          </div>
                          <span className="text-xs text-[#AAAAAA] shrink-0">
                            {new Date(f.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </span>
                        </div>
                        {f.note && f.note !== f.type && (
                          <div className="text-xs text-[#8E8E8E] mt-0.5 truncate">{f.note}</div>
                        )}
                        <div className="text-[10px] text-[#AAAAAA] mt-0.5">
                          Running net: {fmt(runningNet)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const [tab, setTab] = useState<TabId>("holdings");

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 md:px-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[#171A20]">Portfolio</h1>
        <p className="text-xs text-[#8E8E8E] mt-0.5">Holdings · allocation · performance · cash flows · reviews</p>
      </div>

      {/* Tab bar */}
      <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
        <div className="border-b border-[#EEEEEE] flex">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-5 py-3 text-sm font-medium border-b-2 transition-colors"
              style={
                tab === t.id
                  ? { borderColor: "#3E6AE1", color: "#3E6AE1" }
                  : { borderColor: "transparent", color: "#5C5E62" }
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-4">
          {tab === "holdings"   && <HoldingsTab />}
          {tab === "allocation" && <AllocationTab />}
          {tab === "history"    && <HistoryTab />}
          {tab === "reviews"    && <ReviewsTab />}
        </div>
      </div>
    </div>
  );
}
