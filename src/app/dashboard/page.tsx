"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

interface OpportunityEntry {
  ticker: string;
  companyName: string;
  objectiveScore: number;
  recommendation: string;
}

interface FilingSummary {
  id: string;
  ticker: string;
  filingType: string;
  filingDate: string;
}

interface CommitteeSummary {
  ticker: string;
  conviction: string;
}

interface Position {
  id: string;
  ticker: string;
  name: string;
  sector: string | null;
  assetClass: string;
  shares: number | null;
  avgCost: number | null;
  entryDate: string | null;
  status: string;
  currentValueUsd: number | null;
  currentValueThb: number | null;
  allocationPct: number | null;
  unrealizedReturnPct: number | null;
  costBasisUsd: number | null;
  thesis: {
    healthStatus: string | null;
    healthScore: number | null;
    entryConfidence: number;
    currentAssessment: string | null;
  } | null;
  killConditions: Array<{ id: string; status: string }>;
  recommendations: Array<{ id: string; action: string; urgency: string; reasoning: string }>;
}

interface JournalEntry {
  id: string;
  entryType: string;
  content: string;
  createdAt: string;
  position: { ticker: string; name: string } | null;
}

const HEALTH_STYLE: Record<string, string> = {
  intact: "text-[#2d7d46] bg-[#eef7f1] border-[#c3e6cf]",
  weakening: "text-[#b45309] bg-[#fffbeb] border-[#fde68a]",
  broken: "text-[#c0392b] bg-[#fdf0ee] border-[#f5c6c1]",
  monitoring: "text-[#3E6AE1] bg-[#EEF3FD] border-[#bfcffd]",
};

const ACTION_STYLE: Record<string, string> = {
  hold: "text-[#5C5E62] bg-[#F4F4F4]",
  add: "text-[#2d7d46] bg-[#eef7f1]",
  reduce: "text-[#b45309] bg-[#fffbeb]",
  sell: "text-[#c0392b] bg-[#fdf0ee]",
  watch: "text-[#3E6AE1] bg-[#EEF3FD]",
};

const URGENCY_COLOR: Record<string, string> = {
  low: "text-[#8E8E8E]",
  medium: "text-[#3E6AE1]",
  high: "text-[#b45309]",
  critical: "text-[#c0392b]",
};

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function positionCostBasis(p: Pick<Position, "costBasisUsd" | "shares" | "avgCost">): number | null {
  if (p.costBasisUsd != null) return p.costBasisUsd;
  if (p.shares != null && p.avgCost != null) return p.shares * p.avgCost;
  return null;
}

