"use client";
import { useEffect, useState, useCallback } from "react";
import type { ScreenerResult, ScoredEntry } from "@/app/api/screener/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TIER_LABEL: Record<string, string> = {
  tier1: "Large Cap",
  tier2: "Mid Cap",
  tier3: "Small Cap",
  tier4: "ETF",
  tier5: "International",
};

const TIER_COLOR: Record<string, string> = {
  tier1: "bg-[#EEF3FD] text-[#3E6AE1] border-[#bfcffd]",
  tier2: "bg-[#eef7f1] text-[#2d7d46] border-[#c3e6cf]",
  tier3: "bg-[#fffbeb] text-[#b45309] border-[#fde68a]",
  tier4: "bg-[#F4F4F4] text-[#5C5E62] border-[#EEEEEE]",
  tier5: "bg-[#fdf0ee] text-[#c0392b] border-[#f5c6c1]",
};

function scoreColor(n: number): string {
  if (n >= 70) return "text-[#2d7d46]";
  if (n >= 50) return "text-[#b45309]";
  return "text-[#c0392b]";
}

function scoreBg(n: number): string {
  if (n >= 70) return "bg-[#eef7f1] border-[#c3e6cf] text-[#2d7d46]";
  if (n >= 50) return "bg-[#fffbeb] border-[#fde68a] text-[#b45309]";
  return "bg-[#fdf0ee] border-[#f5c6c1] text-[#c0392b]";
}

function ScoreBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.round((value / max) * 100);
  const color = value >= 70 ? "#2d7d46" : value >= 50 ? "#b45309" : "#c0392b";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-12 h-1.5 bg-[#EEEEEE] rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className={`text-xs font-medium tabular-nums ${scoreColor(value)}`}>{value}</span>
    </div>
  );
}

