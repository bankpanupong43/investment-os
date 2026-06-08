"use client";
import { useEffect, useRef, useState } from "react";
import type {
  CIOBriefDocument,
  BucketAllocation,
  EnrichedMacroTopic,
  EnrichedGeoRisk,
  EnrichedThesisStatus,
  EnrichedRadarEntry,
} from "@/lib/brief-generator";

// ─── Design tokens ────────────────────────────────────────────────────────────

const REGIME_STYLE: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  "Risk On":  { bg: "bg-[#eef7f1]", text: "text-[#2d7d46]",  border: "border-[#c3e6cf]", dot: "bg-[#2d7d46]"  },
  "Neutral":  { bg: "bg-[#fffbeb]", text: "text-[#b45309]",  border: "border-[#fde68a]", dot: "bg-[#b45309]"  },
  "Risk Off": { bg: "bg-[#fdf0ee]", text: "text-[#c0392b]",  border: "border-[#f5c6c1]", dot: "bg-[#c0392b]"  },
};

const SIGNAL_DOT: Record<string, string> = {
  positive: "bg-[#2d7d46]",
  neutral:  "bg-[#8E8E8E]",
  negative: "bg-[#c0392b]",
  watch:    "bg-[#b45309]",
};

const STATUS_STYLE: Record<EnrichedThesisStatus["status"], { bg: string; text: string; label: string; dot: string }> = {
  strengthened: { bg: "bg-[#eef7f1]", text: "text-[#2d7d46]", label: "Strengthened", dot: "bg-[#2d7d46]" },
  unchanged:    { bg: "bg-[#F4F4F4]", text: "text-[#5C5E62]", label: "Unchanged",    dot: "bg-[#8E8E8E]" },
  weakened:     { bg: "bg-[#fdf0ee]", text: "text-[#c0392b]", label: "Weakened",     dot: "bg-[#c0392b]" },
};

const URGENCY_STYLE: Record<string, string> = {
  high:   "text-[#c0392b] bg-[#fdf0ee] border-[#f5c6c1]",
  medium: "text-[#b45309] bg-[#fffbeb] border-[#fde68a]",
  low:    "text-[#5C5E62] bg-[#F4F4F4] border-[#EEEEEE]",
};

const GEO_LEVEL_STYLE: Record<string, string> = {
  high:   "text-[#c0392b] bg-[#fdf0ee]",
  medium: "text-[#b45309] bg-[#fffbeb]",
  low:    "text-[#8E8E8E] bg-[#F4F4F4]",
};

const CONFIDENCE_STYLE: Record<string, string> = {
  High:   "bg-[#eef7f1] text-[#2d7d46]",
  Medium: "bg-[#fffbeb] text-[#b45309]",
  Low:    "bg-[#F4F4F4] text-[#8E8E8E]",
};

function impactStyle(score: number): string {
  if (score >= 5) return "bg-[#fdf0ee] text-[#c0392b]";
  if (score >= 4) return "bg-[#fffbeb] text-[#b45309]";
  if (score >= 3) return "bg-[#EEF3FD] text-[#3E6AE1]";
  return "bg-[#F4F4F4] text-[#8E8E8E]";
}

// ─── Badge components ─────────────────────────────────────────────────────────

function ConfidenceBadge({ conf }: { conf: string }) {
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${CONFIDENCE_STYLE[conf] ?? CONFIDENCE_STYLE.Low}`}>
      {conf}
    </span>
  );
}

function ImpactBadge({ score }: { score: number }) {
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${impactStyle(score)}`}>
      Impact {score}/5
    </span>
  );
}

function EvidenceFooter({ count, sources }: { count: number; sources: string[] }) {
  if (count === 0) return <span className="text-[11px] text-[#AAAAAA] italic">No direct evidence</span>;
  return (
    <span className="text-[11px] text-[#AAAAAA]">
      {count} fact{count > 1 ? "s" : ""} · {sources.join(", ")}
    </span>
  );
}

