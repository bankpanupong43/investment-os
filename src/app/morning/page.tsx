"use client";
import { useEffect, useState } from "react";
import type {
  MarketRegime,
  MacroSummary,
  GeopoliticalSummary,
  TechnologySummary,
  DailyDigest,
  DailyDigestItem,
  RecommendedAction,
} from "@/lib/morning-brief-engine";

interface MorningBriefResponse {
  id: string;
  briefingDate: string;
  createdAt: string;
  marketRegime: MarketRegime;
  marketRegimeEvidence: string[];
  macroSummary: MacroSummary;
  geopoliticalSummary: GeopoliticalSummary;
  technologySummary: TechnologySummary;
  portfolioImpact: DailyDigest;
  recommendedActions: RecommendedAction[];
  generatedFromSources: Record<string, number>;
  dataSources?: {
    macro: string[];
    market: string[];
    geo: string[];
    portfolio: string[];
  };
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const REGIME_STYLE: Record<MarketRegime, { bg: string; text: string; border: string; dot: string }> = {
  "Risk On":  { bg: "bg-[#eef7f1]",  text: "text-[#2d7d46]",  border: "border-[#c3e6cf]", dot: "bg-[#2d7d46]" },
  "Neutral":  { bg: "bg-[#fffbeb]",  text: "text-[#b45309]",  border: "border-[#fde68a]", dot: "bg-[#b45309]" },
  "Risk Off": { bg: "bg-[#fdf0ee]",  text: "text-[#c0392b]",  border: "border-[#f5c6c1]", dot: "bg-[#c0392b]" },
};

const SIGNAL_DOT: Record<string, string> = {
  positive: "bg-[#2d7d46]",
  neutral:  "bg-[#8E8E8E]",
  negative: "bg-[#c0392b]",
  watch:    "bg-[#b45309]",
};

const SIGNAL_TEXT: Record<string, string> = {
  positive: "text-[#2d7d46]",
  neutral:  "text-[#8E8E8E]",
  negative: "text-[#c0392b]",
  watch:    "text-[#b45309]",
};

const GEO_LEVEL: Record<string, string> = {
  high:   "text-[#c0392b] bg-[#fdf0ee]",
  medium: "text-[#b45309] bg-[#fffbeb]",
  low:    "text-[#8E8E8E] bg-[#F4F4F4]",
};

const IMPACT_STYLE: Record<string, { border: string; label: string; labelStyle: string }> = {
  positive: { border: "border-l-[#2d7d46]",  label: "Positive", labelStyle: "text-[#2d7d46]" },
  neutral:  { border: "border-l-[#AAAAAA]",  label: "Neutral",  labelStyle: "text-[#8E8E8E]" },
  negative: { border: "border-l-[#c0392b]",  label: "Review",   labelStyle: "text-[#c0392b]" },
  critical: { border: "border-l-[#7f1d1d]",  label: "Critical", labelStyle: "text-[#7f1d1d]" },
};

const URGENCY_STYLE: Record<string, string> = {
  high:   "text-[#c0392b] bg-[#fdf0ee] border-[#f5c6c1]",
  medium: "text-[#b45309] bg-[#fffbeb] border-[#fde68a]",
  low:    "text-[#5C5E62] bg-[#F4F4F4] border-[#EEEEEE]",
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bg-[#EEEEEE] rounded-xl animate-pulse ${className}`} />;
}

function LoadingSkeleton() {
  return (
    <div className="p-6 lg:p-8 max-w-5xl space-y-6">
      <Skeleton className="h-20 w-full" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
      <Skeleton className="h-48" />
      <Skeleton className="h-64" />
      <Skeleton className="h-48" />
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

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

// ─── Market Regime header ─────────────────────────────────────────────────────

function RegimeHeader({ brief }: { brief: MorningBriefResponse }) {
  const style = REGIME_STYLE[brief.marketRegime];
  const date = new Date(brief.briefingDate).toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const generated = new Date(brief.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl p-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-medium text-[#171A20]">Morning Intelligence</h1>
          <p className="text-sm text-[#8E8E8E] mt-0.5">{date} · Generated {generated}</p>
        </div>
        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${style.bg} ${style.border} shrink-0`}>
          <span className={`w-2 h-2 rounded-full ${style.dot}`} />
          <span className={`text-sm font-semibold ${style.text}`}>{brief.marketRegime}</span>
        </div>
      </div>
      {brief.marketRegimeEvidence.length > 0 && (
        <div className="mt-4 space-y-1">
          {brief.marketRegimeEvidence.map((e, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-[#5C5E62]">
              <span className="text-[#AAAAAA] mt-0.5 shrink-0">·</span>
              <span>{e}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Macro ────────────────────────────────────────────────────────────────────

function MacroSection({ macro }: { macro: MacroSummary }) {
  return (
    <Section label="Macro Environment">
      <p className="text-sm text-[#5C5E62] mb-4 italic">{macro.overallStance}</p>
      <div className="space-y-3">
        {macro.topics.map(topic => (
          <div key={topic.topic} className="flex items-start gap-3">
            <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${SIGNAL_DOT[topic.signal]}`} />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-[#171A20]">{topic.topic}</span>
                <span className={`text-[10px] font-semibold uppercase ${SIGNAL_TEXT[topic.signal]}`}>{topic.signal}</span>
                {(topic as { value?: string }).value && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-[#F4F4F4] text-[#5C5E62] rounded font-mono border border-[#EEEEEE]">
                    {(topic as { value?: string }).value}
                  </span>
                )}
                {(topic as { source?: string }).source && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-[#EEF3FD] text-[#3E6AE1] rounded">
                    {(topic as { source?: string }).source}
                  </span>
                )}
              </div>
              <p className="text-sm text-[#5C5E62] mt-0.5">{topic.insight}</p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ─── Geopolitics ──────────────────────────────────────────────────────────────

function GeopoliticsSection({ geo }: { geo: GeopoliticalSummary }) {
  return (
    <Section label="Geopolitics">
      <p className="text-sm text-[#5C5E62] mb-4 italic">{geo.overallStance}</p>
      <div className="space-y-4">
        {geo.risks.map(risk => {
          const r = risk as typeof risk & { latestEvent?: string; eventSource?: string };
          return (
            <div key={risk.region}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-[#171A20]">{risk.region}</span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${GEO_LEVEL[risk.level]}`}>
                  {risk.level.toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-[#8E8E8E] mb-1">{risk.portfolioExposure}</p>
              <p className="text-sm text-[#5C5E62]">{risk.insight}</p>
              {r.latestEvent && (
                <div className="mt-1.5 flex items-start gap-1.5">
                  <span className="text-[10px] text-[#AAAAAA] shrink-0 mt-0.5">Latest:</span>
                  <div className="min-w-0">
                    <span className="text-[11px] text-[#5C5E62] italic leading-tight">{r.latestEvent}</span>
                    {r.eventSource && (
                      <span className="ml-1.5 text-[10px] px-1 py-0.5 bg-[#EEF3FD] text-[#3E6AE1] rounded">{r.eventSource}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ─── Technology ───────────────────────────────────────────────────────────────

function TechnologySection({ tech }: { tech: TechnologySummary }) {
  return (
    <Section label="Technology Themes">
      <p className="text-sm text-[#5C5E62] mb-4 italic">{tech.overallStance}</p>
      <div className="space-y-4">
        {tech.themes.map(theme => (
          <div key={theme.theme} className="flex items-start gap-3">
            <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${SIGNAL_DOT[theme.signal]}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-[#171A20]">{theme.theme}</span>
                <span className={`text-[10px] font-semibold uppercase ${SIGNAL_TEXT[theme.signal]}`}>{theme.signal}</span>
                {theme.holdingRelevance.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {theme.holdingRelevance.map(t => (
                      <span key={t} className="text-[10px] px-1.5 py-0.5 bg-[#EEF3FD] text-[#3E6AE1] rounded font-medium">{t}</span>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-sm text-[#5C5E62] mt-0.5">{theme.insight}</p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ─── Portfolio Impact ─────────────────────────────────────────────────────────

const TYPE_LABEL: Record<DailyDigestItem["type"], string> = {
  filing: "FILING",
  geo: "GEO",
  mention: "MENTION",
};

function DailyDigestSection({ digest }: { digest: DailyDigest }) {
  if (digest.noActivity) {
    return (
      <Section label="Today's Events">
        <p className="text-sm text-[#8E8E8E] italic">No material events in the last 24 hours.</p>
      </Section>
    );
  }

  return (
    <>
      {digest.executeNow.length > 0 && (
        <Section label="Execute Today">
          <div className="space-y-2">
            {digest.executeNow.map((item, i) => (
              <div key={i} className="flex items-start gap-3 border-l-2 border-[#3E6AE1] pl-3 py-1">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#171A20]">{item.action}</p>
                  <p className="text-xs text-[#8E8E8E] mt-0.5">{item.reason}</p>
                </div>
                {item.ticker && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-[#EEF3FD] text-[#3E6AE1] rounded font-medium shrink-0">{item.ticker}</span>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}
      <Section label="Today's Events">
        <div className="space-y-2">
          {digest.items.map((item, i) => {
            const style = IMPACT_STYLE[item.impact] ?? IMPACT_STYLE.neutral;
            return (
              <div key={i} className={`border-l-2 ${style.border} pl-3 py-1`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-[#F4F4F4] text-[#5C5E62] rounded">{TYPE_LABEL[item.type]}</span>
                  {item.ticker && <span className="text-xs font-semibold text-[#3E6AE1]">{item.ticker}</span>}
                  <span className="text-sm text-[#171A20]">{item.headline}</span>
                  <span className={`text-[10px] font-semibold uppercase ${style.labelStyle}`}>{style.label}</span>
                </div>
                {item.detail && <p className="text-xs text-[#8E8E8E] mt-0.5">{item.detail}</p>}
                {item.source && <p className="text-[10px] text-[#AAAAAA] mt-0.5">{item.source}</p>}
              </div>
            );
          })}
        </div>
      </Section>
    </>
  );
}

// ─── Recommended Actions ──────────────────────────────────────────────────────

function ActionsSection({ actions }: { actions: RecommendedAction[] }) {
  return (
    <Section label="Recommended Actions">
      <div className="space-y-3">
        {actions.map((action, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="mt-0.5 w-5 h-5 rounded-full bg-[#3E6AE1] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
              {action.priority}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-[#171A20]">{action.action}</span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${URGENCY_STYLE[action.urgency]}`}>
                  {action.urgency.toUpperCase()}
                </span>
                {action.ticker && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-[#EEF3FD] text-[#3E6AE1] rounded font-medium">{action.ticker}</span>
                )}
              </div>
              <p className="text-xs text-[#8E8E8E] mt-0.5">{action.reason}</p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ─── Data sources footer ──────────────────────────────────────────────────────

function SourcesFooter({
  sources,
  dataSources,
}: {
  sources: Record<string, number>;
  dataSources?: { macro: string[]; market: string[]; geo: string[]; portfolio: string[] };
}) {
  const counts = Object.entries(sources).filter(([, v]) => v > 0);
  const externalSources = dataSources
    ? [
        ...dataSources.macro,
        ...dataSources.market,
        ...dataSources.geo,
      ].filter(Boolean)
    : [];

  return (
    <div className="space-y-1.5">
      {externalSources.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className="text-[10px] text-[#AAAAAA] self-center">External:</span>
          {externalSources.map((s, i) => (
            <span key={i} className="text-[10px] px-1.5 py-0.5 bg-[#EEF3FD] text-[#3E6AE1] rounded border border-[#dce8fb]">{s}</span>
          ))}
        </div>
      )}
      <div className="text-[10px] text-[#AAAAAA] flex flex-wrap gap-3">
        <span>Internal:</span>
        {counts.map(([k, v]) => (
          <span key={k}>{k.replace(/_/g, " ")} {v}</span>
        ))}
      </div>
    </div>
  );
}

// ─── Error state ──────────────────────────────────────────────────────────────

function EmptyState({ onGenerate, generating }: { onGenerate: () => void; generating: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-12 h-12 rounded-xl bg-[#EEF3FD] flex items-center justify-center mb-4">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3E6AE1" strokeWidth="1.75">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h2 className="text-base font-medium text-[#171A20]">No morning brief yet</h2>
      <p className="text-sm text-[#8E8E8E] mt-1 mb-6 max-w-xs">
        Generate today&apos;s briefing to see what changed, what matters, and what to review.
      </p>
      <button
        onClick={onGenerate}
        disabled={generating}
        className="px-5 py-2 bg-[#3E6AE1] text-white text-sm font-medium rounded-lg hover:bg-[#2f58c8] disabled:opacity-50 transition-colors"
      >
        {generating ? "Generating…" : "Generate Today's Brief"}
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MorningPage() {
  const [brief, setBrief] = useState<MorningBriefResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBrief = () => {
    setLoading(true);
    fetch("/api/morning-brief")
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => { setBrief(d); setError(null); })
      .catch(code => {
        if (code === 404) setBrief(null);
        else setError("Failed to load morning brief.");
      })
      .finally(() => setLoading(false));
  };

  const generate = () => {
    setGenerating(true);
    setError(null);
    fetch("/api/morning-brief", { method: "POST" })
      .then(r => r.ok ? r.json() : Promise.reject("Generation failed"))
      .then(d => { setBrief(d); })
      .catch(() => setError("Generation failed. Check console."))
      .finally(() => setGenerating(false));
  };

  useEffect(() => { fetchBrief(); }, []);

  if (loading) return <LoadingSkeleton />;

  if (error) {
    return (
      <div className="p-6 lg:p-8 max-w-5xl">
        <div className="bg-[#fdf0ee] border border-[#f5c6c1] rounded-xl p-4 text-sm text-[#c0392b]">{error}</div>
      </div>
    );
  }

  if (!brief) {
    return (
      <div className="p-6 lg:p-8 max-w-5xl">
        <EmptyState onGenerate={generate} generating={generating} />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl space-y-4">
      {/* Header with regime */}
      <RegimeHeader brief={brief} />

      {/* Regenerate button */}
      <div className="flex justify-end">
        <button
          onClick={generate}
          disabled={generating}
          className="px-4 py-1.5 text-sm text-[#3E6AE1] border border-[#3E6AE1] rounded-lg hover:bg-[#EEF3FD] disabled:opacity-50 transition-colors"
        >
          {generating ? "Regenerating…" : "Regenerate"}
        </button>
      </div>

      {/* Two-column grid for macro + geopolitics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MacroSection macro={brief.macroSummary} />
        <GeopoliticsSection geo={brief.geopoliticalSummary} />
      </div>

      {/* Technology full-width */}
      <TechnologySection tech={brief.technologySummary} />

      {/* Portfolio Impact */}
      <DailyDigestSection digest={brief.portfolioImpact} />

      {/* Recommended Actions */}
      <ActionsSection actions={brief.recommendedActions} />

      {/* Sources footer */}
      <SourcesFooter sources={brief.generatedFromSources} dataSources={brief.dataSources} />
    </div>
  );
}
