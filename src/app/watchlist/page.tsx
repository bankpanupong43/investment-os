"use client";
import { useEffect, useState } from "react";

interface WatchlistItem {
  id: string;
  ticker: string;
  name: string | null;
  interestReason: string;
  draftThesis: string | null;
  targetEntryPrice: number | null;
  addedAt: string;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmt(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const INPUT_CLS = "w-full bg-white border border-[#EEEEEE] text-[#171A20] text-sm rounded px-3 py-2 focus:outline-none focus:border-[#3E6AE1] placeholder:text-[#8E8E8E]";

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState({
    ticker: "",
    name: "",
    interestReason: "",
    draftThesis: "",
    targetEntryPrice: "",
  });

  useEffect(() => {
    fetch("/api/watchlist")
      .then(r => r.json())
      .then(d => setItems(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.ticker.trim() || !form.interestReason.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: form.ticker.toUpperCase().trim(),
          name: form.name.trim() || null,
          interestReason: form.interestReason.trim(),
          draftThesis: form.draftThesis.trim() || null,
          targetEntryPrice: form.targetEntryPrice ? parseFloat(form.targetEntryPrice) : null,
        }),
      });
      if (res.ok) {
        const created = await res.json();
        setItems(prev => [created, ...prev]);
        setForm({ ticker: "", name: "", interestReason: "", draftThesis: "", targetEntryPrice: "" });
        setShowForm(false);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 lg:p-8 space-y-4 max-w-5xl">
        <div className="h-7 w-48 bg-[#EEEEEE] rounded animate-pulse" />
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-[#EEEEEE] rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-5 max-w-5xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium text-[#171A20]">Watchlist</h1>
          <p className="text-[#8E8E8E] text-sm mt-0.5">{items.length} idea{items.length !== 1 ? "s" : ""} being tracked</p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          style={{ transition: "background-color 0.33s" }}
          className="bg-[#3E6AE1] hover:bg-[#2d5bc7] text-white px-5 py-2 rounded text-sm font-medium"
        >
          + Add Ticker
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-[#EEEEEE] rounded-xl p-5 space-y-4">
          <h2 className="font-medium text-[#171A20] text-sm">Add to Watchlist</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#8E8E8E] font-medium mb-1.5">Ticker *</label>
              <input
                type="text"
                value={form.ticker}
                onChange={e => setForm(f => ({ ...f, ticker: e.target.value.toUpperCase() }))}
                placeholder="AAPL"
                required
                className={INPUT_CLS}
              />
            </div>
            <div>
              <label className="block text-xs text-[#8E8E8E] font-medium mb-1.5">Company Name</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Apple Inc."
                className={INPUT_CLS}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-[#8E8E8E] font-medium mb-1.5">Interest Reason *</label>
            <textarea
              value={form.interestReason}
              onChange={e => setForm(f => ({ ...f, interestReason: e.target.value }))}
              placeholder="Why are you watching this?"
              rows={2}
              required
              className={`${INPUT_CLS} resize-y`}
            />
          </div>
          <div>
            <label className="block text-xs text-[#8E8E8E] font-medium mb-1.5">Draft Thesis</label>
            <textarea
              value={form.draftThesis}
              onChange={e => setForm(f => ({ ...f, draftThesis: e.target.value }))}
              placeholder="Early investment thesis..."
              rows={3}
              className={`${INPUT_CLS} resize-y`}
            />
          </div>
          <div className="sm:w-48">
            <label className="block text-xs text-[#8E8E8E] font-medium mb-1.5">Target Entry Price</label>
            <input
              type="number"
              value={form.targetEntryPrice}
              onChange={e => setForm(f => ({ ...f, targetEntryPrice: e.target.value }))}
              placeholder="150.00"
              step="0.01"
              min="0"
              className={INPUT_CLS}
            />
          </div>
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              style={{ transition: "color 0.33s" }}
              className="px-4 py-2 text-sm text-[#8E8E8E] hover:text-[#393C41]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !form.ticker.trim() || !form.interestReason.trim()}
              style={{ transition: "background-color 0.33s" }}
              className="bg-[#3E6AE1] hover:bg-[#2d5bc7] disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2 rounded text-sm font-medium"
            >
              {submitting ? "Adding..." : "Add to Watchlist"}
            </button>
          </div>
        </form>
      )}

      {/* Items */}
      {items.length === 0 ? (
        <div className="bg-white border border-[#EEEEEE] rounded-xl p-10 text-center space-y-2">
          <div className="text-[#393C41] font-medium">Watchlist is empty</div>
          <div className="text-sm text-[#8E8E8E]">Add tickers you're monitoring for potential entry.</div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map(item => (
            <div
              key={item.id}
              style={{ transition: "border-color 0.33s" }}
              className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden hover:border-[#D0D1D2]"
            >
              <div className="px-5 py-4 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-medium text-[#171A20] text-lg">{item.ticker}</span>
                    {item.name && <span className="text-sm text-[#8E8E8E]">{item.name}</span>}
                    {item.targetEntryPrice != null && (
                      <span className="text-xs text-[#2d7d46] bg-[#eef7f1] px-2 py-0.5 rounded">
                        Target: {fmt(item.targetEntryPrice)}
                      </span>
                    )}
                    <span className="text-xs text-[#D0D1D2] ml-auto">{fmtDate(item.addedAt)}</span>
                  </div>
                  <p className="text-sm text-[#5C5E62] mt-1.5 line-clamp-2">{item.interestReason}</p>
                </div>
                {item.draftThesis && (
                  <button
                    onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                    style={{ transition: "color 0.33s" }}
                    className="text-xs text-[#3E6AE1] hover:text-[#2d5bc7] font-medium shrink-0"
                  >
                    {expanded === item.id ? "Hide ↑" : "Thesis ↓"}
                  </button>
                )}
              </div>

              {expanded === item.id && item.draftThesis && (
                <div className="border-t border-[#EEEEEE] px-5 py-4 bg-[#F4F4F4]">
                  <div className="text-xs text-[#8E8E8E] font-medium mb-2">Draft Thesis</div>
                  <p className="text-sm text-[#393C41] leading-relaxed whitespace-pre-line">{item.draftThesis}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
