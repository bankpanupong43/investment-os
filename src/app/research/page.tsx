"use client";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { WatchlistButton } from "@/components/watchlist-button";
import type { ResearchDossierData, FactItem } from "@/app/api/research/route";
import type { OpportunityEntry, OpportunityResult } from "@/app/api/opportunities/route";

// ─── Strength / severity indicators ──────────────────────────────────────────

function StrengthDot({ s }: { s: "strong" | "moderate" | "weak" }) {
  const color = s === "strong" ? "#2d7d46" : s === "moderate" ? "#D97706" : "#DC2626";
  return <span className="inline-block w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ backgroundColor: color }} />;
}

function SevBadge({ s }: { s: "high" | "medium" | "low" }) {
  const styles = {
    high:   { bg: "#FEF2F2", text: "#991B1B" },
    medium: { bg: "#FFFBEB", text: "#92400E" },
    low:    { bg: "#F0FDF4", text: "#14532D" },
  }[s];
  return (
    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase"
      style={{ backgroundColor: styles.bg, color: styles.text }}>
      {s}
    </span>
  );
}

// ─── Evidence viewer ──────────────────────────────────────────────────────────

const CAT_STYLE: Record<string, { bg: string; text: string }> = {
  Fundamentals: { bg: "#EEF3FD", text: "#3E6AE1" },
  Portfolio:    { bg: "#F0FDF4", text: "#15803D" },
  Opportunity:  { bg: "#FFFBEB", text: "#D97706" },
  BrainContext: { bg: "#FEF2F2", text: "#991B1B" },
  Research:     { bg: "#F4F4F4", text: "#5C5E62" },
};