function TierBadge({ tier }: { tier: string }) {
  return (
    <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded border ${TIER_COLOR[tier] ?? "bg-[#F4F4F4] text-[#5C5E62] border-[#EEEEEE]"}`}>
      {TIER_LABEL[tier] ?? tier}
    </span>
  );
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────

interface Filters {
  grossMarginMin: string;
  operatingMarginMin: string;
  revenueGrowthMin: string;
  debtToEquityMax: string;
  minScore: string;
}

const DEFAULT_FILTERS: Filters = {
  grossMarginMin: "20",
  operatingMarginMin: "5",
  revenueGrowthMin: "0",
  debtToEquityMax: "3.0",
  minScore: "30",
};

function FilterBar({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  function set(key: keyof Filters, val: string) {
    onChange({ ...filters, [key]: val });
  }

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl px-5 py-4 flex flex-wrap gap-4 items-end">
      <span className="text-xs font-semibold text-[#5C5E62] uppercase tracking-wide self-center">Filters</span>
      {[
        { key: "grossMarginMin" as const, label: "Gross Margin ≥", suffix: "%" },
        { key: "operatingMarginMin" as const, label: "Op. Margin ≥", suffix: "%" },
        { key: "revenueGrowthMin" as const, label: "Rev. Growth ≥", suffix: "%" },
        { key: "debtToEquityMax" as const, label: "Debt/Equity ≤", suffix: "" },
        { key: "minScore" as const, label: "Min Score", suffix: "" },
      ].map(({ key, label, suffix }) => (
        <div key={key} className="flex flex-col gap-1 min-w-[100px]">
          <label className="text-[10px] font-medium text-[#8E8E8E] uppercase tracking-wide">{label}</label>
          <div className="flex items-center border border-[#EEEEEE] rounded-lg overflow-hidden">
            <input
              type="number"
              value={filters[key]}
              onChange={e => set(key, e.target.value)}
              className="w-16 px-2 py-1.5 text-sm text-[#171A20] bg-white outline-none"
            />
            {suffix && <span className="px-2 text-xs text-[#8E8E8E] bg-[#F4F4F4] self-stretch flex items-center border-l border-[#EEEEEE]">{suffix}</span>}
          </div>
        </div>
      ))}
      <button
        onClick={() => onChange(DEFAULT_FILTERS)}
        className="text-xs text-[#3E6AE1] hover:underline self-end pb-1.5"
      >
        Reset
      </button>
    </div>
  );
}

// ─── Universe Table ───────────────────────────────────────────────────────────

type SortKey = "totalScore" | "businessQuality" | "growth" | "financialStrength" | "capitalAllocation" | "ticker" | "marketCap";

function UniverseTable({ entries, showAll = false }: { entries: ScoredEntry[]; showAll?: boolean }) {
  const [sortBy, setSortBy] = useState<SortKey>("totalScore");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [showCount, setShowCount] = useState(50);

  function toggleSort(key: SortKey) {
    if (sortBy === key) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortBy(key); setSortDir("desc"); }
  }

  const sorted = [...entries].sort((a, b) => {
    let av: number, bv: number;
    if (sortBy === "ticker") {
      av = 0; bv = 0;
      return sortDir === "asc" ? a.ticker.localeCompare(b.ticker) : b.ticker.localeCompare(a.ticker);
    }
    if (sortBy === "marketCap") {
      av = a.marketCap ?? 0;
      bv = b.marketCap ?? 0;
    } else {
      av = a.latestScore?.[sortBy as keyof typeof a.latestScore] as number ?? 0;
      bv = b.latestScore?.[sortBy as keyof typeof b.latestScore] as number ?? 0;
    }
    return sortDir === "desc" ? bv - av : av - bv;
  });

  const visible = showAll ? sorted : sorted.slice(0, showCount);

  function SortHeader({ col, label }: { col: SortKey; label: string }) {
    const active = sortBy === col;
    return (
      <th
        onClick={() => toggleSort(col)}
        className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-[#8E8E8E] cursor-pointer select-none hover:text-[#171A20] whitespace-nowrap"
      >
        {label} {active ? (sortDir === "desc" ? "↓" : "↑") : ""}
      </th>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-[#EEEEEE]">
        <table className="w-full text-sm">
          <thead className="bg-[#F4F4F4] border-b border-[#EEEEEE]">
            <tr>
              <SortHeader col="ticker" label="Ticker" />
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-[#8E8E8E]">Company</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-[#8E8E8E]">Tier</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-[#8E8E8E]">Sector</th>
              <SortHeader col="totalScore" label="Score" />
              <SortHeader col="businessQuality" label="Quality" />
              <SortHeader col="growth" label="Growth" />
              <SortHeader col="financialStrength" label="FinStr" />
              <SortHeader col="capitalAllocation" label="CapAlloc" />
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-[#8E8E8E]">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEEEEE]">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-sm text-[#8E8E8E]">No entries match the current filters.</td>
              </tr>
            ) : (
              visible.map(e => (
                <tr key={e.id} className="hover:bg-[#F9F9F9] transition-colors">
                  <td className="px-3 py-3">
                    <span className="font-semibold text-[#171A20] font-mono text-xs">{e.ticker}</span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-xs text-[#5C5E62] max-w-[140px] truncate block">{e.companyName}</span>
                  </td>
                  <td className="px-3 py-3">
                    <TierBadge tier={e.universeTier} />
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-xs text-[#8E8E8E]">{e.sector ?? "—"}</span>
                  </td>
                  <td className="px-3 py-3">
                    {e.latestScore ? (
                      <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded border ${scoreBg(e.latestScore.totalScore)}`}>
                        {e.latestScore.totalScore}
                      </span>
                    ) : <span className="text-xs text-[#CCCCCC]">—</span>}
                  </td>
                  <td className="px-3 py-3"><ScoreBar value={e.latestScore?.businessQuality ?? 0} /></td>
                  <td className="px-3 py-3"><ScoreBar value={e.latestScore?.growth ?? 0} /></td>
                  <td className="px-3 py-3"><ScoreBar value={e.latestScore?.financialStrength ?? 0} /></td>
                  <td className="px-3 py-3"><ScoreBar value={e.latestScore?.capitalAllocation ?? 0} /></td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1">
                      {e.inPortfolio && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#EEF3FD] text-[#3E6AE1] border border-[#bfcffd]">Owned</span>
                      )}
                      {e.inWatchlist && !e.inPortfolio && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#F4F4F4] text-[#5C5E62] border border-[#EEEEEE]">Watch</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {!showAll && sorted.length > showCount && (
        <button
          onClick={() => setShowCount(c => c + 50)}
          className="mt-3 text-xs text-[#3E6AE1] hover:underline"
        >
          Show more ({sorted.length - showCount} remaining)
        </button>
      )}
    </div>
  );
}

// ─── Research Queue ───────────────────────────────────────────────────────────

