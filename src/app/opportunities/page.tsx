"use client";
import { useEffect, useState, useMemo } from "react";
import type { OpportunityEntry, OpportunityResult } from "@/app/api/opportunities/route";

// ─── Tier badge ───────────────────────────────────────────────────────────────

const TIER_LABELS: Record<string, string> = {
  tier1: "Large Cap",
  tier2: "Mid Cap",
  tier3: "Small Cap",
  tier4: "ETF",
  tier5: "Intl",
};

const TIER_COLORS: Record<string, { bg: string; text: string }> = {
  tier1: { bg: "#EEF3FD", text: "#3E6AE1" },
  tier2: { bg: "#F0FDF4", text: "#15803D" },
  tier3: { bg: "#FFFBEB", text: "#D97706" },
  tier4: { bg: "#F4F4F4", text: "#5C5E62" },
  tier5: { bg: "#FEF3C7", text: "#92400E" },
};

function TierBadge({ tier }: { tier: string }) {
  const c = TIER_COLORS[tier] ?? { bg: "#F4F4F4", text: "#5C5E62" };
  return (
    <span
      className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      {TIER_LABELS[tier] ?? tier}
    </span>
  );
}

// ─── Score bar ────────────────────────────────────────────────────────────────

function ScoreBar({ label, score, weight, color = "#3E6AE1" }: { label: string; score: number; weight: number; color?: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-[#5C5E62]">{label}</span>
        <span className="text-[11px] font-medium text-[#171A20]">{score.toFixed(0)} <span className="text-[#AAAAAA]">({weight}%)</span></span>
      </div>
      <div className="h-1.5 bg-[#EEEEEE] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(100, score)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// ─── Allocation box ───────────────────────────────────────────────────────────

function AllocationBox({ label, pct, usd }: { label: string; pct: number; usd: number }) {
  const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return (
    <div className="flex-1 bg-[#F4F4F4] rounded-lg p-2 text-center">
      <div className="text-[10px] text-[#8E8E8E] mb-0.5 uppercase tracking-wide">{label}</div>
      <div className="text-sm font-semibold text-[#171A20]">{pct.toFixed(1)}%</div>
      <div className="text-[11px] text-[#5C5E62]">${fmt(usd)}</div>
    </div>
  );
}

// ─── Opportunity card ─────────────────────────────────────────────────────────

function OpportunityCard({ entry }: { entry: OpportunityEntry }) {
  const [expanded, setExpanded] = useState(false);
  const [researchState, setResearchState] = useState<"idle" | "generating" | "done">("idle");
  const scoreColor = entry.opportunityScore >= 75 ? "#2d7d46" : entry.opportunityScore >= 55 ? "#3E6AE1" : "#D97706";

  async function handleGenerateResearch(e: React.MouseEvent) {
    e.stopPropagation();
    setResearchState("generating");
    try {
      const res = await fetch(`/api/research/${entry.ticker}/generate`, { method: "POST" });
      if (res.ok) setResearchState("done");
      else setResearchState("idle");
    } catch {
      setResearchState("idle");
    }
  }

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
      {/* Header row */}
      <button
        className="w-full text-left p-4"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-bold text-[#171A20]">{entry.ticker}</span>
              <TierBadge tier={entry.universeTier} />
              {entry.inPortfolio && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: "#F0FDF4", color: "#15803D" }}>
                  In Portfolio
                </span>
              )}
              {entry.inWatchlist && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: "#EEF3FD", color: "#3E6AE1" }}>
                  Watchlist
                </span>
              )}
            </div>
            <div className="text-xs text-[#8E8E8E] mt-0.5 truncate">{entry.companyName}</div>
            {!expanded && (
              <p className="text-xs text-[#5C5E62] mt-1.5 line-clamp-1">{entry.reasoning.whyBuy}</p>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <div className="text-2xl font-bold" style={{ color: scoreColor }}>
                {entry.opportunityScore.toFixed(1)}
              </div>
              <div className="text-[10px] text-[#AAAAAA] leading-none">/ 100</div>
            </div>
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#AAAAAA" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-[#EEEEEE] p-4 space-y-4">
          {/* Score breakdown */}
          <div className="space-y-2">
            <div className="text-[11px] font-semibold text-[#8E8E8E] uppercase tracking-wide">Score Breakdown</div>
            <ScoreBar label="Company Quality" score={entry.companyScore} weight={40} color="#3E6AE1" />
            <ScoreBar label="Allocation Gap" score={entry.allocationGapScore} weight={25} color="#16A34A" />
            <ScoreBar label="Diversification" score={entry.diversificationScore} weight={15} color="#7C3AED" />
            <ScoreBar label="Watchlist Signal" score={entry.watchlistScore} weight={10} color="#D97706" />
            <ScoreBar label="Brain OS Alignment" score={entry.brainAlignmentScore} weight={10} color="#DC2626" />
          </div>

          {/* Fundamentals */}
          {entry.fundamentals && (
            <div>
              <div className="text-[11px] font-semibold text-[#8E8E8E] uppercase tracking-wide mb-2">Key Metrics</div>
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  { label: "ROIC", value: entry.fundamentals.roic != null ? `${entry.fundamentals.roic.toFixed(1)}%` : "—" },
                  { label: "Gross M", value: entry.fundamentals.grossMargin != null ? `${entry.fundamentals.grossMargin.toFixed(1)}%` : "—" },
                  { label: "Rev G", value: entry.fundamentals.revenueGrowth != null ? `${entry.fundamentals.revenueGrowth.toFixed(1)}%` : "—" },
                  { label: "D/E", value: entry.fundamentals.debtToEquity != null ? entry.fundamentals.debtToEquity.toFixed(2) : "—" },
                ].map(m => (
                  <div key={m.label} className="bg-[#F4F4F4] rounded-lg p-2">
                    <div className="text-[10px] text-[#8E8E8E]">{m.label}</div>
                    <div className="text-sm font-semibold text-[#171A20]">{m.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reasoning */}
          <div className="space-y-2">
            <div>
              <div className="text-[11px] font-semibold text-[#8E8E8E] uppercase tracking-wide mb-1">Why Buy</div>
              <p className="text-sm text-[#171A20]">{entry.reasoning.whyBuy}</p>
            </div>
            <div>
              <div className="text-[11px] font-semibold text-[#8E8E8E] uppercase tracking-wide mb-1">Why Now</div>
              <p className="text-sm text-[#5C5E62]">{entry.reasoning.whyNow}</p>
            </div>
            <div>
              <div className="text-[11px] font-semibold text-[#8E8E8E] uppercase tracking-wide mb-1">Portfolio Impact</div>
              <p className="text-sm text-[#5C5E62]">{entry.reasoning.portfolioImpact}</p>
            </div>
          </div>

          {/* Supporting / contradicting factors */}
          {((entry.supportingFactors?.length ?? 0) > 0 || (entry.contradictingFactors?.length ?? 0) > 0) && (
            <div className="grid grid-cols-2 gap-3">
              {(entry.supportingFactors?.length ?? 0) > 0 && (
                <div>
                  <div className="text-[11px] font-semibold text-[#8E8E8E] uppercase tracking-wide mb-1.5">Supporting</div>
                  <ul className="space-y-1">
                    {(entry.supportingFactors ?? []).map((f, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-[#5C5E62]">
                        <span className="text-[#15803D] font-bold shrink-0 mt-0.5">+</span>{f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(entry.contradictingFactors?.length ?? 0) > 0 && (
                <div>
                  <div className="text-[11px] font-semibold text-[#8E8E8E] uppercase tracking-wide mb-1.5">Risks</div>
                  <ul className="space-y-1">
                    {(entry.contradictingFactors ?? []).map((f, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-[#5C5E62]">
                        <span className="text-[#DC2626] font-bold shrink-0 mt-0.5">−</span>{f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Suggested allocation */}
          <div>
            <div className="text-[11px] font-semibold text-[#8E8E8E] uppercase tracking-wide mb-2">Suggested Position Size</div>
            <div className="flex gap-2">
              <AllocationBox label="Starter" pct={entry.suggestedAllocation.starterPct} usd={entry.suggestedAllocation.starterUsd} />
              <AllocationBox label="Target" pct={entry.suggestedAllocation.targetPct} usd={entry.suggestedAllocation.targetUsd} />
              <AllocationBox label="Max" pct={entry.suggestedAllocation.maxPct} usd={entry.suggestedAllocation.maxUsd} />
            </div>
            {entry.currentValue?.usd != null && (
              <div className="mt-2 text-xs text-[#8E8E8E] text-center">
                Current: ${entry.currentValue.usd.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                {entry.allocationTarget && (
                  <> · Target: ${entry.allocationTarget.targetUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}</>
                )}
              </div>
            )}
          </div>

          {/* Action badge + Generate Research */}
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-xs font-semibold px-3 py-1.5 rounded-lg"
              style={
                entry.reasoning.positionType === "initiate"
                  ? { backgroundColor: "#EEF3FD", color: "#3E6AE1" }
                  : entry.reasoning.positionType === "add"
                  ? { backgroundColor: "#F0FDF4", color: "#15803D" }
                  : { backgroundColor: "#F4F4F4", color: "#5C5E62" }
              }
            >
              {entry.reasoning.positionType === "initiate"
                ? "Initiate Position"
                : entry.reasoning.positionType === "add"
                ? "Add to Position"
                : "Hold — no immediate action"}
            </span>
            {entry.sector && (
              <span className="text-xs text-[#AAAAAA]">{entry.sector}</span>
            )}
            <div className="ml-auto">
              {researchState === "done" ? (
                <a
                  href="/research"
                  className="text-xs font-medium px-3 py-1.5 rounded border border-[#BBF7D0] text-[#15803D] hover:bg-[#F0FDF4] transition-colors"
                >
                  View Dossier →
                </a>
              ) : (
                <button
                  onClick={handleGenerateResearch}
                  disabled={researchState === "generating"}
                  className="text-xs font-medium px-3 py-1.5 rounded border border-[#EEEEEE] text-[#5C5E62] hover:border-[#3E6AE1] hover:text-[#3E6AE1] transition-colors disabled:opacity-50"
                >
                  {researchState === "generating" ? "Generating…" : "Generate Research"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab views ────────────────────────────────────────────────────────────────

type TabId = "bestBuys" | "conviction" | "underallocated" | "diversification" | "watchlist";

const TABS: { id: TabId; label: string }[] = [
  { id: "bestBuys",        label: "Best Next Buys" },
  { id: "conviction",      label: "Highest Conviction" },
  { id: "underallocated",  label: "Most Underallocated" },
  { id: "diversification", label: "Diversification" },
  { id: "watchlist",       label: "Watchlist" },
];

function filterAndSort(entries: OpportunityEntry[], tab: TabId): OpportunityEntry[] {
  switch (tab) {
    case "bestBuys":
      return [...entries].sort((a, b) => b.opportunityScore - a.opportunityScore);
    case "conviction":
      return [...entries].sort((a, b) => b.companyScore - a.companyScore);
    case "underallocated":
      return [...entries]
        .filter(e => e.allocationTarget != null && e.allocationGapScore > 0)
        .sort((a, b) => b.allocationGapScore - a.allocationGapScore);
    case "diversification":
      return [...entries]
        .sort((a, b) => b.diversificationScore - a.diversificationScore);
    case "watchlist":
      return [...entries]
        .filter(e => e.inWatchlist)
        .sort((a, b) => b.opportunityScore - a.opportunityScore);
  }
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function OpportunitiesPage() {
  const [result, setResult] = useState<OpportunityResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("bestBuys");

  useEffect(() => {
    fetch("/api/opportunities")
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setResult(d as OpportunityResult);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/opportunities", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const d: OpportunityResult = await res.json();
      setResult(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save scores.");
    } finally {
      setSaving(false);
    }
  }

  const visibleEntries = useMemo(
    () => (result ? filterAndSort(result.entries, activeTab) : []),
    [result, activeTab]
  );

  const fmtUsd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-sm text-[#8E8E8E]">Computing opportunities...</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 md:px-6 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-[#171A20]">Opportunity Engine</h1>
          <p className="text-xs text-[#8E8E8E] mt-0.5">
            Best next buys for your portfolio — quality × allocation gap × diversification
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg text-white transition-opacity"
          style={{ backgroundColor: "#3E6AE1", opacity: saving ? 0.6 : 1 }}
        >
          {saving ? (
            <>
              <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              Saving...
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              Save Snapshot
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="text-sm text-[#DC2626] bg-[#FEF2F2] border border-[#FECACA] rounded-lg px-4 py-2">
          {error}
        </div>
      )}

      {/* Summary stats */}
      {result && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Universe Scored", value: result.summary.totalScored.toString() },
            { label: "New Opportunities", value: result.summary.newPositions.toString() },
            { label: "On Watchlist", value: result.summary.onWatchlist.toString() },
            { label: "Available Cash", value: fmtUsd(result.summary.availableCashUsd) },
          ].map(m => (
            <div key={m.label} className="bg-white border border-[#EEEEEE] rounded-xl p-3">
              <div className="text-xs text-[#8E8E8E] mb-1">{m.label}</div>
              <div className="text-lg font-semibold text-[#171A20]">{m.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Top opportunity highlight */}
      {result && result.summary.topOpportunity && (
        <div className="bg-[#EEF3FD] border border-[#BFDBFE] rounded-xl p-4">
          <div className="text-[11px] font-semibold text-[#3E6AE1] uppercase tracking-wide mb-1">Top Opportunity</div>
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-[#1E40AF]">{result.summary.topOpportunity}</span>
            <span className="text-sm text-[#3E6AE1]">
              {result.entries[0]?.companyName}
            </span>
            <span className="text-xl font-bold text-[#3E6AE1] ml-auto">
              {result.entries[0]?.opportunityScore.toFixed(1)}
            </span>
          </div>
          <p className="text-xs text-[#3E6AE1] mt-1">{result.entries[0]?.reasoning.whyNow}</p>
        </div>
      )}

      {/* Tabs */}
      {result && (
        <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
          <div className="border-b border-[#EEEEEE] flex overflow-x-auto">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors"
                style={
                  activeTab === tab.id
                    ? { borderColor: "#3E6AE1", color: "#3E6AE1" }
                    : { borderColor: "transparent", color: "#5C5E62" }
                }
              >
                {tab.label}
                {tab.id === "watchlist" && result.summary.onWatchlist > 0 && (
                  <span className="ml-1.5 text-[10px] bg-[#3E6AE1] text-white rounded-full px-1.5 py-0.5">
                    {result.summary.onWatchlist}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="p-4 space-y-3">
            {visibleEntries.length === 0 ? (
              <p className="text-sm text-[#8E8E8E] text-center py-8">
                {activeTab === "watchlist"
                  ? "No watchlist items in the universe. Add tickers to your watchlist."
                  : activeTab === "underallocated"
                  ? "No tickers with allocation targets below threshold."
                  : "No opportunities available."}
              </p>
            ) : (
              visibleEntries.map(entry => (
                <OpportunityCard key={entry.ticker} entry={entry} />
              ))
            )}
          </div>
        </div>
      )}

      {result && (
        <div className="text-center text-xs text-[#AAAAAA]">
          Computed {new Date(result.generatedAt).toLocaleString()} · {result.summary.totalScored} universe entries scored
        </div>
      )}
    </div>
  );
}
