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

type TabId = "holdings" | "allocation" | "performance" | "cashflows" | "reviews";
const TABS: { id: TabId; label: string }[] = [
  { id: "holdings",    label: "Holdings" },
  { id: "allocation",  label: "Allocation" },
  { id: "performance", label: "Performance" },
  { id: "cashflows",   label: "Cash Flows" },
  { id: "reviews",     label: "Reviews" },
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

// ─── Performance tab ──────────────────────────────────────────────────────────

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

function PerformanceTab() {
  const [perf, setPerf] = useState<PerfData | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/performance").then(r => r.json()),
      fetch("/api/portfolio-snapshots").then(r => r.json()),
    ])
      .then(([perf, snap]) => {
        setPerf(perf);
        setSnapshots((snap.snapshots ?? []).slice().reverse()); // newest first
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="py-12 text-center text-sm text-[#8E8E8E]">Loading performance…</div>;
  if (error) return <div className="text-sm text-[#DC2626] py-4">{error}</div>;
  if (!perf) return null;

  const gainColor = perf.gainUsd >= 0 ? "#15803D" : "#DC2626";
  const gainSign = perf.gainUsd >= 0 ? "+" : "";
  const inceptionStr = perf.inceptionDate
    ? new Date(perf.inceptionDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—";

  return (
    <div className="space-y-5">
      {/* Since-inception hero */}
      <div className="bg-[#F4F4F4] rounded-xl p-5">
        <div className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest mb-3">
          Since Inception {inceptionStr !== "—" ? `· ${inceptionStr}` : ""}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-[#8E8E8E] mb-1">Net Deposits</div>
            <div className="text-xl font-semibold text-[#171A20]">{fmt(perf.netDepositsUsd)}</div>
            <div className="text-[11px] text-[#8E8E8E]">total contributed</div>
          </div>
          <div>
            <div className="text-xs text-[#8E8E8E] mb-1">Current Value</div>
            <div className="text-xl font-semibold text-[#171A20]">{fmt(perf.currentValueUsd)}</div>
            <div className="text-[11px] text-[#8E8E8E]">portfolio mark-to-market</div>
          </div>
          <div>
            <div className="text-xs text-[#8E8E8E] mb-1">Total Profit / Loss</div>
            <div className="text-xl font-semibold" style={{ color: gainColor }}>
              {gainSign}{fmt(perf.gainUsd)}
            </div>
            <div className="text-[11px] text-[#8E8E8E]">value − net deposits</div>
          </div>
          <div>
            <div className="text-xs text-[#8E8E8E] mb-1">Total Return</div>
            <div className="text-xl font-semibold" style={{ color: gainColor }}>
              {gainSign}{perf.totalReturnPct.toFixed(2)}%
            </div>
            <div className="text-[11px] text-[#8E8E8E]">gain ÷ net deposits</div>
          </div>
        </div>
      </div>

      {/* Return method breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white border border-[#EEEEEE] rounded-xl p-4">
          <div className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest mb-2">Simple Return</div>
          <div className="text-2xl font-semibold" style={{ color: gainColor }}>
            {gainSign}{perf.totalReturnPct.toFixed(2)}%
          </div>
          <div className="text-xs text-[#8E8E8E] mt-1">gain ÷ net deposits — matches Excel</div>
        </div>
        <div className="bg-white border border-[#EEEEEE] rounded-xl p-4">
          <div className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest mb-2">TWR</div>
          <div className="text-2xl font-semibold text-[#171A20]">
            {perf.snapshotCount < 2 ? "—" : `${perf.twrPct >= 0 ? "+" : ""}${perf.twrPct.toFixed(2)}%`}
          </div>
          <div className="text-xs text-[#8E8E8E] mt-1">time-weighted · removes deposit timing</div>
        </div>
        <div className="bg-white border border-[#EEEEEE] rounded-xl p-4">
          <div className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest mb-2">MWR (XIRR)</div>
          <div className="text-2xl font-semibold text-[#171A20]">
            {perf.mwrPct == null ? "—" : `${perf.mwrPct >= 0 ? "+" : ""}${perf.mwrPct.toFixed(2)}%`}
          </div>
          <div className="text-xs text-[#8E8E8E] mt-1">money-weighted annualised IRR</div>
        </div>
      </div>

      {/* Snapshot history table */}
      {snapshots.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide mb-2">
            Snapshot History ({snapshots.length})
          </div>
          <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#EEEEEE] bg-[#F4F4F4] text-xs text-[#8E8E8E]">
                  <th className="text-left px-4 py-2.5 font-medium">Date</th>
                  <th className="text-right px-4 py-2.5 font-medium">Portfolio</th>
                  <th className="text-right px-4 py-2.5 font-medium">Net Deposits</th>
                  <th className="text-right px-4 py-2.5 font-medium">Gain</th>
                  <th className="text-right px-4 py-2.5 font-medium">Return %</th>
                  <th className="text-right px-4 py-2.5 font-medium hidden md:table-cell">Source</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map(s => {
                  const ret = s.totalReturnPct;
                  const retColor = ret >= 0 ? "#15803D" : "#DC2626";
                  return (
                    <tr key={s.snapshotDate} className="border-b border-[#EEEEEE] last:border-0">
                      <td className="px-4 py-2.5 text-xs text-[#5C5E62]">
                        {new Date(s.snapshotDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-[#171A20]">{fmt(s.portfolioValueUsd)}</td>
                      <td className="px-4 py-2.5 text-right text-[#5C5E62]">{fmt(s.netDepositsUsd)}</td>
                      <td className="px-4 py-2.5 text-right" style={{ color: s.unrealizedGainUsd >= 0 ? "#15803D" : "#DC2626" }}>
                        {s.unrealizedGainUsd >= 0 ? "+" : ""}{fmt(s.unrealizedGainUsd)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold" style={{ color: retColor }}>
                        {ret >= 0 ? "+" : ""}{ret.toFixed(2)}%
                      </td>
                      <td className="px-4 py-2.5 text-right hidden md:table-cell">
                        <span className="text-[10px] text-[#AAAAAA] bg-[#F4F4F4] px-1.5 py-0.5 rounded">{s.source}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {perf.snapshotCount === 0 && (
        <div className="text-center py-8 text-sm text-[#8E8E8E]">
          No snapshots yet. Run <code className="bg-[#F4F4F4] px-1.5 py-0.5 rounded">npm run import:excel-history</code> to import history,
          or <code className="bg-[#F4F4F4] px-1.5 py-0.5 rounded">npm run snapshot:create</code> for today.
        </div>
      )}
    </div>
  );
}

// ─── Cash Flows tab ───────────────────────────────────────────────────────────

interface CashFlowRecord {
  id: string;
  date: string;
  type: "deposit" | "withdrawal";
  amountUsd: number;
  note: string | null;
  source: string;
}

function CashFlowsTab() {
  const [flows, setFlows] = useState<CashFlowRecord[]>([]);
  const [netDepositsUsd, setNetDepositsUsd] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), type: "deposit", amountUsd: "", note: "" });
  const [showForm, setShowForm] = useState(false);

  function loadFlows() {
    return fetch("/api/cash-flows")
      .then(r => r.json())
      .then(d => { setFlows(d.flows ?? []); setNetDepositsUsd(d.netDepositsUsd ?? 0); });
  }

  useEffect(() => { loadFlows().catch(e => setError(e.message)).finally(() => setLoading(false)); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
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
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="py-12 text-center text-sm text-[#8E8E8E]">Loading cash flows…</div>;

  const deposits = flows.filter(f => f.type === "deposit").reduce((s, f) => s + f.amountUsd, 0);
  const withdrawals = flows.filter(f => f.type === "withdrawal").reduce((s, f) => s + f.amountUsd, 0);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-[#EEEEEE] rounded-xl p-4">
          <div className="text-xs text-[#8E8E8E] mb-1">Total Deposited</div>
          <div className="text-lg font-semibold text-[#15803D]">{fmt(deposits)}</div>
        </div>
        <div className="bg-white border border-[#EEEEEE] rounded-xl p-4">
          <div className="text-xs text-[#8E8E8E] mb-1">Total Withdrawn</div>
          <div className="text-lg font-semibold text-[#DC2626]">{fmt(withdrawals)}</div>
        </div>
        <div className="bg-white border border-[#EEEEEE] rounded-xl p-4">
          <div className="text-xs text-[#8E8E8E] mb-1">Net Deposits</div>
          <div className="text-lg font-semibold text-[#171A20]">{fmt(netDepositsUsd)}</div>
        </div>
      </div>

      {/* Add flow button + form */}
      <div>
        {!showForm && (
          <div className="flex gap-2">
            <button
              onClick={() => { setForm(f => ({ ...f, type: "deposit" })); setShowForm(true); }}
              className="px-4 py-2 text-sm font-medium rounded-lg text-white bg-[#15803D] hover:bg-[#166534] transition-colors"
            >
              + Deposit
            </button>
            <button
              onClick={() => { setForm(f => ({ ...f, type: "withdrawal" })); setShowForm(true); }}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-[#DC2626] text-[#DC2626] hover:bg-[#FEF2F2] transition-colors"
            >
              − Withdrawal
            </button>
          </div>
        )}
        {showForm && (
          <form onSubmit={handleSubmit} className="bg-white border border-[#EEEEEE] rounded-xl p-4 space-y-3">
            <div className="text-sm font-medium text-[#171A20] capitalize">{form.type}</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#8E8E8E] mb-1 block">Date</label>
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  required className="w-full px-3 py-2 text-sm border border-[#EEEEEE] rounded focus:outline-none focus:border-[#3E6AE1]" />
              </div>
              <div>
                <label className="text-xs text-[#8E8E8E] mb-1 block">Amount (USD)</label>
                <input type="number" step="0.01" min="0.01" value={form.amountUsd} onChange={e => setForm(f => ({ ...f, amountUsd: e.target.value }))}
                  required placeholder="0.00" className="w-full px-3 py-2 text-sm border border-[#EEEEEE] rounded focus:outline-none focus:border-[#3E6AE1]" />
              </div>
            </div>
            <div>
              <label className="text-xs text-[#8E8E8E] mb-1 block">Note (optional)</label>
              <input type="text" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                placeholder="e.g. Monthly contribution" className="w-full px-3 py-2 text-sm border border-[#EEEEEE] rounded focus:outline-none focus:border-[#3E6AE1]" />
            </div>
            {error && <div className="text-xs text-[#DC2626]">{error}</div>}
            <div className="flex gap-2">
              <button type="submit" disabled={submitting}
                className="px-4 py-2 text-sm font-medium rounded-lg text-white bg-[#3E6AE1] disabled:opacity-60 transition-colors">
                {submitting ? "Saving…" : "Save"}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-[#EEEEEE] text-[#5C5E62] hover:bg-[#F4F4F4] transition-colors">
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Flow list */}
      {flows.length === 0 ? (
        <div className="text-center py-8 text-sm text-[#8E8E8E]">No cash flows recorded.</div>
      ) : (
        <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
          {flows.map(f => (
            <div key={f.id} className="flex items-center gap-3 px-4 py-3 border-b border-[#EEEEEE] last:border-0">
              <div className={`w-2 h-2 rounded-full shrink-0 ${f.type === "deposit" ? "bg-[#15803D]" : "bg-[#DC2626]"}`} />
              <div className="text-xs text-[#8E8E8E] w-24 shrink-0">
                {new Date(f.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-[#5C5E62] truncate">{f.note ?? f.type}</div>
              </div>
              <div className={`text-sm font-semibold shrink-0 ${f.type === "deposit" ? "text-[#15803D]" : "text-[#DC2626]"}`}>
                {f.type === "deposit" ? "+" : "−"}{fmt(f.amountUsd)}
              </div>
              {f.source !== "manual" && (
                <span className="text-[10px] text-[#AAAAAA] bg-[#F4F4F4] px-1.5 py-0.5 rounded shrink-0">{f.source}</span>
              )}
            </div>
          ))}
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
          {tab === "holdings"    && <HoldingsTab />}
          {tab === "allocation"  && <AllocationTab />}
          {tab === "performance" && <PerformanceTab />}
          {tab === "cashflows"   && <CashFlowsTab />}
          {tab === "reviews"     && <ReviewsTab />}
        </div>
      </div>
    </div>
  );
}