// ─── Shell components ─────────────────────────────────────────────────────────

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

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bg-[#EEEEEE] rounded-xl animate-pulse ${className}`} />;
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────

type Tab = "brief" | "archive" | "email";

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string }[] = [
    { id: "brief",   label: "Latest Brief"  },
    { id: "archive", label: "Archive"       },
    { id: "email",   label: "Email Preview" },
  ];
  return (
    <div className="flex border-b border-[#EEEEEE] bg-white px-5">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            active === t.id
              ? "border-[#171A20] text-[#171A20]"
              : "border-transparent text-[#8E8E8E] hover:text-[#5C5E62]"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── Quality Summary bar ──────────────────────────────────────────────────────

function QualitySummaryBar({ qm }: { qm: CIOBriefDocument["qualityMetrics"] }) {
  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl p-4">
      <p className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest mb-3">Brief Quality</p>
      <div className="flex flex-wrap gap-3">
        <QualityPill label="Read Time" value={`~${qm.estimatedReadTimeMin} min`} bg="bg-[#F4F4F4]" text="text-[#5C5E62]" />
        <QualityPill label="Evidence" value={`${qm.evidenceCoveragePercent}%`} bg="bg-[#EEF3FD]" text="text-[#3E6AE1]" />
        <QualityPill label="High Confidence" value={String(qm.highConfidenceCount)} bg="bg-[#eef7f1]" text="text-[#2d7d46]" />
        <QualityPill label="Med Confidence" value={String(qm.mediumConfidenceCount)} bg="bg-[#fffbeb]" text="text-[#b45309]" />
        <QualityPill label="Portfolio Events" value={String(qm.portfolioRelevantEvents)} bg="bg-[#fffbeb]" text="text-[#b45309]" />
        <QualityPill label="Noise Removed" value={String(qm.noiseRemovedCount)} bg="bg-[#F4F4F4]" text="text-[#8E8E8E]" />
      </div>
      {qm.autoSummarized && (
        <p className="mt-2 text-[11px] text-[#b45309] italic">
          Auto-summarized: content trimmed to meet 15-minute read target.
        </p>
      )}
    </div>
  );
}

function QualityPill({ label, value, bg, text }: { label: string; value: string; bg: string; text: string }) {
  return (
    <div className={`flex flex-col items-center rounded-lg px-3 py-2 min-w-[72px] ${bg}`}>
      <span className={`text-sm font-bold ${text}`}>{value}</span>
      <span className={`text-[10px] ${text} opacity-80`}>{label}</span>
    </div>
  );
}

// ─── Section 1: Executive Summary ────────────────────────────────────────────

