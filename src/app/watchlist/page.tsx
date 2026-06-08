"use client";
import { useEffect, useState, useCallback } from "react";

type WatchlistStatus = "watching" | "researching" | "high_conviction" | "rejected" | "owned";

interface WatchlistItem {
  id: string;
  ticker: string;
  name: string | null;
  status: WatchlistStatus;
  interestReason: string;
  notes: string | null;
  draftThesis: string | null;
  targetEntryPrice: number | null;
  addedAt: string;
  updatedAt: string;
}

const STATUS_LABELS: Record<WatchlistStatus, string> = {
  watching:        "Watching",
  researching:     "Researching",
  high_conviction: "High Conviction",
  rejected:        "Rejected",
  owned:           "Owned",
};

const STATUS_STYLE: Record<WatchlistStatus, { bg: string; text: string; border: string }> = {
  watching:        { bg: "bg-[#EEF3FD]",  text: "text-[#3E6AE1]",  border: "border-[#dce8fb]" },
  researching:     { bg: "bg-[#fffbeb]",  text: "text-[#b45309]",  border: "border-[#fde68a]" },
  high_conviction: { bg: "bg-[#eef7f1]",  text: "text-[#2d7d46]",  border: "border-[#c3e6cf]" },
  rejected:        { bg: "bg-[#fdf0ee]",  text: "text-[#c0392b]",  border: "border-[#f5c6c1]" },
  owned:           { bg: "bg-[#F4F4F4]",  text: "text-[#5C5E62]",  border: "border-[#EEEEEE]" },
};

const STATUS_ORDER: WatchlistStatus[] = ["high_conviction", "researching", "watching", "owned", "rejected"];

