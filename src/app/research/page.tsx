"use client";
import { useEffect, useState, useMemo, useCallback } from "react";
import type { ResearchDossierData } from "@/app/api/research/route";
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

export default function ResearchPage() {
  const [dossiers, setDossiers] = useState<ResearchDossierData[]>([]);
  const [opportunities, setOpportunities] = useState<OpportunityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("queue");
  const [generatingTickers, setGeneratingTickers] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

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
    () => [...dossiers].sort((a, b) => b.thesisDraft.confidence - a.thesisDraft.confidence),
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

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 md:px-6 space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-[#171A20]">Research Dossiers</h1>
        <p className="text-xs text-[#8E8E8E] mt-0.5">
          Structured investment research — from opportunity ranking to thesis draft
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Universe", value: opportunities.length },
          { label: "Dossiers Generated", value: dossiers.length },
          { label: "Watchlist Research", value: watchlistDossiers.length },
          { label: "Pending Generation", value: queueEntries.filter(e => !dossierTickers.has(e.ticker)).length },
        ].map(m => (
          <div key={m.label} className="bg-white border border-[#EEEEEE] rounded-xl p-3">
            <div className="text-xs text-[#8E8E8E] mb-1">{m.label}</div>
            <div className="text-lg font-semibold text-[#171A20]">{m.value}</div>
          </div>
        ))}
      </div>

      {error && (
        <div className="text-sm text-[#DC2626] bg-[#FEF2F2] border border-[#FECACA] rounded-lg px-4 py-2">{error}</div>
      )}

      {/* Tabs */}
      <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
        <div className="border-b border-[#EEEEEE] flex overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors"
              style={activeTab === tab.id
                ? { borderColor: "#3E6AE1", color: "#3E6AE1" }
                : { borderColor: "transparent", color: "#5C5E62" }}
            >
              {tab.label}
              {tab.id === "dossiers" && dossiers.length > 0 && (
                <span className="ml-1.5 text-[10px] bg-[#3E6AE1] text-white rounded-full px-1.5 py-0.5">
                  {dossiers.length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="p-4">
          {/* Research Queue */}
          {activeTab === "queue" && (
            <div>
              <p className="text-xs text-[#8E8E8E] mb-3">
                {queueEntries.length} universe entries sorted by opportunity score. Click Generate to create a research dossier.
              </p>
              <div>
                {queueEntries.map(entry => (
                  <QueueRow
                    key={entry.ticker}
                    entry={entry}
                    hasDossier={dossierTickers.has(entry.ticker)}
                    onGenerate={handleGenerate}
                    generating={generatingTickers.has(entry.ticker)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Generated Dossiers */}
          {activeTab === "dossiers" && (
            <div className="space-y-3">
              {dossiers.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-sm text-[#8E8E8E]">No dossiers generated yet.</p>
                  <p className="text-xs text-[#AAAAAA] mt-1">Go to Research Queue and click Generate on any entry.</p>
                </div>
              ) : (
                dossiers.map(d => <DossierCard key={d.ticker} d={d} />)
              )}
            </div>
          )}

          {/* Highest Conviction */}
          {activeTab === "conviction" && (
            <div className="space-y-3">
              {convictionDossiers.length === 0 ? (
                <p className="text-sm text-[#8E8E8E] text-center py-8">Generate dossiers to see conviction rankings.</p>
              ) : (
                convictionDossiers.map(d => <DossierCard key={d.ticker} d={d} />)
              )}
            </div>
          )}

          {/* Watchlist Research */}
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
                        <QueueRow
                          key={entry.ticker}
                          entry={entry}
                          hasDossier={false}
                          onGenerate={handleGenerate}
                          generating={generatingTickers.has(entry.ticker)}
                        />
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
  );
}
