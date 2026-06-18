"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PublicEntry {
  ticker:               string;
  category:             "pure_play" | "beneficiary" | "infrastructure";
  themeRelevanceScore:  number;
  opportunityScore:     number | null;
  portfolioExposurePct: number;
  inPortfolio:          boolean;
}

interface PrivateEntry {
  company:            string;
  category:           string;
  fundingStage:       string;
  strategicRelevance: string;
}

interface ThemeDossier {
  theme:             string;
  generatedAt:       string;
  completenessScore: number;
  executiveSummary:  { whatIsThis: string; whyNow: string; whyItMatters: string; bullets: string[] };
  marketOverview:    { maturity: string; momentum: string; institutionalInterest: string; newsletterInterest: string; themeScore: number; noveltyScore: number; researchPriority: number };
  keyDrivers:        string[];
  risks:             string[];
  publicExposure:    PublicEntry[];
  privateExposure:   PrivateEntry[];
  scenarios:         { bull: string; base: string; bear: string };
  portfolioRelevance: { currentExposurePct: number; recommendedExposurePct: number; gap: number; holdings: string[] };
  researchActions:   { action: "Read" | "Monitor" | "Analyze"; description: string }[];
  evidenceSources:   string[];
  sectionsWithGaps:  string[];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bg-[#EEEEEE] rounded-xl animate-pulse ${className}`} />;
}

function Section({ title, children, gap }: { title: string; children: React.ReactNode; gap?: boolean }) {
  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold text-[#171A20]">{title}</h2>
        {gap && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#FFF7ED] text-[#92400E]">Research Needed</span>}
      </div>
      {children}
    </div>
  );
}

const INTEREST_COLOR: Record<string, string> = {
  high:   "#15803D",
  medium: "#D97706",
  low:    "#8E8E8E",
  none:   "#AAAAAA",
};

const CATEGORY_LABEL: Record<string, string> = {
  pure_play:      "Pure Play",
  beneficiary:    "Beneficiary",
  infrastructure: "Infrastructure",
};

const ACTION_COLOR: Record<string, { bg: string; text: string }> = {
  Read:    { bg: "#EEF3FD", text: "#3E6AE1" },
  Monitor: { bg: "#F0FDF4", text: "#15803D" },
  Analyze: { bg: "#FFF7ED", text: "#92400E" },
};

const MATURITY_COLOR: Record<string, string> = {
  emerging: "#3E6AE1",
  scaling:  "#15803D",
  mature:   "#5C5E62",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ResearchDossierPage() {
  const params          = useParams<{ theme: string }>();
  const theme           = decodeURIComponent(params.theme ?? "");
  const [dossier, setDossier] = useState<ThemeDossier | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!theme) return;
    fetch(`/api/research-dossier/${encodeURIComponent(theme)}`)
      .then(r => {
        if (r.status === 404) throw new Error("not_found");
        if (!r.ok) throw new Error("failed");
        return r.json();
      })
      .then(d => setDossier(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [theme]);

  function handleGenerate() {
    setGenerating(true);
    fetch(`/api/research-dossier/${encodeURIComponent(theme)}`, { method: "POST" })
      .then(r => r.json())
      .then(() => {
        return fetch(`/api/research-dossier/${encodeURIComponent(theme)}`).then(r => r.json());
      })
      .then(d => { setDossier(d); setError(null); })
      .catch(() => setError("Generation failed — run Theme Scout first."))
      .finally(() => setGenerating(false));
  }

  if (loading) {
    return (
      <div className="p-6 lg:p-8 space-y-4 max-w-4xl">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (!dossier && error === "not_found") {
    return (
      <div className="p-6 lg:p-8 max-w-4xl">
        <Link href="/dashboard" className="text-[11px] text-[#3E6AE1] hover:underline">← Dashboard</Link>
        <div className="mt-6 bg-white border border-[#EEEEEE] rounded-xl p-8 text-center">
          <div className="text-[#171A20] font-semibold mb-2">{theme}</div>
          <p className="text-sm text-[#8E8E8E] mb-4">No dossier exists for this theme yet.</p>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="text-sm font-medium px-4 py-2 rounded-xl bg-[#3E6AE1] text-white hover:bg-[#2c56c8] disabled:opacity-50 transition-colors"
          >
            {generating ? "Generating…" : "Generate Dossier"}
          </button>
        </div>
      </div>
    );
  }

  if (!dossier) {
    return (
      <div className="p-6 lg:p-8 max-w-4xl">
        <p className="text-sm text-[#8E8E8E]">{error ?? "Unknown error"}</p>
      </div>
    );
  }

  const purePlays      = dossier.publicExposure.filter(e => e.category === "pure_play");
  const beneficiaries  = dossier.publicExposure.filter(e => e.category === "beneficiary");
  const infrastructure = dossier.publicExposure.filter(e => e.category === "infrastructure");
  const gapColor       = dossier.portfolioRelevance.gap > 2 ? "#991B1B" : dossier.portfolioRelevance.gap < -2 ? "#D97706" : "#15803D";

  return (
    <div className="p-6 lg:p-8 space-y-4 max-w-4xl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Link href="/dashboard" className="text-[11px] text-[#3E6AE1] hover:underline">← Dashboard</Link>
          <span className="text-[11px] text-[#AAAAAA]">/</span>
          <span className="text-[11px] text-[#AAAAAA]">Research Dossier</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-[#171A20]">{dossier.theme}</h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-[11px] text-[#8E8E8E]">
                {new Date(dossier.generatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </span>
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: dossier.completenessScore >= 70 ? "#F0FDF4" : "#FFF7ED", color: dossier.completenessScore >= 70 ? "#15803D" : "#92400E" }}
              >
                {dossier.completenessScore}% complete
              </span>
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: "#EEF3FD", color: MATURITY_COLOR[dossier.marketOverview.maturity] }}
              >
                {dossier.marketOverview.maturity}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="text-[11px] font-medium px-3 py-1.5 rounded-xl border border-[#EEEEEE] text-[#5C5E62] hover:bg-[#F4F4F4] disabled:opacity-50 transition-colors"
            >
              {generating ? "Refreshing…" : "↻ Refresh"}
            </button>
            <Link
              href={`/ask?q=Tell+me+about+${encodeURIComponent(dossier.theme)}`}
              className="text-[11px] font-medium px-3 py-1.5 rounded-xl bg-[#3E6AE1] text-white hover:bg-[#2c56c8] transition-colors"
            >
              Ask CIO →
            </Link>
          </div>
        </div>
      </div>

      {/* KPI Bar */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Theme Score", value: `${dossier.marketOverview.themeScore.toFixed(0)}/100` },
          { label: "Novelty", value: `${dossier.marketOverview.noveltyScore.toFixed(0)}/100` },
          { label: "Momentum", value: dossier.marketOverview.momentum },
          { label: "Research Priority", value: `${dossier.marketOverview.researchPriority.toFixed(0)}/100` },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white border border-[#EEEEEE] rounded-xl p-3 text-center">
            <div className="text-[10px] text-[#AAAAAA] uppercase tracking-widest">{kpi.label}</div>
            <div className="text-base font-semibold text-[#171A20] mt-0.5">{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Section 1: Executive Summary */}
      <Section title="Executive Summary" gap={dossier.sectionsWithGaps.includes("Executive Summary")}>
        <div className="space-y-3">
          <div>
            <div className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest mb-1">What is this?</div>
            <p className="text-sm text-[#333]">{dossier.executiveSummary.whatIsThis}</p>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest mb-1">Why Now?</div>
            <p className="text-sm text-[#333]">{dossier.executiveSummary.whyNow}</p>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest mb-1">Why It Matters?</div>
            <p className="text-sm text-[#333]">{dossier.executiveSummary.whyItMatters}</p>
          </div>
          {dossier.executiveSummary.bullets.length > 0 && (
            <ul className="space-y-1 pt-1 border-t border-[#F4F4F4]">
              {dossier.executiveSummary.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-[#333]">
                  <span className="text-[#3E6AE1] mt-0.5">•</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      {/* Section 2: Market Overview */}
      <Section title="Market Overview">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          {[
            { label: "Maturity",                value: dossier.marketOverview.maturity },
            { label: "Momentum",                value: dossier.marketOverview.momentum },
            { label: "Institutional Interest",  value: dossier.marketOverview.institutionalInterest, colorKey: true },
            { label: "Newsletter Interest",     value: dossier.marketOverview.newsletterInterest, colorKey: true },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between py-1.5 border-b border-[#F4F4F4]">
              <span className="text-xs text-[#8E8E8E]">{row.label}</span>
              <span
                className="text-xs font-semibold capitalize"
                style={{ color: row.colorKey ? INTEREST_COLOR[row.value] : "#171A20" }}
              >
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* Sections 3 + 4 side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="Key Drivers" gap={dossier.sectionsWithGaps.includes("Key Drivers")}>
          {dossier.keyDrivers.length > 0
            ? <ul className="space-y-1.5">
                {dossier.keyDrivers.map((d, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-[#333]">
                    <span className="text-[#15803D] mt-0.5">↑</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            : <p className="text-sm text-[#AAAAAA]">Research Needed</p>}
        </Section>

        <Section title="Risks" gap={dossier.sectionsWithGaps.includes("Risks")}>
          {dossier.risks.length > 0
            ? <ul className="space-y-1.5">
                {dossier.risks.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-[#333]">
                    <span className="text-[#DC2626] mt-0.5">↓</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            : <p className="text-sm text-[#AAAAAA]">Research Needed</p>}
        </Section>
      </div>

      {/* Section 5: Public Market Exposure */}
      <Section title="Public Market Exposure" gap={dossier.sectionsWithGaps.includes("Public Market Exposure")}>
        {dossier.publicExposure.length === 0 ? (
          <p className="text-sm text-[#AAAAAA]">Research Needed</p>
        ) : (
          <div className="space-y-4">
            {[
              { label: "Pure Plays",       items: purePlays },
              { label: "Beneficiaries",    items: beneficiaries },
              { label: "Infrastructure",   items: infrastructure },
            ].filter(g => g.items.length > 0).map(group => (
              <div key={group.label}>
                <div className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest mb-2">{group.label}</div>
                <div className="space-y-1.5">
                  {group.items.map(e => (
                    <div key={e.ticker} className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-[#F4F4F4] transition-colors">
                      <Link
                        href={`/research?q=${e.ticker}`}
                        className="text-sm font-semibold text-[#3E6AE1] hover:underline w-14 shrink-0"
                      >
                        {e.ticker}
                      </Link>
                      <div className="flex-1 flex items-center gap-2">
                        <span
                          className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: "#F4F4F4", color: "#5C5E62" }}
                        >
                          {CATEGORY_LABEL[e.category]}
                        </span>
                        {e.opportunityScore !== null && (
                          <span className="text-[10px] text-[#8E8E8E]">Score {e.opportunityScore.toFixed(0)}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {e.inPortfolio && (
                          <span className="text-[10px] font-semibold text-[#15803D]">Owned</span>
                        )}
                        {e.portfolioExposurePct > 0 && (
                          <span className="text-[10px] text-[#AAAAAA]">{e.portfolioExposurePct.toFixed(1)}%</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Section 6: Private Market Exposure */}
      {dossier.privateExposure.length > 0 && (
        <Section title="Private Market Exposure">
          <div className="space-y-3">
            {dossier.privateExposure.map(p => (
              <div key={p.company} className="p-3 bg-[#F4F4F4] rounded-xl">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-[#171A20]">{p.company}</span>
                  <span className="text-[10px] text-[#8E8E8E]">{p.fundingStage}</span>
                </div>
                <div className="text-[10px] text-[#AAAAAA] mb-1">{p.category}</div>
                <p className="text-xs text-[#5C5E62]">{p.strategicRelevance}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Section 7: Bull / Base / Bear */}
      <Section title="Scenarios" gap={dossier.sectionsWithGaps.includes("Scenarios")}>
        <div className="space-y-3">
          {[
            { label: "Bull",  text: dossier.scenarios.bull,  color: "#15803D", bg: "#F0FDF4" },
            { label: "Base",  text: dossier.scenarios.base,  color: "#3E6AE1", bg: "#EEF3FD" },
            { label: "Bear",  text: dossier.scenarios.bear,  color: "#991B1B", bg: "#FEF2F2" },
          ].map(s => (
            <div key={s.label} className="p-3 rounded-xl" style={{ backgroundColor: s.bg }}>
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: s.color }}>{s.label}</span>
              <p className="text-sm text-[#333] mt-1">{s.text}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Section 8: Portfolio Relevance */}
      <Section title="Portfolio Relevance">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-[10px] text-[#AAAAAA] uppercase tracking-widest">Current</div>
            <div className="text-lg font-semibold text-[#171A20]">{dossier.portfolioRelevance.currentExposurePct.toFixed(1)}%</div>
          </div>
          <div>
            <div className="text-[10px] text-[#AAAAAA] uppercase tracking-widest">Target</div>
            <div className="text-lg font-semibold text-[#171A20]">{dossier.portfolioRelevance.recommendedExposurePct.toFixed(1)}%</div>
          </div>
          <div>
            <div className="text-[10px] text-[#AAAAAA] uppercase tracking-widest">Gap</div>
            <div className="text-lg font-semibold" style={{ color: gapColor }}>
              {dossier.portfolioRelevance.gap > 0 ? "+" : ""}{dossier.portfolioRelevance.gap.toFixed(1)}%
            </div>
          </div>
        </div>
        {dossier.portfolioRelevance.holdings.length > 0 && (
          <div className="mt-3 pt-3 border-t border-[#F4F4F4]">
            <div className="text-[10px] text-[#AAAAAA] mb-1">Holdings</div>
            <div className="flex gap-1.5 flex-wrap">
              {dossier.portfolioRelevance.holdings.map(t => (
                <Link
                  key={t}
                  href={`/research?q=${t}`}
                  className="text-[11px] font-medium px-2 py-0.5 rounded bg-[#EEF3FD] text-[#3E6AE1] hover:bg-[#3E6AE1] hover:text-white transition-colors"
                >
                  {t}
                </Link>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* Section 9: Research Actions */}
      <Section title="Research Actions">
        <div className="space-y-2">
          {dossier.researchActions.map((a, i) => {
            const c = ACTION_COLOR[a.action] ?? { bg: "#F4F4F4", text: "#5C5E62" };
            return (
              <div key={i} className="flex items-start gap-3">
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded shrink-0 mt-0.5"
                  style={{ backgroundColor: c.bg, color: c.text }}
                >
                  {a.action}
                </span>
                <span className="text-sm text-[#333]">{a.description}</span>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Footer */}
      <div className="flex items-center justify-between text-[10px] text-[#AAAAAA]">
        <span>Sources: {dossier.evidenceSources.join(", ") || "None"}</span>
        {dossier.sectionsWithGaps.length > 0 && (
          <span>{dossier.sectionsWithGaps.length} section(s) need research</span>
        )}
      </div>
    </div>
  );
}
