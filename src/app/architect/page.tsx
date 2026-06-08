"use client";
import { useCallback, useEffect, useState } from "react";
import type {
  PortfolioBlueprintData, Regime, GapItem,
} from "@/lib/architect-engine";
import { validateAllocation } from "@/lib/architect-engine";
import type {
  PortfolioCapacity, OverexposureResult, BuyCandidate, SellFlag, CapitalDeployment,
} from "@/lib/architect-v2";

// ─── Design tokens ────────────────────────────────────────────────────────────

const REGIME_STYLE: Record<Regime, { bg: string; text: string; border: string; dot: string }> = {
  "Risk On":  { bg: "bg-[#eef7f1]", text: "text-[#2d7d46]",  border: "border-[#c3e6cf]", dot: "bg-[#2d7d46]" },
  "Neutral":  { bg: "bg-[#fffbeb]", text: "text-[#b45309]",  border: "border-[#fde68a]", dot: "bg-[#b45309]" },
  "Risk Off": { bg: "bg-[#fdf0ee]", text: "text-[#c0392b]",  border: "border-[#f5c6c1]", dot: "bg-[#c0392b]" },
};
const GAP_ACTION: Record<string, { bg: string; text: string; label: string }> = {
  reduce:   { bg: "bg-[#fdf0ee]", text: "text-[#c0392b]", label: "Reduce"   },
  increase: { bg: "bg-[#eef7f1]", text: "text-[#2d7d46]", label: "Increase" },
  maintain: { bg: "bg-[#F4F4F4]", text: "text-[#5C5E62]", label: "Maintain" },
};
const PRIORITY_DOT: Record<string, string> = {
  high: "bg-[#c0392b]", medium: "bg-[#b45309]", low: "bg-[#AAAAAA]",
};
const SEV_STYLE: Record<string, { bg: string; text: string }> = {
  critical: { bg: "bg-[#fdf0ee]", text: "text-[#c0392b]" },
  high:     { bg: "bg-[#fffbeb]", text: "text-[#b45309]" },
  watch:    { bg: "bg-[#EEF3FD]", text: "text-[#3E6AE1]" },
};
const CLASS_STYLE: Record<string, string> = {
  Core:        "bg-[#eef7f1] text-[#2d7d46]",
  Growth:      "bg-[#EEF3FD] text-[#3E6AE1]",
  Speculative: "bg-[#fffbeb] text-[#b45309]",
  ETF:         "bg-[#F4F4F4] text-[#5C5E62]",
};
const CONVICTION_STYLE: Record<string, string> = {
  "Strong Buy": "bg-[#eef7f1] text-[#2d7d46]",
  "Buy":        "bg-[#EEF3FD] text-[#3E6AE1]",
  "Watch":      "bg-[#F4F4F4] text-[#5C5E62]",
};
const FLAG_STYLE: Record<string, { label: string; bg: string; text: string }> = {
  weakened_thesis:    { label: "Weakened Thesis",   bg: "bg-[#fdf0ee]", text: "text-[#c0392b]" },
  oversized:          { label: "Oversized",          bg: "bg-[#fffbeb]", text: "text-[#b45309]" },
  better_alternative: { label: "Better Alternative", bg: "bg-[#EEF3FD]", text: "text-[#3E6AE1]" },
  exceeds_max:        { label: "Exceeds Max",        bg: "bg-[#fdf0ee]", text: "text-[#c0392b]" },
};

