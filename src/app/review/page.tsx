"use client";
import { useEffect, useState } from "react";
import type {
  PortfolioReviewRecord,
  ReviewCard,
  ReviewSeverity,
  PortfolioSummarySection,
  AllocationAnalysisSection,
  ThesisCoverageSection,
  RiskAnalysisSection,
  CashAllocationSection,
  WatchlistPrioritizationSection,
} from "@/lib/portfolio-review";
import type { OpportunityEntry } from "@/app/api/opportunities/route";

// ─── Severity helpers ─────────────────────────────────────────────────────────

function severityColor(s: ReviewSeverity) {
  if (s === "critical") return { bg: "#FEF2F2", border: "#FECACA", text: "#991B1B", badge: "#DC2626" };
  if (s === "high")     return { bg: "#FFF7ED", border: "#FED7AA", text: "#92400E", badge: "#EA580C" };
  if (s === "medium")   return { bg: "#FFFBEB", border: "#FDE68A", text: "#78350F", badge: "#D97706" };
  if (s === "info")     return { bg: "#EEF3FD", border: "#BFDBFE", text: "#1E40AF", badge: "#3E6AE1" };
  return { bg: "#F0FDF4", border: "#BBF7D0", text: "#14532D", badge: "#16A34A" };
}

function SeverityBadge({ s }: { s: ReviewSeverity }) {
  const c = severityColor(s);
  const label = s === "info" ? "info" : s;
  return (
    <span
      className="inline-block text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
      style={{ backgroundColor: c.badge + "22", color: c.badge }}
    >
      {label}
    </span>
  );
}

// ─── Review Card ──────────────────────────────────────────────────────────────

