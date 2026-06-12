"use client";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import type { BucketId, AllocationGap, AllocationRecommendation, BucketAllocation, ConcentrationMetric, BucketDriverSummary } from "@/lib/allocation-engine";
import type { SimulatorResult, ComparisonRow, RegimeMatrixRow, SimulatorMove, SimulationResult } from "@/lib/allocation-simulator";

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

type TabId = "holdings" | "allocation" | "themes" | "simulator" | "architecture" | "hedge" | "decisions" | "history";
const TABS: { id: TabId; label: string }[] = [
  { id: "holdings",     label: "Holdings" },
  { id: "allocation",   label: "Allocation" },
  { id: "themes",       label: "Themes" },
  { id: "simulator",    label: "Simulator" },
  { id: "architecture", label: "Architecture" },
  { id: "hedge",        label: "Hedge Audit" },
  { id: "decisions",    label: "Decision Reviews" },
  { id: "history",      label: "History" },
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

interface AllocationReviewResponse {
  generatedAt: string;
  regime: string;
  scenario: string;
  buckets: BucketAllocation[];
  allocationGrade: string;
  allocationScore: number;
  alignmentPct: number;
  gapAnalysis: AllocationGap[];
  concentration: ConcentrationMetric;
  recommendations: AllocationRecommendation[];
  largestUnderweight: AllocationGap | null;
  largestOverweight: AllocationGap | null;
  bucketDriverSummaries: BucketDriverSummary[];
  topDriver: string;
}

const BUCKET_COLOR: Record<BucketId, string> = {
  growth:     "#3E6AE1",
  healthcare: "#15803D",
  defense:    "#D97706",
  gold:       "#B45309",
  cash:       "#8E8E8E",
  broad:      "#6D28D9",
  other:      "#AAAAAA",
};

const GAP_GRADE_COLOR: Record<string, string> = {
  A: "#15803D", B: "#3E6AE1", C: "#D97706", D: "#92400E", F: "#DC2626",
};

function GapBar({ gap }: { gap: AllocationGap }) {
  const color = BUCKET_COLOR[gap.bucket] ?? "#8E8E8E";
  const max = 80;
  const currentW = Math.min(100, (gap.currentPct / max) * 100);
  const targetW  = Math.min(100, (gap.targetPct  / max) * 100);
  const isUnder  = gap.direction === "underweight";
  const isOver   = gap.direction === "overweight";

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl px-4 py-3">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="text-sm font-semibold text-[#171A20]">{gap.label}</div>
          <div className="flex gap-1 mt-0.5 flex-wrap">
            {gap.tickers.map(t => (
              <span key={t} className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: color + "22", color }}>{t}</span>
            ))}
          </div>
        </div>
        <div className="text-right shrink-0">
          {isUnder && <span className="text-xs font-bold" style={{ color: "#15803D" }}>+{gap.gapPct.toFixed(1)}% needed</span>}
          {isOver  && <span className="text-xs font-bold" style={{ color: "#DC2626" }}>{gap.gapPct.toFixed(1)}% excess</span>}
          {!isUnder && !isOver && <span className="text-xs text-[#15803D] font-medium">Balanced</span>}
        </div>
      </div>
      {/* Dual bar: current (solid) vs target (dashed outline) */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#8E8E8E] w-12 shrink-0">Current</span>
          <div className="flex-1 h-2 bg-[#EEEEEE] rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${currentW}%`, backgroundColor: color }} />
          </div>
          <span className="text-[10px] font-semibold text-[#5C5E62] w-8 text-right tabular-nums">{gap.currentPct.toFixed(0)}%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#8E8E8E] w-12 shrink-0">Target</span>
          <div className="flex-1 h-2 bg-[#EEEEEE] rounded-full overflow-hidden" style={{ border: "1px dashed #CCCCCC" }}>
            <div className="h-full rounded-full opacity-50" style={{ width: `${targetW}%`, backgroundColor: color }} />
          </div>
          <span className="text-[10px] font-semibold text-[#5C5E62] w-8 text-right tabular-nums">{gap.targetPct.toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
}

const DRIVER_SOURCE_STYLE = {
  REGIME:        { bg: "#EEF3FD", text: "#3E6AE1", label: "Regime" },
  OPPORTUNITY:   { bg: "#F0FDF4", text: "#15803D", label: "Opportunity" },
  HEDGE:         { bg: "#FFFBEB", text: "#D97706", label: "Hedge" },
  CONCENTRATION: { bg: "#FEF2F2", text: "#DC2626", label: "Concentration" },
};

function BucketDriverCard({ driver }: { driver: BucketDriverSummary }) {
  const rows = ([
    { source: "REGIME" as const,        adj: driver.regimeAdjustment,        desc: driver.regimeDescription },
    { source: "OPPORTUNITY" as const,   adj: driver.opportunityAdjustment,   desc: driver.opportunityDescription },
    { source: "HEDGE" as const,         adj: driver.hedgeAdjustment,         desc: driver.hedgeDescription },
    { source: "CONCENTRATION" as const, adj: driver.concentrationAdjustment, desc: driver.concentrationDescription },
  ] as { source: keyof typeof DRIVER_SOURCE_STYLE; adj: number; desc: string }[]).filter(r => r.adj !== 0);

  if (rows.length === 0) return null;

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-[#171A20]">{driver.label}</span>
        <span className="text-xs font-semibold text-[#171A20]">Final: {driver.finalAllocation.toFixed(0)}%</span>
      </div>
      {/* Base row */}
      <div className="flex items-center justify-between py-1 border-t border-[#F4F4F4]">
        <span className="text-xs text-[#8E8E8E]">Base (Neutral)</span>
        <span className="text-xs font-medium text-[#5C5E62] tabular-nums">{driver.baseAllocation}%</span>
      </div>
      {/* Adjustment rows */}
      {rows.map(row => {
        const s = DRIVER_SOURCE_STYLE[row.source];
        return (
          <div key={row.source} className="flex items-center justify-between py-1 border-t border-[#F4F4F4]">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0"
                style={{ backgroundColor: s.bg, color: s.text }}>
                {s.label}
              </span>
              <span className="text-xs text-[#5C5E62] truncate">{row.desc}</span>
            </div>
            <span className="text-xs font-semibold tabular-nums ml-2 shrink-0"
              style={{ color: row.adj > 0 ? "#15803D" : "#DC2626" }}>
              {row.adj > 0 ? "+" : ""}{row.adj.toFixed(0)}%
            </span>
          </div>
        );
      })}
      {/* Final row */}
      <div className="flex items-center justify-between pt-2 mt-1 border-t-2 border-[#EEEEEE]">
        <span className="text-xs font-semibold text-[#171A20]">Final Target</span>
        <span className="text-xs font-bold text-[#3E6AE1] tabular-nums">{driver.finalAllocation.toFixed(0)}%</span>
      </div>
    </div>
  );
}

// ─── Themes tab ───────────────────────────────────────────────────────────────

interface ThemeGapItem {
  themeId: string;
  label: string;
  currentPct: number;
  targetPct: number;
  gapPct: number;
  direction: string;
  tickers: string[];
}

interface ThemeDriverSummaryItem {
  themeId: string;
  label: string;
  basePct: number;
  regimeAdjustment: number;
  regimeDescription: string;
  opportunityAdjustment: number;
  opportunityDescription: string;
  newsletterAdjustment: number;
  newsletterDescription: string;
  momentumAdjustment: number;
  momentumDescription: string;
  finalAllocation: number;
}

interface ThemeRecommendationItem {
  rank: number;
  themeId: string;
  label: string;
  action: "ADD" | "REDUCE";
  currentPct: number;
  targetPct: number;
  gapPct: number;
  reason: string;
  implementationTickers: string[];
}

interface ThemeAllocationData {
  regime: string;
  scenario: string;
  gapAnalysis: ThemeGapItem[];
  recommendations: ThemeRecommendationItem[];
  themeDriverSummaries: ThemeDriverSummaryItem[];
  largestThemeGap: { label: string; gapPct: number } | null;
  largestThemeOverweight: { label: string; gapPct: number } | null;
  topThemeDriver: string;
}

const THEME_SOURCE_STYLE = {
  REGIME:      { bg: "#EEF3FD", text: "#3E6AE1",  label: "Regime" },
  OPPORTUNITY: { bg: "#F0FDF4", text: "#15803D",  label: "Opportunity" },
  NEWSLETTER:  { bg: "#FFF7ED", text: "#D97706",  label: "Newsletter" },
  MOMENTUM:    { bg: "#F5F3FF", text: "#7C3AED",  label: "Momentum" },
} as const;

const THEME_COLORS: Record<string, string> = {
  "ai-infrastructure": "#6366F1",
  "semiconductors":    "#0EA5E9",
  "healthcare":        "#10B981",
  "defense":           "#3E6AE1",
  "cybersecurity":     "#8B5CF6",
  "consumer":          "#F59E0B",
  "financials":        "#06B6D4",
  "energy":            "#EF4444",
  "cash":              "#22C55E",
  "gold":              "#EAB308",
  "broad":             "#6B7280",
};

function ThemeGapBar({ gap }: { gap: ThemeGapItem }) {
  const color = THEME_COLORS[gap.themeId] ?? "#8E8E8E";
  const maxPct = Math.max(gap.currentPct, gap.targetPct, 5);
  const isUnder = gap.direction === "underweight";
  const isOver  = gap.direction === "overweight";

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-[#171A20]">{gap.label}</span>
        <span className="text-xs font-bold tabular-nums" style={{ color: isUnder ? "#15803D" : isOver ? "#DC2626" : "#8E8E8E" }}>
          {gap.gapPct > 0 ? "+" : ""}{gap.gapPct.toFixed(1)}%
        </span>
      </div>
      <div className="space-y-1.5">
        {/* Current */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#AAAAAA] w-12 shrink-0">Current</span>
          <div className="flex-1 h-2 bg-[#F4F4F4] rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(gap.currentPct / maxPct) * 100}%`, backgroundColor: color, opacity: 0.5 }} />
          </div>
          <span className="text-[11px] font-semibold tabular-nums w-10 text-right text-[#5C5E62]">{gap.currentPct.toFixed(1)}%</span>
        </div>
        {/* Target */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#AAAAAA] w-12 shrink-0">Target</span>
          <div className="flex-1 h-2 bg-[#F4F4F4] rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(gap.targetPct / maxPct) * 100}%`, backgroundColor: color }} />
          </div>
          <span className="text-[11px] font-semibold tabular-nums w-10 text-right text-[#171A20]">{gap.targetPct.toFixed(1)}%</span>
        </div>
      </div>
      {gap.tickers.length > 0 && (
        <div className="flex gap-1 mt-2 flex-wrap">
          {gap.tickers.slice(0, 5).map(t => (
            <Link key={t} href={`/portfolio/${t}`}
              className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#F4F4F4] text-[#5C5E62] hover:text-[#3E6AE1]">
              {t}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function ThemeDriverCard({ driver }: { driver: ThemeDriverSummaryItem }) {
  const rows = ([
    { source: "REGIME" as const,      adj: driver.regimeAdjustment,      desc: driver.regimeDescription },
    { source: "OPPORTUNITY" as const, adj: driver.opportunityAdjustment, desc: driver.opportunityDescription },
    { source: "NEWSLETTER" as const,  adj: driver.newsletterAdjustment,  desc: driver.newsletterDescription },
    { source: "MOMENTUM" as const,    adj: driver.momentumAdjustment,    desc: driver.momentumDescription },
  ] as { source: keyof typeof THEME_SOURCE_STYLE; adj: number; desc: string }[]).filter(r => r.adj !== 0);

  if (rows.length === 0) return null;

  const color = THEME_COLORS[driver.themeId] ?? "#8E8E8E";

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <span className="text-sm font-semibold text-[#171A20]">{driver.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#AAAAAA]">base {driver.basePct}%</span>
          <span className="text-xs font-bold text-[#3E6AE1] tabular-nums">→ {driver.finalAllocation.toFixed(1)}%</span>
        </div>
      </div>
      {rows.map(row => {
        const s = THEME_SOURCE_STYLE[row.source];
        return (
          <div key={row.source} className="flex items-center justify-between py-1 border-t border-[#F4F4F4]">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0"
                style={{ backgroundColor: s.bg, color: s.text }}>
                {s.label}
              </span>
              <span className="text-xs text-[#5C5E62] truncate">{row.desc}</span>
            </div>
            <span className="text-xs font-semibold tabular-nums ml-2 shrink-0"
              style={{ color: row.adj > 0 ? "#15803D" : "#DC2626" }}>
              {row.adj > 0 ? "+" : ""}{row.adj.toFixed(0)}%
            </span>
          </div>
        );
      })}
      <div className="flex items-center justify-between pt-2 mt-1 border-t-2 border-[#EEEEEE]">
        <span className="text-xs font-semibold text-[#171A20]">Final Target</span>
        <span className="text-xs font-bold text-[#3E6AE1] tabular-nums">{driver.finalAllocation.toFixed(1)}%</span>
      </div>
    </div>
  );
}

function ThemesTab() {
  const [data, setData] = useState<ThemeAllocationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/theme-allocation")
      .then(async r => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
        return json as ThemeAllocationData;
      })
      .then(d => setData(d))
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load theme allocation"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="py-12 text-center text-sm text-[#8E8E8E]">Loading themes…</div>;
  if (error)   return <div className="text-sm text-[#DC2626] py-4">{error}</div>;
  if (!data)   return null;

  const hasDrivers = (data.themeDriverSummaries ?? []).some(d =>
    d.regimeAdjustment !== 0 || d.opportunityAdjustment !== 0 ||
    d.newsletterAdjustment !== 0 || d.momentumAdjustment !== 0
  );

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Regime", value: data.regime },
          { label: "Scenario", value: data.scenario },
          { label: "Themes", value: `${data.gapAnalysis.length} active` },
        ].map(m => (
          <div key={m.label} className="bg-white border border-[#EEEEEE] rounded-xl p-3">
            <div className="text-xs text-[#8E8E8E] mb-1">{m.label}</div>
            <div className="text-lg font-semibold text-[#171A20]">{m.value}</div>
          </div>
        ))}
      </div>

      {/* Gap strips */}
      {(data.largestThemeGap || data.largestThemeOverweight) && (
        <div className="flex gap-3 flex-wrap">
          {data.largestThemeGap && (
            <div className="flex items-center gap-2 bg-[#F0FDF4] border border-[#86EFAC] rounded-xl px-3 py-2">
              <span className="text-xs font-semibold text-[#15803D]">Largest Gap</span>
              <span className="text-xs text-[#5C5E62]">{data.largestThemeGap.label}</span>
              <span className="text-xs font-bold text-[#15803D]">+{data.largestThemeGap.gapPct.toFixed(1)}%</span>
            </div>
          )}
          {data.largestThemeOverweight && (
            <div className="flex items-center gap-2 bg-[#FEF2F2] border border-[#FCA5A5] rounded-xl px-3 py-2">
              <span className="text-xs font-semibold text-[#DC2626]">Largest Excess</span>
              <span className="text-xs text-[#5C5E62]">{data.largestThemeOverweight.label}</span>
              <span className="text-xs font-bold text-[#DC2626]">{data.largestThemeOverweight.gapPct.toFixed(1)}%</span>
            </div>
          )}
        </div>
      )}

      {/* Theme gap bars */}
      <div>
        <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide mb-2">Theme Allocation</div>
        <div className="space-y-2">
          {data.gapAnalysis.map(gap => <ThemeGapBar key={gap.themeId} gap={gap} />)}
        </div>
      </div>

      {/* Theme Drivers */}
      {hasDrivers && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide">Theme Drivers</div>
            <span className="text-[10px] text-[#AAAAAA]">targets normalized to 100%</span>
          </div>
          <div className="space-y-2">
            {(data.themeDriverSummaries ?? []).map(d => (
              <ThemeDriverCard key={d.themeId} driver={d} />
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {data.recommendations.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide mb-2">Recommendations</div>
          <div className="space-y-2">
            {data.recommendations.map(rec => {
              const isAdd = rec.action === "ADD";
              return (
                <div key={rec.themeId} className="bg-white border border-[#EEEEEE] rounded-xl px-4 py-3">
                  <div className="flex items-start gap-3">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded mt-0.5 shrink-0"
                      style={{ backgroundColor: isAdd ? "#F0FDF4" : "#FFF7ED", color: isAdd ? "#15803D" : "#92400E" }}>
                      {isAdd ? "INCREASE" : "REDUCE"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-[#171A20]">
                        {rec.label}
                        <span className="ml-1.5 text-xs font-normal text-[#8E8E8E]">
                          {rec.currentPct.toFixed(0)}% → {rec.targetPct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="text-xs text-[#5C5E62] mt-0.5">{rec.reason}</div>
                      {rec.implementationTickers.length > 0 && (
                        <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                          <span className="text-[10px] text-[#AAAAAA] mr-0.5">via:</span>
                          {rec.implementationTickers.map(t => (
                            <Link key={t} href={`/portfolio/${t}`}
                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#EEF3FD] text-[#3E6AE1] hover:bg-[#DBEAFE]">
                              {t}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="text-xs font-semibold tabular-nums shrink-0"
                      style={{ color: isAdd ? "#15803D" : "#DC2626" }}>
                      {rec.gapPct > 0 ? "+" : ""}{rec.gapPct.toFixed(1)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function AllocationTab() {
  const [data, setData] = useState<AllocationReviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/allocation-review")
      .then(async r => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
        return json as AllocationReviewResponse;
      })
      .then(d => setData(d))
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load allocation"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="py-12 text-center text-sm text-[#8E8E8E]">Loading allocation…</div>;
  if (error) return <div className="text-sm text-[#DC2626] py-4">{error}</div>;
  if (!data) return null;

  const gradeColor = GAP_GRADE_COLOR[data.allocationGrade] ?? "#8E8E8E";

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Alignment", value: `${data.alignmentPct}%` },
          { label: "Grade", value: data.allocationGrade, color: gradeColor },
          { label: "Regime", value: data.regime },
          { label: "Scenario", value: data.scenario },
        ].map(m => (
          <div key={m.label} className="bg-white border border-[#EEEEEE] rounded-xl p-3">
            <div className="text-xs text-[#8E8E8E] mb-1">{m.label}</div>
            <div className="text-lg font-semibold" style={{ color: m.color ?? "#171A20" }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Gap summary strip */}
      {(data.largestUnderweight || data.largestOverweight) && (
        <div className="flex gap-3 flex-wrap">
          {data.largestUnderweight && (
            <div className="flex items-center gap-2 bg-[#F0FDF4] border border-[#86EFAC] rounded-xl px-3 py-2">
              <span className="text-xs font-semibold text-[#15803D]">Largest Gap</span>
              <span className="text-xs text-[#5C5E62]">{data.largestUnderweight.label}</span>
              <span className="text-xs font-bold text-[#15803D]">+{data.largestUnderweight.gapPct.toFixed(1)}%</span>
            </div>
          )}
          {data.largestOverweight && (
            <div className="flex items-center gap-2 bg-[#FEF2F2] border border-[#FCA5A5] rounded-xl px-3 py-2">
              <span className="text-xs font-semibold text-[#DC2626]">Largest Excess</span>
              <span className="text-xs text-[#5C5E62]">{data.largestOverweight.label}</span>
              <span className="text-xs font-bold text-[#DC2626]">{data.largestOverweight.gapPct.toFixed(1)}%</span>
            </div>
          )}
        </div>
      )}

      {/* Bucket bars */}
      <div>
        <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide mb-2">Bucket Allocation</div>
        <div className="space-y-2">
          {data.gapAnalysis.map(gap => <GapBar key={gap.bucket} gap={gap} />)}
        </div>
      </div>

      {/* Allocation Drivers */}
      {(data.bucketDriverSummaries ?? []).some(d =>
        d.regimeAdjustment !== 0 || d.opportunityAdjustment !== 0 ||
        d.hedgeAdjustment !== 0 || d.concentrationAdjustment !== 0
      ) && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide">Allocation Drivers</div>
            <span className="text-[10px] text-[#AAAAAA]">targets normalized to 100%</span>
          </div>
          <div className="space-y-2">
            {(data.bucketDriverSummaries ?? []).map(d => (
              <BucketDriverCard key={d.bucket} driver={d} />
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {data.recommendations.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide mb-2">Recommendations</div>
          <div className="space-y-2">
            {data.recommendations.map(rec => {
              const isAdd = rec.action === "ADD";
              return (
                <div key={rec.bucket} className="bg-white border border-[#EEEEEE] rounded-xl px-4 py-3">
                  <div className="flex items-start gap-3">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded mt-0.5 shrink-0"
                      style={{ backgroundColor: isAdd ? "#F0FDF4" : "#FFF7ED", color: isAdd ? "#15803D" : "#92400E" }}>
                      {rec.action}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-[#171A20]">
                        {isAdd ? "Increase" : "Reduce"} {BUCKET_COLOR[rec.bucket] ? rec.bucket.charAt(0).toUpperCase() + rec.bucket.slice(1) : rec.bucket} Allocation
                        <span className="ml-1.5 text-xs font-normal text-[#8E8E8E]">
                          {rec.currentPct.toFixed(0)}% → {rec.targetPct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="text-xs text-[#5C5E62] mt-0.5">{rec.reason}</div>
                      {rec.implementationTickers.length > 0 && (
                        <div className="flex gap-1 mt-1.5 flex-wrap">
                          <span className="text-[10px] text-[#AAAAAA] mr-0.5">via:</span>
                          {rec.implementationTickers.map(t => (
                            <Link key={t} href={`/portfolio/${t}`}
                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#EEF3FD] text-[#3E6AE1] hover:bg-[#DBEAFE]">
                              {t}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="text-xs font-semibold tabular-nums shrink-0"
                      style={{ color: isAdd ? "#15803D" : "#DC2626" }}>
                      {rec.gapPct.toFixed(1)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Concentration */}
      <div>
        <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide mb-2">Concentration Analysis</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Key metrics */}
          <div className="bg-white border border-[#EEEEEE] rounded-xl p-4 space-y-3">
            {[
              { label: "Top Position", value: `${data.concentration.topPosition.ticker} (${data.concentration.topPosition.pct.toFixed(1)}%)` },
              { label: "Top 5 Concentration", value: `${data.concentration.top5Pct.toFixed(1)}%`, warn: data.concentration.top5Pct > 75 },
              { label: "Mag7 Exposure", value: `${data.concentration.mag7Pct.toFixed(1)}%`, warn: data.concentration.mag7Pct > 35 },
            ].map(m => (
              <div key={m.label} className="flex items-center justify-between">
                <span className="text-xs text-[#5C5E62]">{m.label}</span>
                <span className="text-xs font-semibold" style={{ color: m.warn ? "#D97706" : "#171A20" }}>{m.value}</span>
              </div>
            ))}
          </div>
          {/* Sector breakdown */}
          <div className="bg-white border border-[#EEEEEE] rounded-xl p-4 space-y-2">
            <div className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-wide mb-2">Sector Exposure</div>
            {data.concentration.sectorBreakdown.slice(0, 5).map(s => (
              <div key={s.sector} className="flex items-center gap-2">
                <div className="flex-1 text-xs text-[#5C5E62] truncate">{s.sector}</div>
                <div className="w-24 h-1.5 bg-[#EEEEEE] rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-[#3E6AE1]" style={{ width: `${Math.min(100, s.pct * 2)}%` }} />
                </div>
                <div className="text-[10px] font-semibold text-[#5C5E62] w-8 text-right tabular-nums">{s.pct.toFixed(0)}%</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Simulator tab ────────────────────────────────────────────────────────────

const METRIC_ICONS: Record<string, string> = {
  "Expected Return":     "↑",
  "Drawdown Protection": "⛶",
  "Resilience":          "◈",
  "Hedge Score":         "⬡",
  "Concentration Risk":  "⊕",
};

function ScoreBadge({ value, higherBetter = true }: { value: number; higherBetter?: boolean }) {
  const good = higherBetter ? value >= 70 : value <= 30;
  const mid  = higherBetter ? value >= 45 : value <= 55;
  const color = good ? "#15803D" : mid ? "#D97706" : "#DC2626";
  const bg    = good ? "#F0FDF4" : mid ? "#FFFBEB" : "#FEF2F2";
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded tabular-nums" style={{ color, backgroundColor: bg }}>
      {value}
    </span>
  );
}

function DeltaBadge({ delta, higherBetter = true }: { delta: number; higherBetter?: boolean }) {
  if (Math.abs(delta) < 1) return <span className="text-xs text-[#8E8E8E] tabular-nums">—</span>;
  const isGood = higherBetter ? delta > 0 : delta < 0;
  const color  = isGood ? "#15803D" : "#DC2626";
  const sign   = delta > 0 ? "+" : "";
  return (
    <span className="text-xs font-bold tabular-nums" style={{ color }}>
      {sign}{Math.round(delta)}
    </span>
  );
}

function MetricCard({ metric, current, recommended, higherIsBetter }: ComparisonRow) {
  const delta = recommended - current;
  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl p-3">
      <div className="text-xs text-[#8E8E8E] mb-2">{metric}</div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="text-[10px] text-[#AAAAAA] mb-0.5">Current</div>
          <ScoreBadge value={current} higherBetter={higherIsBetter} />
        </div>
        <DeltaBadge delta={delta} higherBetter={higherIsBetter} />
        <div className="text-right">
          <div className="text-[10px] text-[#AAAAAA] mb-0.5">Target</div>
          <ScoreBadge value={recommended} higherBetter={higherIsBetter} />
        </div>
      </div>
    </div>
  );
}

function SimulatorTab() {
  const [data, setData]       = useState<SimulatorResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/allocation-simulator")
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setData(d); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="space-y-4">
      {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20" />)}
    </div>
  );
  if (error) return <div className="text-sm text-[#DC2626] py-4">{error}</div>;
  if (!data)  return <div className="text-sm text-[#8E8E8E] py-4">No data.</div>;

  const { current, recommended, comparison, regimeMatrix, regime, moves } = data;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[#171A20]">Allocation Simulator</h2>
          <p className="text-xs text-[#8E8E8E] mt-0.5">
            What happens if you follow the recommendations? · {regime} regime
          </p>
        </div>
      </div>

      {/* Metric cards — side by side */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {comparison.map(row => (
          <MetricCard key={row.metric} {...row} />
        ))}
      </div>

      {/* Side-by-side comparison table */}
      <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#EEEEEE]">
          <span className="text-sm font-semibold text-[#171A20]">Scenario Comparison</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#EEEEEE] text-xs text-[#8E8E8E]">
              <th className="text-left px-4 py-2.5 font-medium">Metric</th>
              <th className="text-right px-4 py-2.5 font-medium">Current</th>
              <th className="text-right px-4 py-2.5 font-medium">Target</th>
              <th className="text-right px-4 py-2.5 font-medium">Delta</th>
            </tr>
          </thead>
          <tbody>
            {comparison.map(row => (
              <tr key={row.metric} className="border-b border-[#EEEEEE] last:border-0">
                <td className="px-4 py-2.5">
                  <span className="text-xs text-[#171A20]">{row.metric}</span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <ScoreBadge value={row.current} higherBetter={row.higherIsBetter} />
                </td>
                <td className="px-4 py-2.5 text-right">
                  <ScoreBadge value={row.recommended} higherBetter={row.higherIsBetter} />
                </td>
                <td className="px-4 py-2.5 text-right">
                  <DeltaBadge delta={row.delta} higherBetter={row.higherIsBetter} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Regime matrix */}
      <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#EEEEEE]">
          <span className="text-sm font-semibold text-[#171A20]">Regime Matrix</span>
          <span className="text-xs text-[#8E8E8E] ml-2">Portfolio score per scenario (0–100)</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#EEEEEE] text-xs text-[#8E8E8E]">
              <th className="text-left px-4 py-2.5 font-medium">Scenario</th>
              <th className="text-right px-4 py-2.5 font-medium">Current</th>
              <th className="text-right px-4 py-2.5 font-medium">Target</th>
              <th className="text-right px-4 py-2.5 font-medium">Δ</th>
            </tr>
          </thead>
          <tbody>
            {regimeMatrix.map(row => (
              <tr key={row.regime} className="border-b border-[#EEEEEE] last:border-0">
                <td className="px-4 py-2.5 text-xs text-[#171A20]">{row.regime}</td>
                <td className="px-4 py-2.5 text-right">
                  <span className="text-xs font-semibold tabular-nums text-[#5C5E62]">{row.current}</span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <span className="text-xs font-semibold tabular-nums text-[#5C5E62]">{row.recommended}</span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <DeltaBadge delta={row.delta} higherBetter={true} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Improvements / Degradations */}
      {(recommended.improvements.length > 0 || recommended.degradations.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {recommended.improvements.length > 0 && (
            <div className="bg-[#F0FDF4] border border-[#BBF7D0] rounded-xl px-4 py-3">
              <div className="text-xs font-semibold text-[#15803D] mb-2">Improvements vs Current</div>
              {recommended.improvements.map(s => (
                <div key={s} className="text-xs text-[#15803D] py-0.5">{s}</div>
              ))}
            </div>
          )}
          {recommended.degradations.length > 0 && (
            <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-xl px-4 py-3">
              <div className="text-xs font-semibold text-[#DC2626] mb-2">Trade-offs vs Current</div>
              {recommended.degradations.map(s => (
                <div key={s} className="text-xs text-[#DC2626] py-0.5">{s}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recommended moves */}
      {moves.length > 0 && (
        <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[#EEEEEE]">
            <span className="text-sm font-semibold text-[#171A20]">Recommended Moves</span>
            <span className="text-xs text-[#8E8E8E] ml-2">To reach target allocation</span>
          </div>
          <div className="divide-y divide-[#EEEEEE]">
            {moves.map((move, i) => (
              <div key={i} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded shrink-0"
                    style={{
                      backgroundColor: move.action === "ADD" ? "#F0FDF4" : "#FEF2F2",
                      color:           move.action === "ADD" ? "#15803D" : "#DC2626",
                    }}
                  >
                    {move.action}
                  </span>
                  <span className="text-xs font-semibold text-[#171A20] capitalize">{move.label}</span>
                  <div className="flex gap-1 flex-wrap min-w-0">
                    {move.tickers.slice(0, 4).map(t => (
                      <span key={t} className="text-[10px] text-[#3E6AE1] bg-[#EEF3FD] px-1.5 py-0.5 rounded font-medium">{t}</span>
                    ))}
                  </div>
                </div>
                <span className="text-xs font-bold tabular-nums shrink-0"
                  style={{ color: move.action === "ADD" ? "#15803D" : "#DC2626" }}>
                  {move.action === "ADD" ? "+" : "-"}{move.gapPct.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

// ─── Architecture tab ─────────────────────────────────────────────────────────

interface ArchitectureReviewSummary {
  id: string;
  reviewDate: string;
  marketRegime: string;
  architectureScore: { total: number; diversification: number; concentration: number; hedgeQuality: number; regimeResilience: number; grade: string; label: string };
  recommendations: string[];
  hedgeAudit?: { hedgeScore: number; verdict: string; hedgeStack: { gold: { tickers: string[]; allocationPct: number }; cash: { tickers: string[]; allocationPct: number }; defense: { tickers: string[]; allocationPct: number }; broadEtf: { tickers: string[]; allocationPct: number }; growthAssets: { tickers: string[]; allocationPct: number }; totalHedgePct: number } } | null;
}

function ScoreRow({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-[#5C5E62]">{label}</span>
        <span className="text-xs font-semibold" style={{ color }}>{score}</span>
      </div>
      <div className="h-1.5 bg-[#EEEEEE] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function ArchitectureTab() {
  const [review, setReview] = useState<ArchitectureReviewSummary | null>(null);
  const [history, setHistory] = useState<{ reviewDate: string; architectureScore: number; scoreGrade: string; scoreLabel: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/portfolio-architecture")
      .then(r => r.json())
      .then(d => { setReview(d.review); setHistory(d.history ?? []); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function runReview() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio-architecture", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Review failed");
      setReview(data);
      setHistory(prev => [{ reviewDate: data.reviewDate, architectureScore: data.architectureScore.total, scoreGrade: data.architectureScore.grade, scoreLabel: data.architectureScore.label }, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setRunning(false);
    }
  }

  if (loading) return <div className="py-12 text-center text-sm text-[#8E8E8E]">Loading architecture review…</div>;

  const a = review?.architectureScore;
  const gradeColor = a?.grade === "A" ? "#15803D" : a?.grade === "B" ? "#3E6AE1" : a?.grade === "C" ? "#D97706" : "#DC2626";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#5C5E62]">Portfolio architecture quality analysis.</p>
        <button
          onClick={runReview}
          disabled={running}
          className="text-sm font-medium px-4 py-2 rounded-lg text-white transition-opacity"
          style={{ backgroundColor: "#3E6AE1", opacity: running ? 0.6 : 1 }}
        >
          {running ? "Analyzing…" : "Run Review"}
        </button>
      </div>
      {error && <div className="text-sm text-[#DC2626] bg-[#FEF2F2] border border-[#FECACA] rounded-lg px-4 py-2">{error}</div>}

      {review && a ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Architecture Score", value: a.total + "/100" },
              { label: "Grade", value: a.grade },
              { label: "Regime", value: review.marketRegime },
              { label: "Review Date", value: new Date(review.reviewDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) },
            ].map(m => (
              <div key={m.label} className="bg-white border border-[#EEEEEE] rounded-xl p-3">
                <div className="text-xs text-[#8E8E8E] mb-1">{m.label}</div>
                <div className="text-lg font-semibold" style={{ color: m.label === "Grade" ? gradeColor : "#171A20" }}>{m.value}</div>
              </div>
            ))}
          </div>

          <div className="bg-white border border-[#EEEEEE] rounded-xl p-4 space-y-3">
            <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide">{a.label}</div>
            <ScoreRow label="Architecture (overall)" score={a.total} color="#3E6AE1" />
            <ScoreRow label="Diversification" score={a.diversification} color="#15803D" />
            <ScoreRow label="Concentration" score={a.concentration} color="#D97706" />
            <ScoreRow label="Hedge Quality" score={a.hedgeQuality} color="#9333EA" />
            <ScoreRow label="Regime Resilience" score={a.regimeResilience} color="#F59E0B" />
          </div>

          {(review.recommendations ?? []).length > 0 && (
            <div className="bg-white border border-[#EEEEEE] rounded-xl p-4">
              <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide mb-3">Recommendations</div>
              <ul className="space-y-2">
                {review.recommendations.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-[#5C5E62]">
                    <span className="text-[#AAAAAA] mt-0.5">·</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {history.length > 1 && (
            <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
              <div className="px-4 py-3 text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide border-b border-[#EEEEEE]">History</div>
              {history.slice(0, 6).map(h => (
                <div key={h.reviewDate} className="flex items-center justify-between px-4 py-2.5 border-b border-[#EEEEEE] last:border-0">
                  <span className="text-sm text-[#5C5E62]">
                    {new Date(h.reviewDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[#171A20]">{h.architectureScore}/100</span>
                    <span className="text-xs font-semibold px-1.5 py-0.5 rounded"
                      style={{ color: h.scoreGrade === "A" ? "#15803D" : h.scoreGrade === "B" ? "#3E6AE1" : "#D97706",
                               backgroundColor: h.scoreGrade === "A" ? "#F0FDF4" : h.scoreGrade === "B" ? "#EEF3FD" : "#FFFBEB" }}>
                      {h.scoreGrade}
                    </span>
                    <span className="text-xs text-[#8E8E8E]">{h.scoreLabel}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-12 text-sm text-[#8E8E8E]">
          No architecture review yet. Click "Run Review" to generate one.
        </div>
      )}
    </div>
  );
}

// ─── Hedge Audit tab ──────────────────────────────────────────────────────────

const VERDICT_STYLE: Record<string, { bg: string; text: string }> = {
  KEEP:    { bg: "#F0FDF4", text: "#15803D" },
  REDUCE:  { bg: "#FFFBEB", text: "#92400E" },
  REPLACE: { bg: "#FEF2F2", text: "#991B1B" },
  REMOVE:  { bg: "#FEF2F2", text: "#991B1B" },
};

function HedgeAuditTab() {
  const [review, setReview] = useState<ArchitectureReviewSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/portfolio-architecture")
      .then(r => r.json())
      .then(d => setReview(d.review))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="py-12 text-center text-sm text-[#8E8E8E]">Loading hedge audit…</div>;
  if (error) return <div className="text-sm text-[#DC2626] py-4">{error}</div>;

  const audit = review?.hedgeAudit;

  if (!audit) return (
    <div className="text-center py-12 text-sm text-[#8E8E8E]">
      No hedge audit data. Run an Architecture Review to generate one.
    </div>
  );

  const stack = audit.hedgeStack;
  const vs = VERDICT_STYLE[audit.verdict] ?? VERDICT_STYLE.KEEP;

  const hedgeRows = [
    { label: "Cash", tickers: stack.cash.tickers, pct: stack.cash.allocationPct },
    { label: "Gold (GLDM/GLD)", tickers: stack.gold.tickers, pct: stack.gold.allocationPct },
    { label: "Defense ETF (ITA)", tickers: stack.defense.tickers, pct: stack.defense.allocationPct },
    { label: "Broad ETF", tickers: stack.broadEtf.tickers, pct: stack.broadEtf.allocationPct },
  ];

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-white border border-[#EEEEEE] rounded-xl p-3">
          <div className="text-xs text-[#8E8E8E] mb-1">Hedge Score</div>
          <div className="text-lg font-semibold text-[#171A20]">{audit.hedgeScore}/100</div>
        </div>
        <div className="bg-white border border-[#EEEEEE] rounded-xl p-3">
          <div className="text-xs text-[#8E8E8E] mb-1">Total Hedge %</div>
          <div className="text-lg font-semibold text-[#171A20]">{stack.totalHedgePct.toFixed(1)}%</div>
        </div>
        <div className="bg-white border border-[#EEEEEE] rounded-xl p-3">
          <div className="text-xs text-[#8E8E8E] mb-1">Verdict</div>
          <span
            className="text-sm font-semibold px-2.5 py-1 rounded"
            style={{ backgroundColor: vs.bg, color: vs.text }}
          >
            {audit.verdict}
          </span>
        </div>
      </div>

      {/* Hedge Stack */}
      <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
        <div className="px-4 py-3 text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide border-b border-[#EEEEEE]">
          Current Hedge Stack
        </div>
        {hedgeRows.map(row => (
          <div key={row.label} className="flex items-center gap-4 px-4 py-3 border-b border-[#EEEEEE] last:border-0">
            <div className="w-36 text-sm text-[#5C5E62]">{row.label}</div>
            <div className="flex-1 flex items-center gap-3">
              <div className="flex gap-1 flex-wrap">
                {row.tickers.length > 0 ? row.tickers.map(t => (
                  <span key={t} className="text-xs font-semibold px-1.5 py-0.5 rounded bg-[#EEF3FD] text-[#3E6AE1]">{t}</span>
                )) : <span className="text-xs text-[#AAAAAA]">—</span>}
              </div>
            </div>
            <div className="text-sm font-semibold text-[#171A20] tabular-nums w-14 text-right">
              {row.pct.toFixed(1)}%
            </div>
          </div>
        ))}
        <div className="flex items-center gap-4 px-4 py-3 bg-[#F4F4F4]">
          <div className="w-36 text-sm font-semibold text-[#171A20]">Total Hedge</div>
          <div className="flex-1" />
          <div className="text-sm font-bold text-[#171A20] tabular-nums w-14 text-right">{stack.totalHedgePct.toFixed(1)}%</div>
        </div>
      </div>

      {/* Growth assets for context */}
      {stack.growthAssets.tickers.length > 0 && (
        <div className="bg-white border border-[#EEEEEE] rounded-xl p-4">
          <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide mb-2">Growth Assets</div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1 flex-wrap">
              {stack.growthAssets.tickers.map(t => (
                <span key={t} className="text-xs font-semibold px-1.5 py-0.5 rounded bg-[#F0FDF4] text-[#15803D]">{t}</span>
              ))}
            </div>
            <span className="text-sm font-semibold text-[#171A20]">{stack.growthAssets.allocationPct.toFixed(1)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Decision Reviews tab ─────────────────────────────────────────────────────

interface DecisionReview {
  id: string;
  ticker: string;
  thesisStatus: string;
  verdict: string;
  confidence: number;
  opportunityScore: number;
  lessonLearned: string;
  reviewDate: string;
}

const THESIS_VERDICT_STYLE: Record<string, { bg: string; text: string }> = {
  "Strengthen": { bg: "#F0FDF4", text: "#15803D" },
  "Hold":       { bg: "#EEF3FD", text: "#3E6AE1" },
  "Monitor":    { bg: "#FFFBEB", text: "#D97706" },
  "Reduce":     { bg: "#FEF9EC", text: "#92400E" },
  "Exit":       { bg: "#FEF2F2", text: "#991B1B" },
};

const THESIS_STATUS_STYLE: Record<string, { color: string }> = {
  "Confirmed":           { color: "#15803D" },
  "Partially Confirmed": { color: "#D97706" },
  "Broken":              { color: "#DC2626" },
};

function DecisionReviewsTab() {
  const [reviews, setReviews] = useState<DecisionReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/decision-review")
      .then(r => r.json())
      .then(d => setReviews(d.reviews ?? []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="py-12 text-center text-sm text-[#8E8E8E]">Loading decision reviews…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#5C5E62]">Latest decision review per position.</p>
      </div>
      {error && <div className="text-sm text-[#DC2626] bg-[#FEF2F2] border border-[#FECACA] rounded-lg px-4 py-2">{error}</div>}
      {reviews.length === 0 ? (
        <div className="text-center py-12 text-sm text-[#8E8E8E]">No decision reviews yet. Run from Automation.</div>
      ) : (
        <div className="space-y-2">
          {reviews.map(r => {
            const vs = THESIS_VERDICT_STYLE[r.verdict] ?? THESIS_VERDICT_STYLE["Hold"];
            const ts = THESIS_STATUS_STYLE[r.thesisStatus] ?? { color: "#8E8E8E" };
            return (
              <div key={r.id} className="bg-white border border-[#EEEEEE] rounded-xl px-4 py-3">
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[#171A20]">{r.ticker}</span>
                    <span
                      className="text-xs font-medium"
                      style={{ color: ts.color }}
                    >
                      {r.thesisStatus}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[11px] font-semibold px-2.5 py-0.5 rounded"
                      style={{ backgroundColor: vs.bg, color: vs.text }}
                    >
                      {r.verdict}
                    </span>
                    <span className="text-[11px] text-[#AAAAAA]">
                      {new Date(r.reviewDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-[#8E8E8E]">
                  <span>Confidence {r.confidence}/10</span>
                  <span>Opp score {r.opportunityScore}</span>
                </div>
                {r.lessonLearned && (
                  <div className="text-xs text-[#5C5E62] mt-1.5 border-l-2 border-[#EEEEEE] pl-2">{r.lessonLearned}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
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
        <p className="text-xs text-[#8E8E8E] mt-0.5">How healthy is my portfolio?</p>
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
          {tab === "holdings"     && <HoldingsTab />}
          {tab === "allocation"   && <AllocationTab />}
          {tab === "themes"       && <ThemesTab />}
          {tab === "simulator"    && <SimulatorTab />}
          {tab === "architecture" && <ArchitectureTab />}
          {tab === "hedge"        && <HedgeAuditTab />}
          {tab === "decisions"    && <DecisionReviewsTab />}
          {tab === "history"      && <HistoryTab />}
        </div>
      </div>
    </div>
  );
}
