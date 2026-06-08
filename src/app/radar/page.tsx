"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { DiscoveryCandidateData, RadarSignal, ThemeSummary } from "@/lib/radar-engine";

type CandidateRow = DiscoveryCandidateData & {
  id: string; status: string; promotedAt: string | null;
  lastRefreshedAt: string; createdAt: string;
};

type Tab = "small_cap" | "mid_cap" | "themes" | "all";

// ─── Design tokens ────────────────────────────────────────────────────────────

const SCORE_COLOR = (s: number) =>
  s >= 65 ? "#2d7d46" : s >= 40 ? "#b45309" : "#5C5E62";

const CONFIDENCE_STYLE: Record<string, string> = {
  high:   "text-[#2d7d46] bg-[#eef7f1] border-[#c3e6cf]",
  medium: "text-[#b45309] bg-[#fffbeb] border-[#fde68a]",
  low:    "text-[#8E8E8E] bg-[#F4F4F4] border-[#EEEEEE]",
};

const CATEGORY_LABEL: Record<string, string> = {
  small_cap:         "Small Cap",
  mid_cap:           "Mid Cap",
  large_cap:         "Large Cap",
  etf:               "ETF",
  special_situation: "Special",
};

const SOURCE_LABEL: Record<string, string> = {
  opportunity_engine: "Opportunity",
  universe_quality:   "Quality Screen",
  sec_filings:        "SEC Filing",
  earnings:           "Earnings Beat",
  committee:          "Committee",
  sector_gap:         "Sector Gap",
  theme_momentum:     "Theme",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMcap(m: number | null): string {
  if (m == null || m === 0) return "—";
  if (m >= 1_000_000) return `$${(m / 1_000_000).toFixed(1)}T`;
  if (m >= 1_000) return `$${(m / 1_000).toFixed(0)}B`;
  return `$${m.toFixed(0)}M`;
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bg-[#EEEEEE] rounded-xl animate-pulse ${className}`} />;
}

// ─── Radar candidate card ─────────────────────────────────────────────────────

function CandidateCard({
  c, onPromote, onDismiss, promoting,
}: {
  c: CandidateRow;
  onPromote: (ticker: string) => void;
  onDismiss: (ticker: string) => void;
  promoting: string | null;
}) {
  const signals: RadarSignal[] = c.signals ?? [];
  const topSignals = signals.slice(0, 3);

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl p-5 hover:border-[#3E6AE1] transition-colors">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-semibold text-[#171A20]">{c.ticker}</span>
            <span className="text-xs text-[#8E8E8E] truncate max-w-[180px]">{c.companyName}</span>
            <span className="text-[10px] px-1.5 py-0.5 bg-[#F4F4F4] text-[#5C5E62] rounded border border-[#EEEEEE]">
              {CATEGORY_LABEL[c.category] ?? c.category}
            </span>
          </div>
          <div className="text-xs text-[#8E8E8E] mt-0.5">{fmtMcap(c.marketCap)}</div>
        </div>

        {/* Radar score circle */}
        <div className="shrink-0 text-center">
          <div className="text-2xl font-bold tabular-nums" style={{ color: SCORE_COLOR(c.radarScore) }}>
            {c.radarScore.toFixed(0)}
          </div>
          <div className="text-[10px] text-[#AAAAAA] uppercase tracking-wider">score</div>
        </div>
      </div>

      {/* Discovery reason */}
      <p className="text-sm text-[#5C5E62] mb-3">{c.discoveryReason}</p>

      {/* Themes */}
      {c.themes.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {c.themes.map(t => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 bg-[#EEF3FD] text-[#3E6AE1] rounded font-medium">{t}</span>
          ))}
        </div>
      )}

      {/* Signal chips */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${CONFIDENCE_STYLE[c.confidence]}`}>
          {c.confidence} confidence
        </span>
        {c.sources.map(s => (
          <span key={s} className="text-[10px] px-1.5 py-0.5 bg-[#F4F4F4] text-[#5C5E62] rounded border border-[#EEEEEE]">
            {SOURCE_LABEL[s] ?? s}
          </span>
        ))}
      </div>

      {/* Top signals */}
      {topSignals.length > 0 && (
        <div className="space-y-1 mb-4">
          {topSignals.map((sig, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-[#8E8E8E]">{sig.label}</span>
              <span className="font-medium text-[#5C5E62] tabular-nums">{sig.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => onPromote(c.ticker)}
          disabled={promoting === c.ticker || c.status === "promoted"}
          className="flex-1 px-3 py-1.5 bg-[#3E6AE1] text-white text-xs font-medium rounded-lg hover:bg-[#2f58c8] disabled:opacity-50 transition-colors"
        >
          {promoting === c.ticker ? "Generating…" : c.status === "promoted" ? "In Research" : "→ Research"}
        </button>
        <button
          onClick={() => onDismiss(c.ticker)}
          disabled={c.status === "dismissed"}
          className="px-3 py-1.5 text-xs text-[#8E8E8E] border border-[#EEEEEE] rounded-lg hover:bg-[#F4F4F4] disabled:opacity-30 transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

// ─── Theme card ───────────────────────────────────────────────────────────────

function ThemeCard({ t, onSelect }: { t: ThemeSummary; onSelect: (theme: string) => void }) {
  return (
    <button
      onClick={() => onSelect(t.theme)}
      className="w-full text-left bg-white border border-[#EEEEEE] rounded-xl p-4 hover:border-[#3E6AE1] transition-colors"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="text-sm font-semibold text-[#171A20]">{t.theme}</div>
          <div className="text-xs text-[#8E8E8E] mt-0.5">{t.candidateCount} candidate{t.candidateCount !== 1 ? "s" : ""}</div>
        </div>
        <div className="text-xl font-bold tabular-nums shrink-0" style={{ color: SCORE_COLOR(t.avgScore) }}>
          {t.avgScore.toFixed(0)}
        </div>
      </div>
      <p className="text-xs text-[#5C5E62] mb-2">{t.description}</p>
      <div className="flex flex-wrap gap-1">
        {t.topTickers.map(tk => (
          <span key={tk} className="text-[10px] px-1.5 py-0.5 bg-[#EEF3FD] text-[#3E6AE1] rounded font-medium">{tk}</span>
        ))}
      </div>
    </button>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onRefresh, refreshing }: { onRefresh: () => void; refreshing: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-12 h-12 rounded-xl bg-[#EEF3FD] flex items-center justify-center mb-4">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3E6AE1" strokeWidth="1.75">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
          <line x1="11" y1="8" x2="11" y2="14" />
          <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
      </div>
      <h2 className="text-base font-medium text-[#171A20]">No radar candidates yet</h2>
      <p className="text-sm text-[#8E8E8E] mt-1 mb-6 max-w-xs">
        Run Discovery Radar to surface investment ideas not yet in your portfolio or watchlist.
      </p>
      <button
        onClick={onRefresh}
        disabled={refreshing}
        className="px-5 py-2 bg-[#3E6AE1] text-white text-sm font-medium rounded-lg hover:bg-[#2f58c8] disabled:opacity-50 transition-colors"
      >
        {refreshing ? "Scanning…" : "Run Radar Scan"}
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RadarPage() {
  const [tab, setTab] = useState<Tab>("small_cap");
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [themes, setThemes] = useState<ThemeSummary[]>([]);
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [promoting, setPromoting] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);

  const loadCandidates = useCallback(() => {
    return fetch("/api/radar?status=active&limit=100")
      .then(r => r.ok ? r.json() : { candidates: [] })
      .then(d => {
        const list: CandidateRow[] = d.candidates ?? [];
        setCandidates(list);
        if (list.length > 0) {
          setLastRefreshed(list[0].lastRefreshedAt);
        }
      });
  }, []);

  const loadThemes = useCallback(() => {
    return fetch("/api/radar?summaries=true")
      .then(r => r.ok ? r.json() : { themes: [] })
      .then(d => setThemes(d.themes ?? []));
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadCandidates(), loadThemes()]).finally(() => setLoading(false));
  }, [loadCandidates, loadThemes]);

  const refresh = () => {
    setRefreshing(true);
    fetch("/api/radar", { method: "POST" })
      .then(() => Promise.all([loadCandidates(), loadThemes()]))
      .catch(() => {})
      .finally(() => setRefreshing(false));
  };

  const promote = (ticker: string) => {
    setPromoting(ticker);
    // Mark as promoted in DB, then navigate to research
    fetch("/api/radar", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker, status: "promoted" }),
    })
      .then(() => {
        // Trigger dossier generation (non-blocking), then navigate
        fetch(`/api/research/${ticker}/generate`, { method: "POST" }).catch(() => {});
        window.location.href = `/research?ticker=${ticker}`;
      })
      .catch(() => setPromoting(null));
  };

  const dismiss = (ticker: string) => {
    fetch("/api/radar", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker, status: "dismissed" }),
    }).then(() => setCandidates(prev => prev.filter(c => c.ticker !== ticker)));
  };

  // Derive filtered lists
  const smallCap = candidates.filter(c => c.category === "small_cap");
  const midCap = candidates.filter(c => c.category === "mid_cap");
  const themeCandidates = selectedTheme
    ? candidates.filter(c => c.themes.includes(selectedTheme))
    : [];
  const allSorted = [...candidates].sort((a, b) => b.radarScore - a.radarScore);

  const TAB_ITEMS: { key: Tab; label: string; count: number }[] = [
    { key: "small_cap", label: "Small Cap", count: smallCap.length },
    { key: "mid_cap",   label: "Mid Cap",   count: midCap.length },
    { key: "themes",    label: "Emerging Themes", count: themes.length },
    { key: "all",       label: "All Discoveries", count: allSorted.length },
  ];

  const activeList =
    tab === "small_cap" ? smallCap :
    tab === "mid_cap"   ? midCap :
    tab === "themes"    ? themeCandidates :
    allSorted;

  const fmtDate = (iso: string) => new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-6xl space-y-6">
        <Skeleton className="h-12 w-72" />
        <div className="flex gap-2"><Skeleton className="h-8 w-24" /><Skeleton className="h-8 w-24" /><Skeleton className="h-8 w-32" /></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-56" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium text-[#171A20]">Discovery Radar</h1>
          <p className="text-sm text-[#8E8E8E] mt-0.5">
            {candidates.length > 0
              ? `${candidates.length} candidates · last scanned ${lastRefreshed ? fmtDate(lastRefreshed) : "—"}`
              : "Surface emerging opportunities not yet in your workflow"}
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="px-4 py-2 text-sm text-[#3E6AE1] border border-[#3E6AE1] rounded-lg hover:bg-[#EEF3FD] disabled:opacity-50 transition-colors shrink-0"
        >
          {refreshing ? "Scanning…" : "Run Scan"}
        </button>
      </div>

      {candidates.length === 0 && !refreshing ? (
        <EmptyState onRefresh={refresh} refreshing={refreshing} />
      ) : (
        <>
          {/* Tabs */}
          <div className="flex gap-1 border-b border-[#EEEEEE]">
            {TAB_ITEMS.map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => { setTab(key); if (key !== "themes") setSelectedTheme(null); }}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  tab === key
                    ? "border-[#3E6AE1] text-[#3E6AE1]"
                    : "border-transparent text-[#8E8E8E] hover:text-[#171A20]"
                }`}
              >
                {label}
                {count > 0 && (
                  <span className="ml-1.5 text-[10px] px-1.5 py-0.5 bg-[#F4F4F4] text-[#8E8E8E] rounded-full">
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Themes tab — show theme cards first, then filtered candidates */}
          {tab === "themes" && (
            <div className="space-y-5">
              {!selectedTheme ? (
                <>
                  <p className="text-sm text-[#8E8E8E]">Select a theme to see matching candidates.</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {themes.map(t => (
                      <ThemeCard key={t.theme} t={t} onSelect={setSelectedTheme} />
                    ))}
                  </div>
                  {themes.length === 0 && (
                    <p className="text-sm text-[#8E8E8E] text-center py-12">Run a radar scan to populate theme data.</p>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setSelectedTheme(null)} className="text-sm text-[#3E6AE1] hover:underline">← Themes</button>
                    <span className="text-sm font-medium text-[#171A20]">{selectedTheme}</span>
                    <span className="text-xs text-[#8E8E8E]">{themeCandidates.length} candidate{themeCandidates.length !== 1 ? "s" : ""}</span>
                  </div>
                  {themeCandidates.length === 0 ? (
                    <p className="text-sm text-[#8E8E8E] py-12 text-center">No candidates match this theme in the current radar scan.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {themeCandidates.map(c => (
                        <CandidateCard key={c.ticker} c={c} onPromote={promote} onDismiss={dismiss} promoting={promoting} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Other tabs — candidate grid */}
          {tab !== "themes" && (
            <div>
              {activeList.length === 0 ? (
                <p className="text-sm text-[#8E8E8E] text-center py-16">
                  No {tab === "small_cap" ? "small cap" : tab === "mid_cap" ? "mid cap" : ""} candidates in current scan.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeList.map(c => (
                    <CandidateCard key={c.ticker} c={c} onPromote={promote} onDismiss={dismiss} promoting={promoting} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