function ResearchQueue({ entries }: { entries: ScoredEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="bg-white border border-[#EEEEEE] rounded-xl p-6 text-center text-sm text-[#8E8E8E]">
        No candidates pass the current filters. Adjust thresholds to expand the queue.
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[#EEEEEE] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3E6AE1" strokeWidth="2">
            <path d="M9 12l2 2 4-4" /><path d="M21 12c0 4.97-4.03 9-9 9S3 16.97 3 12 7.03 3 12 3s9 4.03 9 9z" />
          </svg>
          <span className="text-sm font-semibold text-[#171A20]">Research Queue</span>
        </div>
        <span className="text-xs text-[#8E8E8E]">{entries.length} candidate{entries.length !== 1 ? "s" : ""} — not in portfolio</span>
      </div>
      <div className="divide-y divide-[#EEEEEE]">
        {entries.map((e, idx) => (
          <div key={e.id} className="px-5 py-3 flex items-center gap-4 hover:bg-[#F9F9F9]">
            <span className="text-xs font-medium text-[#8E8E8E] w-5 tabular-nums">{idx + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[#171A20] font-mono text-xs">{e.ticker}</span>
                <TierBadge tier={e.universeTier} />
                {e.inWatchlist && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#F4F4F4] text-[#5C5E62] border border-[#EEEEEE]">Watch</span>
                )}
              </div>
              <div className="text-xs text-[#8E8E8E] truncate mt-0.5">{e.companyName}{e.sector ? ` · ${e.sector}` : ""}</div>
            </div>
            {e.latestScore && (
              <div className="flex items-center gap-3 shrink-0">
                <div className="hidden sm:flex gap-2 text-xs text-[#8E8E8E]">
                  <span>Q <b className={scoreColor(e.latestScore.businessQuality)}>{e.latestScore.businessQuality}</b></span>
                  <span>G <b className={scoreColor(e.latestScore.growth)}>{e.latestScore.growth}</b></span>
                  <span>FS <b className={scoreColor(e.latestScore.financialStrength)}>{e.latestScore.financialStrength}</b></span>
                </div>
                <span className={`text-sm font-semibold tabular-nums ${scoreColor(e.latestScore.totalScore)}`}>
                  {e.latestScore.totalScore}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Add to Universe form ─────────────────────────────────────────────────────

function AddEntryForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    ticker: "", companyName: "", universeTier: "tier1", sector: "",
    exchange: "", country: "US", assetType: "equity",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/universe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? "Failed to add");
        return;
      }
      setForm({ ticker: "", companyName: "", universeTier: "tier1", sector: "", exchange: "", country: "US", assetType: "equity" });
      setOpen(false);
      onAdded();
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#3E6AE1] text-white text-xs font-medium hover:bg-[#2f55c7] transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Add Security
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="bg-white border border-[#EEEEEE] rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold text-[#171A20]">Add to Universe</span>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-[#8E8E8E] hover:text-[#171A20]">Cancel</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { key: "ticker", label: "Ticker *", placeholder: "AAPL" },
          { key: "companyName", label: "Company Name *", placeholder: "Apple Inc." },
          { key: "exchange", label: "Exchange", placeholder: "NASDAQ" },
          { key: "sector", label: "Sector", placeholder: "Technology" },
          { key: "country", label: "Country", placeholder: "US" },
        ].map(({ key, label, placeholder }) => (
          <div key={key} className="flex flex-col gap-1">
            <label className="text-[10px] font-medium text-[#8E8E8E] uppercase tracking-wide">{label}</label>
            <input
              value={form[key as keyof typeof form]}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              placeholder={placeholder}
              className="px-3 py-1.5 text-sm border border-[#EEEEEE] rounded-lg text-[#171A20] bg-white outline-none focus:border-[#3E6AE1]"
            />
          </div>
        ))}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-medium text-[#8E8E8E] uppercase tracking-wide">Tier *</label>
          <select
            value={form.universeTier}
            onChange={e => setForm(f => ({ ...f, universeTier: e.target.value }))}
            className="px-3 py-1.5 text-sm border border-[#EEEEEE] rounded-lg text-[#171A20] bg-white outline-none"
          >
            {Object.entries(TIER_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l} ({v})</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-medium text-[#8E8E8E] uppercase tracking-wide">Asset Type</label>
          <select
            value={form.assetType}
            onChange={e => setForm(f => ({ ...f, assetType: e.target.value }))}
            className="px-3 py-1.5 text-sm border border-[#EEEEEE] rounded-lg text-[#171A20] bg-white outline-none"
          >
            <option value="equity">Equity</option>
            <option value="etf">ETF</option>
          </select>
        </div>
      </div>
      <div className="flex justify-end pt-1">
        <button
          type="submit"
          disabled={saving || !form.ticker || !form.companyName}
          className="px-4 py-2 rounded-lg bg-[#3E6AE1] text-white text-xs font-medium hover:bg-[#2f55c7] disabled:opacity-50 transition-colors"
        >
          {saving ? "Adding…" : "Add to Universe"}
        </button>
      </div>
    </form>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = "all" | "tier1" | "tier2" | "tier3" | "tier4" | "tier5" | "queue";

const TABS: { id: Tab; label: string }[] = [
  { id: "queue",  label: "Research Queue" },
  { id: "all",    label: "All" },
  { id: "tier1",  label: "Large Cap" },
  { id: "tier2",  label: "Mid Cap" },
  { id: "tier3",  label: "Small Cap" },
  { id: "tier4",  label: "ETFs" },
  { id: "tier5",  label: "International" },
];

export default function ScreenerPage() {
  const [data, setData] = useState<ScreenerResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("queue");
  const [filters, setFilters] = useState<{
    grossMarginMin: string; operatingMarginMin: string;
    revenueGrowthMin: string; debtToEquityMax: string; minScore: string;
  }>({
    grossMarginMin: "20", operatingMarginMin: "5",
    revenueGrowthMin: "0", debtToEquityMax: "3.0", minScore: "30",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        grossMarginMin: filters.grossMarginMin,
        operatingMarginMin: filters.operatingMarginMin,
        revenueGrowthMin: filters.revenueGrowthMin,
        debtToEquityMax: filters.debtToEquityMax,
        minScore: filters.minScore,
      });
      const res = await fetch(`/api/screener?${params}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const tierEntries = (tier: string) => (data?.all ?? []).filter(e => e.universeTier === tier);
  const passedEntries = (tier?: string) => {
    const base = data?.passed ?? [];
    return tier ? base.filter(e => e.universeTier === tier) : base;
  };

  return (
    <div className="flex-1 min-h-screen bg-[#F4F4F4]">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-[#171A20]">Investment Universe</h1>
            <p className="text-sm text-[#8E8E8E] mt-1">Ranked securities across all tiers — discover opportunities before AI research is applied</p>
          </div>
          <AddEntryForm onAdded={load} />
        </div>

        {/* Stats row */}
        {data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Universe Size", value: data.stats.universeSize, sub: "active securities" },
              { label: "Passed Filters", value: data.stats.passedFilters, sub: "of " + data.stats.universeSize },
              { label: "Research Queue", value: data.stats.researchQueueSize, sub: "not in portfolio" },
              { label: "Large Cap", value: data.stats.byTier.tier1 ?? 0, sub: "tier 1 entries" },
            ].map(({ label, value, sub }) => (
              <div key={label} className="bg-white border border-[#EEEEEE] rounded-xl p-4">
                <div className="text-xs text-[#8E8E8E] font-medium mb-1">{label}</div>
                <div className="text-2xl font-medium tabular-nums text-[#171A20]">{value}</div>
                <div className="text-xs text-[#8E8E8E] mt-0.5">{sub}</div>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <FilterBar
          filters={filters}
          onChange={f => setFilters(f)}
        />

        {/* Tabs */}
        <div className="flex gap-1 border-b border-[#EEEEEE] overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab === t.id
                  ? "border-[#3E6AE1] text-[#3E6AE1]"
                  : "border-transparent text-[#5C5E62] hover:text-[#171A20]"
              }`}
            >
              {t.label}
              {t.id === "queue" && data && (
                <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#EEF3FD] text-[#3E6AE1]">
                  {data.stats.researchQueueSize}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center h-48 text-sm text-[#8E8E8E]">Loading universe…</div>
        ) : data ? (
          <div>
            {tab === "queue" && <ResearchQueue entries={data.researchQueue} />}
            {tab === "all" && <UniverseTable entries={data.all} />}
            {(["tier1","tier2","tier3","tier4","tier5"] as const).map(tier => (
              tab === tier && <UniverseTable key={tier} entries={tierEntries(tier)} />
            ))}
          </div>
        ) : (
          <div className="bg-white border border-[#EEEEEE] rounded-xl p-8 text-center text-sm text-[#8E8E8E]">
            Failed to load universe data.
          </div>
        )}

        {/* Architecture note */}
        <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-xl px-5 py-4 text-xs text-[#b45309]">
          <span className="font-semibold">Data Ingestion:</span> Universe data is manually managed or seeded. Full ingestion from SEC EDGAR, FMP, and Investor Relations pages is designed but not yet implemented. Fundamentals can be added via <code className="font-mono">PUT /api/universe/[ticker]/fundamentals</code>. Scores are computed via <code className="font-mono">POST /api/universe/[ticker]/score</code>.
        </div>

      </div>
    </div>
  );
}
