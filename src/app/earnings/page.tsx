"use client";
import { useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EarningsEvent {
  id: string;
  ticker: string;
  fiscalPeriod: string | null;
  fiscalQuarter: number | null;
  fiscalYear: number | null;
  reportDate: string | null;
  reportTime: string | null;
  epsActual: number | null;
  epsEstimate: number | null;
  revenueActual: number | null;
  revenueEstimate: number | null;
  guidanceSummary: string | null;
  managementCommentary: string | null;
  thesisImpact: string | null;
  keyMetrics: Record<string, string | number> | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function fmtUsd(n: number | null, decimals = 0) {
  if (n == null) return "—";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function beatMiss(actual: number | null, estimate: number | null): { label: string; color: string } | null {
  if (actual == null || estimate == null) return null;
  const beat = actual > estimate;
  return beat
    ? { label: "Beat", color: "#15803D" }
    : { label: "Miss", color: "#DC2626" };
}

const IMPACT_COLOR: Record<string, string> = {
  positive: "#15803D",
  negative: "#DC2626",
  neutral:  "#8E8E8E",
};

// ─── Add Manual Earnings Form ─────────────────────────────────────────────────

function AddEarningsForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [ticker, setTicker] = useState("");
  const [fiscalQ, setFiscalQ] = useState("1");
  const [fiscalY, setFiscalY] = useState(String(new Date().getFullYear()));
  const [epsActual, setEpsActual] = useState("");
  const [epsEstimate, setEpsEstimate] = useState("");
  const [revActual, setRevActual] = useState("");
  const [revEstimate, setRevEstimate] = useState("");
  const [guidance, setGuidance] = useState("");
  const [commentary, setCommentary] = useState("");
  const [reportTime, setReportTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!ticker.trim()) { setError("Ticker is required"); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/earnings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: ticker.trim().toUpperCase(),
          fiscalQuarter: parseInt(fiscalQ),
          fiscalYear: parseInt(fiscalY),
          reportDate: new Date().toISOString().slice(0, 10),
          reportTime: reportTime || null,
          epsActual: epsActual ? parseFloat(epsActual) : null,
          epsEstimate: epsEstimate ? parseFloat(epsEstimate) : null,
          revenueActual: revActual ? parseFloat(revActual) : null,
          revenueEstimate: revEstimate ? parseFloat(revEstimate) : null,
          guidanceSummary: guidance || null,
          managementCommentary: commentary || null,
          transcript: null,
          keyMetrics: null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setOpen(false);
      setTicker(""); setEpsActual(""); setEpsEstimate(""); setRevActual(""); setRevEstimate("");
      setGuidance(""); setCommentary(""); setReportTime("");
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm font-medium px-4 py-2 rounded-lg border border-[#EEEEEE] bg-white text-[#3E6AE1] hover:border-[#3E6AE1] transition-colors"
      >
        + Add Earnings
      </button>
    );
  }

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl p-4 space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-[#8E8E8E]">Add Earnings Event</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} placeholder="Ticker*" className="col-span-2 text-sm border border-[#EEEEEE] rounded-lg px-3 py-2 focus:outline-none focus:border-[#3E6AE1] placeholder-[#AAAAAA]" />
        <select value={fiscalQ} onChange={e => setFiscalQ(e.target.value)} className="text-sm border border-[#EEEEEE] rounded-lg px-3 py-2 focus:outline-none focus:border-[#3E6AE1]">
          {[1,2,3,4].map(q => <option key={q} value={q}>Q{q}</option>)}
        </select>
        <input value={fiscalY} onChange={e => setFiscalY(e.target.value)} placeholder="Year" className="text-sm border border-[#EEEEEE] rounded-lg px-3 py-2 focus:outline-none focus:border-[#3E6AE1] placeholder-[#AAAAAA]" />
        <select value={reportTime} onChange={e => setReportTime(e.target.value)} className="text-sm border border-[#EEEEEE] rounded-lg px-3 py-2 focus:outline-none focus:border-[#3E6AE1]">
          <option value="">Time —</option>
          <option value="BMO">BMO</option>
          <option value="AMC">AMC</option>
        </select>
        <input value={epsActual} onChange={e => setEpsActual(e.target.value)} placeholder="EPS Actual" className="text-sm border border-[#EEEEEE] rounded-lg px-3 py-2 focus:outline-none focus:border-[#3E6AE1] placeholder-[#AAAAAA]" />
        <input value={epsEstimate} onChange={e => setEpsEstimate(e.target.value)} placeholder="EPS Estimate" className="text-sm border border-[#EEEEEE] rounded-lg px-3 py-2 focus:outline-none focus:border-[#3E6AE1] placeholder-[#AAAAAA]" />
        <input value={revActual} onChange={e => setRevActual(e.target.value)} placeholder="Revenue Actual ($M)" className="text-sm border border-[#EEEEEE] rounded-lg px-3 py-2 focus:outline-none focus:border-[#3E6AE1] placeholder-[#AAAAAA]" />
        <input value={revEstimate} onChange={e => setRevEstimate(e.target.value)} placeholder="Revenue Estimate ($M)" className="text-sm border border-[#EEEEEE] rounded-lg px-3 py-2 focus:outline-none focus:border-[#3E6AE1] placeholder-[#AAAAAA]" />
      </div>
      <input value={guidance} onChange={e => setGuidance(e.target.value)} placeholder="Guidance summary (optional)" className="w-full text-sm border border-[#EEEEEE] rounded-lg px-3 py-2 focus:outline-none focus:border-[#3E6AE1] placeholder-[#AAAAAA]" />
      <textarea value={commentary} onChange={e => setCommentary(e.target.value)} placeholder="Management commentary (optional)" rows={2} className="w-full text-sm border border-[#EEEEEE] rounded-lg px-3 py-2 focus:outline-none focus:border-[#3E6AE1] placeholder-[#AAAAAA] resize-none" />
      {error && <p className="text-xs text-[#DC2626]">{error}</p>}
      <div className="flex gap-2">
        <button onClick={handleSubmit} disabled={loading}
          className="text-sm font-medium px-4 py-2 rounded-lg text-white transition-opacity"
          style={{ backgroundColor: "#3E6AE1", opacity: loading ? 0.6 : 1 }}>
          {loading ? "Saving…" : "Save"}
        </button>
        <button onClick={() => setOpen(false)} className="text-sm text-[#5C5E62] px-4 py-2 rounded-lg hover:bg-[#F4F4F4]">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Earnings Row ─────────────────────────────────────────────────────────────

function EarningsRow({ event }: { event: EarningsEvent }) {
  const [open, setOpen] = useState(false);
  const epsBeat = beatMiss(event.epsActual, event.epsEstimate);
  const revBeat = beatMiss(event.revenueActual, event.revenueEstimate);

  return (
    <div className="border-b border-[#EEEEEE] last:border-0">
      <button
        className="w-full text-left px-4 py-3 hover:bg-[#F9F9F9] transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-[#3E6AE1] w-14 shrink-0">{event.ticker}</span>
          <span className="text-xs bg-[#F4F4F4] text-[#5C5E62] px-2 py-0.5 rounded font-medium">
            {event.fiscalPeriod ?? `Q${event.fiscalQuarter} ${event.fiscalYear}`}
          </span>
          {event.reportTime && (
            <span className="text-xs bg-[#F4F4F4] text-[#5C5E62] px-2 py-0.5 rounded font-medium uppercase">
              {event.reportTime}
            </span>
          )}
          <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-2 min-w-0">
            <div className="text-xs text-[#5C5E62]">
              EPS: <span className="font-medium text-[#171A20]">{event.epsActual != null ? `$${event.epsActual}` : "—"}</span>
              {epsBeat && <span className="ml-1 font-semibold" style={{ color: epsBeat.color }}>{epsBeat.label}</span>}
            </div>
            <div className="text-xs text-[#5C5E62]">
              Rev: <span className="font-medium text-[#171A20]">{fmtUsd(event.revenueActual, 0)}M</span>
              {revBeat && <span className="ml-1 font-semibold" style={{ color: revBeat.color }}>{revBeat.label}</span>}
            </div>
            <div className="text-xs text-[#5C5E62]">
              {fmtDate(event.reportDate)}
            </div>
            {event.thesisImpact && (
              <div className="text-xs font-medium" style={{ color: IMPACT_COLOR[event.thesisImpact] ?? "#8E8E8E" }}>
                {event.thesisImpact}
              </div>
            )}
          </div>
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
          {/* Metrics grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "EPS Actual", val: event.epsActual != null ? `$${event.epsActual}` : "—" },
              { label: "EPS Estimate", val: event.epsEstimate != null ? `$${event.epsEstimate}` : "—" },
              { label: "Revenue Actual", val: fmtUsd(event.revenueActual, 0) + (event.revenueActual != null ? "M" : "") },
              { label: "Revenue Estimate", val: fmtUsd(event.revenueEstimate, 0) + (event.revenueEstimate != null ? "M" : "") },
            ].map(m => (
              <div key={m.label} className="bg-white border border-[#EEEEEE] rounded-lg p-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8E8E8E]">{m.label}</div>
                <div className="text-sm font-bold text-[#171A20] mt-0.5">{m.val}</div>
              </div>
            ))}
          </div>

          {event.guidanceSummary && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8E8E8E] mb-1">Guidance</div>
              <p className="text-sm text-[#5C5E62] leading-relaxed">{event.guidanceSummary}</p>
            </div>
          )}

          {event.managementCommentary && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8E8E8E] mb-1">Management Commentary</div>
              <p className="text-sm text-[#5C5E62] leading-relaxed">{event.managementCommentary}</p>
            </div>
          )}

          {event.keyMetrics && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8E8E8E] mb-1">Key Metrics</div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {Object.entries(event.keyMetrics).map(([k, v]) => (
                  <div key={k} className="bg-white border border-[#EEEEEE] rounded-lg p-2">
                    <div className="text-[10px] text-[#8E8E8E]">{k.replace(/_/g, " ")}</div>
                    <div className="text-sm font-semibold text-[#171A20]">{String(v)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EarningsPage() {
  const [events, setEvents] = useState<EarningsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterTicker, setFilterTicker] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (filterTicker.trim()) params.set("ticker", filterTicker.trim().toUpperCase());
      const res = await fetch(`/api/earnings?${params}`);
      if (!res.ok) throw new Error(`Failed to load earnings (${res.status})`);
      const data = await res.json();
      setEvents(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load earnings");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [filterTicker]);

  const beats = events.filter(e => e.epsActual != null && e.epsEstimate != null && e.epsActual > e.epsEstimate).length;
  const misses = events.filter(e => e.epsActual != null && e.epsEstimate != null && e.epsActual <= e.epsEstimate).length;

  return (
    <div className="min-h-screen bg-[#F4F4F4]">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-[#171A20]">Earnings</h1>
            <p className="text-sm text-[#8E8E8E] mt-0.5">Earnings events with thesis impact tracking</p>
          </div>
          <a href="/filings" className="text-sm text-[#3E6AE1] hover:underline">
            SEC Filings →
          </a>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border border-[#EEEEEE] rounded-xl p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8E8E8E]">Events</div>
            <div className="text-2xl font-bold text-[#171A20] mt-1">{events.length}</div>
          </div>
          <div className="bg-white border border-[#EEEEEE] rounded-xl p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8E8E8E]">EPS Beats</div>
            <div className="text-2xl font-bold mt-1" style={{ color: "#15803D" }}>{beats}</div>
          </div>
          <div className="bg-white border border-[#EEEEEE] rounded-xl p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8E8E8E]">EPS Misses</div>
            <div className="text-2xl font-bold mt-1" style={{ color: "#DC2626" }}>{misses}</div>
          </div>
        </div>

        {/* Add form + filter */}
        <div className="flex flex-wrap items-center gap-2">
          <AddEarningsForm onAdded={load} />
          <input
            type="text"
            value={filterTicker}
            onChange={e => setFilterTicker(e.target.value)}
            placeholder="Filter by ticker…"
            className="text-sm border border-[#EEEEEE] rounded-lg px-3 py-2 w-36 focus:outline-none focus:border-[#3E6AE1] placeholder-[#AAAAAA] bg-white"
          />
        </div>

        {/* Table */}
        <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-10 text-center text-sm text-[#8E8E8E]">Loading earnings…</div>
          ) : error ? (
            <div className="p-10 text-center">
              <p className="text-sm font-medium text-red-600">Failed to load earnings</p>
              <p className="text-xs text-[#8E8E8E] mt-1">{error}</p>
              <button
                onClick={load}
                className="mt-3 text-xs font-medium text-[#5C5E62] border border-[#EEEEEE] rounded-lg px-3 py-1.5 hover:bg-[#F9F9F9]"
              >
                Retry
              </button>
            </div>
          ) : events.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm font-medium text-[#5C5E62]">No earnings events found</p>
              <p className="text-xs text-[#8E8E8E] mt-1">
                Add events manually or run SEC ingestion to extract from 8-K filings.
              </p>
            </div>
          ) : (
            <div>
              <div className="px-4 py-2.5 border-b border-[#EEEEEE] bg-[#F9F9F9]">
                <span className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide">
                  {events.length} event{events.length !== 1 ? "s" : ""}
                </span>
              </div>
              {events.map(e => <EarningsRow key={e.id} event={e} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