function ExecSummary({ bullets }: { bullets: string[] }) {
  return (
    <Section label="Executive Summary">
      <ul className="space-y-2">
        {bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-[#5C5E62]">
            <span className="text-[#AAAAAA] shrink-0 mt-0.5">·</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ─── Section 2: Market Regime ─────────────────────────────────────────────────

function MarketRegimeSection({ doc }: { doc: CIOBriefDocument }) {
  const style = REGIME_STYLE[doc.marketRegime] ?? REGIME_STYLE["Neutral"];
  return (
    <Section label="Market Regime">
      <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border ${style.bg} ${style.border} mb-4`}>
        <span className={`w-2 h-2 rounded-full ${style.dot}`} />
        <span className={`text-sm font-semibold ${style.text}`}>{doc.marketRegime}</span>
      </div>

      {doc.marketMetrics.length > 0 && (
        <div className="mb-4 border border-[#EEEEEE] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#FAFAFA] border-b border-[#EEEEEE]">
                <th className="text-left px-4 py-2 text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-wide">Metric</th>
                <th className="text-right px-4 py-2 text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-wide">Value</th>
                <th className="text-right px-4 py-2 text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-wide">Signal</th>
              </tr>
            </thead>
            <tbody>
              {doc.marketMetrics.map((m, i) => (
                <tr key={i} className="border-t border-[#EEEEEE]">
                  <td className="px-4 py-2 text-[#5C5E62]">{m.label}</td>
                  <td className="px-4 py-2 text-right font-mono text-[#171A20] font-medium">{m.value}</td>
                  <td className="px-4 py-2 text-right">
                    <span className="inline-flex items-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${SIGNAL_DOT[m.signal] ?? "bg-[#8E8E8E]"}`} />
                      <span className="text-[10px] font-semibold text-[#5C5E62] uppercase">{m.signal}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mb-4">
        <p className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest mb-2">Evidence</p>
        <ul className="space-y-1">
          {doc.marketRegimeEvidence.map((e, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-[#5C5E62]">
              <span className="text-[#AAAAAA] shrink-0 mt-0.5">·</span>{e}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest mb-2">Asset Class Impact</p>
        <div className="space-y-2">
          {doc.assetClassImpact.map((a, i) => (
            <div key={i} className="text-sm">
              <span className="font-medium text-[#171A20]">{a.asset}: </span>
              <span className="text-[#5C5E62]">{a.impact} — {a.detail}</span>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ─── Section 3: Macro & Geopolitics ──────────────────────────────────────────

function MacroTopicRow({ topic }: { topic: EnrichedMacroTopic }) {
  return (
    <div className="flex items-start gap-3">
      <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${SIGNAL_DOT[topic.signal] ?? "bg-[#8E8E8E]"}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap mb-1">
          <span className="text-sm font-medium text-[#171A20]">{topic.topic}</span>
          <ImpactBadge score={topic.impactScore} />
          <ConfidenceBadge conf={topic.evidence.confidence} />
          {topic.value && (
            <span className="text-[10px] px-1.5 py-0.5 bg-[#F4F4F4] text-[#5C5E62] rounded font-mono border border-[#EEEEEE]">{topic.value}</span>
          )}
          {topic.source && (
            <span className="text-[10px] px-1.5 py-0.5 bg-[#EEF3FD] text-[#3E6AE1] rounded">{topic.source}</span>
          )}
        </div>
        <p className="text-sm text-[#5C5E62] mb-1">{topic.insight}</p>
        <EvidenceFooter count={topic.evidence.evidenceCount} sources={topic.evidence.sources} />
      </div>
    </div>
  );
}

function GeoRiskRow({ risk }: { risk: EnrichedGeoRisk }) {
  return (
    <div className="border-l-2 border-[#EEEEEE] pl-3">
      <div className="flex items-center gap-1.5 flex-wrap mb-1">
        <span className="text-sm font-medium text-[#171A20]">{risk.region}</span>
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${GEO_LEVEL_STYLE[risk.level] ?? "text-[#8E8E8E] bg-[#F4F4F4]"}`}>
          {risk.level.toUpperCase()}
        </span>
        <ImpactBadge score={risk.impactScore} />
        <ConfidenceBadge conf={risk.evidence.confidence} />
      </div>
      <p className="text-xs text-[#8E8E8E] mb-1">{risk.portfolioExposure}</p>
      <p className="text-sm text-[#5C5E62] mb-1">{risk.insight}</p>
      {risk.latestEvent && (
        <div className="flex items-start gap-1.5 mb-1">
          <span className="text-[10px] text-[#AAAAAA] shrink-0">Latest:</span>
          <span className="text-[11px] text-[#5C5E62] italic">{risk.latestEvent}</span>
          {risk.eventSource && (
            <span className="ml-1 text-[10px] px-1 py-0.5 bg-[#EEF3FD] text-[#3E6AE1] rounded shrink-0">{risk.eventSource}</span>
          )}
        </div>
      )}
      <EvidenceFooter count={risk.evidence.evidenceCount} sources={risk.evidence.sources} />
    </div>
  );
}

function MacroGeoSection({ doc }: { doc: CIOBriefDocument }) {
  const activeGeo = doc.geoRisks.filter(r => !r.filtered);
  const filtered = doc.geoRisks.filter(r => r.filtered);

  return (
    <Section label="Macro & Geopolitics">
      {doc.macroStance && (
        <p className="text-sm text-[#5C5E62] italic mb-4 border-l-2 border-[#EEEEEE] pl-3">{doc.macroStance}</p>
      )}

      <div className="space-y-4 mb-6">
        {doc.macroTopics.map(topic => (
          <MacroTopicRow key={topic.topic} topic={topic} />
        ))}
      </div>

      {activeGeo.length > 0 && (
        <>
          <p className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest mb-3">Geopolitics</p>
          {doc.geoStance && (
            <p className="text-sm text-[#5C5E62] italic mb-4">{doc.geoStance}</p>
          )}
          <div className="space-y-4">
            {activeGeo.map(risk => <GeoRiskRow key={risk.region} risk={risk} />)}
          </div>
        </>
      )}

      {filtered.length > 0 && (
        <p className="mt-4 text-[11px] text-[#AAAAAA] italic">
          Noise filter: {filtered.length} low-relevance geo item{filtered.length > 1 ? "s" : ""} removed (impact &le; 1).
        </p>
      )}
    </Section>
  );
}

// ─── Section 4: Portfolio Health ─────────────────────────────────────────────

function PortfolioHealthSection({ ph }: { ph: CIOBriefDocument["portfolioHealth"] }) {
  const cashPct = ph.totalCapitalUsd > 0
    ? ((ph.cashUsd / ph.totalCapitalUsd) * 100).toFixed(1)
    : null;

  return (
    <Section label="Portfolio Health">
      <p className="text-sm text-[#5C5E62] italic mb-4">{ph.summary}</p>
      {ph.buckets.length > 0 ? (
        <div className="border border-[#EEEEEE] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#FAFAFA] border-b border-[#EEEEEE]">
                <th className="text-left px-4 py-2 text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-wide">Category</th>
                <th className="text-right px-4 py-2 text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-wide">Current</th>
                <th className="text-right px-4 py-2 text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-wide">Target</th>
                <th className="text-right px-4 py-2 text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-wide">Drift</th>
              </tr>
            </thead>
            <tbody>
              {ph.buckets.map((b: BucketAllocation, i: number) => {
                const abs = Math.abs(b.drift);
                const driftColor = abs >= 5 ? "text-[#c0392b]" : abs >= 3 ? "text-[#b45309]" : "text-[#2d7d46]";
                const driftStr = b.drift > 0 ? `+${b.drift.toFixed(1)}%` : `${b.drift.toFixed(1)}%`;
                return (
                  <tr key={i} className="border-t border-[#EEEEEE]">
                    <td className="px-4 py-2 text-[#171A20] font-medium capitalize">{b.bucket}</td>
                    <td className="px-4 py-2 text-right text-[#5C5E62]">{b.currentPct.toFixed(1)}%</td>
                    <td className="px-4 py-2 text-right text-[#5C5E62]">{b.targetPct.toFixed(1)}%</td>
                    <td className={`px-4 py-2 text-right font-semibold ${driftColor}`}>{driftStr}</td>
                  </tr>
                );
              })}
              {cashPct && (
                <tr className="border-t border-[#EEEEEE] bg-[#FAFAFA]">
                  <td className="px-4 py-2 text-[#5C5E62] font-medium">Cash</td>
                  <td className="px-4 py-2 text-right text-[#5C5E62]">{cashPct}%</td>
                  <td className="px-4 py-2 text-right text-[#AAAAAA]">—</td>
                  <td className="px-4 py-2 text-right text-[#AAAAAA]">Available</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-[#AAAAAA]">No allocation targets configured. Run db:seed-targets.</p>
      )}
    </Section>
  );
}

// ─── Section 5: Watchlist & Opportunity Radar ─────────────────────────────────

function RadarEntryCard({ e }: { e: EnrichedRadarEntry }) {
  return (
    <div className="border border-[#EEEEEE] rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 bg-[#FAFAFA] border-b border-[#EEEEEE] flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-[#171A20]">{e.ticker}</span>
        <span className="text-[10px] px-2 py-0.5 bg-[#EEF3FD] text-[#3E6AE1] rounded font-semibold">Score: {e.score}/100</span>
        <ImpactBadge score={e.impactScore} />
        <ConfidenceBadge conf={e.evidence.confidence} />
      </div>
      <div className="px-4 py-3 space-y-2">
        <div>
          <span className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-wide block mb-0.5">Why Now</span>
          <p className="text-sm text-[#5C5E62]">{e.whyNow}</p>
        </div>
        <div>
          <span className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-wide block mb-0.5">Key Risk</span>
          <p className="text-sm text-[#5C5E62]">{e.keyRisk}</p>
        </div>
        <EvidenceFooter count={e.evidence.evidenceCount} sources={e.evidence.sources} />
      </div>
    </div>
  );
}

function RadarGroup({ label, desc, entries }: { label: string; desc?: string; entries: EnrichedRadarEntry[] }) {
  if (!entries.length) return null;
  return (
    <div className="mb-5">
      <p className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest mb-1">{label}</p>
      {desc && <p className="text-xs text-[#AAAAAA] italic mb-3">{desc}</p>}
      <div className="space-y-3">
        {entries.map(e => <RadarEntryCard key={e.ticker} e={e} />)}
      </div>
    </div>
  );
}

function WatchlistRadarSection({ doc }: { doc: CIOBriefDocument }) {
  const total = doc.highConviction.length + doc.disagreement.length + doc.emerging.length;
  return (
    <Section label="Watchlist & Opportunity Radar">
      {total === 0 ? (
        <p className="text-sm text-[#AAAAAA]">No entries. Run opportunity_refresh to populate.</p>
      ) : (
        <>
          <RadarGroup label="A. High Conviction" entries={doc.highConviction} />
          <RadarGroup
            label="B. Disagreement Opportunities"
            desc="System rates highly — no or contrarian committee verdict."
            entries={doc.disagreement}
          />
          <RadarGroup label="C. Emerging" entries={doc.emerging} />
        </>
      )}
    </Section>
  );
}

// ─── Section 6: Thesis Monitoring ────────────────────────────────────────────

function ThesisMonitoringSection({ items }: { items: EnrichedThesisStatus[] }) {
  if (!items.length) {
    return (
      <Section label="Thesis Monitoring">
        <p className="text-sm text-[#AAAAAA]">No active holdings with thesis data.</p>
      </Section>
    );
  }

  const order: EnrichedThesisStatus["status"][] = ["strengthened", "unchanged", "weakened"];
  return (
    <Section label="Thesis Monitoring">
      <div className="space-y-3">
        {order.flatMap(status => {
          const group = items.filter(t => t.status === status);
          if (!group.length) return [];
          const st = STATUS_STYLE[status];
          return group.map(t => (
            <div key={t.ticker} className="flex items-start gap-3">
              <div className={`shrink-0 mt-1 w-2 h-2 rounded-full ${st.dot}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                  <span className="text-sm font-semibold text-[#171A20]">{t.ticker}</span>
                  <span className="text-xs text-[#8E8E8E]">{t.name}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${st.bg} ${st.text}`}>{st.label}</span>
                  <ImpactBadge score={t.impactScore} />
                  <ConfidenceBadge conf={t.evidenceTag.confidence} />
                </div>
                <p className="text-sm text-[#5C5E62] mb-1">{t.evidence}</p>
                <EvidenceFooter count={t.evidenceTag.evidenceCount} sources={t.evidenceTag.sources} />
              </div>
            </div>
          ));
        })}
      </div>
    </Section>
  );
}

// ─── Section 7: Today's Actions ──────────────────────────────────────────────

function TodaysActionsSection({ actions }: { actions: CIOBriefDocument["todaysActions"] }) {
  return (
    <Section label="Today's Actions">
      {actions.length === 0 ? (
        <p className="text-sm text-[#2d7d46] font-medium">No action required today.</p>
      ) : (
        <div className="space-y-3">
          {actions.map(a => (
            <div key={a.priority} className="flex items-start gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-[#F4F4F4] text-[10px] font-bold text-[#5C5E62] flex items-center justify-center mt-0.5">
                {a.priority}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className="text-sm font-medium text-[#171A20]">{a.action}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${URGENCY_STYLE[a.urgency] ?? URGENCY_STYLE.low}`}>
                    {a.urgency.toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-[#8E8E8E]">{a.reason}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ─── Decision Board ───────────────────────────────────────────────────────────

function DecisionBoardSection({ board }: { board: CIOBriefDocument["decisionBoard"] }) {
  const hasContent = board.actNow.length > 0 || board.monitor.length > 0 || board.ignoreCount > 0;
  return (
    <Section label="Decision Board">
      {!hasContent ? (
        <p className="text-sm text-[#2d7d46] font-medium">No decisions required. Portfolio in good standing.</p>
      ) : (
        <div className="space-y-4">
          {board.actNow.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-[#c0392b] uppercase tracking-widest mb-2">Act Now</p>
              <div className="space-y-2">
                {board.actNow.map((d, i) => (
                  <div key={i} className="border-l-2 border-[#c0392b] pl-3">
                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                      <span className="text-sm font-medium text-[#171A20]">{d.item}</span>
                      {d.impactScore != null && <ImpactBadge score={d.impactScore} />}
                    </div>
                    <p className="text-xs text-[#8E8E8E]">{d.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {board.monitor.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-[#b45309] uppercase tracking-widest mb-2">Monitor</p>
              <div className="space-y-2">
                {board.monitor.map((d, i) => (
                  <div key={i} className="border-l-2 border-[#b45309] pl-3">
                    <p className="text-sm font-medium text-[#171A20] mb-0.5">{d.item}</p>
                    <p className="text-xs text-[#8E8E8E]">{d.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {board.ignoreCount > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest mb-1">Ignore</p>
              <p className="text-xs text-[#AAAAAA] italic">
                {board.ignoreCount} low-relevance item{board.ignoreCount > 1 ? "s" : ""} filtered — not portfolio-relevant.
              </p>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

// ─── Discovery Radar (Phase 12B) ─────────────────────────────────────────────

function DiscoveryRadarSection({ dr }: { dr: CIOBriefDocument["discoveryRadar"] }) {
  if (!dr || (dr.tierA.length === 0 && dr.portfolioGapCount === 0)) return null;
  return (
    <Section label="Discovery Radar">
      <p className="text-xs text-[#AAAAAA] mb-4">
        {dr.totalCandidates} candidates active · {dr.portfolioGapCount} portfolio gap{dr.portfolioGapCount !== 1 ? "s" : ""}
        &nbsp;·&nbsp; <a href="/discovery" className="text-[#3E6AE1] hover:underline">Open Discovery Radar</a>
      </p>
      {dr.tierA.length > 0 && (
        <>
          <p className="text-[10px] font-semibold text-[#c0392b] uppercase tracking-widest mb-3">Tier A — Research Now</p>
          <div className="space-y-3 mb-4">
            {dr.tierA.map(c => (
              <div key={c.ticker} className="border-l-2 border-[#c0392b] pl-3">
                <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                  <span className="text-sm font-bold text-[#171A20]">{c.ticker}</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#fdf0ee] text-[#c0392b]">{c.radarScore}/100</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F4F4F4] text-[#5C5E62]">{c.discoveryCategory}</span>
                  {c.themes.slice(0, 2).map(th => (
                    <span key={th} className="text-[10px] px-1.5 py-0.5 rounded bg-[#f3eef9] text-[#7c3aed]">{th}</span>
                  ))}
                </div>
                <p className="text-xs text-[#8E8E8E] leading-relaxed">{c.discoveryReason}</p>
              </div>
            ))}
          </div>
        </>
      )}
      {dr.topThemes.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest mb-2">Top Themes</p>
          <div className="flex flex-wrap gap-1.5">
            {dr.topThemes.map(th => (
              <span key={th} className="text-[11px] px-2 py-0.5 rounded bg-[#f3eef9] text-[#7c3aed] font-medium">{th}</span>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

// ─── Section 8: Sources ───────────────────────────────────────────────────────

function SourcesSection({ doc }: { doc: CIOBriefDocument }) {
  const srcs = doc.sources.length > 0
    ? doc.sources
    : ["Portfolio database (positions, theses, filings, committee sessions)"];
  const qm = doc.qualityMetrics;
  return (
    <Section label="Sources">
      <p className="text-xs text-[#AAAAAA] mb-3">
        External: <strong className="text-[#5C5E62]">{qm.externalSourcesCount}</strong> &nbsp;·&nbsp;
        Internal: <strong className="text-[#5C5E62]">{qm.internalSourcesCount}</strong>
      </p>
      <ul className="space-y-1">
        {srcs.map((s, i) => (
          <li key={i} className="text-xs text-[#8E8E8E]">· {s}</li>
        ))}
      </ul>
    </Section>
  );
}

// ─── Archive tab ─────────────────────────────────────────────────────────────

function ArchiveTab() {
  const [dates, setDates] = useState<string[] | null>(null);

  useEffect(() => {
    fetch("/api/morning-brief/archive")
      .then(r => r.json())
      .then((d: { dates: string[] }) => setDates(d.dates))
      .catch(() => setDates([]));
  }, []);

  if (dates === null) {
    return (
      <div className="p-6 space-y-2">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
      </div>
    );
  }

  if (dates.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-[#AAAAAA]">
        No archived briefs found. Generate and archive a brief first.
      </div>
    );
  }

  return (
    <div className="p-6">
      <p className="text-xs text-[#AAAAAA] mb-4">{dates.length} brief{dates.length !== 1 ? "s" : ""} archived in Brain OS / Morning Brief</p>
      <div className="space-y-2">
        {dates.map(d => {
          const label = new Date(d + "T00:00:00").toLocaleDateString("en-US", {
            weekday: "short", year: "numeric", month: "long", day: "numeric",
          });
          return (
            <div key={d} className="flex items-center justify-between bg-white border border-[#EEEEEE] rounded-lg px-4 py-3">
              <span className="text-sm text-[#171A20] font-medium">{label}</span>
              <div className="flex gap-2">
                <a
                  href={`/api/morning-brief/archive?date=${d}&format=md`}
                  target="_blank"
                  className="text-[11px] px-2.5 py-1 rounded bg-[#F4F4F4] text-[#5C5E62] hover:bg-[#EEEEEE] transition-colors font-medium"
                >
                  .md
                </a>
                <a
                  href={`/api/morning-brief/email-preview?date=${d}`}
                  target="_blank"
                  className="text-[11px] px-2.5 py-1 rounded bg-[#EEF3FD] text-[#3E6AE1] hover:bg-[#dce8fb] transition-colors font-medium"
                >
                  HTML
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Email preview tab ────────────────────────────────────────────────────────

function EmailPreviewTab({ date }: { date: string }) {
  const src = `/api/morning-brief/email-preview?date=${date}`;
  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 160px)" }}>
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#EEEEEE] bg-[#FAFAFA]">
        <span className="text-xs text-[#8E8E8E]">HTML email preview for {date}</span>
        <a
          href={src}
          target="_blank"
          className="text-[11px] px-3 py-1.5 rounded bg-[#171A20] text-white hover:bg-[#333] transition-colors font-medium"
        >
          Open in new tab
        </a>
      </div>
      <iframe
        src={src}
        className="flex-1 w-full border-0"
        title="Email Preview"
        sandbox="allow-same-origin"
      />
    </div>
  );
}

// ─── Main brief view ─────────────────────────────────────────────────────────

function BriefView({ doc, onRefresh }: { doc: CIOBriefDocument; onRefresh: () => void }) {
  const [generating, setGenerating] = useState(false);

  const dateLabel = new Date(doc.date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const timeLabel = new Date(doc.generatedAt).toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit",
  });
  const regime = doc.marketRegime as keyof typeof REGIME_STYLE;
  const rs = REGIME_STYLE[regime] ?? REGIME_STYLE["Neutral"];

  async function handleGenerate() {
    setGenerating(true);
    try {
      await fetch("/api/cio-brief", { method: "POST" });
      onRefresh();
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="p-5 lg:p-6 space-y-4 max-w-4xl">
      {/* Header card */}
      <div className="bg-white border border-[#EEEEEE] rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-xl font-medium text-[#171A20]">Daily CIO Brief</h1>
            <p className="text-sm text-[#8E8E8E] mt-0.5">{dateLabel} · Generated {timeLabel}</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${rs.bg} ${rs.border}`}>
              <span className={`w-2 h-2 rounded-full ${rs.dot}`} />
              <span className={`text-sm font-semibold ${rs.text}`}>{doc.marketRegime}</span>
            </div>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="text-sm px-4 py-2 rounded-lg bg-[#171A20] text-white hover:bg-[#333] transition-colors disabled:opacity-50 font-medium"
            >
              {generating ? "Generating…" : "Regenerate & Archive"}
            </button>
          </div>
        </div>
      </div>

      <QualitySummaryBar qm={doc.qualityMetrics} />
      <ExecSummary bullets={doc.executiveSummary} />
      <MarketRegimeSection doc={doc} />
      <MacroGeoSection doc={doc} />
      <PortfolioHealthSection ph={doc.portfolioHealth} />
      <WatchlistRadarSection doc={doc} />
      <ThesisMonitoringSection items={doc.thesisMonitoring} />
      <TodaysActionsSection actions={doc.todaysActions} />
      <DecisionBoardSection board={doc.decisionBoard} />
      <DiscoveryRadarSection dr={doc.discoveryRadar} />
      <SourcesSection doc={doc} />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MorningBriefPage() {
  const [tab, setTab] = useState<Tab>("brief");
  const [doc, setDoc] = useState<CIOBriefDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch("/api/cio-brief")
      .then(r => {
        if (!r.ok) throw new Error(r.status === 404 ? "No brief found. Generate one first." : "Failed to load brief.");
        return r.json();
      })
      .then((d: CIOBriefDocument) => {
        setDoc(d);
        setLoading(false);
      })
      .catch(e => {
        setError(e.message);
        setLoading(false);
      });
  }, [refreshKey]);

  return (
    <div className="min-h-screen bg-[#F7F7F7]">
      <div className="bg-white border-b border-[#EEEEEE]">
        <div className="max-w-5xl mx-auto">
          <div className="px-5 lg:px-6 py-4">
            <h1 className="text-lg font-semibold text-[#171A20]">Morning Brief</h1>
            <p className="text-xs text-[#AAAAAA] mt-0.5">Phase 12A.1 · CIO Brief with Quality Layer</p>
          </div>
          <TabBar active={tab} onChange={setTab} />
        </div>
      </div>

      <div className="max-w-5xl mx-auto">
        {tab === "brief" && (
          <>
            {loading && (
              <div className="p-5 lg:p-6 space-y-4 max-w-4xl">
                <Skeleton className="h-28" />
                <Skeleton className="h-16" />
                <Skeleton className="h-48" />
                <Skeleton className="h-64" />
              </div>
            )}
            {error && !loading && (
              <div className="p-6">
                <div className="bg-[#fdf0ee] border border-[#f5c6c1] rounded-xl p-5">
                  <p className="text-sm text-[#c0392b] font-medium mb-3">{error}</p>
                  <button
                    onClick={async () => {
                      setLoading(true);
                      setError(null);
                      try {
                        await fetch("/api/cio-brief", { method: "POST" });
                        setRefreshKey(k => k + 1);
                      } catch {
                        setError("Generation failed. Check that the database is accessible.");
                        setLoading(false);
                      }
                    }}
                    className="text-sm px-4 py-2 rounded-lg bg-[#171A20] text-white hover:bg-[#333] transition-colors font-medium"
                  >
                    Generate First Brief
                  </button>
                </div>
              </div>
            )}
            {doc && !loading && (
              <BriefView doc={doc} onRefresh={() => setRefreshKey(k => k + 1)} />
            )}
          </>
        )}
        {tab === "archive" && <ArchiveTab />}
        {tab === "email" && doc && <EmailPreviewTab date={doc.date} />}
        {tab === "email" && !doc && !loading && (
          <div className="p-6 text-sm text-[#AAAAAA]">Generate a brief first to preview the email.</div>
        )}
      </div>
    </div>
  );
}