function EvidenceViewer({ d }: { d: ResearchDossierData }) {
  const [tab, setTab] = useState<"facts" | "interpretation" | "recommendation">("facts");
  const factById = useMemo(() => new Map((d.facts ?? []).map(f => [f.id, f])), [d.facts]);

  const getMetrics = (ids: string[]) =>
    ids.map(id => factById.get(id)?.metric).filter(Boolean).join(", ");

  const dirColor = (dir: string) => dir === "positive" ? "#15803D" : dir === "negative" ? "#DC2626" : "#8E8E8E";
  const dirSym = (dir: string) => dir === "positive" ? "+" : dir === "negative" ? "−" : "○";
  const confColor = (c: string) => c === "high" ? "#15803D" : c === "medium" ? "#D97706" : "#DC2626";

  const facts = d.facts ?? [];
  const interps = d.interpretation ?? [];
  const rec = d.recommendation;
  const ev = d.evidenceSummary;

  const EVTABS = [
    { id: "facts" as const, label: `Facts (${facts.length})` },
    { id: "interpretation" as const, label: `Interpretation (${interps.length})` },
    { id: "recommendation" as const, label: "Recommendation" },
  ];

  return (
    <div>
      <div className="flex gap-1 mb-3">
        {EVTABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="text-[11px] font-medium px-2.5 py-1 rounded transition-colors"
            style={tab === t.id ? { backgroundColor: "#3E6AE1", color: "white" } : { backgroundColor: "#F4F4F4", color: "#5C5E62" }}
          >
            {t.label}
          </button>
        ))}
        {ev && (
          <span className="ml-auto text-[10px] text-[#AAAAAA] self-center">
            {ev.highConfidenceCount}/{ev.evidenceCount} high-conf
            {ev.missingMetrics.length > 0 && ` · missing: ${ev.missingMetrics.join(", ")}`}
          </span>
        )}
      </div>

      {tab === "facts" && (
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
          {facts.map((f: FactItem, i: number) => {
            const cs = CAT_STYLE[f.category] ?? CAT_STYLE.Research;
            return (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0 w-24 text-center"
                  style={{ backgroundColor: cs.bg, color: cs.text }}>
                  {f.category}
                </span>
                <span className="font-medium text-[#171A20] w-36 truncate shrink-0">{f.metric}</span>
                <span className="text-[#171A20] font-semibold">{f.value}</span>
                <span className="text-[#AAAAAA] ml-auto text-[10px] truncate max-w-[140px]">{f.source}</span>
                <span className="text-[10px] font-bold shrink-0" style={{ color: confColor(f.confidence) }}>
                  {f.confidence[0].toUpperCase()}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {tab === "interpretation" && (
        <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
          {interps.length === 0 && <p className="text-xs text-[#8E8E8E]">No interpretations — regenerate the dossier to populate.</p>}
          {interps.map((interp, i) => {
            const metrics = interp.evidenceIds.map(id => factById.get(id)?.metric).filter(Boolean);
            return (
              <div key={i} className="flex gap-2.5">
                <span className="text-base font-bold shrink-0 mt-0.5 w-4 text-center"
                  style={{ color: dirColor(interp.direction) }}>
                  {dirSym(interp.direction)}
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[#171A20]">{interp.claim}</div>
                  <p className="text-[11px] text-[#5C5E62] mt-0.5 leading-snug">{interp.context}</p>
                  {metrics.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {metrics.map((m, j) => (
                        <span key={j} className="text-[10px] px-1.5 py-0.5 rounded bg-[#F4F4F4] text-[#5C5E62]">{m}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "recommendation" && (
        <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
          {!rec?.positionAction && <p className="text-xs text-[#8E8E8E]">No recommendation — regenerate the dossier to populate.</p>}
          {rec?.positionAction && (
            <>
              <div className="rounded-lg p-3" style={{ backgroundColor: "#F4F4F4" }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-[#171A20] uppercase tracking-wide">
                    {rec.positionAction} position
                  </span>
                  <span className="text-xs font-medium text-[#5C5E62]">Confidence {rec.confidence}/10</span>
                </div>
                <p className="text-xs text-[#5C5E62]">{rec.summary}</p>
              </div>

              <div>
                <div className="text-[11px] font-semibold text-[#8E8E8E] mb-1.5">Why Buy</div>
                <div className="space-y-2">
                  {rec.whyBuy.map((item, i) => {
                    const metrics = item.evidenceIds.map(id => factById.get(id)?.metric).filter(Boolean);
                    return (
                      <div key={i} className="flex gap-2">
                        <span className="font-bold text-[#15803D] shrink-0 mt-0.5">+</span>
                        <div>
                          <div className="text-xs text-[#171A20]">{item.reason}</div>
                          {metrics.length > 0 && (
                            <div className="flex gap-1 mt-0.5 flex-wrap">
                              {metrics.map((m, j) => (
                                <span key={j} className="text-[10px] px-1 py-0.5 rounded" style={{ backgroundColor: "#F0FDF4", color: "#15803D" }}>{m}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="text-[11px] font-semibold text-[#8E8E8E] mb-1.5">Risk Factors</div>
                <div className="space-y-2">
                  {rec.whyNotBuy.map((item, i) => {
                    const metrics = item.evidenceIds.map(id => factById.get(id)?.metric).filter(Boolean);
                    return (
                      <div key={i} className="flex gap-2">
                        <span className="font-bold text-[#DC2626] shrink-0 mt-0.5">−</span>
                        <div>
                          <div className="text-xs text-[#171A20]">{item.reason}</div>
                          {metrics.length > 0 && (
                            <div className="flex gap-1 mt-0.5 flex-wrap">
                              {metrics.map((m, j) => (
                                <span key={j} className="text-[10px] px-1 py-0.5 rounded" style={{ backgroundColor: "#FEF2F2", color: "#991B1B" }}>{m}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {ev && (
                <div className="text-[11px] text-[#AAAAAA] pt-1 border-t border-[#EEEEEE]">
                  {ev.evidenceCount} facts · {ev.supportingCount} supporting · {ev.contradictingCount} contradicting
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Dossier card ─────────────────────────────────────────────────────────────

function DossierCard({ d }: { d: ResearchDossierData }) {
  const [expanded, setExpanded] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const scoreColor = d.opportunityScore >= 75 ? "#2d7d46" : d.opportunityScore >= 55 ? "#3E6AE1" : "#D97706";
  const fmtUsd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  async function handleExport() {
    setExporting(true);
    setExportMsg(null);
    try {
      const res = await fetch(`/api/research/${d.ticker}/export`, { method: "POST" });
      const body = await res.json();
      setExportMsg(body.exported ? `Exported to Brain OS` : `Brain OS not accessible: ${body.error}`);
    } catch {
      setExportMsg("Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
      {/* Header */}
      <button className="w-full text-left p-4" onClick={() => setExpanded(e => !e)}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-bold text-[#171A20]">{d.ticker}</span>
              {d.investmentSummary.inPortfolio && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: "#F0FDF4", color: "#15803D" }}>In Portfolio</span>
              )}
              {d.investmentSummary.inWatchlist && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: "#EEF3FD", color: "#3E6AE1" }}>Watchlist</span>
              )}
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#F4F4F4] text-[#5C5E62]">
                Conviction {d.thesisDraft.confidence}/10
              </span>
            </div>
            <div className="text-xs text-[#8E8E8E] mt-0.5">{d.companyName}</div>
            {!expanded && d.whyBuy[0] && (
              <p className="text-xs text-[#5C5E62] mt-1.5 line-clamp-1">{d.whyBuy[0].reason}</p>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <div className="text-2xl font-bold" style={{ color: scoreColor }}>{d.opportunityScore.toFixed(1)}</div>
              <div className="text-[10px] text-[#AAAAAA]">opp score</div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#AAAAAA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[#EEEEEE] p-5 space-y-6">

          {/* Investment Summary */}
          <section>
            <h3 className="text-[11px] font-semibold text-[#8E8E8E] uppercase tracking-wide mb-3">Investment Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                { label: "Sector", value: d.investmentSummary.sector ?? "—" },
                { label: "Industry", value: d.investmentSummary.industry ?? "—" },
                { label: "Market Cap", value: d.investmentSummary.marketCapM != null ? `$${d.investmentSummary.marketCapM.toLocaleString()}M` : "—" },
                { label: "Action", value: d.investmentSummary.positionAction === "initiate" ? "Initiate Position" : d.investmentSummary.positionAction === "add" ? "Add to Position" : "Hold" },
                { label: "Company Score", value: `${d.companyScore}/100` },
                { label: "Brain OS Fit", value: `${d.investmentSummary.brainAlignmentScore}/100` },
                { label: "Confidence", value: `${d.thesisDraft.confidence}/10` },
                { label: "Hold Period", value: d.thesisDraft.holdingPeriod },
              ].map(m => (
                <div key={m.label} className="bg-[#F4F4F4] rounded-lg p-2">
                  <div className="text-[10px] text-[#8E8E8E] mb-0.5">{m.label}</div>
                  <div className="text-xs font-semibold text-[#171A20]">{m.value}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Business Overview */}
          <section>
            <h3 className="text-[11px] font-semibold text-[#8E8E8E] uppercase tracking-wide mb-2">Business Overview</h3>
            <p className="text-sm text-[#5C5E62] leading-relaxed">{d.businessOverview.description}</p>
            <div className="mt-3 grid md:grid-cols-2 gap-3">
              <div>
                <div className="text-[11px] font-semibold text-[#8E8E8E] mb-1.5">Revenue Drivers</div>
                <ul className="space-y-1">
                  {d.businessOverview.revenueDrivers.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-[#5C5E62]">
                      <span className="text-[#3E6AE1] mt-0.5 shrink-0">›</span>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-[11px] font-semibold text-[#8E8E8E] mb-1.5">Business Model</div>
                <p className="text-xs text-[#5C5E62] leading-relaxed">{d.businessOverview.businessModel}</p>
              </div>
            </div>
          </section>

          {/* Why Buy */}
          <section>
            <h3 className="text-[11px] font-semibold text-[#8E8E8E] uppercase tracking-wide mb-3">Why Buy</h3>
            <div className="space-y-3">
              {d.whyBuy.map((r, i) => (
                <div key={i} className="flex gap-3">
                  <StrengthDot s={r.strength} />
                  <div>
                    <div className="text-sm font-semibold text-[#171A20]">{r.reason}</div>
                    <p className="text-xs text-[#5C5E62] leading-relaxed mt-0.5">{r.evidence}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Risks */}
          <section>
            <h3 className="text-[11px] font-semibold text-[#8E8E8E] uppercase tracking-wide mb-3">Risks</h3>
            <div className="grid md:grid-cols-3 gap-3">
              {[
                { label: "Business Risks", items: d.risks.businessRisks },
                { label: "Financial Risks", items: d.risks.financialRisks },
                { label: "Portfolio Risks", items: d.risks.portfolioRisks },
              ].map(section => (
                <div key={section.label}>
                  <div className="text-[11px] font-semibold text-[#8E8E8E] mb-1.5">{section.label}</div>
                  <ul className="space-y-2">
                    {section.items.map((r, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <SevBadge s={r.severity} />
                        <span className="text-xs text-[#5C5E62] leading-snug">{r.risk}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {/* Portfolio Fit */}
          <section>
            <h3 className="text-[11px] font-semibold text-[#8E8E8E] uppercase tracking-wide mb-2">Portfolio Fit</h3>
            <p className="text-sm text-[#171A20] font-medium">{d.portfolioFit.summary}</p>
            <div className="mt-2 space-y-1.5">
              <p className="text-xs text-[#5C5E62]"><span className="font-medium text-[#171A20]">Diversification:</span> {d.portfolioFit.diversificationImpact}</p>
              <p className="text-xs text-[#5C5E62]"><span className="font-medium text-[#171A20]">Allocation:</span> {d.portfolioFit.allocationImpact}</p>
            </div>
          </section>

          {/* Thesis Draft */}
          <section>
            <h3 className="text-[11px] font-semibold text-[#8E8E8E] uppercase tracking-wide mb-2">Thesis Draft</h3>
            <p className="text-sm text-[#5C5E62] leading-relaxed">{d.thesisDraft.whyOwn}</p>
            <div className="mt-3 grid md:grid-cols-2 gap-3">
              <div>
                <div className="text-[11px] font-semibold text-[#8E8E8E] mb-1.5">Key Drivers</div>
                <ul className="space-y-1">
                  {d.thesisDraft.keyDrivers.map((k, i) => (
                    <li key={i} className="flex gap-2 text-xs text-[#5C5E62]">
                      <span className="text-[#3E6AE1] shrink-0">›</span>{k}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-[11px] font-semibold text-[#8E8E8E] mb-1.5">Kill Criteria</div>
                <ul className="space-y-1">
                  {d.thesisDraft.killCriteria.slice(0, 4).map((k, i) => (
                    <li key={i} className="flex gap-2 text-xs text-[#5C5E62]">
                      <span className="text-[#DC2626] shrink-0">✗</span>{k}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          {/* Evidence Viewer */}
          {(d.facts?.length ?? 0) > 0 && (
            <section>
              <h3 className="text-[11px] font-semibold text-[#8E8E8E] uppercase tracking-wide mb-3">Evidence · Facts / Interpretation / Recommendation</h3>
              <EvidenceViewer d={d} />
            </section>
          )}

          {/* Suggested Allocation */}
          <section>
            <h3 className="text-[11px] font-semibold text-[#8E8E8E] uppercase tracking-wide mb-2">Suggested Position Size</h3>
            <div className="flex gap-2">
              {[
                { label: "Starter", pct: d.suggestedAllocation.starterPct, usd: d.suggestedAllocation.starterUsd },
                { label: "Target",  pct: d.suggestedAllocation.targetPct,  usd: d.suggestedAllocation.targetUsd  },
                { label: "Maximum", pct: d.suggestedAllocation.maxPct,     usd: d.suggestedAllocation.maxUsd     },
              ].map(a => (
                <div key={a.label} className="flex-1 bg-[#F4F4F4] rounded-lg p-2 text-center">
                  <div className="text-[10px] text-[#8E8E8E] uppercase tracking-wide">{a.label}</div>
                  <div className="text-sm font-semibold text-[#171A20]">{a.pct.toFixed(1)}%</div>
                  <div className="text-[11px] text-[#5C5E62]">{fmtUsd(a.usd)}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1 flex-wrap">
            <WatchlistButton
              ticker={d.ticker}
              companyName={d.companyName}
              initiallyWatched={d.investmentSummary.inWatchlist}
              size="sm"
            />
            <button
              onClick={handleExport}
              disabled={exporting}
              className="text-xs font-medium px-3 py-1.5 rounded border border-[#EEEEEE] text-[#5C5E62] hover:border-[#3E6AE1] hover:text-[#3E6AE1] transition-colors"
            >
              {exporting ? "Exporting…" : "Export to Brain OS"}
            </button>
            {exportMsg && (
              <span className="text-xs text-[#5C5E62]">{exportMsg}</span>
            )}
            <span className="text-xs text-[#AAAAAA] ml-auto">
              Generated {new Date(d.generatedAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Research Queue row ───────────────────────────────────────────────────────

function QueueRow({
  entry,
  hasDossier,
  onGenerate,
  generating,
}: {
  entry: OpportunityEntry;
  hasDossier: boolean;
  onGenerate: (ticker: string) => void;
  generating: boolean;
}) {
  const scoreColor = entry.opportunityScore >= 75 ? "#2d7d46" : entry.opportunityScore >= 55 ? "#3E6AE1" : "#D97706";
  const tierLabel = { tier1: "LC", tier2: "MC", tier3: "SC", tier4: "ETF", tier5: "Intl" }[entry.universeTier] ?? "?";

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-[#EEEEEE] last:border-0">
      <div className="w-16 text-sm font-bold text-[#171A20]">{entry.ticker}</div>
      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#F4F4F4] text-[#5C5E62]">{tierLabel}</span>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-[#171A20] truncate">{entry.companyName}</div>
        {entry.reasoning.whyBuy && (
          <div className="text-[11px] text-[#8E8E8E] truncate">{entry.reasoning.whyBuy.slice(0, 60)}…</div>
        )}
      </div>
      <div className="text-sm font-bold shrink-0" style={{ color: scoreColor }}>
        {entry.opportunityScore.toFixed(1)}
      </div>
      <div className="shrink-0">
        {hasDossier ? (
          <span className="text-[10px] font-semibold px-2 py-1 rounded" style={{ backgroundColor: "#F0FDF4", color: "#15803D" }}>
            Dossier Ready
          </span>
        ) : (
          <button
            onClick={() => onGenerate(entry.ticker)}
            disabled={generating}
            className="text-[11px] font-medium px-2.5 py-1 rounded text-white transition-opacity"
            style={{ backgroundColor: "#3E6AE1", opacity: generating ? 0.6 : 1 }}
          >
            {generating ? "…" : "Generate"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

type TabId = "queue" | "dossiers" | "conviction" | "watchlist";

const TABS: { id: TabId; label: string }[] = [
  { id: "queue",      label: "Research Queue" },
  { id: "dossiers",   label: "Generated Dossiers" },
  { id: "conviction", label: "Highest Conviction" },
  { id: "watchlist",  label: "Watchlist Research" },
];

// ─── Main page ────────────────────────────────────────────────────────────────

type HubTab = "dossiers" | "filings" | "earnings" | "universe";
const HUB_TABS: { id: HubTab; label: string }[] = [
  { id: "dossiers",  label: "Dossiers" },
  { id: "filings",   label: "Filings" },
  { id: "earnings",  label: "Earnings" },
  { id: "universe",  label: "Universe" },
];

interface FilingRow { id: string; ticker: string; filingType: string; filingDate: string; description: string | null; thesisImpacts: { impactLevel: string }[] }
interface EarningsRow { id: string; ticker: string; fiscalPeriod: string | null; reportDate: string; epsActual: number | null; epsEstimate: number | null; revenueActual: number | null }
interface UniverseRow { ticker: string; companyName: string; universeTier: string; sector: string | null; totalScore: number }

export default function ResearchPage() {
  const [dossiers, setDossiers] = useState<ResearchDossierData[]>([]);
  const [opportunities, setOpportunities] = useState<OpportunityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [hubTab, setHubTab] = useState<HubTab>("dossiers");
  const [activeTab, setActiveTab] = useState<TabId>("queue");
  const [generatingTickers, setGeneratingTickers] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [filings, setFilings] = useState<FilingRow[]>([]);
  const [earnings, setEarnings] = useState<EarningsRow[]>([]);
  const [universe, setUniverse] = useState<UniverseRow[]>([]);
  const [hubLoading, setHubLoading] = useState<Record<HubTab, boolean>>({ dossiers: false, filings: false, earnings: false, universe: false });
  const hubFetchedRef = useRef<Record<HubTab, boolean>>({ dossiers: false, filings: false, earnings: false, universe: false });
  const [hubErrors, setHubErrors] = useState<Partial<Record<HubTab, string>>>({});

  useEffect(() => {
    Promise.all([
      fetch("/api/research").then(r => r.json()),
      fetch("/api/opportunities").then(r => r.json()),
    ])
      .then(([rd, opp]) => {
        setDossiers(rd.dossiers ?? []);
        setOpportunities((opp as OpportunityResult).entries ?? []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (hubTab === "filings" && filings.length === 0 && !hubFetchedRef.current.filings) {
      hubFetchedRef.current.filings = true;
      setHubLoading(p => ({ ...p, filings: true }));
      fetch("/api/filings?limit=30")
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then(d => setFilings(d.filings ?? []))
        .catch(() => setHubErrors(p => ({ ...p, filings: "Failed to load filings." })))
        .finally(() => setHubLoading(p => ({ ...p, filings: false })));
    }
    if (hubTab === "earnings" && earnings.length === 0 && !hubFetchedRef.current.earnings) {
      hubFetchedRef.current.earnings = true;
      setHubLoading(p => ({ ...p, earnings: true }));
      fetch("/api/earnings?limit=30")
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then(d => setEarnings(Array.isArray(d) ? d : []))
        .catch(() => setHubErrors(p => ({ ...p, earnings: "Failed to load earnings." })))
        .finally(() => setHubLoading(p => ({ ...p, earnings: false })));
    }
    if (hubTab === "universe" && universe.length === 0 && !hubFetchedRef.current.universe) {
      hubFetchedRef.current.universe = true;
      setHubLoading(p => ({ ...p, universe: true }));
      fetch("/api/screener")
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then(d => {
          type ScoredRow = { ticker: string; companyName: string; universeTier: string; sector: string | null; latestScore: { totalScore: number } | null };
          const rows = (d.passed ?? d.all ?? []) as ScoredRow[];
          setUniverse(
            rows
              .map(e => ({ ticker: e.ticker, companyName: e.companyName, universeTier: e.universeTier, sector: e.sector, totalScore: e.latestScore?.totalScore ?? 0 }))
              .sort((a, b) => b.totalScore - a.totalScore)
          );
        })
        .catch(() => setHubErrors(p => ({ ...p, universe: "Failed to load universe." })))
        .finally(() => setHubLoading(p => ({ ...p, universe: false })));
    }
  }, [hubTab, filings.length, earnings.length, universe.length]);

  const handleGenerate = useCallback(async (ticker: string) => {
    setGeneratingTickers(prev => new Set(prev).add(ticker));
    setError(null);
    try {
      const res = await fetch(`/api/research/${ticker}/generate`, { method: "POST" });
      const data: ResearchDossierData = await res.json();
      if (!res.ok) throw new Error((data as unknown as { error: string }).error ?? "Generation failed");
      setDossiers(prev => {
        const filtered = prev.filter(d => d.ticker !== ticker);
        return [...filtered, data].sort((a, b) => b.opportunityScore - a.opportunityScore);
      });
      setActiveTab("dossiers");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGeneratingTickers(prev => { const s = new Set(prev); s.delete(ticker); return s; });
    }
  }, []);

  const dossierTickers = useMemo(() => new Set(dossiers.map(d => d.ticker)), [dossiers]);

  const queueEntries = useMemo(
    () => [...opportunities].sort((a, b) => b.opportunityScore - a.opportunityScore),
    [opportunities]
  );

  const convictionDossiers = useMemo(
    () => [...dossiers].sort((a, b) =>
      (b.recommendation?.confidence ?? b.thesisDraft.confidence) -
      (a.recommendation?.confidence ?? a.thesisDraft.confidence)
    ),
    [dossiers]
  );

  const watchlistDossiers = useMemo(
    () => dossiers.filter(d => d.investmentSummary.inWatchlist),
    [dossiers]
  );

  const watchlistQueue = useMemo(
    () => opportunities.filter(e => e.inWatchlist && !dossierTickers.has(e.ticker)),
    [opportunities, dossierTickers]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-sm text-[#8E8E8E]">Loading research system...</span>
      </div>
    );
  }

  const IMPACT_STYLE: Record<string, { bg: string; text: string }> = {
    strengthened:           { bg: "#F0FDF4", text: "#15803D" },
    intact:                 { bg: "#EEF3FD", text: "#3E6AE1" },
    weakened:               { bg: "#FFFBEB", text: "#D97706" },
    kill_criteria_triggered: { bg: "#FEF2F2", text: "#DC2626" },
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 md:px-6 space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-[#171A20]">Research</h1>
        <p className="text-xs text-[#8E8E8E] mt-0.5">
          Research hub · dossiers · filings · earnings · universe
        </p>
      </div>

      {error && (
        <div className="text-sm text-[#DC2626] bg-[#FEF2F2] border border-[#FECACA] rounded-lg px-4 py-2">{error}</div>
      )}

      {/* Hub tabs */}
      <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
        <div className="border-b border-[#EEEEEE] flex overflow-x-auto">
          {HUB_TABS.map(ht => (
            <button
              key={ht.id}
              onClick={() => setHubTab(ht.id)}
              className="shrink-0 px-5 py-3 text-sm font-medium border-b-2 transition-colors"
              style={hubTab === ht.id
                ? { borderColor: "#3E6AE1", color: "#3E6AE1" }
                : { borderColor: "transparent", color: "#5C5E62" }}
            >
              {ht.label}
              {ht.id === "dossiers" && dossiers.length > 0 && (
                <span className="ml-1.5 text-[10px] bg-[#3E6AE1] text-white rounded-full px-1.5 py-0.5">
                  {dossiers.length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="p-4">
          {/* ── Dossiers hub tab ── */}
          {hubTab === "dossiers" && (
            <div className="space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Universe", value: opportunities.length },
                  { label: "Dossiers", value: dossiers.length },
                  { label: "Watchlist", value: watchlistDossiers.length },
                  { label: "Pending", value: queueEntries.filter(e => !dossierTickers.has(e.ticker)).length },
                ].map(m => (
                  <div key={m.label} className="bg-[#F4F4F4] rounded-xl p-3">
                    <div className="text-xs text-[#8E8E8E] mb-1">{m.label}</div>
                    <div className="text-lg font-semibold text-[#171A20]">{m.value}</div>
                  </div>
                ))}
              </div>

              {/* Inner dossier tabs */}
              <div className="border border-[#EEEEEE] rounded-xl overflow-hidden">
                  <div className="border-b border-[#EEEEEE] flex overflow-x-auto bg-[#F4F4F4]">
                    {TABS.map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className="shrink-0 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors"
                        style={activeTab === tab.id
                          ? { borderColor: "#3E6AE1", color: "#3E6AE1", backgroundColor: "white" }
                          : { borderColor: "transparent", color: "#5C5E62", backgroundColor: "transparent" }}
                      >
                        {tab.label}
                        {tab.id === "dossiers" && dossiers.length > 0 && (
                          <span className="ml-1 text-[10px] bg-[#3E6AE1] text-white rounded-full px-1 py-0.5">{dossiers.length}</span>
                        )}
                      </button>
                    ))}
                  </div>

                  <div className="p-4">
                    {activeTab === "queue" && (
                      <div>
                        <p className="text-xs text-[#8E8E8E] mb-3">
                          {queueEntries.length} universe entries sorted by opportunity score. Click Generate to create a research dossier.
                        </p>
                        {queueEntries.map(entry => (
                          <QueueRow key={entry.ticker} entry={entry} hasDossier={dossierTickers.has(entry.ticker)} onGenerate={handleGenerate} generating={generatingTickers.has(entry.ticker)} />
                        ))}
                      </div>
                    )}
                    {activeTab === "dossiers" && (
                      <div className="space-y-3">
                        {dossiers.length === 0 ? (
                          <div className="text-center py-8"><p className="text-sm text-[#8E8E8E]">No dossiers yet. Go to Research Queue and click Generate.</p></div>
                        ) : (
                          dossiers.map(d => <DossierCard key={d.ticker} d={d} />)
                        )}
                      </div>
                    )}
                    {activeTab === "conviction" && (
                      <div className="space-y-3">
                        {convictionDossiers.length === 0 ? (
                          <p className="text-sm text-[#8E8E8E] text-center py-8">Generate dossiers to see conviction rankings.</p>
                        ) : (
                          convictionDossiers.map(d => <DossierCard key={d.ticker} d={d} />)
                        )}
                      </div>
                    )}
                    {activeTab === "watchlist" && (
                      <div className="space-y-3">
                        {watchlistDossiers.length === 0 && watchlistQueue.length === 0 ? (
                          <p className="text-sm text-[#8E8E8E] text-center py-8">No watchlist items in the universe.</p>
                        ) : (
                          <>
                            {watchlistDossiers.map(d => <DossierCard key={d.ticker} d={d} />)}
                            {watchlistQueue.length > 0 && (
                              <div className="mt-4">
                                <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide mb-2">Pending Research</div>
                                {watchlistQueue.map(entry => (
                                  <QueueRow key={entry.ticker} entry={entry} hasDossier={false} onGenerate={handleGenerate} generating={generatingTickers.has(entry.ticker)} />
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
            </div>
          )}

          {/* ── Filings hub tab ── */}
          {hubTab === "filings" && (
            <div>
              <p className="text-xs text-[#8E8E8E] mb-4">Recent SEC filings — most recent first. Use the Automation page to ingest new filings.</p>
              {hubLoading.filings ? (
                <div className="py-8 text-center text-sm text-[#8E8E8E]">Loading filings…</div>
              ) : hubErrors.filings ? (
                <div className="py-8 text-center text-sm text-[#c0392b]">{hubErrors.filings}</div>
              ) : filings.length === 0 ? (
                <div className="py-8 text-center text-sm text-[#8E8E8E]">No filings ingested yet.</div>
              ) : (
                <div className="space-y-0">
                  {filings.map(f => {
                    const impact = f.thesisImpacts[0]?.impactLevel;
                    const impStyle = impact ? (IMPACT_STYLE[impact] ?? IMPACT_STYLE.intact) : null;
                    return (
                      <div key={f.id} className="flex items-center gap-3 py-3 border-b border-[#EEEEEE] last:border-0">
                        <div className="w-14 font-semibold text-[#171A20] shrink-0">{f.ticker}</div>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#F4F4F4] text-[#5C5E62] shrink-0">{f.filingType}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-[#5C5E62] truncate">{f.description ?? f.filingType}</div>
                          <div className="text-[10px] text-[#AAAAAA]">{new Date(f.filingDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
                        </div>
                        {impStyle && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0"
                            style={{ backgroundColor: impStyle.bg, color: impStyle.text }}>
                            {impact?.replace("_", " ")}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Earnings hub tab ── */}
          {hubTab === "earnings" && (
            <div>
              <p className="text-xs text-[#8E8E8E] mb-4">Recent earnings events — most recent first.</p>
              {hubLoading.earnings ? (
                <div className="py-8 text-center text-sm text-[#8E8E8E]">Loading earnings…</div>
              ) : hubErrors.earnings ? (
                <div className="py-8 text-center text-sm text-[#c0392b]">{hubErrors.earnings}</div>
              ) : earnings.length === 0 ? (
                <div className="py-8 text-center text-sm text-[#8E8E8E]">No earnings events recorded yet.</div>
              ) : (
                <div className="space-y-0">
                  {earnings.map(e => {
                    const beat = e.epsActual != null && e.epsEstimate != null
                      ? e.epsActual >= e.epsEstimate ? "beat" : "miss"
                      : null;
                    const beatColor = beat === "beat" ? "#15803D" : beat === "miss" ? "#DC2626" : "#8E8E8E";
                    return (
                      <div key={e.id} className="flex items-center gap-3 py-3 border-b border-[#EEEEEE] last:border-0">
                        <div className="w-14 font-semibold text-[#171A20] shrink-0">{e.ticker}</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-[#5C5E62]">{e.fiscalPeriod ?? "—"}</div>
                          <div className="text-[10px] text-[#AAAAAA]">{new Date(e.reportDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
                        </div>
                        {e.epsActual != null && (
                          <div className="text-right shrink-0">
                            <div className="text-sm font-semibold" style={{ color: beatColor }}>
                              ${e.epsActual.toFixed(2)}
                            </div>
                            {e.epsEstimate != null && (
                              <div className="text-[10px] text-[#AAAAAA]">est ${e.epsEstimate.toFixed(2)}</div>
                            )}
                          </div>
                        )}
                        {beat && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0"
                            style={{ backgroundColor: beat === "beat" ? "#F0FDF4" : "#FEF2F2", color: beatColor }}>
                            {beat}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Universe hub tab ── */}
          {hubTab === "universe" && (
            <div>
              <p className="text-xs text-[#8E8E8E] mb-4">Full investment universe ranked by company score.</p>
              {hubLoading.universe ? (
                <div className="py-8 text-center text-sm text-[#8E8E8E]">Loading universe…</div>
              ) : hubErrors.universe ? (
                <div className="py-8 text-center text-sm text-[#c0392b]">{hubErrors.universe}</div>
              ) : universe.length === 0 ? (
                <div className="py-8 text-center text-sm text-[#8E8E8E]">Universe is empty.</div>
              ) : (
                <div className="space-y-0">
                  {universe.map((u, i) => {
                    const scoreColor = u.totalScore >= 75 ? "#15803D" : u.totalScore >= 55 ? "#3E6AE1" : "#D97706";
                    const tierLabel: Record<string, string> = { tier1: "Large Cap", tier2: "Mid Cap", tier3: "Small Cap", tier4: "ETF", tier5: "Intl" };
                    return (
                      <div key={u.ticker} className="flex items-center gap-3 py-2.5 border-b border-[#EEEEEE] last:border-0">
                        <div className="w-7 text-[11px] text-[#AAAAAA] text-right shrink-0">{i + 1}</div>
                        <div className="w-14 font-semibold text-[#171A20] shrink-0">{u.ticker}</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-[#5C5E62] truncate">{u.companyName}</div>
                          <div className="text-[10px] text-[#AAAAAA]">{tierLabel[u.universeTier] ?? u.universeTier}{u.sector ? ` · ${u.sector}` : ""}</div>
                        </div>
                        <div className="text-sm font-bold shrink-0" style={{ color: scoreColor }}>
                          {u.totalScore.toFixed(0)}
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
