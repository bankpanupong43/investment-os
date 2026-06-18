"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

type MarketRegime = "Risk On" | "Neutral" | "Risk Off";

type ActionType = "EXIT" | "DEPLOY" | "TRIM" | "REBALANCE" | "RESEARCH" | "MONITOR";
type Urgency = "critical" | "high" | "medium" | "low";

interface ActionItem {
  id: string;
  priority: number;
  type: ActionType;
  urgency: Urgency;
  title: string;
  description: string;
  ticker?: string;
  companyName?: string;
  dollarAmount?: number;
  pctGap?: number;
  source: string;
  actionableBy: string;
}

interface DecisionQueue {
  actions: ActionItem[];
  totalCount: number;
  criticalCount: number;
  highCount: number;
  regime: string;
  portfolioTotalUsd: number;
  availableCashUsd: number;
  generatedAt: string;
}

interface MorningBrief {
  id: string;
  briefingDate: string;
  marketRegime: MarketRegime;
  marketRegimeEvidence: string[];
}

interface ArchitectureReview {
  id: string;
  reviewDate: string;
  marketRegime: string;
  architectureScore: { total: number; diversification: number; concentration: number; hedgeQuality: number; regimeResilience: number; grade: string; label: string };
}

interface OpportunityEntry {
  ticker: string;
  companyName: string;
  objectiveScore: number;
  recommendation: string;
}

interface PortfolioValue {
  totalValueThb: number;
  totalValueUsd: number;
  usdthb: number;
  totalCashThb: number;
  totalEquityUsd: number;
}

interface AllocationAlignmentData {
  alignmentPct: number;
  allocationGrade: string;
  regime: string;
  largestUnderweight: { label: string; gapPct: number } | null;
  largestOverweight:  { label: string; gapPct: number } | null;
  largestThemeGap:    { label: string; gapPct: number } | null;
  largestThemeOverweight: { label: string; gapPct: number } | null;
  topDriver: string;
}

type ScoutCategory = "Emerging" | "Accelerating" | "Consensus" | "Hidden Gem" | "Monitoring";

interface ScoutCandidate {
  ticker:         string;
  scoutScore:     number;
  scoutCategory:  ScoutCategory;
  mentionCount30d: number;
  sourceDiversity: number;
  sentimentScore:  number;
  trend:          "Rising" | "Stable" | "Falling";
  isOwned:        boolean;
}

interface CompanyScoutData {
  topNew:      ScoutCandidate[];
  hiddenGems:  ScoutCandidate[];
  emerging:    ScoutCandidate[];
  generatedAt: string;
  coverageAudit: { totalTracked: number; newCompanies: number; biasDetected: boolean };
}

interface DiscoverySignal {
  ticker:          string;
  mentionCount30d: number;
  sourceDiversity: number;
  sentimentScore:  number;
  trend:           "Rising" | "Stable" | "Falling";
  discoveryScore:  number;
  isOwned:         boolean;
}

