"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Position {
  id: string;
  ticker: string;
  name: string;
  sector: string | null;
  assetClass: string;
  status: string;
  currentValueUsd: number | null;
  allocationPct: number | null;
  unrealizedReturnPct: number | null;
  thesis: { healthStatus: string | null; healthScore: number | null; entryConfidence: number } | null;
}

interface OpportunityEntry {
  ticker: string;
  objectiveScore: number;
  companyName: string;
  inPortfolio: boolean;
  supportingFactors: string[];
  contradictingFactors: string[];
}

interface DecisionReview {
  id: string;
  ticker: string;
  thesisStatus: string;
  verdict: string;
  confidence: number;
  opportunityScore: number;
  evidenceFor: string[];
  evidenceAgainst: string[];
  lessonLearned: string;
  reviewDate: string;
}

interface CommitteeSession {
  id: string;
  ticker: string;
  conviction: string;
  bullCase: { thesis: string; keyFactors: string[]; targetMultiple?: string };
  bearCase: { mainRisk: string; keyRisks: string[] };
  createdAt: string;
}

interface NewsletterItem {
  id: string;
  source: string;
  sourceLabel: string;
  title: string;
  url: string | null;
  publishedAt: string;
  summary: string[];
  portfolioRelevance: string;
}

type TabId = "overview" | "thesis" | "decision" | "impact" | "intelligence" | "knowledge" | "history";
const TABS: { id: TabId; label: string }[] = [
  { id: "overview",     label: "Overview" },
  { id: "thesis",       label: "Thesis" },
  { id: "decision",     label: "Decision Review" },
  { id: "impact",       label: "Portfolio Impact" },
  { id: "intelligence", label: "Intelligence" },
  { id: "knowledge",    label: "Knowledge" },
  { id: "history",      label: "History" },
];

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bg-[#EEEEEE] rounded-xl animate-pulse ${className}`} />;
}

const HEALTH_STYLE: Record<string, { bg: string; text: string }> = {
  intact:     { bg: "#F0FDF4", text: "#15803D" },
  weakening:  { bg: "#FFFBEB", text: "#D97706" },
  broken:     { bg: "#FEF2F2", text: "#DC2626" },
  monitoring: { bg: "#EEF3FD", text: "#3E6AE1" },
};

const VERDICT_STYLE: Record<string, { bg: string; text: string }> = {
  Strengthen: { bg: "#F0FDF4", text: "#15803D" },
  Hold:       { bg: "#EEF3FD", text: "#3E6AE1" },
  Monitor:    { bg: "#FFFBEB", text: "#D97706" },
  Reduce:     { bg: "#FFF7ED", text: "#92400E" },
  Exit:       { bg: "#FEF2F2", text: "#991B1B" },
};

const CONVICTION_STYLE: Record<string, { bg: string; text: string }> = {
  "Strong Buy": { bg: "#F0FDF4", text: "#15803D" },
  "Buy":        { bg: "#EEF3FD", text: "#3E6AE1" },
  "Watch":      { bg: "#FFFBEB", text: "#D97706" },
  "Hold":       { bg: "#F4F4F4", text: "#5C5E62" },
  "Pass":       { bg: "#FEF2F2", text: "#991B1B" },
};

const REL_STYLE: Record<string, { bg: string; text: string }> = {
  bullish: { bg: "#F0FDF4", text: "#15803D" },
  neutral: { bg: "#F4F4F4", text: "#5C5E62" },
  bearish: { bg: "#FEF2F2", text: "#DC2626" },
};

// ─── Tab components ───────────────────────────────────────────────────────────

