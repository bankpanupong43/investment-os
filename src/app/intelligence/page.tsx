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

interface MorningBrief {
  id: string;
  briefingDate: string;
  marketRegime: MarketRegime;
  marketRegimeEvidence: string[];
  macroSummary: MacroSummary;
  geopoliticalSummary: GeopoliticalSummary;
  technologySummary: TechnologySummary;
  recommendedActions: { priority: number; action: string; reason: string; urgency: string; ticker: string | null }[];
  institutionalResearch?: NewsletterInsight[];
  newsletterConsensus?: NewsletterInsight[];
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

type TabId = "brief" | "institutional" | "newsletters" | "macro" | "geopolitics";
const TABS: { id: TabId; label: string }[] = [
  { id: "brief",        label: "Morning Brief" },
  { id: "institutional", label: "Institutional" },
  { id: "newsletters",  label: "Newsletters" },
  { id: "macro",        label: "Macro" },
  { id: "geopolitics",  label: "Geopolitics" },
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

  return (
    <div className="space-y-5">
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

const NEWSLETTER_SOURCES = ["matt_levine", "daily_upside", "axios_markets", "sherwood", "morning_brew"];

function NewslettersTab({ brief, items }: { brief: MorningBrief | null; items: NewsletterItem[] }) {
  const briefConsensus = brief?.newsletterConsensus ?? [];
  const newsletters = items.filter(i => !INSTITUTIONAL_SOURCES.some(s => i.source.toLowerCase().includes(s)));

  const grouped = newsletters.reduce<Record<string, NewsletterItem[]>>((acc, item) => {
    const key = item.sourceLabel || item.source;
    acc[key] = acc[key] ?? [];
    acc[key].push(item);
    return acc;
  }, {});

  if (briefConsensus.length === 0 && newsletters.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-[#8E8E8E]">
        No newsletters ingested yet. Configure Gmail OAuth and run a newsletter refresh.
      </div>
    );
  }

  return (
    <div className="space-y-5">
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
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>("brief");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/morning-brief").then(r => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/newsletter?days=14").then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([briefData, nlData]) => {
      if (briefData) setBrief(briefData);
      if (nlData?.items) setNewsletterItems(nlData.items);
    }).finally(() => setLoading(false));
  }, []);

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
          {tab === "newsletters"   && <NewslettersTab brief={brief} items={newsletterItems} />}
          {tab === "macro"         && <MacroTab brief={brief} />}
          {tab === "geopolitics"   && <GeopoliticsTab brief={brief} />}
        </div>
      </div>
    </div>
  );
}