function MetricCard({ label, value, sub, highlight = false }: { label: string; value: string; sub: string; highlight?: boolean }) {
  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl p-5">
      <div className="text-xs text-[#8E8E8E] font-medium mb-2">{label}</div>
      <div className={`text-2xl font-medium tabular-nums ${highlight ? "text-[#c0392b]" : "text-[#171A20]"}`}>{value}</div>
      <div className="text-xs text-[#8E8E8E] mt-1">{sub}</div>
    </div>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bg-[#EEEEEE] rounded-xl animate-pulse ${className}`} />;
}

interface InvestmentThesisItem {
  id: string;
  ticker: string;
  title: string;
  confidenceScore: number;
  status: string;
  isDraft: boolean;
  isReviewDue: boolean;
  daysOverdue: number | null;
  lastReviewedAt: string | null;
  reviewFrequency: string;
}

export default function DashboardPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [theses, setTheses] = useState<InvestmentThesisItem[]>([]);
  const [opportunities, setOpportunities] = useState<OpportunityEntry[]>([]);
  const [recentFilings, setRecentFilings] = useState<FilingSummary[]>([]);
  const [committeeAlerts, setCommitteeAlerts] = useState<CommitteeSummary[]>([]);
  const [perfGainUsd, setPerfGainUsd] = useState<number | null>(null);
  const [perfReturnPct, setPerfReturnPct] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/positions").then(r => r.json()),
      fetch("/api/journal?limit=6").then(r => r.json()),
      fetch("/api/investment-theses").then(r => r.json()),
    ])
      .then(([pos, jrn, thy]) => {
        setPositions(Array.isArray(pos) ? pos : []);
        setJournal(Array.isArray(jrn) ? jrn : []);
        setTheses(Array.isArray(thy?.theses) ? thy.theses : []);
      })
      .finally(() => setLoading(false));

    // Quick-scan supplementary data — non-blocking
    fetch("/api/opportunities").then(r => r.json()).then(d => {
      const entries: OpportunityEntry[] = (d.entries ?? []).slice(0, 5);
      setOpportunities(entries);
    }).catch(() => {});

    fetch("/api/filings?limit=5").then(r => r.json()).then(d => {
      setRecentFilings(d.filings ?? d ?? []);
    }).catch(() => {});

    fetch("/api/committee").then(r => r.json()).then(d => {
      const alerts: CommitteeSummary[] = (d.sessions ?? []).filter((s: CommitteeSummary) =>
        s.conviction === "Strong Buy" || s.conviction === "Buy"
      );
      setCommitteeAlerts(alerts);
    }).catch(() => {});

    fetch("/api/performance").then(r => r.json()).then(d => {
      setPerfGainUsd(d.gainUsd ?? null);
      setPerfReturnPct(d.totalReturnPct ?? null);
    }).catch(() => {});
  }, []);

  const totalInvested = positions.reduce((s, p) => s + (positionCostBasis(p) ?? 0), 0);
  const positionsWithThesis = positions.filter(p => p.thesis != null);
  const avgConfidence = positionsWithThesis.length
    ? positionsWithThesis.reduce((s, p) => s + (p.thesis!.entryConfidence ?? 0), 0) / positionsWithThesis.length
    : 0;
  const allRecs = positions.flatMap(p => p.recommendations);
  const triggeredKills = positions.reduce((s, p) => s + p.killConditions.filter(k => k.status === "triggered").length, 0);

  const healthCounts = positions.reduce((acc, p) => {
    const h = p.thesis?.healthStatus ?? "unreviewed";
    acc[h] = (acc[h] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const thesesOverdue  = theses.filter(t => t.isReviewDue);
  const thesesWeakest  = [...theses].sort((a, b) => a.confidenceScore - b.confidenceScore).slice(0, 3);
  const thesesStrongest = [...theses].sort((a, b) => b.confidenceScore - a.confidenceScore).slice(0, 3);
  const thesisScoreColor = (n: number) => n >= 8 ? "text-[#2d7d46]" : n >= 6 ? "text-[#b45309]" : "text-[#c0392b]";

  if (loading) {
    return (
      <div className="p-6 lg:p-8 space-y-6 max-w-7xl">
        <Skeleton className="h-8 w-56" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="lg:col-span-2 h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-medium text-[#171A20]">Dashboard</h1>
        <p className="text-[#8E8E8E] text-sm mt-0.5">{today}</p>
      </div>

      {/* Quick-scan row — 30-second comprehension */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Portfolio Value + since-inception return */}
        <Link href="/portfolio?tab=performance" className="bg-white border border-[#EEEEEE] rounded-xl p-4 hover:border-[#3E6AE1] transition-colors">
          <div className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest mb-2">Portfolio Value</div>
          <div className="text-xl font-semibold text-[#171A20]">{fmt(totalInvested)}</div>
          {perfReturnPct != null ? (
            <div className="text-xs mt-1" style={{ color: perfReturnPct >= 0 ? "#15803D" : "#DC2626" }}>
              {perfReturnPct >= 0 ? "+" : ""}{perfReturnPct.toFixed(2)}% since inception
            </div>
          ) : (
            <div className="text-xs text-[#8E8E8E] mt-1">{positions.filter(p => p.status === "active").length} positions</div>
          )}
        </Link>

        {/* Top Opportunity */}
        <Link href="/opportunities" className="bg-white border border-[#EEEEEE] rounded-xl p-4 hover:border-[#3E6AE1] transition-colors">
          <div className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest mb-2">Top Opportunity</div>
          {opportunities[0] ? (
            <>
              <div className="text-xl font-semibold text-[#171A20]">{opportunities[0].ticker}</div>
              <div className="text-xs text-[#8E8E8E] mt-1">score {opportunities[0].objectiveScore.toFixed(0)} · {opportunities[0].recommendation}</div>
            </>
          ) : (
            <div className="text-xl font-semibold text-[#8E8E8E]">—</div>
          )}
        </Link>

        {/* Committee Alerts */}
        <Link href="/committee" className={`bg-white border rounded-xl p-4 hover:border-[#3E6AE1] transition-colors ${committeeAlerts.length > 0 ? "border-[#86EFAC]" : "border-[#EEEEEE]"}`}>
          <div className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest mb-2">Committee Alerts</div>
          <div className={`text-xl font-semibold ${committeeAlerts.length > 0 ? "text-[#14532D]" : "text-[#171A20]"}`}>{committeeAlerts.length}</div>
          <div className="text-xs text-[#8E8E8E] mt-1">{committeeAlerts.length > 0 ? "Strong Buy / Buy" : "no action signals"}</div>
        </Link>

        {/* New Filings */}
        <Link href="/research" className="bg-white border border-[#EEEEEE] rounded-xl p-4 hover:border-[#3E6AE1] transition-colors">
          <div className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest mb-2">New Filings</div>
          <div className="text-xl font-semibold text-[#171A20]">{recentFilings.length}</div>
          <div className="text-xs text-[#8E8E8E] mt-1">{recentFilings[0] ? recentFilings[0].ticker + " · " + recentFilings[0].filingType : "none ingested"}</div>
        </Link>
      </div>

      {/* Since Inception banner */}
      {perfReturnPct != null && (
        <Link
          href="/portfolio?tab=performance"
          className="block bg-white border border-[#EEEEEE] rounded-xl px-5 py-4 hover:border-[#3E6AE1] transition-colors"
        >
          <div className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest mb-3">Since Inception</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-[#8E8E8E]">Net Deposits</div>
              <div className="text-base font-semibold text-[#171A20]">{fmt(totalInvested)}</div>
            </div>
            <div>
              <div className="text-xs text-[#8E8E8E]">Current Value</div>
              <div className="text-base font-semibold text-[#171A20]">{fmt(totalInvested + (perfGainUsd ?? 0))}</div>
            </div>
            <div>
              <div className="text-xs text-[#8E8E8E]">Total P&amp;L</div>
              <div className="text-base font-semibold" style={{ color: (perfGainUsd ?? 0) >= 0 ? "#15803D" : "#DC2626" }}>
                {(perfGainUsd ?? 0) >= 0 ? "+" : ""}{fmt(perfGainUsd)}
              </div>
            </div>
            <div>
              <div className="text-xs text-[#8E8E8E]">Total Return</div>
              <div className="text-base font-semibold" style={{ color: perfReturnPct >= 0 ? "#15803D" : "#DC2626" }}>
                {perfReturnPct >= 0 ? "+" : ""}{perfReturnPct.toFixed(2)}%
              </div>
            </div>
          </div>
        </Link>
      )}

      {/* Secondary metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Entry Confidence" value={positionsWithThesis.length ? `${avgConfidence.toFixed(1)} / 10` : "—"} sub={positionsWithThesis.length ? `${positionsWithThesis.length} with thesis` : "no theses yet"} />
        <MetricCard label="Pending Actions" value={String(allRecs.length)} sub="awaiting review" highlight={allRecs.length > 2} />
        <MetricCard label="Triggered Stops" value={String(triggeredKills)} sub="kill conditions hit" highlight={triggeredKills > 0} />
        <MetricCard label="Reviews Overdue" value={String(thesesOverdue.length)} sub="thesis reviews due" highlight={thesesOverdue.length > 0} />
      </div>

      {/* Thesis Health */}
      {positions.length > 0 && (
        <div className="bg-white border border-[#EEEEEE] rounded-xl p-5">
          <h2 className="text-xs text-[#8E8E8E] font-medium mb-4">Thesis Health Distribution</h2>
          <div className="flex flex-wrap gap-2.5">
            {(["intact", "monitoring", "weakening", "broken", "unreviewed"] as const).map(h => {
              const count = healthCounts[h] ?? 0;
              if (count === 0) return null;
              return (
                <div
                  key={h}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded border text-sm font-medium ${HEALTH_STYLE[h] ?? "text-[#5C5E62] bg-[#F4F4F4] border-[#EEEEEE]"}`}
                >
                  <span className="font-medium">{count}</span>
                  <span className="capitalize">{h}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Thesis Coverage Widgets */}
      {theses.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Reviews Due */}
          <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#EEEEEE] flex items-center justify-between">
              <h2 className="font-medium text-[#171A20] text-sm">Reviews Due</h2>
              <span className={`text-xs font-medium tabular-nums px-2 py-0.5 rounded ${thesesOverdue.length > 0 ? "text-[#c0392b] bg-[#fdf0ee]" : "text-[#2d7d46] bg-[#eef7f1]"}`}>
                {thesesOverdue.length}
              </span>
            </div>
            {thesesOverdue.length === 0 ? (
              <div className="px-5 py-5 text-xs text-[#8E8E8E] text-center">All theses up to date</div>
            ) : (
              thesesOverdue.slice(0, 4).map((t, i) => (
                <Link key={t.id} href={`/theses/${t.ticker}`} className={`flex items-center gap-3 px-5 py-3 hover:bg-[#F4F4F4] transition-colors ${i < Math.min(thesesOverdue.length, 4) - 1 ? "border-b border-[#EEEEEE]" : ""}`}>
                  <span className="font-medium text-[#171A20] text-sm w-12 shrink-0">{t.ticker}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-[#c0392b] font-medium">
                      {t.daysOverdue != null ? `${t.daysOverdue}d overdue` : "Never reviewed"}
                    </div>
                    <div className="text-xs text-[#8E8E8E] capitalize">{t.reviewFrequency}</div>
                  </div>
                </Link>
              ))
            )}
            {thesesOverdue.length > 4 && (
              <Link href="/theses" className="block px-5 py-2.5 text-xs text-[#3E6AE1] border-t border-[#EEEEEE] hover:bg-[#F4F4F4] transition-colors">
                +{thesesOverdue.length - 4} more →
              </Link>
            )}
          </div>

          {/* Weakest Conviction */}
          <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#EEEEEE] flex items-center justify-between">
              <h2 className="font-medium text-[#171A20] text-sm">Weakest Conviction</h2>
              <Link href="/theses" className="text-xs text-[#3E6AE1] hover:text-[#2d5bc7] transition-colors">All →</Link>
            </div>
            {thesesWeakest.map((t, i) => (
              <Link key={t.id} href={`/theses/${t.ticker}`} className={`flex items-center gap-3 px-5 py-3 hover:bg-[#F4F4F4] transition-colors ${i < thesesWeakest.length - 1 ? "border-b border-[#EEEEEE]" : ""}`}>
                <span className="font-medium text-[#171A20] text-sm w-12 shrink-0">{t.ticker}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-[#8E8E8E] truncate">{t.title}</div>
                  <div className="text-xs text-[#8E8E8E] capitalize mt-0.5">{t.status}</div>
                </div>
                <span className={`text-sm font-medium tabular-nums shrink-0 ${thesisScoreColor(t.confidenceScore)}`}>{t.confidenceScore}</span>
              </Link>
            ))}
          </div>

          {/* Highest Conviction */}
          <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#EEEEEE] flex items-center justify-between">
              <h2 className="font-medium text-[#171A20] text-sm">Highest Conviction</h2>
              <Link href="/theses" className="text-xs text-[#3E6AE1] hover:text-[#2d5bc7] transition-colors">All →</Link>
            </div>
            {thesesStrongest.map((t, i) => (
              <Link key={t.id} href={`/theses/${t.ticker}`} className={`flex items-center gap-3 px-5 py-3 hover:bg-[#F4F4F4] transition-colors ${i < thesesStrongest.length - 1 ? "border-b border-[#EEEEEE]" : ""}`}>
                <span className="font-medium text-[#171A20] text-sm w-12 shrink-0">{t.ticker}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-[#8E8E8E] truncate">{t.title}</div>
                  <div className="text-xs text-[#8E8E8E] capitalize mt-0.5">{t.status}</div>
                </div>
                <span className={`text-sm font-medium tabular-nums shrink-0 ${thesisScoreColor(t.confidenceScore)}`}>{t.confidenceScore}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Holdings Preview */}
        <div className="lg:col-span-2 bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#EEEEEE] flex items-center justify-between">
            <h2 className="font-medium text-[#171A20] text-sm">Holdings</h2>
            <Link
              href="/portfolio"
              style={{ transition: "color 0.33s" }}
              className="text-[#3E6AE1] hover:text-[#2d5bc7] text-sm font-medium"
            >
              View all →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#EEEEEE] bg-[#F4F4F4]">
                  {["Ticker", "Shares", "Avg Cost", "Cost Basis", "Thesis"].map((h, i) => (
                    <th key={h} className={`px-5 py-3 text-xs text-[#8E8E8E] font-medium ${i === 0 ? "text-left" : i < 4 ? "text-right" : "text-left"}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {positions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-[#8E8E8E] text-sm">
                      No positions yet.{" "}
                      <code className="bg-[#F4F4F4] px-1.5 py-0.5 rounded text-[#5C5E62]">npm run db:seed</code>
                      {" "}to load sample data.
                    </td>
                  </tr>
                ) : (
                  positions.slice(0, 8).map((p, idx) => (
                    <tr
                      key={p.id}
                      style={{ transition: "background-color 0.33s" }}
                      className={`hover:bg-[#F4F4F4] group ${idx < positions.slice(0, 8).length - 1 ? "border-b border-[#EEEEEE]" : ""}`}
                    >
                      <td className="px-5 py-3.5">
                        <Link href={`/positions/${p.id}`} className="block">
                          <div style={{ transition: "color 0.33s" }} className="font-medium text-[#171A20] group-hover:text-[#3E6AE1]">{p.ticker}</div>
                          <div className="text-xs text-[#8E8E8E] truncate max-w-[160px]">{p.name}</div>
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-right tabular-nums text-[#393C41]">
                        {p.shares != null ? p.shares.toLocaleString() : <span className="text-[#D0D1D2]">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-right tabular-nums text-[#393C41]">{fmt(p.avgCost)}</td>
                      <td className="px-5 py-3.5 text-right tabular-nums font-medium text-[#171A20]">{fmt(positionCostBasis(p))}</td>
                      <td className="px-5 py-3.5">
                        {p.thesis?.healthStatus ? (
                          <span className={`text-xs px-2 py-0.5 rounded border capitalize ${HEALTH_STYLE[p.thesis.healthStatus] ?? "text-[#5C5E62] bg-[#F4F4F4] border-[#EEEEEE]"}`}>
                            {p.thesis.healthStatus}
                            {p.thesis.healthScore != null ? ` · ${p.thesis.healthScore.toFixed(1)}` : ""}
                          </span>
                        ) : (
                          <span className="text-[#D0D1D2] text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Pending Actions */}
          <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#EEEEEE]">
              <h2 className="font-medium text-[#171A20] text-sm">Pending Actions</h2>
            </div>
            <div>
              {allRecs.length === 0 ? (
                <div className="px-5 py-6 text-center text-[#8E8E8E] text-sm">No pending actions</div>
              ) : (
                allRecs.slice(0, 5).map((r, idx) => (
                  <div key={r.id} className={`px-5 py-3.5 ${idx < Math.min(allRecs.length, 5) - 1 ? "border-b border-[#EEEEEE]" : ""}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium uppercase ${ACTION_STYLE[r.action] ?? "text-[#5C5E62] bg-[#F4F4F4]"}`}>
                        {r.action}
                      </span>
                      <span className={`text-xs font-medium ${URGENCY_COLOR[r.urgency] ?? "text-[#8E8E8E]"}`}>
                        {r.urgency}
                      </span>
                    </div>
                    <p className="text-xs text-[#5C5E62] line-clamp-2">{r.reasoning}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Journal */}
          <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#EEEEEE] flex items-center justify-between">
              <h2 className="font-medium text-[#171A20] text-sm">Recent Journal</h2>
              <Link
                href="/journal"
                style={{ transition: "color 0.33s" }}
                className="text-[#3E6AE1] hover:text-[#2d5bc7] text-sm font-medium"
              >
                All →
              </Link>
            </div>
            <div>
              {journal.length === 0 ? (
                <div className="px-5 py-6 text-center text-[#8E8E8E] text-sm">No entries yet</div>
              ) : (
                journal.slice(0, 5).map((e, idx) => (
                  <div key={e.id} className={`px-5 py-3.5 ${idx < Math.min(journal.length, 5) - 1 ? "border-b border-[#EEEEEE]" : ""}`}>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {e.position && (
                        <span className="text-xs font-medium text-[#171A20] bg-[#F4F4F4] px-1.5 py-0.5 rounded">
                          {e.position.ticker}
                        </span>
                      )}
                      <span className="text-xs text-[#8E8E8E] capitalize">{e.entryType.replace(/_/g, " ")}</span>
                      <span className="text-xs text-[#D0D1D2] ml-auto">{fmtDate(e.createdAt)}</span>
                    </div>
                    <p className="text-xs text-[#5C5E62] line-clamp-2">{e.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