function fmt$(n: number) { return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`; }
function fmtPct(n: number) { return `${n.toFixed(1)}%`; }

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bg-[#EEEEEE] rounded-xl animate-pulse ${className}`} />;
}
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-[#EEEEEE] bg-[#FAFAFA]">
        <span className="text-[10px] font-semibold text-[#AAAAAA] tracking-widest uppercase">{label}</span>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────

type Tab = "blueprint" | "capital" | "capacity" | "overexposure" | "buy" | "sell";

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string }[] = [
    { id: "blueprint",    label: "Blueprint"    },
    { id: "capital",      label: "New Capital"  },
    { id: "capacity",     label: "Capacity"     },
    { id: "overexposure", label: "Overexposure" },
    { id: "buy",          label: "Buy Ranking"  },
    { id: "sell",         label: "Sell Review"  },
  ];
  return (
    <div className="flex border-b border-[#EEEEEE] bg-white px-5 overflow-x-auto">
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            active === t.id
              ? "border-[#171A20] text-[#171A20]"
              : "border-transparent text-[#8E8E8E] hover:text-[#5C5E62]"
          }`}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── Blueprint tab ────────────────────────────────────────────────────────────

function AllocationBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 text-xs text-[#5C5E62] text-right shrink-0">{label}</div>
      <div className="flex-1 bg-[#EEEEEE] rounded-full h-2 relative overflow-hidden">
        <div className="absolute left-0 top-0 h-2 rounded-full transition-all"
          style={{ width: `${Math.min(100, pct)}%`, background: color }} />
      </div>
      <div className="w-10 text-xs font-mono text-[#171A20] shrink-0">{fmtPct(pct)}</div>
    </div>
  );
}
function RuleCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#EEEEEE] rounded-lg p-3 text-center">
      <p className="text-lg font-bold text-[#171A20]">{value}</p>
      <p className="text-[10px] text-[#AAAAAA] mt-0.5">{label}</p>
    </div>
  );
}

function BlueprintTab({ blueprint, regime, onGenerate, generating }: {
  blueprint: PortfolioBlueprintData;
  regime: Regime;
  onGenerate: () => void;
  generating: boolean;
}) {
  const rs = REGIME_STYLE[regime];
  const ta = blueprint.targetAllocation;
  const gaps = blueprint.gapAnalysis;

  return (
    <div className="p-5 lg:p-6 space-y-4 max-w-3xl">
      <div className="bg-white border border-[#EEEEEE] rounded-xl p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border ${rs.bg} ${rs.border} mb-2`}>
              <span className={`w-2 h-2 rounded-full ${rs.dot}`} />
              <span className={`text-sm font-semibold ${rs.text}`}>{regime}</span>
            </div>
            <p className="text-xs text-[#AAAAAA]">
              Blueprint · Updated {new Date(blueprint.blueprintDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </p>
          </div>
          <button onClick={onGenerate} disabled={generating}
            className="text-sm px-4 py-2 rounded-lg bg-[#171A20] text-white hover:bg-[#333] disabled:opacity-50 font-medium">
            {generating ? "Generating…" : "Regenerate"}
          </button>
        </div>
      </div>

      <Section label="Target Allocation">
        {(() => {
          const v = validateAllocation(ta);
          return (
            <div className="space-y-3">
              <AllocationBar label="Large Cap"     pct={ta.largeCap}      color="#3E6AE1" />
              <AllocationBar label="Mid Cap"       pct={ta.midCap}        color="#7c3aed" />
              <AllocationBar label="Small Cap"     pct={ta.smallCap}      color="#b45309" />
              <AllocationBar label="International" pct={ta.international} color="#2d7d46" />
              <AllocationBar label="Hedge"         pct={ta.hedge}         color="#8E8E8E" />
              <AllocationBar label="Cash"          pct={ta.cash}          color="#AAAAAA" />
              <div className={`flex items-center justify-between pt-2 border-t border-[#EEEEEE] text-xs font-semibold ${v.valid ? "text-[#2d7d46]" : "text-[#c0392b]"}`}>
                <span>Total</span>
                <span>{v.total}%{!v.valid && " ⚠ expected 100%"}</span>
              </div>
              {!v.valid && (
                <p className="text-xs text-[#c0392b] bg-[#fdf0ee] rounded px-2 py-1">
                  Allocation mismatch: {v.message}
                </p>
              )}
            </div>
          );
        })()}
      </Section>

      <Section label="Gap Analysis">
        {gaps.length === 0
          ? <p className="text-sm text-[#2d7d46]">Portfolio aligned with blueprint.</p>
          : <div className="space-y-3">
              {gaps.slice(0, 8).map((g: GapItem, i: number) => {
                const ga = GAP_ACTION[g.action] ?? GAP_ACTION.maintain;
                return (
                  <div key={i} className="flex items-start gap-3">
                    <span className={`shrink-0 mt-1 w-2 h-2 rounded-full ${PRIORITY_DOT[g.priority]}`} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="text-sm font-medium text-[#171A20]">{g.dimension}</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${ga.bg} ${ga.text}`}>{ga.label}</span>
                        <span className="text-xs text-[#AAAAAA]">{fmtPct(g.current)} → {fmtPct(g.target)}</span>
                      </div>
                      <p className="text-xs text-[#8E8E8E]">{g.reason}</p>
                    </div>
                  </div>
                );
              })}
            </div>
        }
      </Section>

      <Section label="Concentration Rules">
        <div className="grid grid-cols-3 gap-4">
          <RuleCard label="Max Positions"   value={String(blueprint.concentrationRules.maxPositions)} />
          <RuleCard label="Max Single Stock" value={fmtPct(blueprint.concentrationRules.maxSingleStockPct)} />
          <RuleCard label="Max Sector"      value={fmtPct(blueprint.concentrationRules.maxSectorPct)} />
        </div>
        <p className="text-xs text-[#AAAAAA] mt-3">{blueprint.concentrationRules.rationale}</p>
      </Section>
    </div>
  );
}

// ─── Capital tab ──────────────────────────────────────────────────────────────

function CapitalTab() {
  const PRESETS = [500, 1000, 2500, 5000];
  const [amount, setAmount] = useState(1000);
  const [custom, setCustom] = useState("");
  const [result, setResult] = useState<CapitalDeployment | null>(null);
  const [loading, setLoading] = useState(false);

  const compute = useCallback(async (amt: number) => {
    setLoading(true);
    try {
      const r = await fetch("/api/architect/capital", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt }),
      });
      setResult(await r.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { compute(amount); }, [amount, compute]);

  return (
    <div className="p-5 lg:p-6 max-w-2xl">
      <div className="bg-white border border-[#EEEEEE] rounded-xl p-5 mb-5">
        <p className="text-sm font-medium text-[#171A20] mb-3">I have this much to deploy:</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {PRESETS.map(p => (
            <button key={p} onClick={() => { setAmount(p); setCustom(""); }}
              className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                amount === p && !custom
                  ? "bg-[#171A20] text-white border-[#171A20]"
                  : "bg-white text-[#5C5E62] border-[#EEEEEE] hover:border-[#171A20]"
              }`}>
              {fmt$(p)}
            </button>
          ))}
          <div className="flex items-center gap-1">
            <span className="text-sm text-[#AAAAAA]">$</span>
            <input type="number" placeholder="Custom…" value={custom}
              onChange={e => setCustom(e.target.value)}
              onBlur={() => { const v = Number(custom); if (v > 0) { setAmount(v); compute(v); } }}
              onKeyDown={e => { if (e.key === "Enter") { const v = Number(custom); if (v > 0) { setAmount(v); compute(v); } } }}
              className="w-24 px-2 py-1.5 text-sm border border-[#EEEEEE] rounded-lg focus:outline-none focus:border-[#171A20]"
            />
          </div>
        </div>
      </div>

      {loading && <Skeleton className="h-64" />}
      {result && !loading && (
        <div className="space-y-4">
          <div className="bg-white border border-[#EEEEEE] rounded-xl p-5">
            <p className="text-sm font-medium text-[#171A20] mb-1">Recommended Deployment</p>
            <p className="text-xs text-[#8E8E8E]">{result.summary}</p>
          </div>
          <Section label="Allocation Breakdown">
            <div className="space-y-3">
              {result.allocations.map((a, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-14 text-[11px] font-mono font-bold text-[#171A20]">{a.ticker}</div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-[#5C5E62]">{a.companyName}</span>
                      <span className="text-sm font-bold text-[#171A20]">{fmt$(a.dollarAmount)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-[#EEEEEE] rounded-full h-1.5 overflow-hidden">
                        <div className="h-full rounded-full bg-[#3E6AE1]" style={{ width: `${a.pct}%` }} />
                      </div>
                      <span className="text-[10px] text-[#AAAAAA] w-8">{fmtPct(a.pct)}</span>
                    </div>
                    <p className="text-[10px] text-[#AAAAAA] mt-0.5">{a.reason}</p>
                  </div>
                  {a.committeeConviction && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${CONVICTION_STYLE[a.committeeConviction] ?? "bg-[#F4F4F4] text-[#5C5E62]"}`}>
                      {a.committeeConviction}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}

// ─── Capacity tab ─────────────────────────────────────────────────────────────

function CapacityTab({ capacity }: { capacity: PortfolioCapacity | null }) {
  if (!capacity) return <div className="p-6"><Skeleton className="h-64" /></div>;

  const slotPct = (capacity.currentCount / capacity.maxPositions) * 100;
  const slotColor = slotPct >= 90 ? "#c0392b" : slotPct >= 75 ? "#b45309" : "#2d7d46";

  return (
    <div className="p-5 lg:p-6 max-w-3xl space-y-4">
      <div className="bg-white border border-[#EEEEEE] rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-2xl font-bold text-[#171A20]">
              {capacity.currentCount}
              <span className="text-sm font-normal text-[#AAAAAA]">/{capacity.maxPositions}</span>
            </p>
            <p className="text-xs text-[#AAAAAA]">
              positions used · {capacity.availableSlots} slot{capacity.availableSlots !== 1 ? "s" : ""} available
            </p>
          </div>
          <p className="text-sm font-medium" style={{ color: slotColor }}>{capacity.utilizationPct}% utilized</p>
        </div>
        <div className="h-2 bg-[#EEEEEE] rounded-full overflow-hidden mb-3">
          <div className="h-full rounded-full transition-all"
            style={{ width: `${Math.min(100, slotPct)}%`, background: slotColor }} />
        </div>
        <p className="text-xs text-[#5C5E62]">{capacity.recommendation}</p>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {(["Core", "Growth", "Speculative", "ETF"] as const).map(cls => {
          const count = capacity.breakdown[cls.toLowerCase() as keyof typeof capacity.breakdown];
          const clrMap: Record<string, string> = { Core: "text-[#2d7d46]", Growth: "text-[#3E6AE1]", Speculative: "text-[#b45309]", ETF: "text-[#8E8E8E]" };
          return (
            <div key={cls} className="bg-white border border-[#EEEEEE] rounded-xl p-3 text-center">
              <p className={`text-xl font-bold ${clrMap[cls]}`}>{count}</p>
              <p className="text-[10px] text-[#AAAAAA]">{cls}</p>
            </div>
          );
        })}
      </div>

      <Section label="Positions">
        <div className="border border-[#EEEEEE] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#FAFAFA] border-b border-[#EEEEEE]">
                {["Position", "Class", "Alloc", "Max", "Status"].map(h => (
                  <th key={h} className={`px-4 py-2 text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-wide ${h === "Position" ? "text-left" : "text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {capacity.positions.map(p => (
                <tr key={p.ticker} className="border-t border-[#EEEEEE]">
                  <td className="px-4 py-2">
                    <span className="font-semibold text-[#171A20]">{p.ticker}</span>
                    <span className="text-[#AAAAAA] ml-2 text-xs">{p.name}</span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${CLASS_STYLE[p.classification] ?? ""}`}>{p.classification}</span>
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-[#171A20]">{fmtPct(p.allocationPct)}</td>
                  <td className="px-4 py-2 text-right font-mono text-[#AAAAAA]">{fmtPct(p.maxPct)}</td>
                  <td className="px-4 py-2 text-right">
                    {p.isOverweight
                      ? <span className="text-[10px] font-semibold text-[#c0392b] bg-[#fdf0ee] px-1.5 py-0.5 rounded">Overweight</span>
                      : <span className="text-[10px] text-[#2d7d46]">OK</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

// ─── Overexposure tab ─────────────────────────────────────────────────────────

function OverexposureTab({ data }: { data: OverexposureResult | null }) {
  if (!data) return <div className="p-6"><Skeleton className="h-64" /></div>;

  return (
    <div className="p-5 lg:p-6 max-w-3xl space-y-4">
      <div className="bg-white border border-[#EEEEEE] rounded-xl p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <p className="text-sm text-[#5C5E62]">{data.summary}</p>
          <div className="shrink-0 text-right">
            <p className="text-xs text-[#AAAAAA]">AI Exposure</p>
            <p className={`text-lg font-bold ${data.aiExposurePct > 40 ? "text-[#c0392b]" : data.aiExposurePct > 30 ? "text-[#b45309]" : "text-[#2d7d46]"}`}>
              {fmtPct(data.aiExposurePct)}
            </p>
          </div>
        </div>
      </div>

      {data.items.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-sm text-[#2d7d46] font-medium">No overexposure detected.</p>
          <p className="text-xs text-[#AAAAAA] mt-1">All sector, theme, and single-stock concentrations within guidelines.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.items.map((item, i) => {
            const ss = SEV_STYLE[item.severity] ?? SEV_STYLE.watch;
            const barColor = item.severity === "critical" ? "#c0392b" : item.severity === "high" ? "#b45309" : "#3E6AE1";
            return (
              <div key={i} className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden flex">
                <div className="w-1 self-stretch" style={{ background: barColor }} />
                <div className="flex-1 p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-[#171A20]">{item.name}</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${ss.bg} ${ss.text}`}>{item.severity.toUpperCase()}</span>
                      <span className="text-[10px] px-1.5 py-0.5 bg-[#F4F4F4] text-[#5C5E62] rounded capitalize">{item.dimension.replace("_", " ")}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-base font-bold ${ss.text}`}>{fmtPct(item.exposurePct)}</p>
                      <p className="text-[10px] text-[#AAAAAA]">threshold: {fmtPct(item.threshold)}</p>
                    </div>
                  </div>
                  <p className="text-sm text-[#5C5E62] mb-2">{item.recommendation}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {item.tickers.map(t => (
                      <span key={t} className="text-[10px] font-mono font-semibold px-2 py-0.5 bg-[#F4F4F4] text-[#5C5E62] rounded border border-[#EEEEEE]">{t}</span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {data.sectorConcentration.length > 0 && (
        <Section label="Sector Breakdown">
          <div className="space-y-2">
            {data.sectorConcentration.slice(0, 8).map(s => (
              <div key={s.sector} className="flex items-center gap-3">
                <div className="w-32 text-xs text-[#5C5E62] text-right truncate shrink-0">{s.sector}</div>
                <div className="flex-1 bg-[#EEEEEE] rounded-full h-1.5 overflow-hidden">
                  <div className="h-full rounded-full"
                    style={{ width: `${Math.min(100, s.pct)}%`, background: s.pct > 40 ? "#c0392b" : s.pct > 25 ? "#b45309" : "#3E6AE1" }} />
                </div>
                <div className="w-10 text-xs font-mono text-[#171A20] shrink-0">{fmtPct(s.pct)}</div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ─── Buy Ranking tab ──────────────────────────────────────────────────────────

function BuyRankingTab({ candidates }: { candidates: BuyCandidate[] | null }) {
  if (!candidates) return <div className="p-6"><Skeleton className="h-64" /></div>;

  return (
    <div className="p-5 lg:p-6 max-w-3xl">
      <p className="text-xs text-[#AAAAAA] mb-4">
        Top buy candidates ranked by composite score (Committee 40% · Opportunity 30% · Discovery 30%).
      </p>
      {candidates.length === 0 ? (
        <div className="text-center py-10 text-sm text-[#AAAAAA]">No candidates. Run committee sessions and discovery refresh.</div>
      ) : (
        <div className="space-y-3">
          {candidates.map(c => (
            <div key={c.ticker} className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden hover:border-[#3E6AE1] transition-colors">
              <div className="flex items-stretch">
                <div className="w-10 flex items-center justify-center border-r border-[#EEEEEE] shrink-0">
                  <span className="text-xs font-bold text-[#AAAAAA]">#{c.rank}</span>
                </div>
                <div className="flex-1 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-bold text-[#171A20]">{c.ticker}</span>
                        <span className="text-xs text-[#8E8E8E]">{c.companyName}</span>
                        {c.committeeConviction && (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${CONVICTION_STYLE[c.committeeConviction] ?? "bg-[#F4F4F4] text-[#5C5E62]"}`}>
                            {c.committeeConviction}
                          </span>
                        )}
                        {c.inResearchQueue && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-[#f3eef9] text-[#7c3aed] rounded font-medium">In Queue</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {c.reasons.map((r, j) => (
                          <span key={j} className="text-[10px] text-[#AAAAAA]">{j > 0 ? "· " : ""}{r}</span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-base font-bold text-[#3E6AE1]">{c.compositeScore}</p>
                      <p className="text-[10px] text-[#AAAAAA]">score</p>
                      <p className="text-xs text-[#2d7d46] font-medium mt-1">Start: {fmtPct(c.suggestedStarterPct)}</p>
                    </div>
                  </div>
                  <div className="flex gap-3 mt-2 text-[10px] text-[#AAAAAA]">
                    {c.discoveryScore != null && <span>Discovery: {Math.round(c.discoveryScore)}/100</span>}
                    {c.opportunityScore != null && <span>Opportunity: {c.opportunityScore.toFixed(0)}/100</span>}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sell Review tab ──────────────────────────────────────────────────────────

function SellReviewTab({ flags }: { flags: SellFlag[] | null }) {
  if (!flags) return <div className="p-6"><Skeleton className="h-64" /></div>;

  return (
    <div className="p-5 lg:p-6 max-w-3xl">
      <p className="text-xs text-[#AAAAAA] mb-4">
        Positions flagged for review. This is NOT a sell recommendation — it is a watchlist for disciplined position management.
      </p>
      {flags.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-sm text-[#2d7d46] font-medium">No positions flagged for review.</p>
          <p className="text-xs text-[#AAAAAA] mt-1">All holdings within guidelines.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {flags.map(f => (
            <div key={f.ticker} className="bg-white border border-[#EEEEEE] rounded-xl p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-bold text-[#171A20]">{f.ticker}</span>
                    <span className="text-xs text-[#8E8E8E]">{f.name}</span>
                  </div>
                  <p className="text-xs text-[#AAAAAA]">Current: {fmtPct(f.currentPct)}</p>
                </div>
                {f.flags.some(fl => fl.severity === "high") && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#fdf0ee] text-[#c0392b]">HIGH PRIORITY</span>
                )}
              </div>
              <div className="space-y-2 mb-3">
                {f.flags.map((fl, i) => {
                  const fs = FLAG_STYLE[fl.type] ?? { label: fl.type, bg: "bg-[#F4F4F4]", text: "text-[#5C5E62]" };
                  return (
                    <div key={i} className="flex items-start gap-2">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${fs.bg} ${fs.text}`}>{fs.label}</span>
                      <p className="text-xs text-[#5C5E62]">{fl.detail}</p>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs font-medium text-[#5C5E62] border-t border-[#EEEEEE] pt-2">{f.recommendation}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type V2Data = {
  capacity: PortfolioCapacity;
  overexposure: OverexposureResult;
  buyRanking: BuyCandidate[];
  sellReview: SellFlag[];
};

export default function ArchitectPage() {
  const [tab, setTab] = useState<Tab>("blueprint");
  const [blueprint, setBlueprint] = useState<(PortfolioBlueprintData & { id: string; createdAt: Date }) | null>(null);
  const [v2, setV2] = useState<V2Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [bpRes, v2Res] = await Promise.all([
        fetch("/api/architect"),
        fetch("/api/architect/v2"),
      ]);
      const bpJson = await bpRes.json();
      const v2Json = await v2Res.json();
      setBlueprint(bpJson.blueprint ?? null);
      if (!v2Json.error) setV2(v2Json as V2Data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const r = await fetch("/api/architect", { method: "POST" });
      const json = await r.json();
      setBlueprint(json.blueprint);
      const v2Res = await fetch("/api/architect/v2");
      const v2Json = await v2Res.json();
      if (!v2Json.error) setV2(v2Json as V2Data);
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F7F7]">
        <div className="bg-white border-b border-[#EEEEEE] px-5 lg:px-6 py-4">
          <h1 className="text-lg font-semibold text-[#171A20]">Portfolio Architect</h1>
        </div>
        <div className="p-5 lg:p-6 space-y-4 max-w-3xl">
          <Skeleton className="h-20" />
          <Skeleton className="h-40" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!blueprint) {
    return (
      <div className="min-h-screen bg-[#F7F7F7]">
        <div className="bg-white border-b border-[#EEEEEE] px-5 lg:px-6 py-4">
          <h1 className="text-lg font-semibold text-[#171A20]">Portfolio Architect</h1>
          <p className="text-xs text-[#AAAAAA] mt-0.5">Phase 12C · Rules-based portfolio construction</p>
        </div>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center p-8">
            <p className="text-sm text-[#AAAAAA] mb-4">No blueprint generated yet.</p>
            <button onClick={handleGenerate} disabled={generating}
              className="text-sm px-6 py-3 rounded-lg bg-[#171A20] text-white hover:bg-[#333] disabled:opacity-50 font-medium">
              {generating ? "Generating…" : "Generate Blueprint"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const regime = blueprint.marketRegime as Regime;

  return (
    <div className="min-h-screen bg-[#F7F7F7]">
      <div className="bg-white border-b border-[#EEEEEE]">
        <div className="max-w-5xl mx-auto">
          <div className="px-5 lg:px-6 py-4">
            <h1 className="text-lg font-semibold text-[#171A20]">Portfolio Architect</h1>
            <p className="text-xs text-[#AAAAAA] mt-0.5">Phase 12C · Rules-based portfolio construction</p>
          </div>
          <TabBar active={tab} onChange={setTab} />
        </div>
      </div>

      <div className="max-w-5xl mx-auto">
        {tab === "blueprint"    && <BlueprintTab blueprint={blueprint} regime={regime} onGenerate={handleGenerate} generating={generating} />}
        {tab === "capital"      && <CapitalTab />}
        {tab === "capacity"     && <CapacityTab capacity={v2?.capacity ?? null} />}
        {tab === "overexposure" && <OverexposureTab data={v2?.overexposure ?? null} />}
        {tab === "buy"          && <BuyRankingTab candidates={v2?.buyRanking ?? null} />}
        {tab === "sell"         && <SellReviewTab flags={v2?.sellReview ?? null} />}
      </div>
    </div>
  );
}
