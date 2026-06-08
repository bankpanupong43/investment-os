"use client";
import { useCallback, useEffect, useState } from "react";
import type {
  DiscoveryRadarResult,
  TieredCandidate,
  PortfolioGap,
} from "@/lib/discovery-radar";
import type { ThemeSummary, RadarSignal } from "@/lib/radar-engine";

// ─── Design tokens ────────────────────────────────────────────────────────────

const TIER_STYLE: Record<string, { bg: string; text: string; border: string; label: string; description: string }> = {
  A: { bg: "bg-[#fdf0ee]", text: "text-[#c0392b]", border: "border-[#f5c6c1]", label: "Tier A", description: "Research immediately · Score 80+" },
  B: { bg: "bg-[#fffbeb]", text: "text-[#b45309]", border: "border-[#fde68a]", label: "Tier B", description: "Monitor · Score 65–79" },
  C: { bg: "bg-[#EEF3FD]", text: "text-[#3E6AE1]", border: "border-[#d0dff8]", label: "Tier C", description: "Interesting but early · Score 50–64" },
};

const CATEGORY_COLOR: Record<string, string> = {
  "Small Cap Compounder": "bg-[#eef7f1] text-[#2d7d46]",
  "Mid Cap Compounder":   "bg-[#EEF3FD] text-[#3E6AE1]",
  "Emerging Leader":      "bg-[#fffbeb] text-[#b45309]",
  "Turnaround":           "bg-[#fdf0ee] text-[#c0392b]",
  "Theme Beneficiary":    "bg-[#f3eef9] text-[#7c3aed]",
  "Quality Compounder":   "bg-[#eef7f1] text-[#2d7d46]",
  "Discovery":            "bg-[#F4F4F4] text-[#5C5E62]",
};

const CONFIDENCE_STYLE: Record<string, string> = {
  high:   "bg-[#eef7f1] text-[#2d7d46]",
  medium: "bg-[#fffbeb] text-[#b45309]",
  low:    "bg-[#F4F4F4] text-[#8E8E8E]",
};

