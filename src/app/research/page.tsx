"use client";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { WatchlistButton } from "@/components/watchlist-button";
import type { ResearchDossierData, FactItem } from "@/app/api/research/route";
import type { OpportunityEntry, OpportunityResult } from "@/app/api/opportunities/route";
import type { FMPSearchResult } from "@/lib/fmp-client";
import type { PeerRow } from "@/app/api/research/[ticker]/peers/route";
import type { InsiderSummary } from "@/app/api/research/[ticker]/insider/route";
import type { DisruptionAnalysis } from "@/app/api/research/[ticker]/disruption/route";

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

function DossierCard({
  d,
  onRefresh,
  refreshing,
}: {
  d: ResearchDossierData;
  onRefresh?: (ticker: string) => void;
  refreshing?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [addingToUniverse, setAddingToUniverse] = useState(false);
  const [universeMsg, setUniverseMsg] = useState<string | null>(null);
  const [peers, setPeers]       = useState<{ sector: string; rows: PeerRow[] } | null>(null);
  const [peersLoading, setPeersLoading] = useState(false);
  const [insider, setInsider]   = useState<InsiderSummary | null>(null);
  const [insiderLoading, setInsiderLoading] = useState(false);
  const [disruption, setDisruption] = useState<DisruptionAnalysis | null>(d.disruptionAnalysis ?? null);
  const [disruptionLoading, setDisruptionLoading] = useState(false);
  const [disruptionError, setDisruptionError] = useState<string | null>(null);
  const scoreColor = d.opportunityScore >= 75 ? "#2d7d46" : d.opportunityScore >= 55 ? "#3E6AE1" : "#D97706";
  const fmtUsd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  const ageMs = Date.now() - new Date(d.generatedAt).getTime();
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
  const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
  const ageLabel = ageDays >= 1 ? `${ageDays}d ago` : ageHours >= 1 ? `${ageHours}h ago` : "just now";

  // Derive source transparency from available data
  const facts = d.facts ?? [];
  const fmpSources: string[] = [];
  if (d.investmentSummary.sector || d.investmentSummary.industry || d.investmentSummary.marketCapM) fmpSources.push("Profile");
  if (facts.some(f => ["Gross Margin", "Operating Margin", "Debt/Equity"].includes(f.metric))) fmpSources.push("Ratios TTM");
  if (facts.some(f => ["ROIC", "Free Cash Flow"].includes(f.metric))) fmpSources.push("Key Metrics TTM");
  if (facts.some(f => ["Revenue Growth", "EPS Growth"].includes(f.metric))) fmpSources.push("Income Statement");

  async function handleAddToUniverse() {
    setAddingToUniverse(true);
    setUniverseMsg(null);
    try {
      const createRes = await fetch("/api/universe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: d.ticker,
          companyName: d.companyName,
          sector: d.investmentSummary.sector ?? null,
          industry: d.investmentSummary.industry ?? null,
          marketCap: d.investmentSummary.marketCapM != null ? d.investmentSummary.marketCapM * 1_000_000 : null,
          universeTier: "tier1",
        }),
      });
      if (!createRes.ok) {
        const body = await createRes.json();
        throw new Error(body.error ?? `HTTP ${createRes.status}`);
      }
      // Ingest fundamentals via FMP
      const ingestRes = await fetch(`/api/universe/${d.ticker}/ingest`, { method: "POST" });
      const ingestBody = await ingestRes.json();
      const status = ingestBody.status ?? "unknown";
      setUniverseMsg(status === "success" || status === "partial"
        ? "Added to Universe — fundamentals ingested."
        : "Added to Universe (fundamentals pending).");
    } catch (e) {
      setUniverseMsg(e instanceof Error ? e.message : "Failed to add to universe");
    } finally {
      setAddingToUniverse(false);
    }
  }

  async function handleGenerateDisruption() {
    setDisruptionLoading(true);
    setDisruptionError(null);
    try {
      const res = await fetch(`/api/research/${d.ticker}/disruption`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setDisruption(body as DisruptionAnalysis);
    } catch (e) {
      setDisruptionError(e instanceof Error ? e.message : "Failed to generate disruption analysis");
    } finally {
      setDisruptionLoading(false);
    }
  }

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
      <button className="w-full text-left p-4" onClick={() => {
        const next = !expanded;
        setExpanded(next);
        if (next && !peers && !peersLoading) {
          setPeersLoading(true);
          fetch(`/api/research/${d.ticker}/peers`)
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data) setPeers(data); })
            .finally(() => setPeersLoading(false));
        }
        if (next && !insider && !insiderLoading) {
          setInsiderLoading(true);
          fetch(`/api/research/${d.ticker}/insider`)
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data) setInsider(data); })
            .finally(() => setInsiderLoading(false));
        }
      }}>
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
              {d.isOnDemand && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: "#F5F0FF", color: "#7C3AED" }}>Research Only</span>
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

          {/* Premium data unavailable notice */}
          {d.premiumDataUnavailable && (
            <div className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs" style={{ backgroundColor: "#FFFBEB", color: "#92400E", border: "1px solid #FDE68A" }}>
              <span className="shrink-0 font-bold mt-px">!</span>
              <span>Some premium metrics unavailable from current FMP plan. Dossier generated from company profile only.</span>
            </div>
          )}

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

          {/* Disruption Analysis */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[11px] font-semibold text-[#8E8E8E] uppercase tracking-wide">Disruption Analysis</h3>
              <button
                onClick={handleGenerateDisruption}
                disabled={disruptionLoading}
                className="text-[11px] font-medium text-[#3E6AE1] hover:text-[#2d4fb0] disabled:text-[#AAAAAA] disabled:cursor-not-allowed"
              >
                {disruptionLoading ? "Analyzing…" : disruption ? "Regenerate" : "Generate"}
              </button>
            </div>

            {disruptionError && (
              <p className="text-xs text-[#DC2626] mb-2">{disruptionError}</p>
            )}

            {disruptionLoading && (
              <div className="h-24 bg-[#F4F4F4] rounded-xl animate-pulse" />
            )}

            {!disruptionLoading && !disruption && !disruptionError && (
              <p className="text-xs text-[#8E8E8E]">Not yet analyzed — click Generate to run disruption analysis.</p>
            )}

            {!disruptionLoading && disruption && (
              <div className="space-y-4">
                {/* Score / confidence / trend */}
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-[#8E8E8E] uppercase tracking-wide">Score</span>
                    <SevBadge s={disruption.disruptionScore} />
                  </div>
                  <span className="text-[10px] text-[#8E8E8E]">Confidence {disruption.confidence.toFixed(0)}/10</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: disruption.trend === "increasing" ? "#FEF2F2" : disruption.trend === "decreasing" ? "#F0FDF4" : "#F4F4F4",
                      color: disruption.trend === "increasing" ? "#991B1B" : disruption.trend === "decreasing" ? "#14532D" : "#5C5E62",
                    }}>
                    {disruption.trend}
                  </span>
                  <span className="text-[10px] text-[#AAAAAA]">
                    Last analyzed {new Date(disruption.generatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </div>

                {/* Current threats */}
                {disruption.threats.length > 0 && (
                  <div>
                    <div className="text-[11px] font-semibold text-[#8E8E8E] mb-1.5">Current Threats</div>
                    <ul className="space-y-2">
                      {disruption.threats.map((t, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <SevBadge s={t.severity} />
                          <span className="text-xs text-[#5C5E62] leading-snug">
                            <span className="font-medium text-[#171A20]">{t.title}</span> — {t.description}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Potential disruptors */}
                {disruption.disruptors.length > 0 && (
                  <div>
                    <div className="text-[11px] font-semibold text-[#8E8E8E] mb-1.5">Potential Disruptors</div>
                    <ul className="space-y-2">
                      {disruption.disruptors.map((ds, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <SevBadge s={ds.threatLevel} />
                          <span className="text-xs text-[#5C5E62] leading-snug">
                            <span className="font-medium text-[#171A20]">{ds.name}</span>
                            <span className="text-[#AAAAAA]"> ({ds.category.replace(/_/g, " ")}, {ds.timeHorizon.replace(/_/g, " ")})</span>
                            {" — "}{ds.description}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Thesis break conditions */}
                {disruption.thesisBreakConditions.length > 0 && (
                  <div>
                    <div className="text-[11px] font-semibold text-[#8E8E8E] mb-1.5">Thesis Break Conditions</div>
                    <ul className="space-y-1.5">
                      {disruption.thesisBreakConditions.map((c, i) => (
                        <li key={i} className="text-xs text-[#5C5E62] leading-snug">
                          <span className="font-medium text-[#171A20]">{c.metric}</span>{" "}
                          <span className="text-[#8E8E8E]">{c.operator}</span>{" "}
                          <span className="font-medium text-[#171A20]">{c.threshold}</span>
                          {" — "}{c.description}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* AI summary */}
                <div className="bg-[#F9F9F9] rounded-lg p-3 space-y-1.5">
                  <p className="text-xs text-[#5C5E62] leading-snug"><span className="font-medium text-[#171A20]">Biggest threats:</span> {disruption.aiSummary.biggestThreats}</p>
                  <p className="text-xs text-[#5C5E62] leading-snug"><span className="font-medium text-[#171A20]">Watch for:</span> {disruption.aiSummary.whatToMonitor}</p>
                  <p className="text-xs text-[#5C5E62] leading-snug"><span className="font-medium text-[#171A20]">Probability:</span> {disruption.aiSummary.probability}</p>
                  <p className="text-xs text-[#5C5E62] leading-snug"><span className="font-medium text-[#171A20]">Time horizon:</span> {disruption.aiSummary.timeHorizon}</p>
                </div>
              </div>
            )}
          </section>

          {/* Scenario Analysis */}
          {d.scenarioAnalysis && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[11px] font-semibold text-[#8E8E8E] uppercase tracking-wide">Scenario Analysis</h3>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[#8E8E8E]">Implied return</span>
                  <span className="text-xs font-bold" style={{ color: d.scenarioAnalysis.impliedReturn >= 0 ? "#15803D" : "#DC2626" }}>
                    {d.scenarioAnalysis.impliedReturn > 0 ? "+" : ""}{d.scenarioAnalysis.impliedReturn}%
                  </span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: d.scenarioAnalysis.convictionLevel === "High" ? "#F0FDF4" : d.scenarioAnalysis.convictionLevel === "Medium" ? "#EEF3FD" : "#F4F4F4",
                      color:           d.scenarioAnalysis.convictionLevel === "High" ? "#15803D" : d.scenarioAnalysis.convictionLevel === "Medium" ? "#3E6AE1"  : "#8E8E8E",
                    }}>
                    {d.scenarioAnalysis.convictionLevel}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {([d.scenarioAnalysis.bull, d.scenarioAnalysis.base, d.scenarioAnalysis.bear] as const).map(sc => {
                  const isBull = sc.label === "Bull";
                  const isBear = sc.label === "Bear";
                  const borderColor = isBull ? "#BBF7D0" : isBear ? "#FECACA" : "#BFDBFE";
                  const labelColor  = isBull ? "#15803D" : isBear ? "#DC2626" : "#3E6AE1";
                  const bgColor     = isBull ? "#F0FDF4" : isBear ? "#FEF2F2" : "#EEF3FD";
                  return (
                    <div key={sc.label} className="rounded-xl border p-3 flex flex-col gap-1.5"
                      style={{ borderColor, backgroundColor: bgColor }}>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: labelColor }}>{sc.label}</span>
                        <span className="text-[10px] text-[#8E8E8E]">{sc.probability}%</span>
                      </div>
                      <div className="text-base font-bold" style={{ color: labelColor }}>
                        {sc.returnPct > 0 ? "+" : ""}{sc.returnPct}%
                      </div>
                      <p className="text-[11px] text-[#5C5E62] leading-snug">{sc.thesis}</p>
                      <div className="text-[10px] text-[#8E8E8E] mt-auto pt-1 border-t" style={{ borderColor }}>
                        <span className="font-medium">Key driver:</span> {sc.keyDriver.slice(0, 60)}{sc.keyDriver.length > 60 ? "…" : ""}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 text-[11px] text-[#8E8E8E]">
                Suggested sizing: <span className="font-medium text-[#5C5E62]">{d.scenarioAnalysis.positionSizing}</span>
              </div>
            </section>
          )}

          {/* Peer Comparison */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-[11px] font-semibold text-[#8E8E8E] uppercase tracking-wide">Peer Comparison</h3>
              {peers?.sector && (
                <span className="text-[10px] text-[#8E8E8E] bg-[#F4F4F4] px-1.5 py-0.5 rounded">{peers.sector}</span>
              )}
            </div>
            {peersLoading && (
              <div className="h-24 bg-[#F4F4F4] rounded-xl animate-pulse" />
            )}
            {!peersLoading && peers && peers.rows.length <= 1 && (
              <p className="text-xs text-[#8E8E8E]">No peers found in universe for this sector.</p>
            )}
            {!peersLoading && peers && peers.rows.length > 1 && (() => {
              const metrics: { key: keyof PeerRow; label: string; fmt: (v: number) => string; higherBetter: boolean }[] = [
                { key: "revenueGrowth",   label: "Rev Growth",  fmt: v => `${v.toFixed(1)}%`,  higherBetter: true  },
                { key: "grossMargin",     label: "Gross Margin",fmt: v => `${v.toFixed(1)}%`,  higherBetter: true  },
                { key: "operatingMargin", label: "Op Margin",   fmt: v => `${v.toFixed(1)}%`,  higherBetter: true  },
                { key: "roic",            label: "ROIC",        fmt: v => `${v.toFixed(1)}%`,  higherBetter: true  },
                { key: "debtToEquity",    label: "D/E",         fmt: v => v.toFixed(2),        higherBetter: false },
                { key: "companyScore",    label: "Score",       fmt: v => v.toFixed(0),        higherBetter: true  },
              ];

              // Precompute best value per metric (for highlighting)
              const best: Record<string, number> = {};
              for (const m of metrics) {
                const vals = peers.rows.map(r => r[m.key] as number | null).filter((v): v is number => v != null);
                if (vals.length) best[m.key] = m.higherBetter ? Math.max(...vals) : Math.min(...vals);
              }

              return (
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[#EEEEEE]">
                        <th className="text-left py-1.5 pr-3 text-[#8E8E8E] font-medium w-20">Ticker</th>
                        {metrics.map(m => (
                          <th key={m.key as string} className="text-right py-1.5 px-2 text-[#8E8E8E] font-medium whitespace-nowrap">{m.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {peers.rows.map(row => (
                        <tr key={row.ticker}
                          className="border-b border-[#F4F4F4] last:border-0"
                          style={{ backgroundColor: row.isSubject ? "#EEF3FD" : undefined }}>
                          <td className="py-1.5 pr-3 font-semibold" style={{ color: row.isSubject ? "#3E6AE1" : "#171A20" }}>
                            {row.ticker}
                          </td>
                          {metrics.map(m => {
                            const val = row[m.key] as number | null;
                            const isBest = val != null && best[m.key] === val;
                            return (
                              <td key={m.key as string} className="text-right py-1.5 px-2 tabular-nums"
                                style={{ color: val == null ? "#AAAAAA" : isBest ? (m.higherBetter ? "#15803D" : "#15803D") : "#5C5E62",
                                         fontWeight: isBest ? 600 : undefined }}>
                                {val == null ? "—" : m.fmt(val)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-[10px] text-[#AAAAAA] mt-1.5">Best-in-class value highlighted green per metric.</p>
                </div>
              );
            })()}
          </section>

          {/* Insider Activity */}
          <section>
            <h3 className="text-[11px] font-semibold text-[#8E8E8E] uppercase tracking-wide mb-3">Insider Activity <span className="font-normal normal-case">(last 90d)</span></h3>
            {insiderLoading && <div className="h-20 bg-[#F4F4F4] rounded-xl animate-pulse" />}
            {!insiderLoading && insider && (() => {
              const SENT_STYLE = {
                bullish: { bg: "#F0FDF4", text: "#15803D", border: "#BBF7D0" },
                neutral: { bg: "#F4F4F4", text: "#5C5E62", border: "#E5E5E5" },
                bearish: { bg: "#FEF2F2", text: "#DC2626", border: "#FECACA" },
              }[insider.sentiment];
              const fmtVal = (v: number) => Math.abs(v) >= 1_000_000
                ? `$${(Math.abs(v) / 1_000_000).toFixed(1)}M`
                : `$${Math.round(Math.abs(v) / 1000)}K`;

              return (
                <div className="space-y-3">
                  {/* Sentiment banner */}
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border text-sm"
                    style={{ backgroundColor: SENT_STYLE.bg, borderColor: SENT_STYLE.border }}>
                    <span className="font-semibold" style={{ color: SENT_STYLE.text }}>
                      {insider.sentiment.charAt(0).toUpperCase() + insider.sentiment.slice(1)}
                    </span>
                    <span className="text-[#5C5E62] text-xs flex-1">{insider.signal}</span>
                    {(insider.buyCount > 0 || insider.sellCount > 0) && (
                      <div className="flex gap-2 shrink-0 text-[11px]">
                        <span className="text-[#15803D] font-semibold">{insider.buyCount}B</span>
                        <span className="text-[#DC2626] font-semibold">{insider.sellCount}S</span>
                        {insider.netValue !== 0 && (
                          <span style={{ color: insider.netValue >= 0 ? "#15803D" : "#DC2626" }}>
                            {insider.netValue >= 0 ? "+" : "−"}{fmtVal(insider.netValue)} net
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Transaction list */}
                  {insider.transactions.filter(t => t.type !== "other").length > 0 && (
                    <div className="space-y-1">
                      {insider.transactions.filter(t => t.type !== "other").slice(0, 6).map((tx, i) => {
                        const isBuy = tx.type === "buy";
                        return (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <span className="w-12 text-[10px] font-bold shrink-0"
                              style={{ color: isBuy ? "#15803D" : "#DC2626" }}>
                              {isBuy ? "BUY" : "SELL"}
                            </span>
                            <span className="text-[#171A20] font-medium truncate flex-1">{tx.name}</span>
                            {tx.title && (
                              <span className="text-[#AAAAAA] text-[10px] truncate max-w-[100px]">{tx.title}</span>
                            )}
                            <span className="text-[#5C5E62] tabular-nums shrink-0">
                              {tx.shares.toLocaleString()} shs
                            </span>
                            {tx.totalValue && (
                              <span className="text-[#8E8E8E] tabular-nums shrink-0 text-[10px]">
                                {fmtVal(tx.totalValue)}
                              </span>
                            )}
                            <span className="text-[#AAAAAA] shrink-0 text-[10px]">
                              {new Date(tx.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {!insider.dataAvailable && (
                    <p className="text-xs text-[#8E8E8E]">No insider transaction data available from FMP.</p>
                  )}
                </div>
              );
            })()}
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

          {/* Source transparency */}
          {fmpSources.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-[#EEEEEE]">
              <span className="text-[10px] text-[#AAAAAA]">FMP:</span>
              {fmpSources.map(s => (
                <span key={s} className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "#EEF3FD", color: "#3E6AE1" }}>{s}</span>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1 flex-wrap">
            <WatchlistButton
              ticker={d.ticker}
              companyName={d.companyName}
              initiallyWatched={d.investmentSummary.inWatchlist}
              size="sm"
            />
            {d.isOnDemand && !universeMsg && (
              <button
                onClick={handleAddToUniverse}
                disabled={addingToUniverse}
                className="text-xs font-medium px-3 py-1.5 rounded border border-[#EEEEEE] text-[#5C5E62] hover:border-[#7C3AED] hover:text-[#7C3AED] transition-colors disabled:opacity-40"
              >
                {addingToUniverse ? "Adding…" : "Add to Universe"}
              </button>
            )}
            {universeMsg && (
              <span className="text-xs" style={{ color: universeMsg.startsWith("Added") ? "#15803D" : "#DC2626" }}>{universeMsg}</span>
            )}
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
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[11px] text-[#AAAAAA]">{ageLabel}</span>
              {onRefresh && (
                <button
                  onClick={() => onRefresh(d.ticker)}
                  disabled={refreshing}
                  className="text-[11px] text-[#3E6AE1] hover:underline disabled:opacity-40"
                >
                  {refreshing ? "Refreshing…" : "Refresh"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Search Tab ──────────────────────────────────────────────────────────────

function SearchTab({
  dossiers,
  onGenerate,
  generatingTickers,
}: {
  dossiers: ResearchDossierData[];
  onGenerate: (ticker: string, force?: boolean) => Promise<ResearchDossierData | null>;
  generatingTickers: Set<string>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FMPSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [activeDossier, setActiveDossier] = useState<ResearchDossierData | null>(null);

  const dossierMap = useMemo(
    () => new Map(dossiers.map(d => [d.ticker, d])),
    [dossiers]
  );

  const recentHistory = useMemo(
    () => [...dossiers].sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()).slice(0, 10),
    [dossiers]
  );

  async function handleSearch() {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setSearchError(null);
    setResults([]);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResults(data.results ?? []);
      if ((data.results ?? []).length === 0) setSearchError("No results found.");
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function handleGenerate(ticker: string) {
    const data = await onGenerate(ticker);
    if (data) setActiveDossier(data);
  }

  async function handleRefreshResult(ticker: string) {
    const data = await onGenerate(ticker, true);
    if (data) setActiveDossier(data);
  }

  const ageLabel = (iso: string) => {
    const ms = Date.now() - new Date(iso).getTime();
    const d = Math.floor(ms / 86400000);
    const h = Math.floor(ms / 3600000);
    return d >= 1 ? `${d}d ago` : h >= 1 ? `${h}h ago` : "just now";
  };

  return (
    <div className="space-y-5">
      {/* Search input */}
      <div>
        <p className="text-xs text-[#8E8E8E] mb-3">
          Search any stock — ticker or company name. Generate a research dossier for any result, even if it's not in your universe.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            placeholder="RKLB, Palantir, Rocket Lab…"
            className="flex-1 text-sm border border-[#EEEEEE] rounded-lg px-3 py-2 text-[#171A20] placeholder:text-[#AAAAAA] focus:outline-none focus:border-[#3E6AE1]"
          />
          <button
            onClick={handleSearch}
            disabled={searching || !query.trim()}
            className="text-sm font-medium px-4 py-2 rounded-lg text-white transition-opacity disabled:opacity-40"
            style={{ backgroundColor: "#3E6AE1" }}
          >
            {searching ? "…" : "Search"}
          </button>
        </div>
        {searchError && (
          <p className="text-xs text-[#DC2626] mt-2">{searchError}</p>
        )}
      </div>

      {/* Search results */}
      {results.length > 0 && (
        <div className="border border-[#EEEEEE] rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-[#F4F4F4] border-b border-[#EEEEEE]">
            <span className="text-[11px] font-semibold text-[#8E8E8E] uppercase tracking-wide">{results.length} results</span>
          </div>
          {results.map(r => {
            const existing = dossierMap.get(r.symbol);
            const generating = generatingTickers.has(r.symbol);
            return (
              <div key={r.symbol} className="flex items-center gap-3 px-4 py-3 border-b border-[#EEEEEE] last:border-0">
                <div className="w-16 font-semibold text-[#171A20] shrink-0">{r.symbol}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-[#171A20] truncate">{r.name}</div>
                  <div className="text-[10px] text-[#AAAAAA]">
                    {r.exchangeShortName ?? r.stockExchange ?? "—"}
                    {r.currency ? ` · ${r.currency}` : ""}
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  {existing && (
                    <span className="text-[10px] text-[#AAAAAA]">{ageLabel(existing.generatedAt)}</span>
                  )}
                  <button
                    onClick={() => {
                      if (existing && !generating) {
                        setActiveDossier(existing);
                      } else {
                        handleGenerate(r.symbol);
                      }
                    }}
                    disabled={generating}
                    className="text-[11px] font-medium px-2.5 py-1 rounded text-white transition-opacity disabled:opacity-40"
                    style={{ backgroundColor: existing ? "#5C5E62" : "#3E6AE1", opacity: generating ? 0.6 : 1 }}
                  >
                    {generating ? "…" : existing ? "View" : "Generate Dossier"}
                  </button>
                  {existing && (
                    <button
                      onClick={() => handleRefreshResult(r.symbol)}
                      disabled={generating}
                      className="text-[11px] text-[#3E6AE1] hover:underline disabled:opacity-40"
                    >
                      Refresh
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Active dossier */}
      {activeDossier && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-[#8E8E8E] uppercase tracking-wide">Research Dossier</span>
            <button onClick={() => setActiveDossier(null)} className="text-[11px] text-[#AAAAAA] hover:text-[#5C5E62]">Dismiss</button>
          </div>
          <DossierCard
            d={activeDossier}
            onRefresh={handleRefreshResult}
            refreshing={generatingTickers.has(activeDossier.ticker)}
          />
        </div>
      )}

      {/* Recent history */}
      {recentHistory.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold text-[#8E8E8E] uppercase tracking-wide mb-2">Recent Research</div>
          <div className="border border-[#EEEEEE] rounded-xl overflow-hidden">
            {recentHistory.map(d => (
              <div
                key={d.ticker}
                className="flex items-center gap-3 px-4 py-2.5 border-b border-[#EEEEEE] last:border-0 cursor-pointer hover:bg-[#F8F9FB]"
                onClick={() => setActiveDossier(d)}
              >
                <div className="w-16 font-semibold text-[#171A20] shrink-0">{d.ticker}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-[#5C5E62] truncate">{d.companyName}</div>
                  {d.investmentSummary.sector && (
                    <div className="text-[10px] text-[#AAAAAA]">{d.investmentSummary.sector}</div>
                  )}
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  {d.isOnDemand && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "#F5F0FF", color: "#7C3AED" }}>Research Only</span>
                  )}
                  <span className="text-[10px] text-[#AAAAAA]">{ageLabel(d.generatedAt)}</span>
                </div>
              </div>
            ))}
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

type HubTab = "search" | "dossiers" | "themes" | "theses" | "filings" | "earnings" | "universe";
const HUB_TABS: { id: HubTab; label: string }[] = [
  { id: "search",    label: "Companies" },
  { id: "dossiers",  label: "Dossiers" },
  { id: "themes",    label: "Theme Notes" },
  { id: "theses",    label: "Thesis Log" },
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
  const [hubTab, setHubTab] = useState<HubTab>("search");
  const [activeTab, setActiveTab] = useState<TabId>("queue");
  const [generatingTickers, setGeneratingTickers] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [filings, setFilings] = useState<FilingRow[]>([]);
  const [earnings, setEarnings] = useState<EarningsRow[]>([]);
  const [universe, setUniverse] = useState<UniverseRow[]>([]);
  const [hubLoading, setHubLoading] = useState<Record<HubTab, boolean>>({ search: false, dossiers: false, themes: false, theses: false, filings: false, earnings: false, universe: false });
  const hubFetchedRef = useRef<Record<HubTab, boolean>>({ search: false, dossiers: false, themes: false, theses: false, filings: false, earnings: false, universe: false });
  const [hubErrors, setHubErrors] = useState<Partial<Record<HubTab, string>>>({});
  const [thesesList, setThesesList] = useState<{ id: string; ticker: string; title: string; confidenceScore: number; status: string; isDraft: boolean; lastReviewedAt: string | null }[]>([]);
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [themeContent, setThemeContent] = useState<string>("");
  const [themeLoading, setThemeLoading] = useState(false);

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
    if (hubTab === "theses" && thesesList.length === 0 && !hubFetchedRef.current.theses) {
      hubFetchedRef.current.theses = true;
      setHubLoading(p => ({ ...p, theses: true }));
      fetch("/api/investment-theses")
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then(d => setThesesList(d.theses ?? []))
        .catch(() => setHubErrors(p => ({ ...p, theses: "Failed to load theses." })))
        .finally(() => setHubLoading(p => ({ ...p, theses: false })));
    }
  }, [hubTab, filings.length, earnings.length, universe.length, thesesList.length]);

  async function loadThemeContent(theme: string) {
    setSelectedTheme(theme);
    setThemeContent("");
    setThemeLoading(true);
    try {
      const res = await fetch(`/api/wiki/theme?name=${encodeURIComponent(theme)}`);
      const data = await res.json();
      setThemeContent(data.context ?? "No wiki content for this theme yet.");
    } catch {
      setThemeContent("Failed to load theme content.");
    } finally {
      setThemeLoading(false);
    }
  }

  const handleGenerate = useCallback(async (ticker: string, force = false) => {
    setGeneratingTickers(prev => new Set(prev).add(ticker));
    setError(null);
    try {
      const url = force
        ? `/api/research/${ticker}/generate?force=true`
        : `/api/research/${ticker}/generate`;
      const res = await fetch(url, { method: "POST" });
      const data: ResearchDossierData = await res.json();
      if (!res.ok) throw new Error((data as unknown as { error: string }).error ?? "Generation failed");
      setDossiers(prev => {
        const filtered = prev.filter(d => d.ticker !== ticker);
        return [...filtered, data].sort((a, b) => b.opportunityScore - a.opportunityScore);
      });
      setActiveTab("dossiers");
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
      return null;
    } finally {
      setGeneratingTickers(prev => { const s = new Set(prev); s.delete(ticker); return s; });
    }
  }, []);

  const handleRefresh = useCallback((ticker: string) => handleGenerate(ticker, true), [handleGenerate]);
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
        <p className="text-xs text-[#8E8E8E] mt-0.5">Why do I own this?</p>
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
          {/* ── Search hub tab ── */}
          {hubTab === "search" && (
            <SearchTab
              dossiers={dossiers}
              onGenerate={handleGenerate}
              generatingTickers={generatingTickers}
            />
          )}

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
                          dossiers.map(d => <DossierCard key={d.ticker} d={d} onRefresh={handleRefresh} refreshing={generatingTickers.has(d.ticker)} />)
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

          {/* ── Themes hub tab ── */}
          {hubTab === "themes" && (() => {
            const THEMES = ["AI Infrastructure", "Semiconductors", "Healthcare", "Defense", "Cybersecurity"];
            return (
              <div className="space-y-4">
                <p className="text-xs text-[#8E8E8E]">Investment themes — click to view wiki content.</p>
                <div className="flex flex-wrap gap-2">
                  {THEMES.map(t => (
                    <button
                      key={t}
                      onClick={() => loadThemeContent(t)}
                      className="px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors"
                      style={selectedTheme === t
                        ? { backgroundColor: "#EEF3FD", color: "#3E6AE1", borderColor: "#3E6AE1" }
                        : { backgroundColor: "white", color: "#5C5E62", borderColor: "#EEEEEE" }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                {selectedTheme && (
                  <div className="bg-white border border-[#EEEEEE] rounded-xl p-4">
                    <div className="text-sm font-semibold text-[#171A20] mb-3">{selectedTheme}</div>
                    {themeLoading ? (
                      <div className="text-sm text-[#8E8E8E]">Loading…</div>
                    ) : (
                      <pre className="text-xs text-[#5C5E62] whitespace-pre-wrap font-mono leading-relaxed">
                        {themeContent || "No wiki content for this theme yet."}
                      </pre>
                    )}
                  </div>
                )}
                {!selectedTheme && (
                  <div className="text-center py-12 text-sm text-[#8E8E8E]">Select a theme above to view its wiki content.</div>
                )}
              </div>
            );
          })()}

          {/* ── Theses hub tab ── */}
          {hubTab === "theses" && (
            <div className="space-y-3">
              <p className="text-xs text-[#8E8E8E]">Investment thesis history — all positions and watchlist tickers.</p>
              {hubLoading.theses ? (
                <div className="py-8 text-center text-sm text-[#8E8E8E]">Loading theses…</div>
              ) : hubErrors.theses ? (
                <div className="py-8 text-center text-sm text-[#DC2626]">{hubErrors.theses}</div>
              ) : thesesList.length === 0 ? (
                <div className="py-8 text-center text-sm text-[#8E8E8E]">No theses yet.</div>
              ) : (
                thesesList.map(t => {
                  const statusColors: Record<string, { bg: string; text: string }> = {
                    intact:     { bg: "#F0FDF4", text: "#15803D" },
                    weakening:  { bg: "#FFFBEB", text: "#D97706" },
                    broken:     { bg: "#FEF2F2", text: "#DC2626" },
                    monitoring: { bg: "#EEF3FD", text: "#3E6AE1" },
                  };
                  const sc = statusColors[t.status] ?? { bg: "#F4F4F4", text: "#5C5E62" };
                  const confColor = t.confidenceScore >= 8 ? "#15803D" : t.confidenceScore >= 6 ? "#D97706" : "#DC2626";
                  return (
                    <div key={t.id} className="bg-white border border-[#EEEEEE] rounded-xl px-4 py-3 flex items-center gap-3">
                      <span className="font-semibold text-sm text-[#171A20] w-16">{t.ticker}</span>
                      <span className="flex-1 text-xs text-[#5C5E62] truncate">{t.title}</span>
                      <span className="text-xs font-semibold" style={{ color: confColor }}>{t.confidenceScore}/10</span>
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded uppercase"
                        style={{ backgroundColor: sc.bg, color: sc.text }}
                      >
                        {t.isDraft ? "draft" : t.status}
                      </span>
                      {t.lastReviewedAt && (
                        <span className="text-[11px] text-[#AAAAAA] shrink-0">
                          {new Date(t.lastReviewedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
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
