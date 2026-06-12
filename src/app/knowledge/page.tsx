"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { EntitySummary } from "@/lib/knowledge-graph-engine";

function SubNav() {
  return (
    <div className="bg-white border-b border-[#EEEEEE] px-6 flex items-center shrink-0">
      <Link
        href="/knowledge"
        className="px-4 py-3 text-sm font-semibold text-[#3E6AE1] border-b-2 border-[#3E6AE1]"
      >
        Overview
      </Link>
      <Link
        href="/knowledge/graph"
        className="px-4 py-3 text-sm font-medium text-[#5C5E62] hover:text-[#171A20] border-b-2 border-transparent transition-colors"
      >
        Graph
      </Link>
    </div>
  );
}

// ─── Types ─────────────────────────────────────────────────────────────────────

interface KnowledgeOverview {
  stats: {
    totalNodes:  number;
    totalEdges:  number;
    companies:   number;
    themes:      number;
    regimes:     number;
    newsletters: number;
    decisions:   number;
  };
  topCompanies:     EntitySummary[];
  topThemes:        EntitySummary[];
  activeRegime:     string;
  impactedThemes:   { name: string; relation: string; strength: number }[];
  recentDecisions:  { ticker: string; verdict: string; thesisStatus: string; confidence: number; date: string }[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bg-[#EEEEEE] rounded-xl animate-pulse ${className}`} />;
}

const VERDICT_STYLE: Record<string, { bg: string; text: string }> = {
  Strengthen: { bg: "#F0FDF4", text: "#15803D" },
  Hold:       { bg: "#EFF6FF", text: "#3E6AE1" },
  Reduce:     { bg: "#FFFBEB", text: "#D97706" },
  Exit:       { bg: "#FEF2F2", text: "#DC2626" },
};

const THESIS_DOT: Record<string, string> = {
  Confirmed:           "#15803D",
  "Partially Confirmed": "#D97706",
  Broken:              "#DC2626",
};

// ─── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl p-3 text-center">
      <div className="text-xl font-bold text-[#171A20] tabular-nums">{value}</div>
      <div className="text-xs text-[#8E8E8E] mt-0.5">{label}</div>
    </div>
  );
}