const GAP_SEVERITY_STYLE: Record<string, { bar: string; badge: string; text: string }> = {
  high:   { bar: "bg-[#c0392b]", badge: "bg-[#fdf0ee] text-[#c0392b]", text: "text-[#c0392b]" },
  medium: { bar: "bg-[#b45309]", badge: "bg-[#fffbeb] text-[#b45309]", text: "text-[#b45309]" },
  low:    { bar: "bg-[#8E8E8E]", badge: "bg-[#F4F4F4] text-[#8E8E8E]",  text: "text-[#8E8E8E]"  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMcap(m: number | null): string {
  if (m == null || m === 0) return "—";
  if (m >= 1_000_000) return `$${(m / 1_000_000).toFixed(1)}T`;
  if (m >= 1_000) return `$${(m / 1_000).toFixed(0)}B`;
  return `$${m.toFixed(0)}M`;
}

function ScoreDot({ score }: { score: number }) {
  const color = score >= 80 ? "#c0392b" : score >= 65 ? "#b45309" : "#3E6AE1";
  return (
    <span
      className="inline-flex items-center justify-center w-10 h-10 rounded-full text-sm font-bold text-white"
      style={{ background: color }}
    >
      {score}
    </span>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bg-[#EEEEEE] rounded-xl animate-pulse ${className}`} />;
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────

type Tab = "tierA" | "tierB" | "tierC" | "themes" | "gaps";

function TabBar({
  active, onChange, counts,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
  counts: { tierA: number; tierB: number; tierC: number; themes: number; gaps: number };
}) {
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "tierA",  label: "Tier A",        count: counts.tierA  },
    { id: "tierB",  label: "Tier B",        count: counts.tierB  },
    { id: "tierC",  label: "Tier C",        count: counts.tierC  },
    { id: "themes", label: "Themes",        count: counts.themes },
    { id: "gaps",   label: "Portfolio Gaps", count: counts.gaps  },
  ];
  return (
    <div className="flex border-b border-[#EEEEEE] bg-white px-5 overflow-x-auto">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            active === t.id
              ? "border-[#171A20] text-[#171A20]"
              : "border-transparent text-[#8E8E8E] hover:text-[#5C5E62]"
          }`}
        >
          {t.label}
          {t.count != null && t.count > 0 && (
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
              active === t.id ? "bg-[#171A20] text-white" : "bg-[#EEEEEE] text-[#8E8E8E]"
            }`}>
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Candidate card ───────────────────────────────────────────────────────────

function CandidateCard({ c, onPromote, promoting }: {
  c: TieredCandidate;
  onPromote: (ticker: string) => void;
  promoting: string | null;
}) {
  const ts = TIER_STYLE[c.tier];
  const catStyle = CATEGORY_COLOR[c.discoveryCategory] ?? "bg-[#F4F4F4] text-[#5C5E62]";
  const confStyle = CONFIDENCE_STYLE[c.confidence] ?? CONFIDENCE_STYLE.low;
  const signals: RadarSignal[] = c.signals ?? [];
  const topSignals = signals.slice(0, 3);

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden hover:border-[#3E6AE1] transition-colors">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#EEEEEE]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <ScoreDot score={Math.round(c.radarScore)} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-base font-semibold text-[#171A20]">{c.ticker}</span>
                <span className="text-sm text-[#8E8E8E] truncate max-w-[200px]">{c.companyName}</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${ts.bg} ${ts.text} ${ts.border}`}>
                  {ts.label}
                </span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${catStyle}`}>
                  {c.discoveryCategory}
                </span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${confStyle}`}>
                  {c.confidence.toUpperCase()}
                </span>
                <span className="text-[11px] text-[#AAAAAA]">{fmtMcap(c.marketCap)}</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => onPromote(c.ticker)}
            disabled={promoting === c.ticker || c.status === "promoted"}
            className={`text-[11px] px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 ${
              c.status === "promoted"
                ? "bg-[#eef7f1] text-[#2d7d46] cursor-default"
                : "bg-[#171A20] text-white hover:bg-[#333] disabled:opacity-50"
            }`}
          >
            {c.status === "promoted" ? "In Queue" : promoting === c.ticker ? "Adding…" : "Add to Queue"}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-4">
        <p className="text-sm text-[#5C5E62] mb-3 leading-relaxed">{c.discoveryReason}</p>

        {/* Themes */}
        {c.themes.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {c.themes.map(th => (
              <span key={th} className="text-[10px] px-2 py-0.5 bg-[#F4F4F4] text-[#5C5E62] rounded-full border border-[#EEEEEE]">
                {th}
              </span>
            ))}
          </div>
        )}

        {/* Top signals */}
        {topSignals.length > 0 && (
          <div className="space-y-1.5">
            {topSignals.map((sig, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-[#8E8E8E]">{sig.label}</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[#5C5E62]">{sig.value}</span>
                  <span className={`text-[10px] px-1 py-0.5 rounded font-semibold ${
                    sig.weight >= 10 ? "bg-[#eef7f1] text-[#2d7d46]" :
                    sig.weight >= 5  ? "bg-[#fffbeb] text-[#b45309]" :
                    "bg-[#F4F4F4] text-[#8E8E8E]"
                  }`}>
                    +{sig.weight}pts
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tier tab ─────────────────────────────────────────────────────────────────

function TierTab({
  tier, candidates, promoting, onPromote, onRefresh,
}: {
  tier: "A" | "B" | "C";
  candidates: TieredCandidate[];
  promoting: string | null;
  onPromote: (ticker: string) => void;
  onRefresh: () => void;
}) {
  const ts = TIER_STYLE[tier];
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await fetch("/api/discovery", { method: "POST" });
      onRefresh();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="p-5 lg:p-6">
      {/* Tier header */}
      <div className={`flex items-center justify-between mb-5 p-4 rounded-xl border ${ts.bg} ${ts.border}`}>
        <div>
          <p className={`text-sm font-semibold ${ts.text}`}>{ts.label} — {ts.description}</p>
          <p className="text-xs text-[#8E8E8E] mt-0.5">{candidates.length} candidate{candidates.length !== 1 ? "s" : ""}</p>
        </div>
        {tier === "A" && (
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="text-sm px-4 py-2 rounded-lg bg-[#171A20] text-white hover:bg-[#333] disabled:opacity-50 font-medium"
          >
            {refreshing ? "Refreshing…" : "Run Discovery"}
          </button>
        )}
      </div>

      {candidates.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-[#AAAAAA] text-sm mb-2">No {ts.label} candidates yet.</p>
          <p className="text-[11px] text-[#AAAAAA]">Run Discovery to surface new candidates.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {candidates.map(c => (
            <CandidateCard key={c.ticker} c={c} onPromote={onPromote} promoting={promoting} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Themes tab ───────────────────────────────────────────────────────────────

function ThemesTab({ themes }: { themes: ThemeSummary[] }) {
  return (
    <div className="p-5 lg:p-6">
      {themes.length === 0 ? (
        <div className="text-center py-12 text-sm text-[#AAAAAA]">
          No theme data. Run Discovery to generate candidates.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {themes.map(t => (
            <div key={t.theme} className="bg-white border border-[#EEEEEE] rounded-xl p-5 hover:border-[#3E6AE1] transition-colors">
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-sm font-semibold text-[#171A20] leading-snug">{t.theme}</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#EEF3FD] text-[#3E6AE1] shrink-0 ml-2">
                  {Math.round(t.avgScore)}/100
                </span>
              </div>
              <p className="text-xs text-[#8E8E8E] mb-3 leading-relaxed">{t.description}</p>
              <div className="flex items-center justify-between text-xs mb-3">
                <span className="text-[#AAAAAA]">{t.candidateCount} candidate{t.candidateCount !== 1 ? "s" : ""}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {t.topTickers.map(tk => (
                  <span key={tk} className="text-[10px] px-2 py-0.5 bg-[#F4F4F4] text-[#5C5E62] rounded font-mono font-semibold border border-[#EEEEEE]">
                    {tk}
                  </span>
                ))}
              </div>
              {/* Score bar */}
              <div className="mt-3 h-1 bg-[#EEEEEE] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#3E6AE1] transition-all"
                  style={{ width: `${Math.min(100, t.avgScore)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Portfolio Gaps tab ───────────────────────────────────────────────────────

function PortfolioGapsTab({ gaps }: { gaps: PortfolioGap[] }) {
  return (
    <div className="p-5 lg:p-6">
      {gaps.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-[#2d7d46] font-medium">No significant portfolio gaps detected.</p>
          <p className="text-xs text-[#AAAAAA] mt-1">Portfolio appears well-allocated across buckets and themes.</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-[#AAAAAA] mb-4">
            {gaps.length} gap{gaps.length !== 1 ? "s" : ""} detected — sorted by severity.
          </p>
          <div className="space-y-4">
            {gaps.map((gap, i) => {
              const gs = GAP_SEVERITY_STYLE[gap.severity];
              return (
                <div key={i} className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
                  <div className="flex items-center gap-0">
                    <div className={`w-1 self-stretch ${gs.bar}`} />
                    <div className="flex-1 p-5">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-semibold text-[#171A20]">{gap.name}</h3>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${gs.badge}`}>
                            {gap.severity.toUpperCase()}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 bg-[#F4F4F4] text-[#5C5E62] rounded capitalize">
                            {gap.type}
                          </span>
                        </div>
                        {gap.type === "bucket" && (
                          <div className="text-right shrink-0">
                            <p className={`text-sm font-bold ${gs.text}`}>
                              {gap.drift > 0 ? "+" : ""}{gap.drift.toFixed(1)}%
                            </p>
                            <p className="text-[10px] text-[#AAAAAA]">drift from target</p>
                          </div>
                        )}
                      </div>

                      <p className="text-sm text-[#5C5E62] mb-3">{gap.description}</p>

                      {gap.type === "bucket" && (
                        <div className="flex items-center gap-4 text-xs text-[#8E8E8E] mb-3">
                          <span>Current: <strong className="text-[#5C5E62]">{gap.currentPct.toFixed(1)}%</strong></span>
                          <span>Target: <strong className="text-[#5C5E62]">{gap.targetPct.toFixed(1)}%</strong></span>
                        </div>
                      )}

                      {gap.suggestedTickers.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-wide mb-1.5">Suggested from Radar</p>
                          <div className="flex flex-wrap gap-1.5">
                            {gap.suggestedTickers.map(tk => (
                              <span key={tk} className="text-[11px] px-2 py-0.5 bg-[#EEF3FD] text-[#3E6AE1] rounded font-mono font-semibold">
                                {tk}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Summary bar ──────────────────────────────────────────────────────────────

function SummaryBar({ summary, newThisWeek }: {
  summary: DiscoveryRadarResult["summary"];
  newThisWeek: number;
}) {
  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl p-4 mx-5 lg:mx-6 mt-5 mb-0">
      <div className="flex flex-wrap gap-4">
        <SumPill label="Total Candidates" value={String(summary.totalCandidates)} color="text-[#171A20]" />
        <SumPill label="Tier A (Research Now)" value={String(summary.tierACount)} color="text-[#c0392b]" />
        <SumPill label="Tier B (Monitor)" value={String(summary.tierBCount)} color="text-[#b45309]" />
        <SumPill label="Tier C (Early)" value={String(summary.tierCCount)} color="text-[#3E6AE1]" />
        <SumPill label="New This Week" value={String(newThisWeek)} color="text-[#8E8E8E]" />
        {summary.topTheme && (
          <div className="flex flex-col">
            <span className="text-[10px] text-[#AAAAAA] mb-0.5">Top Theme</span>
            <span className="text-sm font-semibold text-[#7c3aed]">{summary.topTheme}</span>
          </div>
        )}
        {summary.researchQueueAdded > 0 && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="w-1.5 h-1.5 rounded-full bg-[#2d7d46]" />
            <span className="text-xs text-[#2d7d46] font-medium">{summary.researchQueueAdded} added to Research Queue</span>
          </div>
        )}
      </div>
    </div>
  );
}

function SumPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-[#AAAAAA] mb-0.5">{label}</span>
      <span className={`text-lg font-bold ${color}`}>{value}</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DiscoveryPage() {
  const [tab, setTab] = useState<Tab>("tierA");
  const [data, setData] = useState<DiscoveryRadarResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [promoting, setPromoting] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/discovery")
      .then(r => {
        if (!r.ok) throw new Error("Failed to load discovery data.");
        return r.json();
      })
      .then((d: DiscoveryRadarResult) => {
        setData(d);
        setLoading(false);
      })
      .catch(e => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handlePromote(ticker: string) {
    setPromoting(ticker);
    try {
      await fetch("/api/radar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, status: "promoted" }),
      });
      load();
    } finally {
      setPromoting(null);
    }
  }

  const counts = data
    ? {
        tierA: data.tierA.length,
        tierB: data.tierB.length,
        tierC: data.tierC.length,
        themes: data.themes.length,
        gaps: data.portfolioGaps.length,
      }
    : { tierA: 0, tierB: 0, tierC: 0, themes: 0, gaps: 0 };

  return (
    <div className="min-h-screen bg-[#F7F7F7]">
      {/* Page header */}
      <div className="bg-white border-b border-[#EEEEEE]">
        <div className="max-w-6xl mx-auto">
          <div className="px-5 lg:px-6 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-[#171A20]">Discovery Radar</h1>
              <p className="text-xs text-[#AAAAAA] mt-0.5">Phase 12B · Research pipeline — what to study next</p>
            </div>
            {data && (
              <p className="text-[11px] text-[#AAAAAA]">
                Updated {new Date(data.summary.generatedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </div>
          <TabBar active={tab} onChange={setTab} counts={counts} />
        </div>
      </div>

      <div className="max-w-6xl mx-auto">
        {loading && (
          <div className="p-5 lg:p-6 space-y-4">
            <Skeleton className="h-16" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48" />)}
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="p-6">
            <div className="bg-[#fdf0ee] border border-[#f5c6c1] rounded-xl p-5">
              <p className="text-sm text-[#c0392b] font-medium mb-3">{error}</p>
              <button
                onClick={load}
                className="text-sm px-4 py-2 rounded-lg bg-[#171A20] text-white hover:bg-[#333] transition-colors font-medium"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {data && !loading && (
          <>
            <SummaryBar summary={data.summary} newThisWeek={data.summary.newThisWeek} />

            {tab === "tierA" && (
              <TierTab tier="A" candidates={data.tierA} promoting={promoting} onPromote={handlePromote} onRefresh={load} />
            )}
            {tab === "tierB" && (
              <TierTab tier="B" candidates={data.tierB} promoting={promoting} onPromote={handlePromote} onRefresh={load} />
            )}
            {tab === "tierC" && (
              <TierTab tier="C" candidates={data.tierC} promoting={promoting} onPromote={handlePromote} onRefresh={load} />
            )}
            {tab === "themes" && <ThemesTab themes={data.themes} />}
            {tab === "gaps" && <PortfolioGapsTab gaps={data.portfolioGaps} />}
          </>
        )}
      </div>
    </div>
  );
}