function ReviewCardUI({
  title,
  card,
  icon,
}: {
  title: string;
  card: ReviewCard;
  icon: React.ReactNode;
}) {
  const c = severityColor(card.severity);
  return (
    <div
      className="bg-white rounded-xl p-4 flex flex-col gap-2 border"
      style={{ borderColor: c.border }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span style={{ color: c.badge }}>{icon}</span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[#8E8E8E]">{title}</span>
        </div>
        <SeverityBadge s={card.severity} />
      </div>
      {card.ticker && (
        <span
          className="self-start text-xs font-bold px-2 py-0.5 rounded"
          style={{ backgroundColor: "#F4F4F4", color: "#3E6AE1" }}
        >
          {card.ticker}
        </span>
      )}
      <p className="text-sm font-semibold text-[#171A20] leading-snug">{card.headline}</p>
      <p className="text-xs text-[#5C5E62] leading-relaxed">{card.detail}</p>
    </div>
  );
}

// ─── Section: Portfolio Summary ───────────────────────────────────────────────

function SummarySection({ data }: { data: PortfolioSummarySection }) {
  const fmt = (n: number, decimals = 0) =>
    n.toLocaleString("en-US", { maximumFractionDigits: decimals, minimumFractionDigits: decimals });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Active Positions", value: data.totalPositions.toString() },
          { label: "Total Invested", value: `$${fmt(data.totalInvestedUsd)}` },
          { label: "Cash Available", value: `$${fmt(data.cashUsd)}` },
          { label: "Avg Conviction", value: `${fmt(data.avgConfidenceScore, 1)}/10` },
        ].map(m => (
          <div key={m.label} className="bg-[#F4F4F4] rounded-lg p-3">
            <div className="text-xs text-[#8E8E8E] mb-1">{m.label}</div>
            <div className="text-lg font-semibold text-[#171A20]">{m.value}</div>
          </div>
        ))}
      </div>

      {data.sectors.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide mb-2">Sector Breakdown</div>
          <div className="space-y-2">
            {data.sectors.map(s => (
              <div key={s.sector}>
                <div className="flex justify-between text-xs text-[#5C5E62] mb-1">
                  <span>{s.sector}</span>
                  <span>${s.valueUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })} ({s.pct.toFixed(1)}%)</span>
                </div>
                <div className="h-1.5 bg-[#EEEEEE] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.min(100, s.pct)}%`, backgroundColor: "#3E6AE1" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Section: Allocation Analysis ────────────────────────────────────────────

function AllocationSection({ data }: { data: AllocationAnalysisSection }) {
  const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Target Capital", value: `$${fmt(data.totalTargetUsd)}` },
          { label: "Deployed", value: `$${fmt(data.totalDeployedUsd)}` },
          { label: "Total Gap", value: `$${fmt(data.totalGapUsd)}` },
          { label: "% Funded", value: `${data.pctFunded.toFixed(1)}%` },
        ].map(m => (
          <div key={m.label} className="bg-[#F4F4F4] rounded-lg p-3">
            <div className="text-xs text-[#8E8E8E] mb-1">{m.label}</div>
            <div className="text-lg font-semibold text-[#171A20]">{m.value}</div>
          </div>
        ))}
      </div>

      {data.topGaps.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide mb-2">Top Allocation Gaps</div>
          <div className="space-y-2">
            {data.topGaps.map(t => (
              <div key={t.ticker} className="flex items-center gap-3">
                <span className="w-14 text-xs font-bold text-[#3E6AE1]">{t.ticker}</span>
                <div className="flex-1">
                  <div className="h-1.5 bg-[#EEEEEE] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#3E6AE1]"
                      style={{ width: `${Math.min(100, t.pctFunded)}%` }}
                    />
                  </div>
                </div>
                <span className="text-xs text-[#5C5E62] w-16 text-right">{t.pctFunded.toFixed(0)}% funded</span>
                <span className="text-xs text-[#8E8E8E] w-20 text-right">-${fmt(t.gapUsd)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.overallocated.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide mb-2">Overallocated</div>
          <div className="space-y-1">
            {data.overallocated.map(t => (
              <div key={t.ticker} className="flex justify-between text-sm">
                <span className="font-medium text-[#171A20]">{t.ticker}</span>
                <span className="text-[#b45309]">+${fmt(t.excessUsd)} over target</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 text-sm">
        <span className={`w-2 h-2 rounded-full ${data.canFullyFund ? "bg-green-500" : "bg-orange-500"}`} />
        <span className="text-[#5C5E62]">
          {data.canFullyFund
            ? "Cash is sufficient to close all gaps."
            : `Shortfall of $${fmt(data.shortfallUsd)} to fully fund all targets.`}
        </span>
      </div>
    </div>
  );
}

// ─── Section: Thesis Coverage ─────────────────────────────────────────────────

function ThesisSection({ data }: { data: ThesisCoverageSection }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {[
          { label: "Total", value: data.total },
          { label: "Active", value: data.active },
          { label: "Watchlist", value: data.watchlist },
          { label: "Published", value: data.published },
          { label: "Drafts", value: data.drafts },
          { label: "Overdue", value: data.overdueReviews },
        ].map(m => (
          <div key={m.label} className="bg-[#F4F4F4] rounded-lg p-3 text-center">
            <div className="text-xl font-semibold text-[#171A20]">{m.value}</div>
            <div className="text-xs text-[#8E8E8E] mt-0.5">{m.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.weakest.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide mb-2">Weakest Conviction</div>
            <div className="space-y-2">
              {data.weakest.map(t => (
                <div key={t.ticker} className="flex items-center gap-3">
                  <span className="w-14 text-xs font-bold text-[#3E6AE1]">{t.ticker}</span>
                  <div className="flex-1 h-1.5 bg-[#EEEEEE] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${t.score * 10}%`, backgroundColor: t.score < 5 ? "#c0392b" : t.score < 7 ? "#b45309" : "#2d7d46" }}
                    />
                  </div>
                  <span className="text-xs text-[#5C5E62]">{t.score}/10</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.strongest.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide mb-2">Highest Conviction</div>
            <div className="space-y-2">
              {data.strongest.map(t => (
                <div key={t.ticker} className="flex items-center gap-3">
                  <span className="w-14 text-xs font-bold text-[#3E6AE1]">{t.ticker}</span>
                  <div className="flex-1 h-1.5 bg-[#EEEEEE] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#2d7d46]"
                      style={{ width: `${t.score * 10}%` }}
                    />
                  </div>
                  <span className="text-xs text-[#5C5E62]">{t.score}/10</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Section: Risk Analysis ───────────────────────────────────────────────────

function RiskSection({ data }: { data: RiskAnalysisSection }) {
  const levelColor = {
    low:      { bg: "#F0FDF4", text: "#16A34A", border: "#BBF7D0" },
    medium:   { bg: "#FFFBEB", text: "#D97706", border: "#FDE68A" },
    high:     { bg: "#FFF7ED", text: "#EA580C", border: "#FED7AA" },
    critical: { bg: "#FEF2F2", text: "#DC2626", border: "#FECACA" },
  }[data.overallRiskLevel];

  return (
    <div className="space-y-4">
      <div
        className="rounded-lg p-3 flex items-center gap-3 border"
        style={{ backgroundColor: levelColor.bg, borderColor: levelColor.border }}
      >
        <span className="text-2xl font-bold" style={{ color: levelColor.text }}>
          {data.overallRiskLevel.toUpperCase()}
        </span>
        <span className="text-sm" style={{ color: levelColor.text }}>
          Overall portfolio risk level
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#F4F4F4] rounded-lg p-3">
          <div className="text-xs text-[#8E8E8E] mb-1">Triggered Kill Conditions</div>
          <div className="text-2xl font-semibold text-[#171A20]">{data.triggeredKills.length}</div>
        </div>
        <div className="bg-[#F4F4F4] rounded-lg p-3">
          <div className="text-xs text-[#8E8E8E] mb-1">Pending Actions</div>
          <div className="text-2xl font-semibold text-[#171A20]">{data.pendingActions}</div>
        </div>
      </div>

      {data.triggeredKills.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide mb-2">Triggered Kills</div>
          <div className="space-y-2">
            {data.triggeredKills.map((k, i) => (
              <div key={i} className="border border-[#FECACA] bg-[#FEF2F2] rounded-lg p-3">
                <span className="text-xs font-bold text-[#991B1B]">{k.ticker}</span>
                <p className="text-sm text-[#991B1B] mt-1">{k.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.lowConfidencePositions.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide mb-2">Low Conviction Positions</div>
          <div className="space-y-1">
            {data.lowConfidencePositions.map(p => (
              <div key={p.ticker} className="flex justify-between items-center py-1 border-b border-[#EEEEEE] last:border-0">
                <span className="text-sm font-medium text-[#171A20]">{p.ticker}</span>
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded"
                  style={{ backgroundColor: "#FFF7ED", color: "#b45309" }}
                >
                  {p.score}/10
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Section: Cash Allocation ─────────────────────────────────────────────────

function CashSection({ data }: { data: CashAllocationSection }) {
  const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Cash Available", value: `$${fmt(data.cashUsd)}` },
          { label: "Cash %", value: `${data.cashPct.toFixed(1)}%` },
          { label: "Total Gap", value: `$${fmt(data.totalGapUsd)}` },
          { label: "Shortfall", value: data.shortfallUsd > 0 ? `-$${fmt(data.shortfallUsd)}` : "None" },
        ].map(m => (
          <div key={m.label} className="bg-[#F4F4F4] rounded-lg p-3">
            <div className="text-xs text-[#8E8E8E] mb-1">{m.label}</div>
            <div className="text-lg font-semibold text-[#171A20]">{m.value}</div>
          </div>
        ))}
      </div>

      <div
        className="rounded-lg p-3 border text-sm"
        style={
          data.canFullyFund
            ? { backgroundColor: "#F0FDF4", borderColor: "#BBF7D0", color: "#15803D" }
            : { backgroundColor: "#FFF7ED", borderColor: "#FED7AA", color: "#92400E" }
        }
      >
        {data.canFullyFund
          ? "Cash is sufficient to fully fund all allocation targets."
          : `Cash is short by $${fmt(data.shortfallUsd)} to fully fund all allocation targets.`}
      </div>

      {data.topPriority.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide mb-2">Deployment Priority</div>
          <div className="space-y-2">
            {data.topPriority.map((t, i) => (
              <div key={t.ticker} className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full bg-[#3E6AE1] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <span className="text-sm font-semibold text-[#3E6AE1] w-14">{t.ticker}</span>
                <span className="text-sm text-[#5C5E62] flex-1">{t.name}</span>
                <span className="text-sm text-[#171A20] font-medium">${fmt(t.gapUsd)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Section: Watchlist ───────────────────────────────────────────────────────

function WatchlistSection({ data }: { data: WatchlistPrioritizationSection }) {
  if (data.items.length === 0) {
    return <p className="text-sm text-[#8E8E8E]">No watchlist items found.</p>;
  }

  return (
    <div className="space-y-3">
      {data.topCandidate && (
        <div className="bg-[#EEF3FD] border border-[#BFDBFE] rounded-lg p-3">
          <span className="text-xs font-semibold text-[#3E6AE1] uppercase tracking-wide">Top Candidate</span>
          <p className="text-sm font-semibold text-[#1E40AF] mt-1">{data.topCandidate}</p>
        </div>
      )}
      <div className="space-y-2">
        {data.items.map((w, i) => (
          <div
            key={w.ticker}
            className="border border-[#EEEEEE] rounded-lg p-3 flex items-start gap-3"
            style={i === 0 ? { borderColor: "#BFDBFE", backgroundColor: "#F8FAFF" } : undefined}
          >
            <span className="text-xs font-bold text-[#3E6AE1] w-14 pt-0.5">{w.ticker}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {w.name && <span className="text-sm font-medium text-[#171A20]">{w.name}</span>}
                {w.hasThesis && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: w.isDraftThesis ? "#FFF7ED" : "#F0FDF4", color: w.isDraftThesis ? "#b45309" : "#15803D" }}>
                    {w.isDraftThesis ? "Draft thesis" : "Thesis ready"}
                  </span>
                )}
                {w.targetEntryPrice && (
                  <span className="text-[10px] text-[#8E8E8E]">Target: ${w.targetEntryPrice}</span>
                )}
              </div>
              <p className="text-xs text-[#5C5E62] mt-1 line-clamp-2">{w.interestReason}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Section: Top Opportunities ──────────────────────────────────────────────

function OpportunitiesSection({ data }: { data: OpportunityEntry[] }) {
  const fmtUsd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  if (data.length === 0) {
    return (
      <p className="text-sm text-[#8E8E8E]">
        No opportunities computed. Generate a new review to include opportunity scores.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-[#8E8E8E]">
        Top 3 opportunities at review time — scored by quality × allocation gap × diversification × watchlist × Brain OS fit.
        See the full <a href="/opportunities" className="text-[#3E6AE1] hover:underline">Opportunity Engine</a> for all ranked entries.
      </p>

      {data.map((entry, i) => {
        const scoreColor =
          entry.opportunityScore >= 75 ? "#2d7d46" :
          entry.opportunityScore >= 55 ? "#3E6AE1" : "#D97706";

        return (
          <div key={entry.ticker} className="border border-[#EEEEEE] rounded-xl p-4 space-y-3">
            {/* Header */}
            <div className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-[#3E6AE1] text-white text-xs font-bold flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-[#171A20]">{entry.ticker}</span>
                  <span className="text-xs text-[#8E8E8E]">{entry.companyName}</span>
                  {entry.inPortfolio && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: "#F0FDF4", color: "#15803D" }}>In Portfolio</span>
                  )}
                  {entry.inWatchlist && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: "#EEF3FD", color: "#3E6AE1" }}>Watchlist</span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xl font-bold" style={{ color: scoreColor }}>
                  {entry.opportunityScore.toFixed(1)}
                </div>
                <div className="text-[10px] text-[#AAAAAA]">opp score</div>
              </div>
            </div>

            {/* Reasoning */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-[#171A20]">{entry.reasoning.whyBuy}</p>
              <p className="text-xs text-[#5C5E62]">{entry.reasoning.whyNow}</p>
            </div>

            {/* Allocation suggestion */}
            <div className="flex gap-2">
              {[
                { label: "Starter", pct: entry.suggestedAllocation.starterPct, usd: entry.suggestedAllocation.starterUsd },
                { label: "Target", pct: entry.suggestedAllocation.targetPct, usd: entry.suggestedAllocation.targetUsd },
              ].map(a => (
                <div key={a.label} className="flex-1 bg-[#F4F4F4] rounded-lg p-2 text-center">
                  <div className="text-[10px] text-[#8E8E8E] uppercase tracking-wide">{a.label}</div>
                  <div className="text-sm font-semibold text-[#171A20]">{a.pct.toFixed(1)}%</div>
                  <div className="text-[11px] text-[#5C5E62]">{fmtUsd(a.usd)}</div>
                </div>
              ))}
              <div className="flex items-center">
                <span
                  className="text-xs font-semibold px-2 py-1 rounded"
                  style={
                    entry.reasoning.positionType === "initiate"
                      ? { backgroundColor: "#EEF3FD", color: "#3E6AE1" }
                      : { backgroundColor: "#F0FDF4", color: "#15803D" }
                  }
                >
                  {entry.reasoning.positionType === "initiate" ? "Initiate" : "Add More"}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Section tabs ─────────────────────────────────────────────────────────────

type TabId = "summary" | "allocation" | "thesis" | "risk" | "cash" | "watchlist" | "opportunities";

const TABS: { id: TabId; label: string }[] = [
  { id: "summary",       label: "Portfolio Summary" },
  { id: "allocation",    label: "Allocation" },
  { id: "thesis",        label: "Thesis Coverage" },
  { id: "risk",          label: "Risk" },
  { id: "cash",          label: "Cash" },
  { id: "watchlist",     label: "Watchlist" },
  { id: "opportunities", label: "Opportunities" },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReviewPage() {
  const [reviews, setReviews] = useState<PortfolioReviewRecord[]>([]);
  const [selected, setSelected] = useState<PortfolioReviewRecord | null>(null);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("summary");
  const [showHistory, setShowHistory] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/portfolio-review")
      .then(r => r.json())
      .then(d => {
        setReviews(d.reviews ?? []);
        setSelected(d.reviews?.[0] ?? null);
      })
      .catch(() => setError("Failed to load reviews."))
      .finally(() => setLoading(false));
  }, []);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notes.trim() || null }),
      });
      if (!res.ok) throw new Error(await res.text());
      const review: PortfolioReviewRecord = await res.json();
      setReviews(prev => [review, ...prev]);
      setSelected(review);
      setNotes("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate review.");
    } finally {
      setGenerating(false);
    }
  }

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-sm text-[#8E8E8E]">Loading reviews...</span>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 md:px-6 space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-[#171A20]">Portfolio Review</h1>
          {selected && (
            <p className="text-xs text-[#8E8E8E] mt-0.5">
              Last generated {fmtDate(selected.generatedAt)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {reviews.length > 1 && (
            <button
              onClick={() => setShowHistory(h => !h)}
              className="text-sm text-[#3E6AE1] hover:underline"
            >
              {showHistory ? "Hide" : "Show"} history ({reviews.length})
            </button>
          )}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg text-white transition-opacity"
            style={{ backgroundColor: "#3E6AE1", opacity: generating ? 0.6 : 1 }}
          >
            {generating ? (
              <>
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Generating...
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
                Generate Review
              </>
            )}
          </button>
        </div>
      </div>

      {/* Notes input */}
      <div>
        <input
          type="text"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Optional notes for this review..."
          className="w-full text-sm border border-[#EEEEEE] rounded-lg px-3 py-2 focus:outline-none focus:border-[#3E6AE1] text-[#171A20] placeholder-[#AAAAAA]"
        />
      </div>

      {error && (
        <div className="text-sm text-[#DC2626] bg-[#FEF2F2] border border-[#FECACA] rounded-lg px-4 py-2">
          {error}
        </div>
      )}

      {/* ── History ── */}
      {showHistory && reviews.length > 1 && (
        <div className="bg-white border border-[#EEEEEE] rounded-xl p-4 space-y-2">
          <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide mb-1">Review History</div>
          {reviews.map(r => (
            <button
              key={r.id}
              onClick={() => { setSelected(r); setShowHistory(false); }}
              className="w-full text-left flex items-center justify-between gap-4 px-3 py-2 rounded-lg hover:bg-[#F4F4F4] transition-colors"
              style={selected?.id === r.id ? { backgroundColor: "#EEF3FD" } : undefined}
            >
              <span className="text-sm text-[#171A20]">{fmtDate(r.generatedAt)}</span>
              {r.notes && <span className="text-xs text-[#8E8E8E] truncate max-w-xs">{r.notes}</span>}
              <span className="text-xs px-2 py-0.5 rounded font-semibold"
                style={
                  r.riskAnalysis.overallRiskLevel === "critical" ? { backgroundColor: "#FEF2F2", color: "#DC2626" } :
                  r.riskAnalysis.overallRiskLevel === "high"     ? { backgroundColor: "#FFF7ED", color: "#EA580C" } :
                  r.riskAnalysis.overallRiskLevel === "medium"   ? { backgroundColor: "#FFFBEB", color: "#D97706" } :
                  { backgroundColor: "#F0FDF4", color: "#16A34A" }
                }
              >
                {r.riskAnalysis.overallRiskLevel}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── No reviews yet ── */}
      {!selected && !generating && (
        <div className="bg-white border border-[#EEEEEE] rounded-xl p-10 text-center">
          <svg className="mx-auto mb-3 text-[#CCCCCC]" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <p className="text-sm font-medium text-[#5C5E62]">No reviews yet</p>
          <p className="text-xs text-[#8E8E8E] mt-1">Click Generate Review to analyse your portfolio.</p>
        </div>
      )}

      {selected && (
        <>
          {/* ── AI Review Cards ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <ReviewCardUI
              title="Biggest Risk"
              card={selected.biggestRisk}
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              }
            />
            <ReviewCardUI
              title="Biggest Opportunity"
              card={selected.biggestOpportunity}
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                  <polyline points="16 7 22 7 22 13" />
                </svg>
              }
            />
            <ReviewCardUI
              title="Most Underallocated"
              card={selected.mostUnderallocated}
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
              }
            />
            <ReviewCardUI
              title="Weakest Thesis"
              card={selected.weakestThesis}
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              }
            />
            {/* Reviews Due — can be multiple */}
            <div
              className="bg-white rounded-xl p-4 flex flex-col gap-2 border border-[#EEEEEE] md:col-span-2 lg:col-span-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-[#8E8E8E]">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-[#8E8E8E]">Reviews Due</span>
              </div>
              <div className="space-y-2 mt-1">
                {selected.reviewsDue.map((card, i) => (
                  <div key={i} className="flex items-start gap-2">
                    {card.ticker && (
                      <span className="text-xs font-bold text-[#3E6AE1] w-12 shrink-0 pt-0.5">{card.ticker}</span>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#171A20] leading-snug">{card.headline}</p>
                      <p className="text-xs text-[#5C5E62] leading-relaxed mt-0.5">{card.detail}</p>
                    </div>
                    <SeverityBadge s={card.severity} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Filing Intelligence Cards (Phase 5E) ── */}
          {(selected.filingsRequiringReview?.length > 0 || selected.thesisAlerts?.length > 0 || selected.newRisksDetected?.length > 0) && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[#8E8E8E] mb-2 px-1">
                Primary Source Intelligence
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Filings Requiring Review */}
                <div className="bg-white rounded-xl p-4 flex flex-col gap-2 border border-[#EEEEEE]">
                  <div className="flex items-center gap-2 mb-1">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3E6AE1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                    </svg>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-[#8E8E8E]">Recent Filings</span>
                  </div>
                  <div className="space-y-2">
                    {(selected.filingsRequiringReview ?? []).slice(0, 4).map((card, i) => (
                      <div key={i} className="flex items-start gap-2">
                        {card.ticker && <span className="text-xs font-bold text-[#3E6AE1] w-12 shrink-0 pt-0.5">{card.ticker}</span>}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-[#171A20] leading-snug">{card.headline}</p>
                          <p className="text-[11px] text-[#8E8E8E] leading-snug mt-0.5 line-clamp-2">{card.detail}</p>
                        </div>
                        <SeverityBadge s={card.severity} />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Thesis Alerts */}
                <div className="bg-white rounded-xl p-4 flex flex-col gap-2 border border-[#EEEEEE]">
                  <div className="flex items-center gap-2 mb-1">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-[#8E8E8E]">Thesis Alerts</span>
                  </div>
                  <div className="space-y-2">
                    {(selected.thesisAlerts ?? []).slice(0, 4).map((card, i) => (
                      <div key={i} className="flex items-start gap-2">
                        {card.ticker && <span className="text-xs font-bold text-[#3E6AE1] w-12 shrink-0 pt-0.5">{card.ticker}</span>}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-[#171A20] leading-snug">{card.headline}</p>
                          <p className="text-[11px] text-[#8E8E8E] leading-snug mt-0.5 line-clamp-2">{card.detail}</p>
                        </div>
                        <SeverityBadge s={card.severity} />
                      </div>
                    ))}
                  </div>
                </div>

                {/* New Risks Detected */}
                <div className="bg-white rounded-xl p-4 flex flex-col gap-2 border border-[#EEEEEE]">
                  <div className="flex items-center gap-2 mb-1">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-[#8E8E8E]">New Risks Detected</span>
                  </div>
                  <div className="space-y-2">
                    {(selected.newRisksDetected ?? []).slice(0, 4).map((card, i) => (
                      <div key={i} className="flex items-start gap-2">
                        {card.ticker && <span className="text-xs font-bold text-[#3E6AE1] w-12 shrink-0 pt-0.5">{card.ticker}</span>}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-[#171A20] leading-snug">{card.headline}</p>
                          <p className="text-[11px] text-[#8E8E8E] leading-snug mt-0.5 line-clamp-2">{card.detail}</p>
                        </div>
                        <SeverityBadge s={card.severity} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Section Detail Tabs ── */}
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
                </button>
              ))}
            </div>

            <div className="p-5">
              {activeTab === "summary"       && <SummarySection       data={selected.portfolioSummary} />}
              {activeTab === "allocation"    && <AllocationSection    data={selected.allocationAnalysis} />}
              {activeTab === "thesis"        && <ThesisSection        data={selected.thesisCoverageAnalysis} />}
              {activeTab === "risk"          && <RiskSection          data={selected.riskAnalysis} />}
              {activeTab === "cash"          && <CashSection          data={selected.cashAllocationReview} />}
              {activeTab === "watchlist"     && <WatchlistSection     data={selected.watchlistPrioritization} />}
              {activeTab === "opportunities" && <OpportunitiesSection data={selected.topOpportunities ?? []} />}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