const INPUT_CLS = "w-full bg-white border border-[#EEEEEE] text-[#171A20] text-sm rounded px-3 py-2 focus:outline-none focus:border-[#3E6AE1] placeholder:text-[#8E8E8E]";

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function StatusBadge({ status }: { status: WatchlistStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${s.bg} ${s.text} ${s.border}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

// ─── Edit modal ───────────────────────────────────────────────────────────────

interface EditForm {
  status: WatchlistStatus;
  interestReason: string;
  notes: string;
  draftThesis: string;
  targetEntryPrice: string;
}

function EditModal({ item, onSave, onClose }: {
  item: WatchlistItem;
  onSave: (updated: WatchlistItem) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<EditForm>({
    status: item.status,
    interestReason: item.interestReason,
    notes: item.notes ?? "",
    draftThesis: item.draftThesis ?? "",
    targetEntryPrice: item.targetEntryPrice != null ? String(item.targetEntryPrice) : "",
  });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/watchlist/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: form.status,
          interestReason: form.interestReason.trim(),
          notes: form.notes.trim() || null,
          draftThesis: form.draftThesis.trim() || null,
          targetEntryPrice: form.targetEntryPrice ? parseFloat(form.targetEntryPrice) : null,
        }),
      });
      if (res.ok) {
        onSave(await res.json());
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[#EEEEEE] flex items-center justify-between">
          <div>
            <span className="font-semibold text-[#171A20]">{item.ticker}</span>
            {item.name && <span className="text-sm text-[#8E8E8E] ml-2">{item.name}</span>}
          </div>
          <button onClick={onClose} className="text-[#AAAAAA] hover:text-[#5C5E62] text-lg leading-none">×</button>
        </div>
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-xs text-[#8E8E8E] font-semibold uppercase mb-1.5">Status</label>
            <div className="flex flex-wrap gap-1.5">
              {(Object.entries(STATUS_LABELS) as [WatchlistStatus, string][]).map(([s, label]) => (
                <button
                  key={s}
                  onClick={() => setForm(f => ({ ...f, status: s }))}
                  className={`text-xs font-semibold px-2.5 py-1 rounded border transition-all ${
                    form.status === s
                      ? `${STATUS_STYLE[s].bg} ${STATUS_STYLE[s].text} ${STATUS_STYLE[s].border}`
                      : "bg-white text-[#8E8E8E] border-[#EEEEEE] hover:border-[#AAAAAA]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-[#8E8E8E] font-semibold uppercase mb-1.5">Reason Watching</label>
            <textarea
              value={form.interestReason}
              onChange={e => setForm(f => ({ ...f, interestReason: e.target.value }))}
              rows={2}
              className={`${INPUT_CLS} resize-y`}
            />
          </div>
          <div>
            <label className="block text-xs text-[#8E8E8E] font-semibold uppercase mb-1.5">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Additional observations, price levels, catalysts..."
              rows={2}
              className={`${INPUT_CLS} resize-y`}
            />
          </div>
          <div>
            <label className="block text-xs text-[#8E8E8E] font-semibold uppercase mb-1.5">Draft Thesis</label>
            <textarea
              value={form.draftThesis}
              onChange={e => setForm(f => ({ ...f, draftThesis: e.target.value }))}
              placeholder="Early investment thesis..."
              rows={3}
              className={`${INPUT_CLS} resize-y`}
            />
          </div>
          <div className="sm:w-48">
            <label className="block text-xs text-[#8E8E8E] font-semibold uppercase mb-1.5">Target Entry Price</label>
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
        </div>
        <div className="px-5 py-4 border-t border-[#EEEEEE] flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[#8E8E8E] hover:text-[#393C41]">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving || !form.interestReason.trim()}
            className="px-5 py-2 text-sm font-medium bg-[#3E6AE1] hover:bg-[#2d5bc7] disabled:opacity-40 text-white rounded-lg"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add form ─────────────────────────────────────────────────────────────────

interface AddForm {
  ticker: string;
  name: string;
  status: WatchlistStatus;
  interestReason: string;
  notes: string;
  draftThesis: string;
  targetEntryPrice: string;
}

const EMPTY_ADD: AddForm = { ticker: "", name: "", status: "watching", interestReason: "", notes: "", draftThesis: "", targetEntryPrice: "" };

// ─── Watchlist item card ──────────────────────────────────────────────────────

function WatchlistCard({
  item,
  onUpdated,
  onRemoved,
}: {
  item: WatchlistItem;
  onUpdated: (updated: WatchlistItem) => void;
  onRemoved: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [researchState, setResearchState] = useState<"idle" | "generating" | "done">("idle");

  async function handleDelete() {
    if (!confirm(`Remove ${item.ticker} from watchlist?`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/watchlist/${item.id}`, { method: "DELETE" });
      onRemoved(item.id);
    } finally {
      setDeleting(false);
    }
  }

  async function handleGenerateResearch() {
    setResearchState("generating");
    try {
      const res = await fetch(`/api/research/${item.ticker}/generate`, { method: "POST" });
      setResearchState(res.ok ? "done" : "idle");
    } catch {
      setResearchState("idle");
    }
  }

  return (
    <>
      {editing && (
        <EditModal
          item={item}
          onSave={(updated) => { onUpdated(updated); setEditing(false); }}
          onClose={() => setEditing(false)}
        />
      )}
      <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden hover:border-[#D0D1D2] transition-colors">
        <div className="px-5 py-4">
          {/* Header row */}
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-[#171A20] text-base">{item.ticker}</span>
                {item.name && <span className="text-sm text-[#8E8E8E]">{item.name}</span>}
                <StatusBadge status={item.status} />
                {item.targetEntryPrice != null && (
                  <span className="text-[10px] text-[#2d7d46] bg-[#eef7f1] border border-[#c3e6cf] px-1.5 py-0.5 rounded">
                    Target ${item.targetEntryPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                )}
              </div>
              <p className="text-sm text-[#5C5E62] mt-1.5">{item.interestReason}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setEditing(true)}
                className="text-xs px-2.5 py-1 rounded border border-[#EEEEEE] text-[#8E8E8E] hover:border-[#3E6AE1] hover:text-[#3E6AE1] transition-colors"
              >
                Edit
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-xs px-2.5 py-1 rounded border border-[#EEEEEE] text-[#8E8E8E] hover:border-[#c0392b] hover:text-[#c0392b] transition-colors disabled:opacity-40"
              >
                {deleting ? "…" : "Remove"}
              </button>
            </div>
          </div>

          {/* Notes */}
          {item.notes && (
            <div className="mt-2 text-xs text-[#5C5E62] bg-[#F4F4F4] rounded-lg px-3 py-2">
              {item.notes}
            </div>
          )}

          {/* Draft thesis */}
          {item.draftThesis && (
            <div className="mt-2 border-t border-[#F4F4F4] pt-2">
              <div className="text-[10px] text-[#AAAAAA] font-semibold uppercase mb-1">Draft Thesis</div>
              <p className="text-xs text-[#393C41] leading-relaxed whitespace-pre-line">{item.draftThesis}</p>
            </div>
          )}

          {/* Footer: dates + quick actions */}
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <span className="text-[10px] text-[#AAAAAA]">Added {fmtDate(item.addedAt)}</span>
            {item.updatedAt !== item.addedAt && (
              <span className="text-[10px] text-[#AAAAAA]">· Updated {fmtDate(item.updatedAt)}</span>
            )}
            <div className="ml-auto flex gap-2">
              {researchState === "done" ? (
                <a href="/research"
                  className="text-xs font-medium px-2.5 py-1 rounded border border-[#BBF7D0] text-[#15803D] hover:bg-[#F0FDF4] transition-colors">
                  View Research →
                </a>
              ) : (
                <button
                  onClick={handleGenerateResearch}
                  disabled={researchState === "generating"}
                  className="text-xs font-medium px-2.5 py-1 rounded border border-[#EEEEEE] text-[#5C5E62] hover:border-[#3E6AE1] hover:text-[#3E6AE1] transition-colors disabled:opacity-50"
                >
                  {researchState === "generating" ? "Generating…" : "Generate Research"}
                </button>
              )}
              <a
                href={`/committee?ticker=${item.ticker}`}
                className="text-xs font-medium px-2.5 py-1 rounded border border-[#EEEEEE] text-[#5C5E62] hover:border-[#7C3AED] hover:text-[#7C3AED] transition-colors"
              >
                Committee Review
              </a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type FilterStatus = WatchlistStatus | "all";

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [form, setForm] = useState<AddForm>(EMPTY_ADD);

  useEffect(() => {
    fetch("/api/watchlist")
      .then(r => r.json())
      .then(d => setItems(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, []);

  const handleUpdated = useCallback((updated: WatchlistItem) => {
    setItems(prev => prev.map(i => i.id === updated.id ? updated : i));
  }, []);

  const handleRemoved = useCallback((id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
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
          status: form.status,
          interestReason: form.interestReason.trim(),
          notes: form.notes.trim() || null,
          draftThesis: form.draftThesis.trim() || null,
          targetEntryPrice: form.targetEntryPrice ? parseFloat(form.targetEntryPrice) : null,
        }),
      });
      if (res.ok) {
        const created = await res.json();
        setItems(prev => [created, ...prev]);
        setForm(EMPTY_ADD);
        setShowForm(false);
      } else {
        const body = await res.json();
        alert(body.error ?? "Failed to add to watchlist");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const filtered = filterStatus === "all"
    ? [...items].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))
    : items.filter(i => i.status === filterStatus);

  const counts = items.reduce<Record<string, number>>((acc, i) => {
    acc[i.status] = (acc[i.status] ?? 0) + 1;
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="p-6 lg:p-8 space-y-4 max-w-3xl">
        <div className="h-7 w-48 bg-[#EEEEEE] rounded animate-pulse" />
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-[#EEEEEE] rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-5 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-medium text-[#171A20]">Watchlist</h1>
          <p className="text-sm text-[#8E8E8E] mt-0.5">{items.length} idea{items.length !== 1 ? "s" : ""} tracked</p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="bg-[#3E6AE1] hover:bg-[#2d5bc7] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shrink-0"
        >
          + Add Ticker
        </button>
      </div>

      {/* Status filter pills */}
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFilterStatus("all")}
            className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${filterStatus === "all" ? "bg-[#171A20] text-white border-[#171A20]" : "text-[#5C5E62] border-[#EEEEEE] hover:border-[#AAAAAA]"}`}
          >
            All {items.length}
          </button>
          {(Object.entries(STATUS_LABELS) as [WatchlistStatus, string][])
            .filter(([s]) => counts[s])
            .map(([s, label]) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                  filterStatus === s
                    ? `${STATUS_STYLE[s].bg} ${STATUS_STYLE[s].text} ${STATUS_STYLE[s].border}`
                    : "text-[#5C5E62] border-[#EEEEEE] hover:border-[#AAAAAA]"
                }`}
              >
                {label} {counts[s]}
              </button>
            ))}
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-[#EEEEEE] rounded-xl p-5 space-y-4">
          <h2 className="font-medium text-[#171A20] text-sm">Add to Watchlist</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#8E8E8E] font-semibold uppercase mb-1.5">Ticker *</label>
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
              <label className="block text-xs text-[#8E8E8E] font-semibold uppercase mb-1.5">Company Name</label>
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
            <label className="block text-xs text-[#8E8E8E] font-semibold uppercase mb-1.5">Initial Status</label>
            <div className="flex flex-wrap gap-1.5">
              {(["watching", "researching", "high_conviction"] as WatchlistStatus[]).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, status: s }))}
                  className={`text-xs font-semibold px-2.5 py-1 rounded border transition-colors ${
                    form.status === s
                      ? `${STATUS_STYLE[s].bg} ${STATUS_STYLE[s].text} ${STATUS_STYLE[s].border}`
                      : "bg-white text-[#8E8E8E] border-[#EEEEEE]"
                  }`}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-[#8E8E8E] font-semibold uppercase mb-1.5">Reason Watching *</label>
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
            <label className="block text-xs text-[#8E8E8E] font-semibold uppercase mb-1.5">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Price targets, catalysts to watch..."
              rows={2}
              className={`${INPUT_CLS} resize-y`}
            />
          </div>
          <div>
            <label className="block text-xs text-[#8E8E8E] font-semibold uppercase mb-1.5">Draft Thesis</label>
            <textarea
              value={form.draftThesis}
              onChange={e => setForm(f => ({ ...f, draftThesis: e.target.value }))}
              placeholder="Early investment thesis..."
              rows={3}
              className={`${INPUT_CLS} resize-y`}
            />
          </div>
          <div className="sm:w-48">
            <label className="block text-xs text-[#8E8E8E] font-semibold uppercase mb-1.5">Target Entry Price</label>
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
              onClick={() => { setShowForm(false); setForm(EMPTY_ADD); }}
              className="px-4 py-2 text-sm text-[#8E8E8E] hover:text-[#393C41]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !form.ticker.trim() || !form.interestReason.trim()}
              className="bg-[#3E6AE1] hover:bg-[#2d5bc7] disabled:opacity-40 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {submitting ? "Adding…" : "Add to Watchlist"}
            </button>
          </div>
        </form>
      )}

      {/* List */}
      {items.length === 0 ? (
        <div className="bg-white border border-[#EEEEEE] rounded-xl p-10 text-center space-y-2">
          <div className="text-[#393C41] font-medium">Watchlist is empty</div>
          <div className="text-sm text-[#8E8E8E]">Add tickers you&apos;re monitoring for potential entry.</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-8 text-center text-sm text-[#8E8E8E]">No items with status "{STATUS_LABELS[filterStatus as WatchlistStatus]}".</div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map(item => (
            <WatchlistCard key={item.id} item={item} onUpdated={handleUpdated} onRemoved={handleRemoved} />
          ))}
        </div>
      )}
    </div>
  );
}
