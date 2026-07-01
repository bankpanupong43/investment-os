"use client";
import { useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type MarketRegime = "Risk On" | "Neutral" | "Risk Off";

interface MacroTopic {
  topic: string;
  signal: "positive" | "neutral" | "negative";
  insight: string;
  value?: string;
  source?: string;
}

interface MacroSummary {
  topics: MacroTopic[];
  overallStance: string;
  dataAvailable: boolean;
}

interface GeopoliticalRisk {
  region: string;
  level: "high" | "medium" | "low";
  portfolioExposure: string;
  insight: string;
  latestEvent?: string;
  eventSource?: string;
}

interface GeopoliticalSummary {
  risks: GeopoliticalRisk[];
  overallStance: string;
}

interface TechTheme {
  theme: string;
  signal: "positive" | "neutral" | "negative" | "watch";
  holdingRelevance: string[];
  insight: string;
}

interface TechnologySummary {
  themes: TechTheme[];
  overallStance: string;
}

interface NewsletterInsight {
  source: string;
  title: string;
  summary: string[];
  portfolioRelevance: "bullish" | "neutral" | "bearish";
  publishedAt: string;
  url?: string;
}

interface TradeIdea {
  action: "BUY" | "TRIM" | "WATCH";
  ticker: string;
  thesis: string;
  risk: string;
  urgency: "high" | "medium" | "low";
}

interface MorningBrief {
  id: string;
  briefingDate: string;
  marketRegime: MarketRegime;
  marketRegimeEvidence: string[];
  topCall: string;
  tradeIdeas: TradeIdea[];
  macroSummary: MacroSummary;
  geopoliticalSummary: GeopoliticalSummary;
  technologySummary: TechnologySummary;
  recommendedActions: { priority: number; action: string; reason: string; urgency: string; ticker: string | null }[];
  institutionalResearch?: NewsletterInsight[];
  newsletterConsensus?: NewsletterInsight[];
  freshnessWarning?: string;
}

interface NewsletterFreshness {
  latestEmailAt: string | null;
  latestProcessedAt: string | null;
  lagMinutes: number | null;
}

interface SourceHealth {
  source: string;
  sourceLabel: string;
  lastEmail: string | null;
  lastProcessed: string | null;
  status: "healthy" | "warning" | "critical" | "dead";
  ageHours: number | null;
}

interface NewsletterItem {
  id: string;
  source: string;
  sourceLabel: string;
  title: string;
  url: string | null;
  publishedAt: string;
  summary: string[];
  keyPoints: string[];
  portfolioRelevance: string;
  confidence: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bg-[#EEEEEE] rounded-xl animate-pulse ${className}`} />;
}

const SIGNAL_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  positive: { bg: "#F0FDF4", text: "#15803D", border: "#86EFAC" },
  neutral:  { bg: "#F4F4F4", text: "#5C5E62", border: "#DDDDDD" },
  negative: { bg: "#FEF2F2", text: "#DC2626", border: "#FCA5A5" },
  watch:    { bg: "#FFFBEB", text: "#D97706", border: "#FDE68A" },
};

const REL_STYLE: Record<string, { bg: string; text: string }> = {
  bullish: { bg: "#F0FDF4", text: "#15803D" },
  neutral: { bg: "#F4F4F4", text: "#5C5E62" },
  bearish: { bg: "#FEF2F2", text: "#DC2626" },
};

const GEO_LEVEL_STYLE: Record<string, { bg: string; text: string }> = {
  high:   { bg: "#FEF2F2", text: "#991B1B" },
  medium: { bg: "#FFFBEB", text: "#92400E" },
  low:    { bg: "#F0FDF4", text: "#14532D" },
};

type TabId = "brief" | "institutional" | "newsletters" | "macro" | "geopolitics" | "thesis" | "catalysts";
const TABS: { id: TabId; label: string }[] = [
  { id: "brief",        label: "Morning Brief" },
  { id: "institutional", label: "Institutional" },
  { id: "newsletters",  label: "Newsletters" },
  { id: "macro",        label: "Macro" },
  { id: "geopolitics",  label: "Geopolitics" },
  { id: "thesis",       label: "Thesis Health" },
  { id: "catalysts",    label: "Catalysts" },
];

// ─── Morning Brief Tab ────────────────────────────────────────────────────────

const REGIME_STYLES: Record<MarketRegime, { bg: string; border: string; text: string }> = {
  "Risk On":  { bg: "#F0FDF4", border: "#86EFAC", text: "#15803D" },
  "Neutral":  { bg: "#EEF3FD", border: "#93C5FD", text: "#3E6AE1" },
  "Risk Off": { bg: "#FEF2F2", border: "#FCA5A5", text: "#DC2626" },
};

const URGENCY_COLOR: Record<string, string> = {
  high: "#DC2626",
  medium: "#D97706",
  low: "#8E8E8E",
};

function MorningBriefTab({ brief }: { brief: MorningBrief | null; loading: boolean }) {
  if (!brief) return (
    <div className="py-12 text-center text-sm text-[#8E8E8E]">
      No brief available. Generate one from the Automation page.
    </div>
  );

  const s = REGIME_STYLES[brief.marketRegime] ?? REGIME_STYLES["Neutral"];
  const actions = brief.recommendedActions ?? [];
  const techThemes = brief.technologySummary?.themes ?? [];

  const ACTION_STYLE = {
    BUY:   { bg: "#F0FDF4", text: "#15803D", border: "#BBF7D0" },
    TRIM:  { bg: "#FEF2F2", text: "#DC2626", border: "#FECACA" },
    WATCH: { bg: "#EEF3FD", text: "#3E6AE1", border: "#BFDBFE" },
  };

  return (
    <div className="space-y-5">
      {/* Freshness warning */}
      {brief.freshnessWarning && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-[#FFFBEB] border border-[#FDE68A] text-sm text-[#92400E]">
          <span className="mt-0.5 shrink-0">⚠</span>
          <span>{brief.freshnessWarning}</span>
        </div>
      )}

      {/* Top Call */}
      {brief.topCall && (
        <div className="bg-[#171A20] rounded-xl px-4 py-3">
          <div className="text-[10px] font-semibold text-[#8E8E8E] uppercase tracking-widest mb-1">Top Call</div>
          <div className="text-sm font-medium text-white leading-snug">{brief.topCall}</div>
        </div>
      )}

      {/* Trade Ideas */}
      {(brief.tradeIdeas ?? []).length > 0 && (
        <div>
          <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide mb-2">Trade Ideas</div>
          <div className="space-y-2">
            {(brief.tradeIdeas ?? []).map((idea, i) => {
              const s = ACTION_STYLE[idea.action];
              return (
                <div key={i} className="bg-white border border-[#EEEEEE] rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded"
                      style={{ backgroundColor: s.bg, color: s.text, border: `1px solid ${s.border}` }}>
                      {idea.action}
                    </span>
                    <span className="text-sm font-semibold text-[#171A20]">{idea.ticker}</span>
                    <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: idea.urgency === "high" ? "#FEF2F2" : idea.urgency === "medium" ? "#FFFBEB" : "#F4F4F4",
                               color: idea.urgency === "high" ? "#DC2626" : idea.urgency === "medium" ? "#92400E" : "#8E8E8E" }}>
                      {idea.urgency}
                    </span>
                  </div>
                  <div className="text-xs text-[#171A20] mb-1">{idea.thesis}</div>
                  <div className="text-[11px] text-[#8E8E8E]">
                    <span className="font-medium text-[#DC2626]">Risk:</span> {idea.risk}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Regime + date */}
      <div className="flex items-center gap-3">
        <span
          className="px-3 py-1.5 rounded-lg text-sm font-semibold"
          style={{ backgroundColor: s.bg, color: s.text, border: `1px solid ${s.border}` }}
        >
          {brief.marketRegime}
        </span>
        <span className="text-xs text-[#8E8E8E]">
          {new Date(brief.briefingDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        </span>
      </div>

      {/* Regime evidence */}
      {(brief.marketRegimeEvidence ?? []).length > 0 && (
        <div className="bg-white border border-[#EEEEEE] rounded-xl p-4">
          <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide mb-3">Regime Evidence</div>
          <ul className="space-y-1.5">
            {brief.marketRegimeEvidence.map((e, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-[#5C5E62]">
                <span className="w-1.5 h-1.5 rounded-full mt-2 shrink-0" style={{ backgroundColor: s.text }} />
                {e}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Technology themes */}
      {techThemes.length > 0 && (
        <div className="bg-white border border-[#EEEEEE] rounded-xl p-4">
          <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide mb-3">Technology Themes</div>
          <div className="space-y-3">
            {techThemes.map((t, i) => {
              const ts = SIGNAL_STYLE[t.signal] ?? SIGNAL_STYLE.neutral;
              return (
                <div key={i} className="flex items-start gap-3">
                  <span
                    className="mt-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0"
                    style={{ backgroundColor: ts.bg, color: ts.text }}
                  >
                    {t.signal}
                  </span>
                  <div>
                    <div className="text-sm font-medium text-[#171A20]">{t.theme}</div>
                    <div className="text-xs text-[#5C5E62] mt-0.5">{t.insight}</div>
                    {t.holdingRelevance.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {t.holdingRelevance.map(h => (
                          <span key={h} className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#EEF3FD] text-[#3E6AE1]">{h}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recommended Actions */}
      {actions.length > 0 && (
        <div className="bg-white border border-[#EEEEEE] rounded-xl p-4">
          <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide mb-3">Recommended Actions</div>
          <div className="space-y-3">
            {actions.map((a, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="w-5 text-xs text-[#AAAAAA] font-medium mt-0.5 tabular-nums">{a.priority}.</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    {a.ticker && <span className="text-xs font-semibold text-[#3E6AE1]">{a.ticker}</span>}
                    <span
                      className="text-[10px] font-semibold uppercase tracking-wide"
                      style={{ color: URGENCY_COLOR[a.urgency] ?? "#8E8E8E" }}
                    >
                      {a.urgency}
                    </span>
                  </div>
                  <div className="text-sm text-[#171A20]">{a.action}</div>
                  <div className="text-xs text-[#8E8E8E] mt-0.5">{a.reason}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Institutional Research Tab ───────────────────────────────────────────────

const INSTITUTIONAL_SOURCES = ["blackrock", "morganstanley", "jpmorgan", "goldman", "bridgewater"];

function InsightCard({ item }: { item: NewsletterInsight }) {
  const rel = item.portfolioRelevance;
  const s = REL_STYLE[rel] ?? REL_STYLE.neutral;
  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-[#AAAAAA] uppercase tracking-wide mb-0.5">{item.source}</div>
          {item.url ? (
            <a href={item.url} target="_blank" rel="noopener noreferrer"
              className="text-sm font-medium text-[#171A20] hover:text-[#3E6AE1] leading-snug">
              {item.title}
            </a>
          ) : (
            <div className="text-sm font-medium text-[#171A20] leading-snug">{item.title}</div>
          )}
        </div>
        <span
          className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 uppercase"
          style={{ backgroundColor: s.bg, color: s.text }}
        >
          {rel}
        </span>
      </div>
      {item.summary.length > 0 && (
        <ul className="space-y-1">
          {item.summary.slice(0, 3).map((b, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-[#5C5E62]">
              <span className="text-[#AAAAAA] mt-0.5">·</span>
              {b}
            </li>
          ))}
        </ul>
      )}
      <div className="text-[11px] text-[#AAAAAA]">
        {new Date(item.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
      </div>
    </div>
  );
}

function InstitutionalTab({ brief, items }: { brief: MorningBrief | null; items: NewsletterItem[] }) {
  const briefInsights = brief?.institutionalResearch ?? [];
  const rawInstitutional = items.filter(i => INSTITUTIONAL_SOURCES.some(s => i.source.toLowerCase().includes(s)));

  if (briefInsights.length === 0 && rawInstitutional.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-[#8E8E8E]">
        No institutional research ingested yet. Configure RSS feeds and run a newsletter refresh.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {briefInsights.map((item, i) => <InsightCard key={i} item={item} />)}
      {rawInstitutional.map(item => (
        <div key={item.id} className="bg-white border border-[#EEEEEE] rounded-xl p-4 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-[#AAAAAA] uppercase tracking-wide mb-0.5">{item.sourceLabel}</div>
              {item.url ? (
                <a href={item.url} target="_blank" rel="noopener noreferrer"
                  className="text-sm font-medium text-[#171A20] hover:text-[#3E6AE1] leading-snug">
                  {item.title}
                </a>
              ) : (
                <div className="text-sm font-medium text-[#171A20] leading-snug">{item.title}</div>
              )}
            </div>
            {(() => {
              const rel = item.portfolioRelevance;
              const s = REL_STYLE[rel] ?? REL_STYLE.neutral;
              return (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 uppercase"
                  style={{ backgroundColor: s.bg, color: s.text }}>
                  {rel}
                </span>
              );
            })()}
          </div>
          {item.summary.length > 0 && (
            <ul className="space-y-1">
              {item.summary.slice(0, 3).map((b, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-[#5C5E62]">
                  <span className="text-[#AAAAAA] mt-0.5">·</span>
                  {b}
                </li>
              ))}
            </ul>
          )}
          <div className="text-[11px] text-[#AAAAAA]">
            {new Date(item.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Newsletters Tab ──────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  healthy:  { bg: "#F0FDF4", text: "#15803D" },
  warning:  { bg: "#FFFBEB", text: "#D97706" },
  critical: { bg: "#FEF2F2", text: "#DC2626" },
  dead:     { bg: "#F4F4F4", text: "#8E8E8E" },
};

function NewslettersTab({
  brief, items, freshness, sourceHealth, onRefresh,
}: {
  brief: MorningBrief | null;
  items: NewsletterItem[];
  freshness: NewsletterFreshness | null;
  sourceHealth: SourceHealth[];
  onRefresh: (force: boolean) => Promise<void>;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  async function handleRefresh(force: boolean) {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      await onRefresh(force);
      setRefreshMsg(force ? "Force refresh complete." : "Refresh complete.");
    } catch {
      setRefreshMsg("Refresh failed — check console.");
    } finally {
      setRefreshing(false);
    }
  }

  const briefConsensus = brief?.newsletterConsensus ?? [];
  const newsletters = items.filter(i => !INSTITUTIONAL_SOURCES.some(s => i.source.toLowerCase().includes(s)));

  const grouped = newsletters.reduce<Record<string, NewsletterItem[]>>((acc, item) => {
    const key = item.sourceLabel || item.source;
    acc[key] = acc[key] ?? [];
    acc[key].push(item);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      {/* Freshness panel */}
      <div className="bg-white border border-[#EEEEEE] rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide">Newsletter Freshness</div>
          <div className="flex gap-2">
            <button
              onClick={() => handleRefresh(false)}
              disabled={refreshing}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-[#EEEEEE] text-[#5C5E62] hover:border-[#3E6AE1] hover:text-[#3E6AE1] transition-colors disabled:opacity-50"
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
            <button
              onClick={() => handleRefresh(true)}
              disabled={refreshing}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-[#EEEEEE] text-[#5C5E62] hover:border-[#DC2626] hover:text-[#DC2626] transition-colors disabled:opacity-50"
              title="Force full re-scan of last 30 days (use to recover from outages)"
            >
              Force Refresh
            </button>
          </div>
        </div>

        {freshness && (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-[10px] text-[#AAAAAA] uppercase tracking-wide">Last Email</div>
              <div className="text-sm font-medium text-[#171A20]">
                {freshness.latestEmailAt
                  ? new Date(freshness.latestEmailAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
                  : "—"}
              </div>
              {freshness.latestEmailAt && (
                <div className="text-[10px] text-[#AAAAAA]">
                  {new Date(freshness.latestEmailAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </div>
              )}
            </div>
            <div>
              <div className="text-[10px] text-[#AAAAAA] uppercase tracking-wide">Processed</div>
              <div className="text-sm font-medium text-[#171A20]">
                {freshness.latestProcessedAt
                  ? new Date(freshness.latestProcessedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
                  : "—"}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-[#AAAAAA] uppercase tracking-wide">Lag</div>
              <div className="text-sm font-medium text-[#171A20]">
                {freshness.lagMinutes !== null
                  ? `${freshness.lagMinutes < 0 ? 0 : freshness.lagMinutes} min`
                  : "—"}
              </div>
            </div>
          </div>
        )}

        {refreshMsg && (
          <div className="text-xs text-[#5C5E62] border-t border-[#EEEEEE] pt-2">{refreshMsg}</div>
        )}
      </div>

      {/* Source health */}
      {sourceHealth.length > 0 && (
        <div className="bg-white border border-[#EEEEEE] rounded-xl p-4">
          <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide mb-3">Source Health</div>
          <div className="space-y-2">
            {sourceHealth.map(sh => {
              const ss = STATUS_STYLE[sh.status] ?? STATUS_STYLE.dead;
              return (
                <div key={sh.source} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-[#171A20]">{sh.sourceLabel}</span>
                  <div className="flex items-center gap-3">
                    {sh.lastEmail && (
                      <span className="text-[11px] text-[#AAAAAA]">
                        {new Date(sh.lastEmail).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        {sh.ageHours !== null && ` (${sh.ageHours < 1 ? "<1h" : `${Math.round(sh.ageHours)}h`} ago)`}
                      </span>
                    )}
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase"
                      style={{ backgroundColor: ss.bg, color: ss.text }}
                    >
                      {sh.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Consensus signals from morning brief */}
      {briefConsensus.length > 0 && (
        <div className="bg-white border border-[#EEEEEE] rounded-xl p-4">
          <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide mb-3">Consensus Signals</div>
          <div className="space-y-2">
            {briefConsensus.map((item, i) => {
              const rel = item.portfolioRelevance;
              const s = REL_STYLE[rel] ?? REL_STYLE.neutral;
              return (
                <div key={i} className="flex items-start gap-3">
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide shrink-0 mt-0.5"
                    style={{ backgroundColor: s.bg, color: s.text }}
                  >
                    {rel}
                  </span>
                  <div>
                    <div className="text-sm font-medium text-[#171A20]">{item.title}</div>
                    <div className="text-[11px] text-[#AAAAAA]">{item.source}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Raw newsletter items grouped by source */}
      {Object.entries(grouped).length === 0 && briefConsensus.length === 0 && (
        <div className="py-8 text-center text-sm text-[#8E8E8E]">
          No newsletters ingested yet. Configure Gmail OAuth and run a refresh.
        </div>
      )}

      {Object.entries(grouped).map(([source, sourceItems]) => (
        <div key={source}>
          <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide mb-2">{source}</div>
          <div className="space-y-2">
            {sourceItems.slice(0, 3).map(item => (
              <div key={item.id} className="bg-white border border-[#EEEEEE] rounded-xl p-3 space-y-1.5">
                <div className="flex items-start gap-2">
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noopener noreferrer"
                      className="flex-1 text-sm font-medium text-[#171A20] hover:text-[#3E6AE1] leading-snug">
                      {item.title}
                    </a>
                  ) : (
                    <div className="flex-1 text-sm font-medium text-[#171A20] leading-snug">{item.title}</div>
                  )}
                  {(() => {
                    const rel = item.portfolioRelevance;
                    const s = REL_STYLE[rel] ?? REL_STYLE.neutral;
                    return (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase shrink-0"
                        style={{ backgroundColor: s.bg, color: s.text }}>
                        {rel}
                      </span>
                    );
                  })()}
                </div>
                {item.summary.length > 0 && (
                  <ul className="space-y-0.5">
                    {item.summary.slice(0, 2).map((b, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-[#5C5E62]">
                        <span className="text-[#AAAAAA] mt-0.5">·</span>
                        {b}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="text-[11px] text-[#AAAAAA]">
                  {new Date(item.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Thesis Tab ───────────────────────────────────────────────────────────────

interface ThesisPillar {
  name: string;
  status: "intact" | "weakening" | "broken";
  trend: "improving" | "stable" | "deteriorating";
  lastEvidence: string | null;
  lastEvidenceDate: string | null;
}

interface ThesisPillarResult {
  ticker: string;
  title: string;
  overallStatus: "intact" | "weakening" | "broken";
  confidenceScore: number;
  pillars: ThesisPillar[];
  disconfirmingEvidence: { text: string; date: string }[];
  lastReviewedAt: string | null;
}

const STATUS_DOT: Record<ThesisPillar["status"], { color: string; label: string }> = {
  intact:    { color: "#15803D", label: "Intact" },
  weakening: { color: "#D97706", label: "Weakening" },
  broken:    { color: "#DC2626", label: "Broken" },
};

const TREND_ARROW: Record<ThesisPillar["trend"], { char: string; color: string }> = {
  improving:     { char: "↑", color: "#15803D" },
  stable:        { char: "→", color: "#8E8E8E" },
  deteriorating: { char: "↓", color: "#DC2626" },
};

function ThesisTab() {
  const [items, setItems]     = useState<ThesisPillarResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/thesis-pillars")
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(setItems)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="space-y-3">
      {[1, 2, 3].map(i => <div key={i} className="h-28 bg-[#EEEEEE] rounded-xl animate-pulse" />)}
    </div>
  );

  if (error) return (
    <div className="text-sm text-[#DC2626] bg-[#FEF2F2] border border-[#FECACA] rounded-lg px-4 py-3">{error}</div>
  );

  if (items.length === 0) return (
    <div className="py-12 text-center text-sm text-[#8E8E8E]">
      No investment theses found. Add theses via the Investment Theses page.
    </div>
  );

  return (
    <div className="space-y-4">
      {items.map(item => {
        const dot   = STATUS_DOT[item.overallStatus];
        const hasDisconf = item.disconfirmingEvidence.length > 0;
        return (
          <div key={item.ticker} className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[#F4F4F4]">
              <span className="text-sm font-bold text-[#171A20]">{item.ticker}</span>
              <span className="text-sm text-[#5C5E62] truncate flex-1">{item.title}</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border"
                style={{ color: dot.color, borderColor: dot.color, backgroundColor: dot.color + "18" }}>
                {dot.label}
              </span>
              <span className="text-[10px] text-[#8E8E8E] shrink-0">C{item.confidenceScore}/10</span>
            </div>

            {/* Pillars */}
            <div className="px-4 py-2 space-y-1.5">
              {item.pillars.map((p, i) => {
                const pdot  = STATUS_DOT[p.status];
                const arrow = TREND_ARROW[p.trend];
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: pdot.color }} />
                    <span className="text-xs text-[#171A20] flex-1 truncate">{p.name}</span>
                    <span className="text-xs font-bold shrink-0" style={{ color: arrow.color }}>{arrow.char}</span>
                    <span className="text-[10px] text-[#8E8E8E] shrink-0">{pdot.label}</span>
                  </div>
                );
              })}
            </div>

            {/* Disconfirming evidence */}
            {hasDisconf && (
              <div className="px-4 pb-3 pt-1 space-y-1.5 border-t border-[#F4F4F4] mt-1">
                <div className="text-[10px] font-semibold text-[#DC2626] uppercase tracking-wide">Disconfirming Evidence</div>
                {item.disconfirmingEvidence.map((ev, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-[10px] text-[#DC2626] shrink-0 mt-0.5">!</span>
                    <span className="text-xs text-[#5C5E62] leading-snug">{ev.text}</span>
                    <span className="text-[10px] text-[#AAAAAA] shrink-0 ml-auto">
                      {new Date(ev.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Footer */}
            {item.lastReviewedAt && (
              <div className="px-4 pb-2 text-[10px] text-[#AAAAAA]">
                Last reviewed {new Date(item.lastReviewedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Catalyst Tab ─────────────────────────────────────────────────────────────

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

const IMPACT_STYLE: Record<CatalystEvent["impactRating"], { bg: string; text: string; border: string }> = {
  H: { bg: "#FEF2F2", text: "#DC2626", border: "#FECACA" },
  M: { bg: "#FFFBEB", text: "#D97706", border: "#FDE68A" },
  L: { bg: "#F4F4F4", text: "#8E8E8E", border: "#E5E5E5" },
};

function daysLabel(n: number): string {
  if (n === 0)  return "Today";
  if (n === 1)  return "Tomorrow";
  if (n === -1) return "Yesterday";
  if (n < 0)    return `${Math.abs(n)}d ago`;
  return `in ${n}d`;
}

function CatalystTab() {
  const [events, setEvents]   = useState<CatalystEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/catalysts?days=90")
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(setEvents)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="space-y-2">
      {[1, 2, 3, 4].map(i => <div key={i} className="h-14 bg-[#EEEEEE] rounded-xl animate-pulse" />)}
    </div>
  );

  if (error) return (
    <div className="text-sm text-[#DC2626] bg-[#FEF2F2] border border-[#FECACA] rounded-lg px-4 py-3">{error}</div>
  );

  if (events.length === 0) return (
    <div className="py-12 text-center text-sm text-[#8E8E8E]">
      No upcoming catalysts found. Earnings history is needed to project future dates.
    </div>
  );

  const upcoming = events.filter(e => e.daysAway >= 0);
  const past     = events.filter(e => e.daysAway <  0);

  function EventRow({ ev }: { ev: CatalystEvent }) {
    const imp = IMPACT_STYLE[ev.impactRating];
    const isPast = ev.daysAway < 0;
    return (
      <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${isPast ? "opacity-60" : ""}`}
        style={{ borderColor: "#EEEEEE", backgroundColor: "#FAFAFA" }}>
        {/* Date column */}
        <div className="shrink-0 w-14 text-center">
          <div className="text-[10px] font-semibold text-[#8E8E8E] uppercase">
            {new Date(ev.date + "T12:00:00").toLocaleDateString("en-US", { month: "short" })}
          </div>
          <div className="text-lg font-bold text-[#171A20] leading-none">
            {new Date(ev.date + "T12:00:00").getDate()}
          </div>
          <div className="text-[10px] text-[#AAAAAA] mt-0.5">{daysLabel(ev.daysAway)}</div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold text-[#171A20]">{ev.ticker}</span>
            <span className="text-xs text-[#5C5E62] truncate">{ev.title.replace(`${ev.ticker} `, "")}</span>
          </div>
          {ev.notes && (
            <div className="text-[11px] text-[#8E8E8E] leading-snug truncate">{ev.notes}</div>
          )}
          {ev.isEstimated && (
            <div className="text-[10px] text-[#AAAAAA] mt-0.5">Estimated date</div>
          )}
        </div>

        {/* Impact badge */}
        <span className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded border"
          style={{ backgroundColor: imp.bg, color: imp.text, borderColor: imp.border }}>
          {ev.impactRating}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {upcoming.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide mb-2">Upcoming</div>
          <div className="space-y-2">
            {upcoming.map((ev, i) => <EventRow key={i} ev={ev} />)}
          </div>
        </div>
      )}
      {past.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide mb-2">Recent (last 14d)</div>
          <div className="space-y-2">
            {past.map((ev, i) => <EventRow key={i} ev={ev} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Macro Tab ────────────────────────────────────────────────────────────────

function MacroTab({ brief }: { brief: MorningBrief | null }) {
  const macro = brief?.macroSummary;
  if (!macro) return (
    <div className="py-12 text-center text-sm text-[#8E8E8E]">No macro data — generate a Morning Brief to populate.</div>
  );

  return (
    <div className="space-y-4">
      <div className="bg-white border border-[#EEEEEE] rounded-xl p-4">
        <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide mb-1">Overall Stance</div>
        <div className="text-sm text-[#171A20]">{macro.overallStance}</div>
        {!macro.dataAvailable && (
          <div className="text-xs text-[#D97706] mt-1">No live FRED data — seeded defaults used.</div>
        )}
      </div>
      <div className="space-y-2">
        {macro.topics.map((t, i) => {
          const s = SIGNAL_STYLE[t.signal] ?? SIGNAL_STYLE.neutral;
          return (
            <div key={i} className="bg-white border border-[#EEEEEE] rounded-xl p-4 flex items-start gap-3">
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0 mt-0.5"
                style={{ backgroundColor: s.bg, color: s.text, border: `1px solid ${s.border}` }}
              >
                {t.signal}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[#171A20]">{t.topic}</span>
                  {t.value && <span className="text-xs font-semibold text-[#5C5E62]">{t.value}</span>}
                </div>
                <div className="text-xs text-[#5C5E62] mt-0.5">{t.insight}</div>
                {t.source && <div className="text-[11px] text-[#AAAAAA] mt-0.5">{t.source}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Geopolitics Tab ──────────────────────────────────────────────────────────

function GeopoliticsTab({ brief }: { brief: MorningBrief | null }) {
  const geo = brief?.geopoliticalSummary;
  if (!geo) return (
    <div className="py-12 text-center text-sm text-[#8E8E8E]">No geopolitical data — generate a Morning Brief to populate.</div>
  );

  return (
    <div className="space-y-4">
      <div className="bg-white border border-[#EEEEEE] rounded-xl p-4">
        <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide mb-1">Overall Stance</div>
        <div className="text-sm text-[#171A20]">{geo.overallStance}</div>
      </div>
      <div className="space-y-2">
        {geo.risks.map((r, i) => {
          const s = GEO_LEVEL_STYLE[r.level] ?? GEO_LEVEL_STYLE.low;
          return (
            <div key={i} className="bg-white border border-[#EEEEEE] rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wide"
                  style={{ backgroundColor: s.bg, color: s.text }}
                >
                  {r.level}
                </span>
                <span className="text-sm font-semibold text-[#171A20]">{r.region}</span>
              </div>
              <div className="text-xs text-[#5C5E62]">{r.insight}</div>
              {r.latestEvent && (
                <div className="text-xs text-[#8E8E8E] border-l-2 border-[#EEEEEE] pl-2">
                  {r.latestEvent}
                  {r.eventSource && <span className="text-[#AAAAAA]"> — {r.eventSource}</span>}
                </div>
              )}
              {r.portfolioExposure && (
                <div className="text-xs text-[#5C5E62]">
                  <span className="font-medium text-[#8E8E8E]">Portfolio exposure:</span> {r.portfolioExposure}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function IntelligencePage() {
  const [brief, setBrief] = useState<MorningBrief | null>(null);
  const [newsletterItems, setNewsletterItems] = useState<NewsletterItem[]>([]);
  const [freshness, setFreshness] = useState<NewsletterFreshness | null>(null);
  const [sourceHealth, setSourceHealth] = useState<SourceHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>("brief");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  async function loadNewsletterData() {
    const nlData = await fetch("/api/newsletter?days=14").then(r => r.ok ? r.json() : null).catch(() => null);
    if (nlData?.items) setNewsletterItems(nlData.items);
    if (nlData?.freshness) setFreshness(nlData.freshness);
    if (nlData?.sourceHealth) setSourceHealth(nlData.sourceHealth);
  }

  useEffect(() => {
    Promise.all([
      fetch("/api/morning-brief").then(r => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/newsletter?days=14").then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([briefData, nlData]) => {
      if (briefData) setBrief(briefData);
      if (nlData?.items) setNewsletterItems(nlData.items);
      if (nlData?.freshness) setFreshness(nlData.freshness);
      if (nlData?.sourceHealth) setSourceHealth(nlData.sourceHealth);
    }).finally(() => setLoading(false));
  }, []);

  async function handleRefreshNewsletters(force: boolean) {
    const url = force ? "/api/newsletter?force=true" : "/api/newsletter";
    const res = await fetch(url, { method: "POST" });
    if (!res.ok) throw new Error("Refresh failed");
    await loadNewsletterData();
  }

  async function handleGenerateBrief() {
    setGenerating(true);
    setGenError(null);
    try {
      const res = await fetch("/api/morning-brief", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate");
      setBrief(data);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Failed");
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4 md:px-6 space-y-6">
        <div className="h-8 w-56 bg-[#EEEEEE] rounded-xl animate-pulse" />
        <div className="h-12 w-full bg-[#EEEEEE] rounded-xl animate-pulse" />
        <div className="h-64 w-full bg-[#EEEEEE] rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 md:px-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#171A20]">Intelligence</h1>
          <p className="text-xs text-[#8E8E8E] mt-0.5">What is happening in the world?</p>
        </div>
        <button
          onClick={handleGenerateBrief}
          disabled={generating}
          className="text-sm font-medium px-4 py-2 rounded-lg text-white transition-opacity shrink-0"
          style={{ backgroundColor: "#3E6AE1", opacity: generating ? 0.6 : 1 }}
        >
          {generating ? "Generating…" : "Refresh Brief"}
        </button>
      </div>

      {genError && (
        <div className="text-sm text-[#DC2626] bg-[#FEF2F2] border border-[#FECACA] rounded-lg px-4 py-2">{genError}</div>
      )}

      {/* Tab bar */}
      <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
        <div className="border-b border-[#EEEEEE] flex overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap"
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
          {tab === "brief"         && <MorningBriefTab brief={brief} loading={loading} />}
          {tab === "institutional" && <InstitutionalTab brief={brief} items={newsletterItems} />}
          {tab === "newsletters"   && <NewslettersTab brief={brief} items={newsletterItems} freshness={freshness} sourceHealth={sourceHealth} onRefresh={handleRefreshNewsletters} />}
          {tab === "macro"         && <MacroTab brief={brief} />}
          {tab === "geopolitics"   && <GeopoliticsTab brief={brief} />}
          {tab === "thesis"        && <ThesisTab />}
          {tab === "catalysts"     && <CatalystTab />}
        </div>
      </div>
    </div>
  );
}
