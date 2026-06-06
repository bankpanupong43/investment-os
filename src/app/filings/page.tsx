"use client";
import { useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ThesisImpact {
  impactLevel: string;
  reasoning: string;
}

interface Filing {
  id: string;
  ticker: string;
  filingType: string;
  accessionNumber: string;
  filingDate: string;
  periodEndDate: string | null;
  title: string;
  summary: string | null;
  sourceUrl: string | null;
  thesisImpacts: ThesisImpact[];
}

interface FilingsResponse {
  filings: Filing[];
  total: number;
}

interface IngestResult {
  ticker?: string;
  discovered?: number;
  newFilings?: number;
  skippedDuplicates?: number;
  errors?: string[];
  results?: IngestResult[];
  totalNew?: number;
  totalErrors?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FILING_TYPE_COLOR: Record<string, { bg: string; text: string }> = {
  "10-K": { bg: "#EEF3FD", text: "#3E6AE1" },
  "10-Q": { bg: "#F0FDF4", text: "#15803D" },
  "8-K":  { bg: "#FFFBEB", text: "#D97706" },
  "20-F": { bg: "#FDF0EE", text: "#C0392B" },
};

const IMPACT_COLOR: Record<string, { bg: string; text: string; label: string }> = {
  intact:                   { bg: "#F0FDF4", text: "#15803D", label: "Intact" },
  strengthened:             { bg: "#EEF3FD", text: "#3E6AE1", label: "Strengthened" },
  weakened:                 { bg: "#FFFBEB", text: "#D97706", label: "Weakened" },
  kill_criteria_triggered:  { bg: "#FEF2F2", text: "#DC2626", label: "Kill Criteria" },
};

function FilingTypeBadge({ type }: { type: string }) {
  const c = FILING_TYPE_COLOR[type] ?? { bg: "#F4F4F4", text: "#5C5E62" };
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded border"
      style={{ backgroundColor: c.bg, color: c.text, borderColor: c.text + "33" }}>
      {type}
    </span>
  );
}

function ImpactBadge({ level }: { level: string }) {
  const c = IMPACT_COLOR[level] ?? { bg: "#F4F4F4", text: "#5C5E62", label: level };
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded"
      style={{ backgroundColor: c.bg, color: c.text }}>
      {c.label}
    </span>
  );
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// ─── Ingest Panel ─────────────────────────────────────────────────────────────

function IngestPanel({ onDone }: { onDone: () => void }) {
  const [ticker, setTicker] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleIngest() {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const body = ticker.trim() ? { ticker: ticker.trim().toUpperCase() } : {};
      const res = await fetch("/api/filings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ingestion failed");
      setResult(data);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl p-4 space-y-3">
      <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide">Ingest SEC Filings</div>
      <div className="flex gap-2">
        <input
          type="text"
          value={ticker}
          onChange={e => setTicker(e.target.value.toUpperCase())}
          placeholder="Ticker (blank = full portfolio)"
          className="flex-1 text-sm border border-[#EEEEEE] rounded-lg px-3 py-2 focus:outline-none focus:border-[#3E6AE1] placeholder-[#AAAAAA]"
        />
        <button
          onClick={handleIngest}
          disabled={loading}
          className="text-sm font-medium px-4 py-2 rounded-lg text-white transition-opacity"
          style={{ backgroundColor: "#3E6AE1", opacity: loading ? 0.6 : 1 }}
        >
          {loading ? "Ingesting…" : "Run Ingestion"}
        </button>
      </div>
      {error && <p className="text-xs text-[#DC2626]">{error}</p>}
      {result && (
        <div className="text-xs text-[#5C5E62] space-y-1">
          {result.results ? (
            <>
              <p className="font-medium text-[#171A20]">Portfolio ingestion complete</p>
              <p>New filings: <strong>{result.totalNew}</strong> · Errors: <strong>{result.totalErrors}</strong></p>
            </>
          ) : (
            <>
              <p className="font-medium text-[#171A20]">{result.ticker} ingestion complete</p>
              <p>Discovered: {result.discovered} · New: <strong>{result.newFilings}</strong> · Skipped: {result.skippedDuplicates}</p>
              {result.errors && result.errors.length > 0 && (
                <p className="text-[#D97706]">Warnings: {result.errors.slice(0, 2).join("; ")}</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Filing Row ───────────────────────────────────────────────────────────────

function FilingRow({ filing }: { filing: Filing }) {
  const [open, setOpen] = useState(false);
  const impact = filing.thesisImpacts[0];

  return (
    <div className="border-b border-[#EEEEEE] last:border-0">
      <button
        className="w-full text-left px-4 py-3 hover:bg-[#F9F9F9] transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-[#3E6AE1] w-14 shrink-0">{filing.ticker}</span>
          <FilingTypeBadge type={filing.filingType} />
          <span className="text-sm font-medium text-[#171A20] flex-1 min-w-0 truncate">{filing.title}</span>
          <span className="text-xs text-[#8E8E8E] shrink-0">{fmtDate(filing.filingDate)}</span>
          {impact && <ImpactBadge level={impact.impactLevel} />}
          <svg
            className="shrink-0 transition-transform"
            style={{ transform: open ? "rotate(180deg)" : "rotate(0)" }}
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8E8E8E" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 bg-[#FAFAFA]">
          {filing.summary && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8E8E8E] mb-1">Summary</div>
              <p className="text-sm text-[#5C5E62] leading-relaxed">{filing.summary}</p>
            </div>
          )}
          {impact && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8E8E8E] mb-1">Thesis Impact</div>
              <div className="flex items-center gap-2 mb-1">
                <ImpactBadge level={impact.impactLevel} />
              </div>
              <p className="text-sm text-[#5C5E62] leading-relaxed">{impact.reasoning}</p>
            </div>
          )}
          {!impact && (
            <p className="text-xs text-[#8E8E8E]">No thesis impact analysis available. Run analysis to evaluate.</p>
          )}
          <div className="flex items-center gap-3 pt-1">
            {filing.periodEndDate && (
              <span className="text-xs text-[#8E8E8E]">Period ending: {fmtDate(filing.periodEndDate)}</span>
            )}
            {filing.sourceUrl && (
              <a
                href={filing.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#3E6AE1] hover:underline"
              >
                View on SEC EDGAR
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const FILTER_TYPES = ["All", "10-K", "10-Q", "8-K", "20-F"];
const IMPACT_FILTERS = ["All", "intact", "strengthened", "weakened", "kill_criteria_triggered"];

export default function FilingsPage() {
  const [data, setData] = useState<FilingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("All");
  const [filterImpact, setFilterImpact] = useState("All");
  const [filterTicker, setFilterTicker] = useState("");

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (filterType !== "All") params.set("filingType", filterType);
      if (filterTicker.trim()) params.set("ticker", filterTicker.trim().toUpperCase());
      const res = await fetch(`/api/filings?${params}`);
      const json = await res.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [filterType, filterTicker]);

  const filings = (data?.filings ?? []).filter(f => {
    if (filterImpact === "All") return true;
    return f.thesisImpacts[0]?.impactLevel === filterImpact;
  });

  const impactCounts = {
    kill_criteria_triggered: (data?.filings ?? []).filter(f => f.thesisImpacts[0]?.impactLevel === "kill_criteria_triggered").length,
    weakened: (data?.filings ?? []).filter(f => f.thesisImpacts[0]?.impactLevel === "weakened").length,
    strengthened: (data?.filings ?? []).filter(f => f.thesisImpacts[0]?.impactLevel === "strengthened").length,
  };

  return (
    <div className="min-h-screen bg-[#F4F4F4]">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-[#171A20]">SEC Filings</h1>
            <p className="text-sm text-[#8E8E8E] mt-0.5">
              Primary source company disclosures with thesis impact analysis
            </p>
          </div>
          <a href="/earnings" className="text-sm text-[#3E6AE1] hover:underline">
            Earnings →
          </a>
        </div>

        {/* Stat row */}
        {data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total Filings", value: data.total },
              { label: "Kill Criteria", value: impactCounts.kill_criteria_triggered, color: "#DC2626" },
              { label: "Thesis Weakened", value: impactCounts.weakened, color: "#D97706" },
              { label: "Thesis Strengthened", value: impactCounts.strengthened, color: "#15803D" },
            ].map(s => (
              <div key={s.label} className="bg-white border border-[#EEEEEE] rounded-xl p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8E8E8E]">{s.label}</div>
                <div className="text-2xl font-bold mt-1" style={{ color: s.color ?? "#171A20" }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Ingestion panel */}
        <IngestPanel onDone={load} />

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={filterTicker}
            onChange={e => setFilterTicker(e.target.value)}
            placeholder="Filter by ticker…"
            className="text-sm border border-[#EEEEEE] rounded-lg px-3 py-1.5 w-36 focus:outline-none focus:border-[#3E6AE1] placeholder-[#AAAAAA]"
          />
          <div className="flex gap-1">
            {FILTER_TYPES.map(t => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors"
                style={filterType === t
                  ? { backgroundColor: "#3E6AE1", color: "#fff", borderColor: "#3E6AE1" }
                  : { backgroundColor: "#fff", color: "#5C5E62", borderColor: "#EEEEEE" }}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {IMPACT_FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setFilterImpact(f)}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors"
                style={filterImpact === f
                  ? { backgroundColor: "#171A20", color: "#fff", borderColor: "#171A20" }
                  : { backgroundColor: "#fff", color: "#5C5E62", borderColor: "#EEEEEE" }}
              >
                {f === "kill_criteria_triggered" ? "Kill" : f === "All" ? "All Impact" : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-10 text-center text-sm text-[#8E8E8E]">Loading filings…</div>
          ) : filings.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm font-medium text-[#5C5E62]">No filings found</p>
              <p className="text-xs text-[#8E8E8E] mt-1">Run ingestion above to fetch SEC filings for your portfolio.</p>
            </div>
          ) : (
            <div>
              <div className="px-4 py-2.5 border-b border-[#EEEEEE] bg-[#F9F9F9]">
                <span className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide">
                  {filings.length} filing{filings.length !== 1 ? "s" : ""}
                </span>
              </div>
              {filings.map(f => <FilingRow key={f.id} filing={f} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