function CentralityBar({ score, max }: { score: number; max: number }) {
  const pct = max > 0 ? Math.round((score / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-[#EEEEEE] rounded-full overflow-hidden">
        <div className="h-full rounded-full bg-[#3E6AE1]" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold text-[#3E6AE1] tabular-nums w-6 text-right">{score}</span>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function KnowledgePage() {
  const [data, setData]       = useState<KnowledgeOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/knowledge-graph")
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setData(d); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <SubNav />
    <div className="max-w-4xl mx-auto py-8 px-4 md:px-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#171A20]">Knowledge Graph</h1>
          <p className="text-xs text-[#8E8E8E] mt-0.5">Investment intelligence network — what is everything connected to?</p>
        </div>
        <Link
          href="/knowledge/graph"
          className="shrink-0 flex items-center gap-1.5 px-4 py-2 bg-[#3E6AE1] text-white text-sm font-semibold rounded-lg hover:bg-[#2E5AD1] transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="5" cy="12" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="19" cy="19" r="2"/>
            <line x1="7" y1="11" x2="17" y2="6"/><line x1="7" y1="13" x2="17" y2="18"/>
          </svg>
          Open Graph
        </Link>
      </div>

      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16" />)}
          </div>
          <Skeleton className="h-64" />
          <Skeleton className="h-48" />
        </div>
      ) : error ? (
        <div className="text-sm text-[#DC2626] py-4">{error}</div>
      ) : data ? (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            <StatCard label="Nodes"       value={data.stats.totalNodes}  />
            <StatCard label="Edges"       value={data.stats.totalEdges}  />
            <StatCard label="Companies"   value={data.stats.companies}   />
            <StatCard label="Themes"      value={data.stats.themes}      />
            <StatCard label="Newsletters" value={data.stats.newsletters} />
            <StatCard label="Decisions"   value={data.stats.decisions}   />
          </div>

          {/* Most Connected Companies */}
          <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[#EEEEEE]">
              <span className="text-sm font-semibold text-[#171A20]">Most Connected Companies</span>
              <span className="text-xs text-[#8E8E8E] ml-2">Ranked by knowledge centrality</span>
            </div>
            <div className="divide-y divide-[#EEEEEE]">
              {data.topCompanies.slice(0, 10).map((entity, i) => {
                const owned = Boolean(entity.node.metadata?.owned);
                const maxScore = data.topCompanies[0]?.centralityScore ?? 1;
                return (
                  <div key={entity.node.id} className="px-4 py-3 flex items-center gap-4">
                    <span className="text-xs text-[#AAAAAA] tabular-nums w-5 shrink-0">#{i + 1}</span>
                    <div className="w-20 shrink-0">
                      <Link
                        href={`/portfolio/${entity.node.name}`}
                        className="text-sm font-bold text-[#3E6AE1] hover:underline"
                      >
                        {entity.node.name}
                      </Link>
                      {owned && (
                        <span className="block text-[10px] text-[#15803D] font-medium">owned</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <CentralityBar score={entity.centralityScore} max={maxScore} />
                      <div className="text-[10px] text-[#AAAAAA] mt-0.5">{entity.degree} connections</div>
                    </div>
                    {entity.node.score !== undefined && (
                      <span className="text-xs font-semibold text-[#5C5E62] shrink-0">
                        Opp {entity.node.score.toFixed(0)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Two-column: Themes + Active Regime */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Most Connected Themes */}
            <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[#EEEEEE]">
                <span className="text-sm font-semibold text-[#171A20]">Most Connected Themes</span>
              </div>
              <div className="divide-y divide-[#EEEEEE]">
                {data.topThemes.map((entity) => {
                  const maxScore = data.topThemes[0]?.centralityScore ?? 1;
                  return (
                    <div key={entity.node.id} className="px-4 py-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-[#171A20]">{entity.node.name}</span>
                        <span className="text-xs text-[#8E8E8E]">{entity.degree} links</span>
                      </div>
                      <CentralityBar score={entity.centralityScore} max={maxScore} />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Active Regime */}
            <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[#EEEEEE]">
                <span className="text-sm font-semibold text-[#171A20]">Active Regime</span>
                <span className="text-xs font-medium text-[#3E6AE1] ml-2">{data.activeRegime}</span>
              </div>
              <div className="px-4 py-3 space-y-2">
                {data.impactedThemes.length === 0 ? (
                  <p className="text-xs text-[#8E8E8E]">No regime–theme edges computed yet.</p>
                ) : (
                  data.impactedThemes.map(t => (
                    <div key={t.name} className="flex items-center justify-between gap-3">
                      <span className="text-xs text-[#171A20]">{t.name}</span>
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded"
                        style={
                          t.relation === "IMPACTS"
                            ? { backgroundColor: "#F0FDF4", color: "#15803D" }
                            : { backgroundColor: "#FEF2F2", color: "#DC2626" }
                        }
                      >
                        {t.relation === "IMPACTS" ? "↑ Boosted" : "↓ Weakened"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Recent Decisions */}
          <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[#EEEEEE]">
              <span className="text-sm font-semibold text-[#171A20]">Recent Decisions</span>
              <span className="text-xs text-[#8E8E8E] ml-2">Latest decision review per company</span>
            </div>
            <div className="divide-y divide-[#EEEEEE]">
              {data.recentDecisions.map(d => {
                const vs = VERDICT_STYLE[d.verdict] ?? { bg: "#F4F4F4", text: "#5C5E62" };
                const dot = THESIS_DOT[d.thesisStatus] ?? "#AAAAAA";
                return (
                  <div key={d.ticker} className="px-4 py-3 flex items-center gap-4">
                    <Link
                      href={`/portfolio/${d.ticker}`}
                      className="text-sm font-bold text-[#3E6AE1] hover:underline w-16 shrink-0"
                    >
                      {d.ticker}
                    </Link>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ backgroundColor: vs.bg, color: vs.text }}>
                      {d.verdict}
                    </span>
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: dot }} />
                      <span className="text-xs text-[#5C5E62] truncate">{d.thesisStatus}</span>
                    </div>
                    <span className="text-xs font-semibold text-[#5C5E62] tabular-nums shrink-0">{d.confidence}</span>
                    {d.date && (
                      <span className="text-[10px] text-[#AAAAAA] shrink-0 hidden md:inline">
                        {new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : null}
    </div>
    </div>
  );
}
