"use client";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import type { OpportunityEntry, OpportunityResult, DisagreementOpportunity, AgreementOpportunity } from "@/app/api/opportunities/route";
import type { FeedbackType } from "@/app/api/feedback/route";
import { WatchlistButton } from "@/components/watchlist-button";

// ─── Tier badge ───────────────────────────────────────────────────────────────

const TIER_LABELS: Record<string, string> = {
  tier1: "Large Cap", tier2: "Mid Cap", tier3: "Small Cap", tier4: "ETF", tier5: "Intl",
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
    <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
      style={{ backgroundColor: c.bg, color: c.text }}>
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
        <span className="text-[11px] font-medium text-[#171A20]">
          {score.toFixed(0)} <span className="text-[#AAAAAA]">({weight}%)</span>
        </span>
      </div>
      <div className="h-1.5 bg-[#EEEEEE] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(100, score)}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

// ─── Preference bar ───────────────────────────────────────────────────────────

function PreferenceBar({ score, label }: { score: number; label: string }) {
  const color = score >= 70 ? "#15803D" : score >= 45 ? "#8E8E8E" : "#DC2626";
  const width = score;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-[#5C5E62]">User preference</span>
        <span className="text-[11px] font-medium" style={{ color }}>
          {score}/100 · {label}
        </span>
      </div>
      <div className="h-1.5 bg-[#EEEEEE] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all"
          style={{ width: `${width}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

// ─── Confidence pips ──────────────────────────────────────────────────────────

function ConfidencePips({ confidence }: { confidence: number }) {
  const color = confidence >= 8 ? "#15803D" : confidence >= 5 ? "#D97706" : "#DC2626";
  return (
    <div className="flex items-center gap-0.5" title={`Confidence: ${confidence}/10`}>
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="w-1 h-2 rounded-sm"
          style={{ backgroundColor: i < confidence ? color : "#EEEEEE" }} />
      ))}
      <span className="text-[10px] ml-1" style={{ color }}>{confidence}/10</span>
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

// ─── Feedback strip ───────────────────────────────────────────────────────────

const FEEDBACK_OPTIONS: { type: FeedbackType; label: string; activeColor: string }[] = [
  { type: "interested",     label: "Interested",  activeColor: "#15803D" },
  { type: "researching",    label: "Researching", activeColor: "#3E6AE1" },
  { type: "not_interested", label: "Not for me",  activeColor: "#8E8E8E" },
  { type: "disagree",       label: "Disagree",    activeColor: "#DC2626" },
];

const PREFERENCE_LABELS: Record<string, string> = {
  interested:     "Interested",
  researching:    "Researching",
  already_owned:  "Already owned",
  not_interested: "Not for me",
  disagree:       "Disagree",
};

function FeedbackStrip({ ticker, currentFeedback, onFeedback }: {
  ticker: string;
  currentFeedback: string | null;
  onFeedback: (ticker: string, type: FeedbackType) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function submit(type: FeedbackType) {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, feedbackType: type }),
      });
      onFeedback(ticker, type);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      <span className="text-[10px] text-[#AAAAAA] mr-0.5">Your signal:</span>
      {FEEDBACK_OPTIONS.map(opt => {
        const isActive = currentFeedback === opt.type;
        return (
          <button key={opt.type}
            onClick={e => { e.stopPropagation(); submit(opt.type); }}
            disabled={busy}
            className="text-[11px] font-medium px-2 py-1 rounded border transition-all"
            style={
              isActive
                ? { backgroundColor: opt.activeColor, color: "#fff", borderColor: opt.activeColor }
                : { backgroundColor: "#F4F4F4", color: "#5C5E62", borderColor: "#EEEEEE" }
            }>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Opportunity card ─────────────────────────────────────────────────────────

function OpportunityCard({ entry, onFeedback }: {
  entry: OpportunityEntry;
  onFeedback: (ticker: string, type: FeedbackType) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [researchState, setResearchState] = useState<"idle" | "generating" | "done">("idle");
  const scoreColor = entry.objectiveScore >= 75 ? "#2d7d46" : entry.objectiveScore >= 55 ? "#3E6AE1" : "#D97706";

  async function handleGenerateResearch(e: React.MouseEvent) {
    e.stopPropagation();
    setResearchState("generating");
    try {
      const res = await fetch(`/api/research/${entry.ticker}/generate`, { method: "POST" });
      setResearchState(res.ok ? "done" : "idle");
    } catch {
      setResearchState("idle");
    }
  }

  const prefLabel = entry.userFeedback ? PREFERENCE_LABELS[entry.userFeedback] : null;
  const prefBadgeStyle = !entry.userFeedback ? null
    : entry.userFeedback === "disagree"      ? { bg: "#FEF2F2", text: "#DC2626" }
    : entry.userFeedback === "not_interested" ? { bg: "#F4F4F4", text: "#8E8E8E" }
    : { bg: "#F0FDF4", text: "#15803D" };

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
      <button className="w-full text-left p-4" onClick={() => setExpanded(e => !e)}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-bold text-[#171A20]">{entry.ticker}</span>
              <TierBadge tier={entry.universeTier} />
              {entry.inPortfolio && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: "#F0FDF4", color: "#15803D" }}>In Portfolio</span>
              )}
              {entry.inWatchlist && !expanded && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: "#EEF3FD", color: "#3E6AE1" }}>Watching</span>
              )}
              {prefBadgeStyle && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: prefBadgeStyle.bg, color: prefBadgeStyle.text }}>
                  {prefLabel}
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
                {entry.objectiveScore.toFixed(1)}
              </div>
              <div className="text-[10px] text-[#AAAAAA] leading-none">objective</div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#AAAAAA" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[#EEEEEE] p-4 space-y-4">

          {/* Objective Drivers */}
          <div className="space-y-2">
            <div className="text-[11px] font-semibold text-[#8E8E8E] uppercase tracking-wide">
              Objective Drivers
              <span className="ml-1.5 normal-case font-normal text-[#AAAAAA]">· AI-only · feedback has no effect on these</span>
            </div>
            <ScoreBar label="Company Quality" score={entry.companyScore} weight={50} color="#3E6AE1" />
            <ScoreBar label="Allocation Gap" score={entry.allocationGapScore} weight={15} color="#16A34A" />
            <ScoreBar label="Diversification" score={entry.diversificationScore} weight={15} color="#7C3AED" />
            <ScoreBar label="Watchlist Signal" score={entry.watchlistScore} weight={10} color="#D97706" />
            <ScoreBar label="Brain OS Alignment" score={entry.brainAlignmentScore} weight={10} color="#DC2626" />
          </div>

          {/* Preference Signal — clearly separated */}
          <div className="bg-[#F4F4F4] rounded-lg p-3 space-y-2">
            <div className="text-[11px] font-semibold text-[#8E8E8E] uppercase tracking-wide">
              Your Preference Signal
              <span className="ml-1.5 normal-case font-normal text-[#AAAAAA]">· visible only · does not change rank</span>
            </div>
            <PreferenceBar
              score={entry.preferenceScore}
              label={entry.userFeedback ? PREFERENCE_LABELS[entry.userFeedback] : "No signal yet"}
            />
            <FeedbackStrip ticker={entry.ticker} currentFeedback={entry.userFeedback} onFeedback={onFeedback} />
          </div>

          {/* Confidence */}
          <div>
            <div className="text-[11px] font-semibold text-[#8E8E8E] uppercase tracking-wide mb-1.5">
              Data Confidence
              <span className="ml-1.5 normal-case font-normal text-[#AAAAAA]">· based on data completeness only</span>
            </div>
            <ConfidencePips confidence={entry.confidence} />
            {entry.uncertaintyFactors.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {entry.uncertaintyFactors.map((f, i) => (
                  <li key={i} className="text-[11px] text-[#D97706] flex items-start gap-1">
                    <span className="shrink-0 mt-0.5">⚠</span>{f}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Key Metrics */}
          {entry.fundamentals && (
            <div>
              <div className="text-[11px] font-semibold text-[#8E8E8E] uppercase tracking-wide mb-2">Key Metrics</div>
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  { label: "ROIC",   value: entry.fundamentals.roic != null ? `${entry.fundamentals.roic.toFixed(1)}%` : "—" },
                  { label: "Gross M", value: entry.fundamentals.grossMargin != null ? `${entry.fundamentals.grossMargin.toFixed(1)}%` : "—" },
                  { label: "Rev G",  value: entry.fundamentals.revenueGrowth != null ? `${entry.fundamentals.revenueGrowth.toFixed(1)}%` : "—" },
                  { label: "D/E",    value: entry.fundamentals.debtToEquity != null ? entry.fundamentals.debtToEquity.toFixed(2) : "—" },
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

          {/* Supporting / contradicting */}
          {((entry.supportingFactors?.length ?? 0) > 0 || (entry.contradictingFactors?.length ?? 0) > 0) && (
            <div className="grid grid-cols-2 gap-3">
              {(entry.supportingFactors?.length ?? 0) > 0 && (
                <div>
                  <div className="text-[11px] font-semibold text-[#8E8E8E] uppercase tracking-wide mb-1.5">Supporting</div>
                  <ul className="space-y-1">
                    {entry.supportingFactors.map((f, i) => (
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
                    {entry.contradictingFactors.map((f, i) => (
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
                {entry.allocationTarget && <> · Target: ${entry.allocationTarget.targetUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}</>}
              </div>
            )}
          </div>

          {/* Action + Generate Research */}
          <div className="flex items-center gap-2 flex-wrap">
            <WatchlistButton
              ticker={entry.ticker}
              companyName={entry.companyName}
              initiallyWatched={entry.inWatchlist}
              size="sm"
            />
            <span className="text-xs font-semibold px-3 py-1.5 rounded-lg"
              style={
                entry.reasoning.positionType === "initiate" ? { backgroundColor: "#EEF3FD", color: "#3E6AE1" }
                : entry.reasoning.positionType === "add"    ? { backgroundColor: "#F0FDF4", color: "#15803D" }
                : { backgroundColor: "#F4F4F4", color: "#5C5E62" }
              }>
              {entry.reasoning.positionType === "initiate" ? "Initiate Position"
                : entry.reasoning.positionType === "add" ? "Add to Position"
                : "Hold — no immediate action"}
            </span>
            {entry.sector && <span className="text-xs text-[#AAAAAA]">{entry.sector}</span>}
            <div className="ml-auto">
              {researchState === "done" ? (
                <a href="/research"
                  className="text-xs font-medium px-3 py-1.5 rounded border border-[#BBF7D0] text-[#15803D] hover:bg-[#F0FDF4] transition-colors">
                  View Dossier →
                </a>
              ) : (
                <button onClick={handleGenerateResearch} disabled={researchState === "generating"}
                  className="text-xs font-medium px-3 py-1.5 rounded border border-[#EEEEEE] text-[#5C5E62] hover:border-[#3E6AE1] hover:text-[#3E6AE1] transition-colors disabled:opacity-50">
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

// ─── Disagreement section ─────────────────────────────────────────────────────

function DisagreementSection({ items }: { items: DisagreementOpportunity[] }) {
  if (items.length === 0) return null;
  return (
    <div className="bg-white border border-[#FECACA] rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-[#FECACA] bg-[#FEF2F2]">
        <div className="text-sm font-semibold text-[#DC2626]">AI High Conviction — Your Low Interest</div>
        <p className="text-[11px] text-[#DC2626] opacity-70 mt-0.5">
          The model rates these highly on objective criteria. You&apos;ve signaled low interest.
          Consider whether the data warrants a second look.
        </p>
      </div>
      <div className="divide-y divide-[#EEEEEE]">
        {items.map(item => (
          <div key={item.ticker} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-[#171A20]">{item.ticker}</span>
                  {item.sector && <span className="text-[11px] text-[#8E8E8E]">{item.sector}</span>}
                </div>
                <div className="text-[11px] text-[#5C5E62] mt-1 line-clamp-2">{item.whyAILikes}</div>
                <div className="text-[11px] text-[#DC2626] mt-0.5">
                  Your signal: {item.whyUserMayDisagree}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-lg font-bold text-[#DC2626]">{item.objectiveScore.toFixed(1)}</div>
                <div className="text-[10px] text-[#AAAAAA]">objective</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Agreement section ────────────────────────────────────────────────────────

function AgreementSection({ items }: { items: AgreementOpportunity[] }) {
  if (items.length === 0) return null;
  return (
    <div className="bg-white border border-[#BBF7D0] rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-[#BBF7D0] bg-[#F0FDF4]">
        <div className="text-sm font-semibold text-[#15803D]">AI High Conviction — Your High Interest</div>
        <p className="text-[11px] text-[#15803D] opacity-70 mt-0.5">
          Both objective scoring and your signals point the same direction.
        </p>
      </div>
      <div className="divide-y divide-[#EEEEEE]">
        {items.map(item => (
          <div key={item.ticker} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-[#171A20]">{item.ticker}</span>
                  {item.sector && <span className="text-[11px] text-[#8E8E8E]">{item.sector}</span>}
                </div>
                <div className="text-[11px] text-[#5C5E62] mt-1">{item.alignment}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-lg font-bold text-[#15803D]">{item.objectiveScore.toFixed(1)}</div>
                <div className="text-[10px] text-[#AAAAAA]">objective</div>
              </div>
            </div>
          </div>
        ))}
      </div>
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
    case "bestBuys":      return [...entries].sort((a, b) => b.objectiveScore - a.objectiveScore);
    case "conviction":    return [...entries].sort((a, b) => b.companyScore - a.companyScore);
    case "underallocated":
      return [...entries].filter(e => e.allocationTarget != null && e.allocationGapScore > 0)
        .sort((a, b) => b.allocationGapScore - a.allocationGapScore);
    case "diversification": return [...entries].sort((a, b) => b.diversificationScore - a.diversificationScore);
    case "watchlist":
      return [...entries].filter(e => e.inWatchlist).sort((a, b) => b.objectiveScore - a.objectiveScore);
  }
}

// ─── Main page ────────────────────────────────────────────────────────────────

type PageTab = "recommended" | "committee" | "agreement" | "disagreement" | "watchlist" | "screener";
const PAGE_TABS: { id: PageTab; label: string }[] = [
  { id: "recommended",  label: "Top Ranked" },
  { id: "committee",    label: "Committee" },
  { id: "agreement",    label: "Agreement" },
  { id: "disagreement", label: "Disagreement" },
  { id: "watchlist",    label: "Watchlist" },
  { id: "screener",     label: "Screener" },
];

export default function OpportunitiesPage() {
  const [result, setResult] = useState<OpportunityResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("bestBuys");
  const [pageTab, setPageTab] = useState<PageTab>("recommended");
  const [feedbackMap, setFeedbackMap] = useState<Record<string, FeedbackType>>({});
  const [screenerData, setScreenerData] = useState<{ ticker: string; companyName: string; totalScore: number; universeTier: string; sector: string | null }[]>([]);
  const [screenerError, setScreenerError] = useState<string | null>(null);
  const [screenerLoading, setScreenerLoading] = useState(false);
  const screenerFetchedRef = useRef(false);
  const [committeeSessions, setCommitteeSessions] = useState<{ id: string; ticker: string; companyName: string; conviction: string; verdict: string; createdAt: string }[]>([]);
  const committeeFetchedRef = useRef(false);

  useEffect(() => {
    fetch("/api/opportunities")
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        const res = d as OpportunityResult;
        setResult(res);
        const initial: Record<string, FeedbackType> = {};
        for (const e of res.entries) {
          if (e.userFeedback) initial[e.ticker] = e.userFeedback as FeedbackType;
        }
        setFeedbackMap(initial);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (pageTab !== "committee" || committeeFetchedRef.current) return;
    committeeFetchedRef.current = true;
    fetch("/api/committee")
      .then(r => r.json())
      .then(d => {
        const seen = new Set<string>();
        const latest = (d.sessions ?? []).filter((s: { ticker: string }) => {
          if (seen.has(s.ticker)) return false;
          seen.add(s.ticker);
          return true;
        });
        setCommitteeSessions(latest);
      })
      .catch(() => {});
  }, [pageTab]);

  useEffect(() => {
    if (pageTab !== "screener" || screenerFetchedRef.current) return;
    screenerFetchedRef.current = true;
    setScreenerLoading(true);
    fetch("/api/screener")
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => {
        type Row = { ticker: string; companyName: string; universeTier: string; sector: string | null; latestScore: { totalScore: number } | null };
        const entries = (d.passed ?? d.all ?? []) as Row[];
        setScreenerData(
          entries
            .map(e => ({ ticker: e.ticker, companyName: e.companyName, totalScore: e.latestScore?.totalScore ?? 0, universeTier: e.universeTier, sector: e.sector }))
            .sort((a, b) => b.totalScore - a.totalScore)
        );
      })
      .catch(() => setScreenerError("Failed to load screener data."))
      .finally(() => setScreenerLoading(false));
  }, [pageTab]);

  const handleFeedback = useCallback((ticker: string, type: FeedbackType) => {
    setFeedbackMap(prev => ({ ...prev, [ticker]: type }));
    // Patch preference score + userFeedback in-place (objectiveScore never changes)
    const PREF_SCORES: Record<string, number> = {
      interested: 90, researching: 75, already_owned: 60, not_interested: 20, disagree: 5,
    };
    setResult(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        entries: prev.entries.map(e =>
          e.ticker !== ticker ? e : { ...e, userFeedback: type, preferenceScore: PREF_SCORES[type] ?? 50 }
        ),
        // Rebuild agreement/disagreement surfaces based on updated feedback
        disagreementOpportunities: prev.disagreementOpportunities.filter(d => d.ticker !== ticker)
          .concat(
            prev.entries
              .filter(e => e.ticker === ticker && e.objectiveScore >= 62 && (type === "disagree" || type === "not_interested"))
              .map(e => ({
                ticker: e.ticker, companyName: e.companyName, sector: e.sector,
                objectiveScore: e.objectiveScore, userFeedback: type,
                whyAILikes: e.reasoning.whyBuy,
                whyUserMayDisagree: type === "disagree" ? "Contradicts current investment view" : "Outside current area of interest",
              }))
          ),
        agreementOpportunities: prev.agreementOpportunities.filter(a => a.ticker !== ticker)
          .concat(
            prev.entries
              .filter(e => e.ticker === ticker && e.objectiveScore >= 62 && (type === "interested" || type === "researching"))
              .map(e => ({
                ticker: e.ticker, companyName: e.companyName, sector: e.sector,
                objectiveScore: e.objectiveScore, userFeedback: type,
                alignment: type === "interested" ? "Marked as interested — aligned with current conviction" : "Actively researching — high personal engagement",
              }))
          ),
      };
    });
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/opportunities", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      setResult(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save scores.");
    } finally {
      setSaving(false);
    }
  }

  const entriesWithFeedback = useMemo(() => {
    if (!result) return [];
    return result.entries.map(e => ({
      ...e,
      userFeedback: feedbackMap[e.ticker] ?? e.userFeedback,
    }));
  }, [result, feedbackMap]);

  const visibleEntries = useMemo(
    () => filterAndSort(entriesWithFeedback, activeTab),
    [entriesWithFeedback, activeTab]
  );

  const fmtUsd = (n: number | null | undefined) =>
    n == null || !isFinite(n) ? "—" : `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

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
          <h1 className="text-xl font-semibold text-[#171A20]">Opportunities</h1>
          <p className="text-xs text-[#8E8E8E] mt-0.5">
            Discovery hub · objective rankings · 50% quality · preference visible but never blended
          </p>
        </div>
        <button onClick={handleSave} disabled={saving || loading}
          className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg text-white transition-opacity"
          style={{ backgroundColor: "#3E6AE1", opacity: saving ? 0.6 : 1 }}>
          {saving ? (
            <><svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>Saving...</>
          ) : (
            <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
            </svg>Save Snapshot</>
          )}
        </button>
      </div>

      {error && (
        <div className="text-sm text-[#DC2626] bg-[#FEF2F2] border border-[#FECACA] rounded-lg px-4 py-2">{error}</div>
      )}

      {/* Outer page tab bar */}
      <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
        <div className="border-b border-[#EEEEEE] flex overflow-x-auto">
          {PAGE_TABS.map(pt => (
            <button key={pt.id} onClick={() => setPageTab(pt.id)}
              className="shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors"
              style={
                pageTab === pt.id
                  ? { borderColor: "#3E6AE1", color: "#3E6AE1" }
                  : { borderColor: "transparent", color: "#5C5E62" }
              }>
              {pt.label}
              {pt.id === "agreement" && result && result.agreementOpportunities.length > 0 && (
                <span className="ml-1.5 text-[10px] bg-[#15803D] text-white rounded-full px-1.5 py-0.5">
                  {result.agreementOpportunities.length}
                </span>
              )}
              {pt.id === "disagreement" && result && result.disagreementOpportunities.length > 0 && (
                <span className="ml-1.5 text-[10px] bg-[#DC2626] text-white rounded-full px-1.5 py-0.5">
                  {result.disagreementOpportunities.length}
                </span>
              )}
              {pt.id === "watchlist" && result && result.summary.onWatchlist > 0 && (
                <span className="ml-1.5 text-[10px] bg-[#3E6AE1] text-white rounded-full px-1.5 py-0.5">
                  {result.summary.onWatchlist}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="p-4">
          {/* ── Recommended ── */}
          {pageTab === "recommended" && (
            <div className="space-y-4">
              {/* Summary stats */}
              {result && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: "Universe Scored",   value: result.summary.totalScored.toString() },
                    { label: "New Opportunities", value: result.summary.newPositions.toString() },
                    { label: "On Watchlist",      value: result.summary.onWatchlist.toString() },
                    { label: "Available Cash",    value: fmtUsd(result.summary.availableCashUsd) },
                  ].map(m => (
                    <div key={m.label} className="bg-[#F4F4F4] rounded-xl p-3">
                      <div className="text-xs text-[#8E8E8E] mb-1">{m.label}</div>
                      <div className="text-lg font-semibold text-[#171A20]">{m.value}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Top opportunity */}
              {result?.summary.topOpportunity && (
                <div className="bg-[#EEF3FD] border border-[#BFDBFE] rounded-xl p-4">
                  <div className="text-[11px] font-semibold text-[#3E6AE1] uppercase tracking-wide mb-1">Top Objective Opportunity</div>
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-[#1E40AF]">{result.summary.topOpportunity}</span>
                    <span className="text-sm text-[#3E6AE1]">{result.entries[0]?.companyName}</span>
                    <span className="text-xl font-bold text-[#3E6AE1] ml-auto">{result.entries[0]?.objectiveScore.toFixed(1)}</span>
                  </div>
                  <p className="text-xs text-[#3E6AE1] mt-1">{result.entries[0]?.reasoning.whyNow}</p>
                </div>
              )}

              {loading && <div className="py-8 text-center text-sm text-[#8E8E8E]">Computing opportunities…</div>}

              {/* Inner filter tabs + ranked list */}
              {result && (
                <div className="border border-[#EEEEEE] rounded-xl overflow-hidden">
                  <div className="border-b border-[#EEEEEE] flex overflow-x-auto bg-[#F4F4F4]">
                    {TABS.map(tab => (
                      <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                        className="shrink-0 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors"
                        style={
                          activeTab === tab.id
                            ? { borderColor: "#3E6AE1", color: "#3E6AE1", backgroundColor: "white" }
                            : { borderColor: "transparent", color: "#5C5E62", backgroundColor: "transparent" }
                        }>
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  <div className="p-4 space-y-3">
                    {visibleEntries.length === 0 ? (
                      <p className="text-sm text-[#8E8E8E] text-center py-8">No opportunities for this filter.</p>
                    ) : (
                      visibleEntries.map(entry => (
                        <OpportunityCard key={entry.ticker} entry={entry} onFeedback={handleFeedback} />
                      ))
                    )}
                  </div>
                </div>
              )}

              {result && (
                <div className="text-center text-xs text-[#AAAAAA]">
                  Computed {new Date(result.generatedAt).toLocaleString()} · {result.summary.totalScored} entries · {result.preferenceProfile.totalSignals} preference signals
                </div>
              )}
            </div>
          )}

          {/* ── Agreement ── */}
          {pageTab === "agreement" && (
            <div>
              {result ? (
                result.agreementOpportunities.length === 0 ? (
                  <p className="text-sm text-[#8E8E8E] text-center py-8">No agreement opportunities. Mark some tickers as Interested or Researching.</p>
                ) : (
                  <AgreementSection items={result.agreementOpportunities} />
                )
              ) : (
                <div className="py-8 text-center text-sm text-[#8E8E8E]">Loading…</div>
              )}
            </div>
          )}

          {/* ── Disagreement ── */}
          {pageTab === "disagreement" && (
            <div>
              {result ? (
                result.disagreementOpportunities.length === 0 ? (
                  <p className="text-sm text-[#8E8E8E] text-center py-8">No disagreement opportunities. Mark some high-scoring tickers as Disagree to surface them here.</p>
                ) : (
                  <DisagreementSection items={result.disagreementOpportunities} />
                )
              ) : (
                <div className="py-8 text-center text-sm text-[#8E8E8E]">Loading…</div>
              )}
            </div>
          )}

          {/* ── Watchlist ── */}
          {pageTab === "watchlist" && (
            <div className="space-y-3">
              {result ? (
                result.entries.filter(e => e.inWatchlist).length === 0 ? (
                  <p className="text-sm text-[#8E8E8E] text-center py-8">No watchlist items in the scored universe.</p>
                ) : (
                  result.entries
                    .filter(e => e.inWatchlist)
                    .sort((a, b) => b.objectiveScore - a.objectiveScore)
                    .map(entry => (
                      <OpportunityCard key={entry.ticker} entry={entry} onFeedback={handleFeedback} />
                    ))
                )
              ) : (
                <div className="py-8 text-center text-sm text-[#8E8E8E]">Loading…</div>
              )}
            </div>
          )}

          {/* ── Screener ── */}
          {pageTab === "committee" && (() => {
            const convictionOrder = ["Strong Buy", "Buy", "Watch", "Hold", "Pass"];
            const grouped = convictionOrder.reduce<Record<string, typeof committeeSessions>>((acc, c) => {
              acc[c] = committeeSessions.filter(s => s.conviction === c);
              return acc;
            }, {});
            const convStyle: Record<string, { bg: string; text: string }> = {
              "Strong Buy": { bg: "#F0FDF4", text: "#15803D" },
              "Buy":        { bg: "#EEF3FD", text: "#3E6AE1" },
              "Watch":      { bg: "#FFFBEB", text: "#D97706" },
              "Hold":       { bg: "#F4F4F4", text: "#5C5E62" },
              "Pass":       { bg: "#FEF2F2", text: "#991B1B" },
            };
            return (
              <div className="space-y-5">
                {committeeSessions.length === 0 ? (
                  <div className="py-12 text-center text-sm text-[#8E8E8E]">
                    No committee sessions yet. Run a committee session from the Research page.
                  </div>
                ) : (
                  convictionOrder.filter(c => grouped[c].length > 0).map(conviction => {
                    const cs = convStyle[conviction] ?? convStyle["Hold"];
                    return (
                      <div key={conviction}>
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className="text-xs font-semibold px-2.5 py-1 rounded"
                            style={{ backgroundColor: cs.bg, color: cs.text }}
                          >
                            {conviction}
                          </span>
                          <span className="text-xs text-[#AAAAAA]">{grouped[conviction].length} ticker{grouped[conviction].length !== 1 ? "s" : ""}</span>
                        </div>
                        <div className="space-y-1.5">
                          {grouped[conviction].map(s => (
                            <div key={s.id} className="flex items-center gap-3 bg-white border border-[#EEEEEE] rounded-xl px-4 py-2.5">
                              <span className="font-semibold text-sm text-[#171A20] w-14">{s.ticker}</span>
                              <span className="flex-1 text-xs text-[#5C5E62] truncate">{s.companyName}</span>
                              {s.verdict && s.verdict !== s.conviction && (
                                <span className="text-xs text-[#8E8E8E]">{s.verdict}</span>
                              )}
                              <span className="text-[11px] text-[#AAAAAA]">
                                {new Date(s.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            );
          })()}

          {pageTab === "screener" && (
            <div>
              <p className="text-xs text-[#8E8E8E] mb-4">Universe ranked by company score. Use filters on the screener page for advanced filtering.</p>
              {screenerLoading ? (
                <div className="py-8 text-center text-sm text-[#8E8E8E]">Loading screener data…</div>
              ) : screenerError ? (
                <div className="py-8 text-center text-sm text-[#c0392b]">{screenerError}</div>
              ) : screenerData.length === 0 ? (
                <div className="py-8 text-center text-sm text-[#8E8E8E]">No companies in universe yet.</div>
              ) : (
                <div className="space-y-0">
                  {screenerData.map((e, i) => {
                    const scoreColor = e.totalScore >= 75 ? "#15803D" : e.totalScore >= 55 ? "#3E6AE1" : "#D97706";
                    const tierLabel: Record<string, string> = { tier1: "LC", tier2: "MC", tier3: "SC", tier4: "ETF", tier5: "Intl" };
                    return (
                      <div key={e.ticker} className="flex items-center gap-3 py-2.5 border-b border-[#EEEEEE] last:border-0">
                        <div className="w-7 text-[11px] text-[#AAAAAA] text-right shrink-0">{i + 1}</div>
                        <div className="w-14 font-semibold text-[#171A20] shrink-0">{e.ticker}</div>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#F4F4F4] text-[#5C5E62] shrink-0">
                          {tierLabel[e.universeTier] ?? e.universeTier}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-[#5C5E62] truncate">{e.companyName}</div>
                          {e.sector && <div className="text-[10px] text-[#AAAAAA]">{e.sector}</div>}
                        </div>
                        <div className="text-sm font-bold shrink-0" style={{ color: scoreColor }}>
                          {e.totalScore.toFixed(0)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