interface CatalystEvent {
  ticker: string;
  eventType: "earnings" | "macro" | "other";
  title: string;
  date: string;
  impactRating: "H" | "M" | "L";
  notes: string | null;
  isEstimated: boolean;
  daysAway: number;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bg-[#EEEEEE] rounded-xl animate-pulse ${className}`} />;
}

function fmtThb(n: number): string {
  return "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ─── Constants ────────────────────────────────────────────────────────────────

const REGIME_STYLES: Record<MarketRegime, { bg: string; border: string; badge: string; text: string; dot: string }> = {
  "Risk On":  { bg: "#F0FDF4", border: "#86EFAC", badge: "#15803D", text: "#14532D", dot: "#15803D" },
  "Neutral":  { bg: "#EEF3FD", border: "#93C5FD", badge: "#3E6AE1", text: "#1E40AF", dot: "#3E6AE1" },
  "Risk Off": { bg: "#FEF2F2", border: "#FCA5A5", badge: "#DC2626", text: "#991B1B", dot: "#DC2626" },
};

const IMPACT_STYLE: Record<"H" | "M" | "L", { bg: string; text: string }> = {
  H: { bg: "#FEF2F2", text: "#991B1B" },
  M: { bg: "#FFF7ED", text: "#92400E" },
  L: { bg: "#F4F4F4", text: "#5C5E62" },
};

const SCOUT_CAT_STYLE: Record<ScoutCategory, { bg: string; text: string }> = {
  "Consensus":    { bg: "#F0FDF4", text: "#15803D" },
  "Hidden Gem":   { bg: "#F3EEF9", text: "#7C3AED" },
  "Emerging":     { bg: "#EEF3FD", text: "#3E6AE1" },
  "Accelerating": { bg: "#FFFBEB", text: "#D97706" },
  "Monitoring":   { bg: "#F4F4F4", text: "#5C5E62" },
};

const DISCOVERY_TREND_ARROW: Record<string, string> = { Rising: "↑", Stable: "→", Falling: "↓" };
const DISCOVERY_TREND_COLOR: Record<string, string> = { Rising: "#15803D", Stable: "#8E8E8E", Falling: "#DC2626" };

const ACTION_STYLE: Record<ActionType, { bg: string; text: string; border: string; label: string }> = {
  EXIT:      { bg: "bg-red-900/40",     text: "text-red-300",     border: "border-red-700/50",     label: "EXIT"      },
  DEPLOY:    { bg: "bg-emerald-900/40", text: "text-emerald-300", border: "border-emerald-700/50", label: "DEPLOY"    },
  TRIM:      { bg: "bg-orange-900/40",  text: "text-orange-300",  border: "border-orange-700/50",  label: "TRIM"      },
  REBALANCE: { bg: "bg-blue-900/40",    text: "text-blue-300",    border: "border-blue-700/50",    label: "REBALANCE" },
  RESEARCH:  { bg: "bg-purple-900/40",  text: "text-purple-300",  border: "border-purple-700/50",  label: "RESEARCH"  },
  MONITOR:   { bg: "bg-yellow-900/40",  text: "text-yellow-300",  border: "border-yellow-700/50",  label: "MONITOR"   },
};

const URGENCY_DOT: Record<Urgency, string> = {
  critical: "bg-red-500 animate-pulse",
  high:     "bg-orange-400",
  medium:   "bg-yellow-400",
  low:      "bg-slate-500",
};

// ─── Regime Card ──────────────────────────────────────────────────────────────

function RegimeCard({ brief }: { brief: MorningBrief | null }) {
  if (!brief) return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl p-5 h-full">
      <div className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest mb-3">Current Regime</div>
      <div className="text-sm text-[#8E8E8E]">Run Morning Brief to generate.</div>
    </div>
  );

  const regime = brief.marketRegime;
  const s = REGIME_STYLES[regime] ?? REGIME_STYLES["Neutral"];
  const evidence = (brief.marketRegimeEvidence ?? []).slice(0, 3);

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl p-5 flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest">Current Regime</div>
        <Link href="/intelligence" className="text-[11px] text-[#3E6AE1] hover:underline">Brief →</Link>
      </div>
      <div className="flex items-center gap-3">
        <div
          className="px-3 py-1.5 rounded-lg text-sm font-semibold"
          style={{ backgroundColor: s.bg, color: s.badge, border: `1px solid ${s.border}` }}
        >
          {regime}
        </div>
        <div className="text-xs text-[#5C5E62]">
          {new Date(brief.briefingDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </div>
      </div>
      {evidence.length > 0 && (
        <ul className="space-y-1">
          {evidence.map((e, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-[#5C5E62]">
              <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: s.dot }} />
              {e}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Portfolio Pulse Card ─────────────────────────────────────────────────────
// Merges: Portfolio Health (value + arch grade) + Allocation Alignment (grade + gaps)

function PortfolioPulseCard({ review, portValue, allocation, allocLoading }: {
  review:      ArchitectureReview | null;
  portValue:   PortfolioValue | null;
  allocation:  AllocationAlignmentData | null;
  allocLoading: boolean;
}) {
  const arch  = review?.architectureScore;
  const grade = arch?.grade;
  const gradeColor = grade === "A" ? "#15803D" : grade === "B" ? "#3E6AE1" : grade === "C" ? "#D97706" : "#DC2626";
  const aGrade = allocation?.allocationGrade;
  const aColor = aGrade === "A" ? "#15803D" : aGrade === "B" ? "#3E6AE1" : aGrade === "C" ? "#D97706" : "#DC2626";

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl p-5 h-full flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest">Portfolio Pulse</div>
        <Link href="/portfolio" className="text-[11px] text-[#3E6AE1] hover:underline">Portfolio →</Link>
      </div>

      {/* Value row + grade circles */}
      <div className="flex items-start gap-6">
        <div className="flex-1 min-w-0">
          {portValue && portValue.totalValueThb > 0 ? (
            <>
              <div className="text-2xl font-semibold text-[#171A20] tabular-nums">{fmtThb(portValue.totalValueThb)}</div>
              <div className="text-xs text-[#8E8E8E] tabular-nums mt-0.5">
                ${Math.round(portValue.totalValueUsd).toLocaleString()} USD · 1 USD = {portValue.usdthb.toFixed(2)} THB
              </div>
              <div className="flex gap-4 pt-2 text-xs text-[#5C5E62]">
                <span>Equity <span className="font-semibold text-[#171A20]">${Math.round(portValue.totalEquityUsd).toLocaleString()}</span></span>
                <span>Cash <span className="font-semibold text-[#171A20]">{fmtThb(portValue.totalCashThb)}</span></span>
              </div>
            </>
          ) : (
            <div className="text-sm text-[#8E8E8E]">Add holdings to see value.</div>
          )}
        </div>

        <div className="flex gap-4 shrink-0">
          {arch && grade && (
            <div className="flex flex-col items-center gap-1">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2"
                style={{ color: gradeColor, borderColor: gradeColor }}
              >
                {grade}
              </div>
              <div className="text-[9px] text-[#AAAAAA] text-center">Arch</div>
            </div>
          )}
          {!allocLoading && aGrade && (
            <div className="flex flex-col items-center gap-1">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2"
                style={{ color: aColor, borderColor: aColor }}
              >
                {aGrade}
              </div>
              <div className="text-[9px] text-[#AAAAAA] text-center">Alloc</div>
            </div>
          )}
        </div>
      </div>

      {/* Allocation gaps */}
      {!allocLoading && allocation && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 pt-3 border-t border-[#F4F4F4]">
          {allocation.largestUnderweight && (
            <div className="flex items-center justify-between text-xs gap-2">
              <span className="text-[#5C5E62]">Underweight</span>
              <span className="font-semibold text-[#15803D] shrink-0">
                {allocation.largestUnderweight.label} +{allocation.largestUnderweight.gapPct.toFixed(1)}%
              </span>
            </div>
          )}
          {allocation.largestOverweight && (
            <div className="flex items-center justify-between text-xs gap-2">
              <span className="text-[#5C5E62]">Overweight</span>
              <span className="font-semibold text-[#DC2626] shrink-0">
                {allocation.largestOverweight.label} {allocation.largestOverweight.gapPct.toFixed(1)}%
              </span>
            </div>
          )}
          {allocation.largestThemeGap && (
            <div className="flex items-center justify-between text-xs gap-2">
              <span className="text-[#5C5E62]">Theme gap</span>
              <span className="font-semibold text-[#15803D] shrink-0">
                {allocation.largestThemeGap.label} +{allocation.largestThemeGap.gapPct.toFixed(1)}%
              </span>
            </div>
          )}
          {allocation.largestThemeOverweight && (
            <div className="flex items-center justify-between text-xs gap-2">
              <span className="text-[#5C5E62]">Theme excess</span>
              <span className="font-semibold text-[#DC2626] shrink-0">
                {allocation.largestThemeOverweight.label} {allocation.largestThemeOverweight.gapPct.toFixed(1)}%
              </span>
            </div>
          )}
        </div>
      )}
      {allocLoading && (
        <div className="pt-3 border-t border-[#F4F4F4]">
          <Skeleton className="h-4 w-40" />
        </div>
      )}
    </div>
  );
}

// ─── Top Opportunities Card ───────────────────────────────────────────────────

function TopOpportunitiesCard({ opportunities }: { opportunities: OpportunityEntry[] }) {
  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest">Top Opportunities</div>
        <Link href="/opportunities" className="text-[11px] text-[#3E6AE1] hover:underline">All →</Link>
      </div>
      {opportunities.length === 0 ? (
        <div className="text-sm text-[#8E8E8E]">No opportunities scored.</div>
      ) : (
        <ol className="space-y-2">
          {opportunities.slice(0, 5).map((o, i) => (
            <li key={o.ticker} className="flex items-center gap-3">
              <span className="w-5 text-xs text-[#AAAAAA] font-medium tabular-nums">{i + 1}.</span>
              <span className="font-semibold text-sm text-[#171A20] w-12">{o.ticker}</span>
              <span className="text-xs text-[#8E8E8E] flex-1 truncate">{o.companyName}</span>
              <span className="text-xs font-medium text-[#3E6AE1] tabular-nums">{o.objectiveScore.toFixed(0)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ─── Discovery Pulse Card ─────────────────────────────────────────────────────
// Merges: Company Scout (emerging/hiddenGems) + Discovery Radar

function DiscoveryPulseCard({ scoutData, scoutLoading, signals, signalsLoading }: {
  scoutData:     CompanyScoutData | null;
  scoutLoading:  boolean;
  signals:       DiscoverySignal[];
  signalsLoading: boolean;
}) {
  // Merge scout + radar into unified ranked list
  const scoutMap = new Map<string, ScoutCandidate>();
  if (scoutData) {
    for (const c of [...(scoutData.emerging ?? []), ...(scoutData.hiddenGems ?? []), ...(scoutData.topNew ?? [])]) {
      if (!scoutMap.has(c.ticker)) scoutMap.set(c.ticker, c);
    }
  }
  const radarMap = new Map<string, DiscoverySignal>();
  for (const s of signals) radarMap.set(s.ticker, s);

  type PulseItem = {
    ticker: string; score: number;
    trend: "Rising" | "Stable" | "Falling";
    mentionCount: number; sourceDiversity: number; sentimentScore: number;
    badge: ScoutCategory | null; isOwned: boolean;
  };

  const allTickers = new Set([...scoutMap.keys(), ...radarMap.keys()]);
  const combined: PulseItem[] = [];
  for (const ticker of allTickers) {
    const scout = scoutMap.get(ticker);
    const radar = radarMap.get(ticker);
    combined.push({
      ticker,
      score:           Math.max(scout?.scoutScore ?? 0, radar?.discoveryScore ?? 0),
      trend:           scout?.trend ?? radar?.trend ?? "Stable",
      mentionCount:    scout?.mentionCount30d ?? radar?.mentionCount30d ?? 0,
      sourceDiversity: scout?.sourceDiversity ?? radar?.sourceDiversity ?? 0,
      sentimentScore:  scout?.sentimentScore  ?? radar?.sentimentScore  ?? 0,
      badge:           scout?.scoutCategory ?? null,
      isOwned:         scout?.isOwned ?? radar?.isOwned ?? false,
    });
  }
  combined.sort((a, b) => b.score - a.score);
  const top5 = combined.slice(0, 5);
  const isLoading = scoutLoading && signalsLoading;

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest">Discovery Pulse</div>
          <div className="text-xs text-[#8E8E8E] mt-0.5">Top signals across scout + radar</div>
        </div>
        <Link href="/discovery?tab=mentions" className="text-[11px] text-[#3E6AE1] hover:underline font-medium">All →</Link>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10" />)}
        </div>
      ) : top5.length === 0 ? (
        <div className="py-4 text-sm text-[#8E8E8E]">
          No signals yet — run Discovery Intelligence from the Automation page.
        </div>
      ) : (
        <ol className="space-y-1.5">
          {top5.map((item, i) => {
            const tc = DISCOVERY_TREND_COLOR[item.trend] ?? "#8E8E8E";
            const ta = DISCOVERY_TREND_ARROW[item.trend] ?? "→";
            const scoreColor = item.score >= 70 ? "#15803D" : item.score >= 55 ? "#D97706" : "#5C5E62";
            const sentColor  = item.sentimentScore > 0.3 ? "#15803D" : item.sentimentScore < -0.3 ? "#DC2626" : "#8E8E8E";
            const badgeStyle = item.badge ? (SCOUT_CAT_STYLE[item.badge] ?? SCOUT_CAT_STYLE.Monitoring) : null;
            return (
              <li key={item.ticker} className="flex items-center gap-3 p-2 rounded-xl hover:bg-[#F4F4F4] transition-colors">
                <span className="w-4 text-xs text-[#AAAAAA] font-medium tabular-nums shrink-0">{i + 1}.</span>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: sentColor }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Link
                      href={`/research?q=${item.ticker}`}
                      className="text-sm font-semibold text-[#171A20] hover:text-[#3E6AE1] transition-colors"
                    >
                      {item.ticker}
                    </Link>
                    {badgeStyle && item.badge && (
                      <span
                        className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: badgeStyle.bg, color: badgeStyle.text }}
                      >
                        {item.badge}
                      </span>
                    )}
                    {item.isOwned && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-[#EEF3FD] text-[#3E6AE1] font-medium">Owned</span>
                    )}
                  </div>
                  <div className="text-[10px] text-[#8E8E8E]">
                    {item.mentionCount} mentions · {item.sourceDiversity} src
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-sm font-bold" style={{ color: tc }}>{ta}</span>
                  <span className="text-xs font-bold tabular-nums" style={{ color: scoreColor }}>{item.score}</span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

// ─── Catalyst Strip ────────────────────────────────────────────────────────────

function CatalystStrip({ events, loading }: { events: CatalystEvent[]; loading: boolean }) {
  const upcoming = events.filter(e => e.daysAway >= -1).slice(0, 4);

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest">Upcoming Catalysts</div>
        <Link href="/ask?q=What+earnings+are+coming+up%3F" className="text-[11px] text-[#3E6AE1] hover:underline">Ask →</Link>
      </div>

      {loading ? (
        <div className="flex gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 flex-1" />)}
        </div>
      ) : upcoming.length === 0 ? (
        <div className="text-sm text-[#8E8E8E]">No upcoming catalysts — add earnings history via the Catalyst page.</div>
      ) : (
        <div className="flex gap-3 flex-wrap">
          {upcoming.map((e, i) => {
            const s = IMPACT_STYLE[e.impactRating];
            const dayLabel = e.daysAway === 0 ? "Today"
              : e.daysAway === 1 ? "Tomorrow"
              : e.daysAway < 0 ? `${Math.abs(e.daysAway)}d ago`
              : `${e.daysAway}d`;
            return (
              <div key={`${e.ticker}-${i}`} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#EEEEEE] flex-1 min-w-[160px]">
                <span
                  className="w-5 h-5 flex items-center justify-center text-[9px] font-bold rounded shrink-0"
                  style={{ backgroundColor: s.bg, color: s.text }}
                >
                  {e.impactRating}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-[#171A20] truncate">{e.title}</div>
                  <div className="text-[10px] text-[#AAAAAA]">{dayLabel}{e.isEstimated ? " (est.)" : ""}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Decision Queue Card ──────────────────────────────────────────────────────

function actionItemHref(item: ActionItem): string {
  if (item.type === "EXIT" || item.type === "TRIM" || item.type === "MONITOR") {
    return item.ticker ? `/portfolio/${item.ticker}` : "/portfolio";
  }
  if (item.type === "DEPLOY") {
    return item.ticker ? `/research?q=${item.ticker}` : "/opportunities";
  }
  if (item.type === "REBALANCE") {
    return "/portfolio";
  }
  if (item.type === "RESEARCH") {
    return item.ticker ? `/research?q=${item.ticker}` : "/research";
  }
  return "/portfolio";
}

function DecisionQueueCard() {
  const [queue, setQueue] = useState<DecisionQueue | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch("/api/decisions")
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
      .then(setQueue)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const VISIBLE = expanded ? (queue?.actions.length ?? 0) : 7;
  const shown = queue?.actions.slice(0, VISIBLE) ?? [];

  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-white">What should I do next?</h2>
          <p className="text-xs text-slate-400 mt-0.5">Decision Queue — prioritized actions across all signals</p>
        </div>
        {queue && (
          <div className="flex items-center gap-2">
            {queue.criticalCount > 0 && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-900/60 text-red-300 border border-red-700/50">
                {queue.criticalCount} critical
              </span>
            )}
            {queue.highCount > 0 && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange-900/60 text-orange-300 border border-orange-700/50">
                {queue.highCount} high
              </span>
            )}
            <span className="text-xs text-slate-500">{queue.totalCount} total</span>
          </div>
        )}
      </div>

      {/* Context strip */}
      {queue && (
        <div className="flex gap-4 mb-4 text-xs text-slate-400">
          <span>Regime: <span className={
            queue.regime === "Risk On" ? "text-emerald-400" :
            queue.regime === "Risk Off" ? "text-red-400" : "text-yellow-400"
          }>{queue.regime}</span></span>
          {queue.availableCashUsd > 0 && (
            <span>Cash available: <span className="text-white">${Math.round(queue.availableCashUsd).toLocaleString()}</span></span>
          )}
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 bg-slate-700/40 rounded-lg animate-pulse" />)}
        </div>
      )}

      {!loading && queue && queue.actions.length === 0 && (
        <div className="text-center py-8 text-slate-400">
          <p className="text-sm">No actions needed — portfolio looks well-positioned.</p>
        </div>
      )}

      {!loading && shown.length > 0 && (
        <div className="space-y-2">
          {shown.map(item => {
            const style = ACTION_STYLE[item.type];
            return (
              <Link
                key={item.id}
                href={actionItemHref(item)}
                className={`block rounded-lg border p-3 ${style.bg} ${style.border} hover:opacity-80 transition-opacity`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-center gap-1.5 pt-0.5 min-w-[28px]">
                    <span className="text-xs font-bold text-slate-400">#{item.priority}</span>
                    <span className={`w-2 h-2 rounded-full ${URGENCY_DOT[item.urgency]}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded ${style.bg} ${style.text} border ${style.border}`}>
                        {style.label}
                      </span>
                      {item.ticker && (
                        <span className="text-xs font-mono font-semibold text-white">{item.ticker}</span>
                      )}
                      {item.dollarAmount && item.dollarAmount > 0 && (
                        <span className="text-xs text-slate-400">${Math.round(item.dollarAmount).toLocaleString()}</span>
                      )}
                      {item.pctGap && (
                        <span className="text-xs text-slate-400">{item.pctGap > 0 ? "+" : ""}{item.pctGap.toFixed(1)}%</span>
                      )}
                    </div>
                    <p className={`text-sm font-medium ${style.text} mb-1`}>{item.title}</p>
                    <p className="text-xs text-slate-400 leading-relaxed">{item.description}</p>
                    <p className="text-xs text-slate-300 mt-1.5 italic">→ {item.actionableBy}</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {!loading && queue && queue.totalCount > 7 && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="mt-3 w-full text-xs text-slate-400 hover:text-slate-200 transition-colors py-1"
        >
          {expanded ? "Show less" : `Show ${queue.totalCount - 7} more actions`}
        </button>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [brief, setBrief]                 = useState<MorningBrief | null>(null);
  const [archReview, setArchReview]       = useState<ArchitectureReview | null>(null);
  const [opportunities, setOpportunities] = useState<OpportunityEntry[]>([]);
  const [allocationData, setAllocationData]     = useState<AllocationAlignmentData | null>(null);
  const [allocationLoading, setAllocationLoading] = useState(true);
  const [portValue, setPortValue]         = useState<PortfolioValue | null>(null);
  const [loading, setLoading]             = useState(true);
  const [catalysts, setCatalysts]         = useState<CatalystEvent[]>([]);
  const [catalystsLoading, setCatalystsLoading] = useState(true);
  const [discoverySignals, setDiscoverySignals] = useState<DiscoverySignal[]>([]);
  const [discoveryLoading, setDiscoveryLoading] = useState(true);
  const [scoutData, setScoutData]         = useState<CompanyScoutData | null>(null);
  const [scoutLoading, setScoutLoading]   = useState(true);

  useEffect(() => {
    // Catalyst calendar loads independently
    fetch("/api/catalysts").then(r => r.ok ? r.json() : null).then(d => {
      if (Array.isArray(d)) setCatalysts(d as CatalystEvent[]);
    }).catch(() => {}).finally(() => setCatalystsLoading(false));

    // Discovery Radar loads independently
    fetch("/api/discovery-signals").then(r => r.ok ? r.json() : null).then(d => {
      if (d?.signals) setDiscoverySignals((d.signals as DiscoverySignal[]).slice(0, 10));
    }).catch(() => {}).finally(() => setDiscoveryLoading(false));

    // Company Scout loads independently
    fetch("/api/company-scout").then(r => r.ok ? r.json() : null).then(d => {
      if (d && !d.error) setScoutData(d as CompanyScoutData);
    }).catch(() => {}).finally(() => setScoutLoading(false));

    // Allocation + theme reviews load in parallel
    Promise.all([
      fetch("/api/allocation-review").then(r => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/theme-allocation").then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([alloc, theme]) => {
      if (alloc) setAllocationData({
        alignmentPct:           alloc.alignmentPct,
        allocationGrade:        alloc.allocationGrade,
        regime:                 alloc.regime,
        largestUnderweight:     alloc.largestUnderweight,
        largestOverweight:      alloc.largestOverweight,
        topDriver:              alloc.topDriver ?? "",
        largestThemeGap:        theme?.largestThemeGap ?? null,
        largestThemeOverweight: theme?.largestThemeOverweight ?? null,
      });
    }).catch(() => {}).finally(() => setAllocationLoading(false));

    // Core data in parallel
    Promise.all([
      fetch("/api/morning-brief").then(r => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/portfolio-architecture").then(r => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/opportunities").then(r => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/portfolio-value").then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([briefData, archData, oppData, pvData]) => {
      if (briefData) setBrief(briefData);
      if (archData?.review) setArchReview(archData.review);
      if (oppData?.entries) setOpportunities((oppData.entries as OpportunityEntry[]).slice(0, 5));
      if (pvData?.totalValueThb) setPortValue(pvData as PortfolioValue);
    }).finally(() => setLoading(false));
  }, []);

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  if (loading) {
    return (
      <div className="p-6 lg:p-8 space-y-6 max-w-5xl">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-medium text-[#171A20]">Dashboard</h1>
        <p className="text-[#8E8E8E] text-sm mt-0.5">{today}</p>
      </div>

      {/* Row 0: Decision Queue — what to act on today */}
      <DecisionQueueCard />

      {/* Row 1: Regime (1/3) + Portfolio Pulse (2/3) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <RegimeCard brief={brief} />
        <div className="md:col-span-2">
          <PortfolioPulseCard
            review={archReview}
            portValue={portValue}
            allocation={allocationData}
            allocLoading={allocationLoading}
          />
        </div>
      </div>

      {/* Row 2: Top Opportunities + Discovery Pulse */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TopOpportunitiesCard opportunities={opportunities} />
        <DiscoveryPulseCard
          scoutData={scoutData}
          scoutLoading={scoutLoading}
          signals={discoverySignals}
          signalsLoading={discoveryLoading}
        />
      </div>

      {/* Row 3: Catalyst Strip — compact upcoming events */}
      <CatalystStrip events={catalysts} loading={catalystsLoading} />
    </div>
  );
}