function OverviewTab({ position, opp }: { position: Position | null; opp: OpportunityEntry | null }) {
  if (!position) return <div className="py-8 text-center text-sm text-[#8E8E8E]">Position not found in portfolio.</div>;

  const ret = position.unrealizedReturnPct;
  const retColor = ret == null ? "#8E8E8E" : ret >= 0 ? "#15803D" : "#DC2626";
  const health = position.thesis?.healthStatus ?? "unreviewed";
  const hs = HEALTH_STYLE[health] ?? { bg: "#F4F4F4", text: "#5C5E62" };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-[#EEEEEE] rounded-xl p-3">
          <div className="text-xs text-[#8E8E8E] mb-1">Portfolio Weight</div>
          <div className="text-lg font-semibold text-[#171A20]">
            {position.allocationPct != null ? position.allocationPct.toFixed(1) + "%" : "—"}
          </div>
        </div>
        <div className="bg-white border border-[#EEEEEE] rounded-xl p-3">
          <div className="text-xs text-[#8E8E8E] mb-1">Return</div>
          <div className="text-lg font-semibold" style={{ color: retColor }}>
            {ret != null ? (ret >= 0 ? "+" : "") + ret.toFixed(1) + "%" : "—"}
          </div>
        </div>
        <div className="bg-white border border-[#EEEEEE] rounded-xl p-3">
          <div className="text-xs text-[#8E8E8E] mb-1">Opp Score</div>
          <div className="text-lg font-semibold text-[#171A20]">
            {opp ? opp.objectiveScore.toFixed(0) : "—"}
          </div>
        </div>
        <div className="bg-white border border-[#EEEEEE] rounded-xl p-3">
          <div className="text-xs text-[#8E8E8E] mb-1">Thesis Health</div>
          <span
            className="text-sm font-semibold px-2 py-0.5 rounded"
            style={{ backgroundColor: hs.bg, color: hs.text }}
          >
            {health}
          </span>
        </div>
      </div>

      {/* Position details */}
      <div className="bg-white border border-[#EEEEEE] rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#8E8E8E]">Sector</span>
          <span className="text-sm text-[#171A20]">{position.sector ?? "—"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#8E8E8E]">Asset Class</span>
          <span className="text-sm text-[#171A20]">{position.assetClass}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#8E8E8E]">Current Value</span>
          <span className="text-sm font-semibold text-[#171A20]">
            {position.currentValueUsd != null
              ? "$" + position.currentValueUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })
              : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#8E8E8E]">Entry Confidence</span>
          <span className="text-sm text-[#171A20]">{position.thesis?.entryConfidence ?? "—"}/10</span>
        </div>
      </div>

      {/* Supporting / contradicting factors */}
      {opp && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {opp.supportingFactors.length > 0 && (
            <div className="bg-white border border-[#EEEEEE] rounded-xl p-4">
              <div className="text-xs font-semibold text-[#15803D] uppercase tracking-wide mb-2">Supporting Factors</div>
              <ul className="space-y-1">
                {opp.supportingFactors.slice(0, 4).map((f, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-[#5C5E62]">
                    <span className="text-[#86EFAC] mt-0.5">+</span>{f}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {opp.contradictingFactors.length > 0 && (
            <div className="bg-white border border-[#EEEEEE] rounded-xl p-4">
              <div className="text-xs font-semibold text-[#DC2626] uppercase tracking-wide mb-2">Risk Factors</div>
              <ul className="space-y-1">
                {opp.contradictingFactors.slice(0, 4).map((f, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-[#5C5E62]">
                    <span className="text-[#FCA5A5] mt-0.5">−</span>{f}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ThesisTab({ wikiContent, loading }: { wikiContent: string; loading: boolean }) {
  if (loading) return <div className="py-8 text-center text-sm text-[#8E8E8E]">Loading thesis…</div>;
  if (!wikiContent) return (
    <div className="py-8 text-center text-sm text-[#8E8E8E]">
      No wiki entry yet. Generate a dossier from the Research page to create one.
    </div>
  );

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl p-4">
      <pre className="text-xs text-[#5C5E62] whitespace-pre-wrap font-mono leading-relaxed">{wikiContent}</pre>
    </div>
  );
}

function DecisionReviewTab({ reviews }: { reviews: DecisionReview[] }) {
  if (reviews.length === 0) return (
    <div className="py-8 text-center text-sm text-[#8E8E8E]">
      No decision reviews for this ticker. Run from Automation.
    </div>
  );

  const latest = reviews[0];
  const vs = VERDICT_STYLE[latest.verdict] ?? VERDICT_STYLE.Hold;

  return (
    <div className="space-y-4">
      {/* Latest review summary */}
      <div className="bg-white border border-[#EEEEEE] rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#8E8E8E]">
            {new Date(latest.reviewDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </span>
          <span
            className="text-sm font-semibold px-3 py-1 rounded"
            style={{ backgroundColor: vs.bg, color: vs.text }}
          >
            {latest.verdict}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="text-xs text-[#8E8E8E]">Thesis Status</div>
            <div className="text-sm font-medium text-[#171A20]">{latest.thesisStatus}</div>
          </div>
          <div>
            <div className="text-xs text-[#8E8E8E]">Confidence</div>
            <div className="text-sm font-medium text-[#171A20]">{latest.confidence}%</div>
          </div>
          <div>
            <div className="text-xs text-[#8E8E8E]">Opp Score</div>
            <div className="text-sm font-medium text-[#171A20]">{latest.opportunityScore.toFixed(0)}</div>
          </div>
        </div>
        {latest.lessonLearned && (
          <div className="text-xs text-[#5C5E62] border-l-2 border-[#3E6AE1] pl-3">{latest.lessonLearned}</div>
        )}
      </div>

      {/* Evidence */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {latest.evidenceFor.length > 0 && (
          <div className="bg-white border border-[#EEEEEE] rounded-xl p-4">
            <div className="text-xs font-semibold text-[#15803D] uppercase tracking-wide mb-2">Evidence For ({latest.evidenceFor.length})</div>
            <ul className="space-y-1">
              {latest.evidenceFor.map((e, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-[#5C5E62]">
                  <span className="text-[#86EFAC] shrink-0 mt-0.5">+</span>{e}
                </li>
              ))}
            </ul>
          </div>
        )}
        {latest.evidenceAgainst.length > 0 && (
          <div className="bg-white border border-[#EEEEEE] rounded-xl p-4">
            <div className="text-xs font-semibold text-[#DC2626] uppercase tracking-wide mb-2">Evidence Against ({latest.evidenceAgainst.length})</div>
            <ul className="space-y-1">
              {latest.evidenceAgainst.map((e, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-[#5C5E62]">
                  <span className="text-[#FCA5A5] shrink-0 mt-0.5">−</span>{e}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function ImpactTab({ ticker, archReview }: { ticker: string; archReview: { marketRegime: string; architectureScore: { total: number; diversification: number }; recommendations: string[] } | null }) {
  if (!archReview) return (
    <div className="py-8 text-center text-sm text-[#8E8E8E]">
      No architecture review available. Run from Automation.
    </div>
  );

  const relevantRecs = (archReview.recommendations ?? []).filter(r =>
    r.toLowerCase().includes(ticker.toLowerCase()) || r.toLowerCase().includes("concentrat") || r.toLowerCase().includes("hedge")
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white border border-[#EEEEEE] rounded-xl p-3">
          <div className="text-xs text-[#8E8E8E] mb-1">Current Regime</div>
          <div className="text-sm font-semibold text-[#171A20]">{archReview.marketRegime}</div>
        </div>
        <div className="bg-white border border-[#EEEEEE] rounded-xl p-3">
          <div className="text-xs text-[#8E8E8E] mb-1">Architecture Score</div>
          <div className="text-sm font-semibold text-[#171A20]">{archReview.architectureScore.total}/100</div>
        </div>
        <div className="bg-white border border-[#EEEEEE] rounded-xl p-3">
          <div className="text-xs text-[#8E8E8E] mb-1">Diversification</div>
          <div className="text-sm font-semibold text-[#171A20]">{archReview.architectureScore.diversification}/100</div>
        </div>
      </div>

      {relevantRecs.length > 0 && (
        <div className="bg-white border border-[#EEEEEE] rounded-xl p-4">
          <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide mb-2">Relevant Recommendations</div>
          <ul className="space-y-1.5">
            {relevantRecs.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-[#5C5E62]">
                <span className="text-[#AAAAAA] mt-0.5">·</span>{r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {archReview.recommendations.length > 0 && (
        <div className="bg-white border border-[#EEEEEE] rounded-xl p-4">
          <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide mb-2">Portfolio Recommendations</div>
          <ul className="space-y-1.5">
            {archReview.recommendations.slice(0, 5).map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-[#5C5E62]">
                <span className="text-[#AAAAAA] mt-0.5">·</span>{r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function IntelligenceTab({ ticker, items, brief }: {
  ticker: string;
  items: NewsletterItem[];
  brief: { marketRegime: string; portfolioImpact?: { positive: { ticker: string; reason: string }[]; neutral: { ticker: string; reason: string }[]; negative: { ticker: string; reason: string }[] } } | null;
}) {
  const relevant = items.filter(i =>
    i.title.toUpperCase().includes(ticker) ||
    (i.summary ?? []).some(s => s.toUpperCase().includes(ticker))
  );

  const posImpact = brief?.portfolioImpact?.positive.find(p => p.ticker === ticker);
  const negImpact = brief?.portfolioImpact?.negative.find(p => p.ticker === ticker);
  const neutImpact = brief?.portfolioImpact?.neutral.find(p => p.ticker === ticker);

  return (
    <div className="space-y-4">
      {/* Morning brief impact */}
      {(posImpact || negImpact || neutImpact) ? (
        <div className="bg-white border border-[#EEEEEE] rounded-xl p-4">
          <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide mb-2">Morning Brief Impact</div>
          {posImpact && (
            <div className="flex items-start gap-2 text-sm text-[#15803D]">
              <span className="shrink-0">+</span>
              <span>{posImpact.reason}</span>
            </div>
          )}
          {negImpact && (
            <div className="flex items-start gap-2 text-sm text-[#DC2626]">
              <span className="shrink-0">−</span>
              <span>{negImpact.reason}</span>
            </div>
          )}
          {neutImpact && (
            <div className="flex items-start gap-2 text-sm text-[#5C5E62]">
              <span className="shrink-0">○</span>
              <span>{neutImpact.reason}</span>
            </div>
          )}
        </div>
      ) : (
        brief && (
          <div className="bg-white border border-[#EEEEEE] rounded-xl p-4 text-sm text-[#8E8E8E]">
            No specific morning brief mentions for {ticker}.
          </div>
        )
      )}

      {/* Newsletter mentions */}
      {relevant.length > 0 ? (
        <div>
          <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide mb-2">Newsletter Mentions ({relevant.length})</div>
          <div className="space-y-2">
            {relevant.map(item => {
              const s = REL_STYLE[item.portfolioRelevance] ?? REL_STYLE.neutral;
              return (
                <div key={item.id} className="bg-white border border-[#EEEEEE] rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-[#AAAAAA] mb-0.5">{item.sourceLabel}</div>
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
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase shrink-0"
                      style={{ backgroundColor: s.bg, color: s.text }}
                    >
                      {item.portfolioRelevance}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#AAAAAA] mt-1">
                    {new Date(item.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-[#EEEEEE] rounded-xl p-4 text-sm text-[#8E8E8E]">
          No recent newsletter mentions for {ticker}.
        </div>
      )}
    </div>
  );
}

// ─── Knowledge tab ────────────────────────────────────────────────────────────

interface CompanyKnowledge {
  ticker: string;
  centralityScore: number;
  degree: number;
  owned: boolean;
  allocationPct: number;
  opportunityScore?: number;
  themes: { id: string; name: string }[];
  relatedCompanies: { ticker: string; sharedThemes: string[] }[];
  newsletters: { id: string; name: string; strength: number }[];
  decisions: { verdict: string; thesisStatus: string; confidence: number; date: string }[];
}

function KnowledgeTab({ ticker }: { ticker: string }) {
  const [data, setData]       = useState<CompanyKnowledge | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/knowledge/company/${ticker}`)
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setData(d); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [ticker]);

  if (loading) return (
    <div className="space-y-3">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="bg-[#EEEEEE] rounded-xl h-16 animate-pulse" />
      ))}
    </div>
  );
  if (error) return <div className="text-sm text-[#DC2626] py-4">{error}</div>;
  if (!data)  return <div className="text-sm text-[#8E8E8E] py-4">No knowledge graph data.</div>;

  return (
    <div className="space-y-5">
      {/* Centrality header */}
      <div className="flex items-center gap-4">
        <div className="bg-[#EEF3FD] rounded-xl px-4 py-2.5 flex items-center gap-3">
          <div>
            <div className="text-[10px] text-[#8E8E8E] uppercase tracking-wide">Knowledge Centrality</div>
            <div className="text-xl font-bold text-[#3E6AE1] tabular-nums">{data.centralityScore}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-[#8E8E8E]">Connections</div>
            <div className="text-sm font-semibold text-[#5C5E62]">{data.degree}</div>
          </div>
        </div>
      </div>

      {/* Themes */}
      {data.themes.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide mb-2">Themes</div>
          <div className="flex flex-wrap gap-2">
            {data.themes.map(t => (
              <span key={t.id} className="text-xs font-medium px-3 py-1 rounded-full bg-[#EEF3FD] text-[#3E6AE1]">
                {t.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Related Companies */}
      {data.relatedCompanies.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide mb-2">Related Companies</div>
          <div className="flex flex-wrap gap-2">
            {data.relatedCompanies.map(c => (
              <a
                key={c.ticker}
                href={`/portfolio/${c.ticker}`}
                className="text-xs font-medium px-3 py-1 rounded-full bg-[#F4F4F4] text-[#5C5E62] hover:bg-[#EEF3FD] hover:text-[#3E6AE1] transition-colors"
                title={c.sharedThemes.join(", ")}
              >
                {c.ticker}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Newsletter Mentions */}
      {data.newsletters.length > 0 && (
        <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#EEEEEE]">
            <span className="text-xs font-semibold text-[#171A20]">Newsletter Mentions</span>
          </div>
          <div className="divide-y divide-[#EEEEEE]">
            {data.newsletters.slice(0, 8).map(nl => (
              <div key={nl.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                <span className="text-xs text-[#5C5E62]">{nl.name}</span>
                <div className="flex items-center gap-1.5">
                  <div className="w-16 h-1.5 bg-[#EEEEEE] rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-[#6366F1]" style={{ width: `${nl.strength}%` }} />
                  </div>
                  <span className="text-[10px] text-[#AAAAAA] tabular-nums w-6 text-right">{nl.strength}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Decision Reviews */}
      {data.decisions.length > 0 && (
        <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#EEEEEE]">
            <span className="text-xs font-semibold text-[#171A20]">Decision Graph</span>
          </div>
          <div className="divide-y divide-[#EEEEEE]">
            {data.decisions.map((d, i) => {
              const vs = VERDICT_STYLE[d.verdict] ?? { bg: "#F4F4F4", text: "#5C5E62" };
              return (
                <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ backgroundColor: vs.bg, color: vs.text }}>
                    {d.verdict}
                  </span>
                  <span className="text-xs text-[#5C5E62] flex-1">{d.thesisStatus}</span>
                  <span className="text-xs font-semibold tabular-nums text-[#8E8E8E]">{d.confidence}</span>
                  {d.date && (
                    <span className="text-[10px] text-[#AAAAAA] hidden md:inline">
                      {new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {data.themes.length === 0 && data.relatedCompanies.length === 0 && data.newsletters.length === 0 && (
        <p className="text-sm text-[#8E8E8E] py-4">{ticker} is not yet in the knowledge graph. Run universe ingestion to add it.</p>
      )}

      {/* Open Full Graph deep-link */}
      <a
        href={`/knowledge/graph?focus=${ticker}`}
        className="flex items-center justify-center gap-2 w-full py-2.5 px-4 border border-[#3E6AE1] text-[#3E6AE1] text-sm font-semibold rounded-lg hover:bg-[#EEF3FD] transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="5" cy="12" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="19" cy="19" r="2"/>
          <line x1="7" y1="11" x2="17" y2="6"/><line x1="7" y1="13" x2="17" y2="18"/>
        </svg>
        Open Full Graph
      </a>
    </div>
  );
}

function HistoryTab({ ticker, sessions, reviews }: {
  ticker: string;
  sessions: CommitteeSession[];
  reviews: DecisionReview[];
}) {
  return (
    <div className="space-y-5">
      {/* Committee history */}
      {sessions.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide mb-2">Committee History</div>
          <div className="space-y-2">
            {sessions.slice(0, 5).map(s => {
              const cs = CONVICTION_STYLE[s.conviction] ?? CONVICTION_STYLE.Hold;
              return (
                <div key={s.id} className="bg-white border border-[#EEEEEE] rounded-xl px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded"
                      style={{ backgroundColor: cs.bg, color: cs.text }}
                    >
                      {s.conviction}
                    </span>
                    <span className="text-[11px] text-[#AAAAAA]">
                      {new Date(s.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </div>
                  <div className="text-xs text-[#5C5E62] mt-1">{s.bullCase?.thesis?.slice(0, 120)}…</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Decision history */}
      {reviews.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide mb-2">Decision History</div>
          <div className="space-y-2">
            {reviews.map(r => {
              const vs = VERDICT_STYLE[r.verdict] ?? VERDICT_STYLE.Hold;
              return (
                <div key={r.id} className="bg-white border border-[#EEEEEE] rounded-xl px-4 py-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-[#8E8E8E]">
                      {new Date(r.reviewDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </div>
                    <div className="text-sm text-[#5C5E62] mt-0.5">{r.thesisStatus}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs font-semibold px-2.5 py-0.5 rounded"
                      style={{ backgroundColor: vs.bg, color: vs.text }}
                    >
                      {r.verdict}
                    </span>
                    <span className="text-xs text-[#8E8E8E]">{r.confidence}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {sessions.length === 0 && reviews.length === 0 && (
        <div className="py-8 text-center text-sm text-[#8E8E8E]">No history yet.</div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PositionPage() {
  const params = useParams();
  const ticker = (params.ticker as string).toUpperCase();

  const [tab, setTab] = useState<TabId>("overview");
  const [position, setPosition] = useState<Position | null>(null);
  const [opp, setOpp] = useState<OpportunityEntry | null>(null);
  const [decisionReviews, setDecisionReviews] = useState<DecisionReview[]>([]);
  const [committeeSessions, setCommitteeSessions] = useState<CommitteeSession[]>([]);
  const [newsletterItems, setNewsletterItems] = useState<NewsletterItem[]>([]);
  const [brief, setBrief] = useState<{ marketRegime: string; portfolioImpact?: { positive: { ticker: string; reason: string }[]; neutral: { ticker: string; reason: string }[]; negative: { ticker: string; reason: string }[] } } | null>(null);
  const [archReview, setArchReview] = useState<{ marketRegime: string; architectureScore: { total: number; diversification: number }; recommendations: string[] } | null>(null);
  const [wikiContent, setWikiContent] = useState("");
  const [wikiLoading, setWikiLoading] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ticker) return;

    // Core data
    Promise.all([
      fetch("/api/positions").then(r => r.json()).catch(() => null),
      fetch("/api/opportunities").then(r => r.json()).catch(() => null),
      fetch("/api/decision-review").then(r => r.json()).catch(() => null),
      fetch("/api/committee").then(r => r.json()).catch(() => null),
      fetch("/api/newsletter?days=30").then(r => r.json()).catch(() => null),
      fetch("/api/morning-brief").then(r => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/portfolio-architecture").then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([posData, oppData, decData, commData, nlData, briefData, archData]) => {
      const positions: Position[] = Array.isArray(posData) ? posData : (posData?.positions ?? []);
      setPosition(positions.find(p => p.ticker === ticker) ?? null);

      const entries: OpportunityEntry[] = oppData?.entries ?? [];
      setOpp(entries.find(e => e.ticker === ticker) ?? null);

      const allReviews: DecisionReview[] = (decData?.reviews ?? []).map((r: DecisionReview & { evidenceFor: string | string[]; evidenceAgainst: string | string[] }) => ({
        ...r,
        evidenceFor: typeof r.evidenceFor === "string" ? JSON.parse(r.evidenceFor) : (r.evidenceFor ?? []),
        evidenceAgainst: typeof r.evidenceAgainst === "string" ? JSON.parse(r.evidenceAgainst) : (r.evidenceAgainst ?? []),
      }));
      setDecisionReviews(allReviews.filter(r => r.ticker === ticker));

      const allSessions = (commData?.sessions ?? []).map((s: CommitteeSession & { bullCase: string | CommitteeSession["bullCase"]; bearCase: string | CommitteeSession["bearCase"] }) => ({
        ...s,
        bullCase: typeof s.bullCase === "string" ? JSON.parse(s.bullCase) : s.bullCase,
        bearCase: typeof s.bearCase === "string" ? JSON.parse(s.bearCase) : s.bearCase,
      }));
      setCommitteeSessions(allSessions.filter((s: CommitteeSession) => s.ticker === ticker));

      setNewsletterItems(nlData?.items ?? []);

      if (briefData) {
        const pi = briefData.portfolioImpact;
        setBrief({
          marketRegime: briefData.marketRegime,
          portfolioImpact: pi,
        });
      }

      if (archData?.review) {
        const rev = archData.review;
        const recs = typeof rev.recommendations === "string" ? JSON.parse(rev.recommendations) : (rev.recommendations ?? []);
        setArchReview({
          marketRegime: rev.marketRegime,
          architectureScore: rev.architectureScore,
          recommendations: recs,
        });
      }
    }).finally(() => setLoading(false));

    // Wiki content — may be slow
    fetch(`/api/wiki/company?ticker=${encodeURIComponent(ticker)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setWikiContent(d?.context ?? ""))
      .catch(() => setWikiContent(""))
      .finally(() => setWikiLoading(false));
  }, [ticker]);

  const latestDecision = decisionReviews[0];
  const latestCommittee = committeeSessions[0];
  const vs = latestDecision ? VERDICT_STYLE[latestDecision.verdict] : null;
  const cs = latestCommittee ? CONVICTION_STYLE[latestCommittee.conviction] : null;

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 md:px-6 space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href="/portfolio" className="text-sm text-[#3E6AE1] hover:underline mt-0.5">← Portfolio</Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-[#171A20]">{ticker}</h1>
            {loading ? (
              <Skeleton className="h-6 w-32" />
            ) : (
              position && <span className="text-sm text-[#5C5E62]">{position.name}</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            {opp && (
              <span className="text-xs font-semibold text-[#3E6AE1]">Score {opp.objectiveScore.toFixed(0)}</span>
            )}
            {vs && latestDecision && (
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded"
                style={{ backgroundColor: vs.bg, color: vs.text }}
              >
                {latestDecision.verdict}
              </span>
            )}
            {cs && latestCommittee && (
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded"
                style={{ backgroundColor: cs.bg, color: cs.text }}
              >
                Committee: {latestCommittee.conviction}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
        <div className="border-b border-[#EEEEEE] flex overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors"
              style={tab === t.id
                ? { borderColor: "#3E6AE1", color: "#3E6AE1" }
                : { borderColor: "transparent", color: "#5C5E62" }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="p-4">
          {loading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : (
            <>
              {tab === "overview"     && <OverviewTab position={position} opp={opp} />}
              {tab === "thesis"       && <ThesisTab wikiContent={wikiContent} loading={wikiLoading} />}
              {tab === "decision"     && <DecisionReviewTab reviews={decisionReviews} />}
              {tab === "impact"       && <ImpactTab ticker={ticker} archReview={archReview} />}
              {tab === "intelligence" && <IntelligenceTab ticker={ticker} items={newsletterItems} brief={brief} />}
              {tab === "knowledge"    && <KnowledgeTab ticker={ticker} />}
              {tab === "history"      && <HistoryTab ticker={ticker} sessions={committeeSessions} reviews={decisionReviews} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
