"use client";
import { useEffect, useMemo, useState } from "react";
import type { ResearchDossierData } from "@/app/api/research/route";
import type { DisruptionAnalysis } from "@/app/api/research/[ticker]/disruption/route";

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

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl p-5">
      <h2 className="text-[11px] font-semibold text-[#8E8E8E] uppercase tracking-wide mb-3">{title}</h2>
      {children}
    </div>
  );
}

export default function ThesisDashboardPage() {
  const [dossiers, setDossiers] = useState<ResearchDossierData[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [disruptionLoading, setDisruptionLoading] = useState(false);
  const [disruptionError, setDisruptionError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/research")
      .then(r => r.json())
      .then(body => setDossiers(body.dossiers ?? []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return dossiers;
    return dossiers.filter(d => d.ticker.toUpperCase().includes(q) || d.companyName.toUpperCase().includes(q));
  }, [dossiers, query]);

  const selected = dossiers.find(d => d.ticker === selectedTicker) ?? null;

  async function handleGenerateDisruption(ticker: string) {
    setDisruptionLoading(true);
    setDisruptionError(null);
    try {
      const res = await fetch(`/api/research/${ticker}/disruption`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setDossiers(prev => prev.map(d => d.ticker === ticker ? { ...d, disruptionAnalysis: body as DisruptionAnalysis } : d));
    } catch (e) {
      setDisruptionError(e instanceof Error ? e.message : "Failed to generate disruption analysis");
    } finally {
      setDisruptionLoading(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#171A20]">Investment Thesis Dashboard</h1>
        <p className="text-sm text-[#5C5E62] mt-1">
          Why Buy? · What Could Go Wrong? · Who Could Disrupt This Business? · What Breaks My Thesis?
        </p>
      </div>

      {/* Ticker picker */}
      <div className="bg-white border border-[#EEEEEE] rounded-xl p-4">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search ticker or company…"
          className="w-full text-sm border border-[#E5E5E5] rounded px-3 py-2 mb-3 focus:outline-none focus:border-[#3E6AE1]"
        />
        {loading && <p className="text-xs text-[#8E8E8E]">Loading dossiers…</p>}
        {!loading && filtered.length === 0 && (
          <p className="text-xs text-[#8E8E8E]">No dossiers found. Generate research on the Research page first.</p>
        )}
        {!loading && filtered.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {filtered.slice(0, 30).map(d => (
              <button
                key={d.ticker}
                onClick={() => setSelectedTicker(d.ticker)}
                className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
                  selectedTicker === d.ticker
                    ? "bg-[#EEF3FD] border-[#3E6AE1] text-[#3E6AE1]"
                    : "bg-white border-[#E5E5E5] text-[#5C5E62] hover:border-[#AAAAAA]"
                }`}
              >
                {d.ticker} <span className="opacity-70 font-normal">{d.companyName}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {!selected && (
        <div className="bg-white border border-[#EEEEEE] rounded-xl p-8 text-center text-sm text-[#8E8E8E]">
          Select a ticker above to view its investment thesis.
        </div>
      )}

      {selected && (
        <div className="grid md:grid-cols-2 gap-4">
          {/* Why Buy? */}
          <SectionCard title="Why Buy?">
            {selected.whyBuy.length === 0 ? (
              <p className="text-xs text-[#8E8E8E]">No bull-case reasons on file.</p>
            ) : (
              <ul className="space-y-2.5">
                {selected.whyBuy.map((r, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <StrengthDot s={r.strength} />
                    <span className="text-xs text-[#5C5E62] leading-snug">
                      <span className="font-medium text-[#171A20]">{r.reason}</span>
                      {r.evidence ? <> — {r.evidence}</> : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {/* What Could Go Wrong? */}
          <SectionCard title="What Could Go Wrong?">
            {[
              { label: "Business Risks", items: selected.risks.businessRisks },
              { label: "Financial Risks", items: selected.risks.financialRisks },
              { label: "Portfolio Risks", items: selected.risks.portfolioRisks },
            ].every(s => s.items.length === 0) ? (
              <p className="text-xs text-[#8E8E8E]">No risks on file.</p>
            ) : (
              <div className="space-y-3">
                {[
                  { label: "Business Risks", items: selected.risks.businessRisks },
                  { label: "Financial Risks", items: selected.risks.financialRisks },
                  { label: "Portfolio Risks", items: selected.risks.portfolioRisks },
                ].filter(s => s.items.length > 0).map(section => (
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
            )}
          </SectionCard>

          {/* Who Could Disrupt This Business? */}
          <SectionCard title="Who Could Disrupt This Business?">
            {!selected.disruptionAnalysis ? (
              <div className="space-y-2">
                <p className="text-xs text-[#8E8E8E]">Not yet analyzed.</p>
                {disruptionError && <p className="text-xs text-[#DC2626]">{disruptionError}</p>}
                <button
                  onClick={() => handleGenerateDisruption(selected.ticker)}
                  disabled={disruptionLoading}
                  className="text-[11px] font-medium text-[#3E6AE1] hover:text-[#2d4fb0] disabled:text-[#AAAAAA] disabled:cursor-not-allowed"
                >
                  {disruptionLoading ? "Analyzing…" : "Generate"}
                </button>
              </div>
            ) : selected.disruptionAnalysis.disruptors.length === 0 ? (
              <p className="text-xs text-[#8E8E8E]">No potential disruptors identified.</p>
            ) : (
              <ul className="space-y-2">
                {selected.disruptionAnalysis.disruptors.map((ds, i) => (
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
            )}
          </SectionCard>

          {/* What Breaks My Thesis? */}
          <SectionCard title="What Breaks My Thesis?">
            <div className="space-y-3">
              <div>
                <div className="text-[11px] font-semibold text-[#8E8E8E] mb-1.5">Kill Criteria</div>
                {selected.thesisDraft.killCriteria.length === 0 ? (
                  <p className="text-xs text-[#8E8E8E]">None on file.</p>
                ) : (
                  <ul className="space-y-1.5 list-disc list-inside">
                    {selected.thesisDraft.killCriteria.map((c, i) => (
                      <li key={i} className="text-xs text-[#5C5E62] leading-snug">{c}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <div className="text-[11px] font-semibold text-[#8E8E8E] mb-1.5">Thesis Break Conditions</div>
                {!selected.disruptionAnalysis || selected.disruptionAnalysis.thesisBreakConditions.length === 0 ? (
                  <p className="text-xs text-[#8E8E8E]">Not available — generate disruption analysis to see structured break conditions.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {selected.disruptionAnalysis.thesisBreakConditions.map((c, i) => (
                      <li key={i} className="text-xs text-[#5C5E62] leading-snug">
                        <span className="font-medium text-[#171A20]">{c.metric}</span>{" "}
                        <span className="text-[#8E8E8E]">{c.operator}</span>{" "}
                        <span className="font-medium text-[#171A20]">{c.threshold}</span>
                        {" — "}{c.description}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  );
}
