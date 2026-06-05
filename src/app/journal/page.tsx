"use client";
import { useEffect, useState } from "react";

interface JournalEntry {
  id: string;
  entryType: string;
  content: string;
  createdAt: string;
  position: { ticker: string; name: string } | null;
  positionId: string | null;
}

interface Position {
  id: string;
  ticker: string;
  name: string;
}

const ENTRY_TYPE_COLOR: Record<string, string> = {
  buy_rationale: "text-[#2d7d46]",
  thesis_update: "text-[#3E6AE1]",
  decision: "text-[#6d28d9]",
  observation: "text-[#5C5E62]",
  earnings_note: "text-[#b45309]",
  macro: "text-[#0e7490]",
  evaluation: "text-[#4f46e5]",
};

const ENTRY_TYPES = [
  "buy_rationale", "thesis_update", "decision", "observation", "earnings_note", "macro", "evaluation"
];

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtTime(d: string) {
  return new Date(d).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function groupByDate(entries: JournalEntry[]) {
  const groups: Record<string, JournalEntry[]> = {};
  for (const e of entries) {
    const key = fmtDate(e.createdAt);
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  }
  return Object.entries(groups);
}

const INPUT_CLS = "w-full bg-white border border-[#EEEEEE] text-[#171A20] text-sm rounded px-3 py-2 focus:outline-none focus:border-[#3E6AE1] placeholder:text-[#8E8E8E]";
const SELECT_CLS = "w-full bg-white border border-[#EEEEEE] text-[#393C41] text-sm rounded px-3 py-2 focus:outline-none focus:border-[#3E6AE1]";

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newEntry, setNewEntry] = useState({ positionId: "", entryType: "observation", content: "" });

  useEffect(() => {
    Promise.all([
      fetch("/api/journal?limit=100").then(r => r.json()),
      fetch("/api/positions").then(r => r.json()),
    ])
      .then(([j, p]) => {
        setEntries(Array.isArray(j) ? j : []);
        setPositions(Array.isArray(p) ? p : []);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = entries.filter(e => typeFilter === "all" || e.entryType === typeFilter);
  const grouped = groupByDate(filtered);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newEntry.content.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          positionId: newEntry.positionId || null,
          entryType: newEntry.entryType,
          content: newEntry.content.trim(),
        }),
      });
      if (res.ok) {
        const created = await res.json();
        const pos = positions.find(p => p.id === newEntry.positionId) ?? null;
        setEntries(prev => [{ ...created, position: pos ? { ticker: pos.ticker, name: pos.name } : null }, ...prev]);
        setNewEntry({ positionId: "", entryType: "observation", content: "" });
        setShowForm(false);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 lg:p-8 space-y-4 max-w-4xl">
        <div className="h-7 w-48 bg-[#EEEEEE] rounded animate-pulse" />
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="h-24 bg-[#EEEEEE] rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-5 max-w-4xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium text-[#171A20]">Journal</h1>
          <p className="text-[#8E8E8E] text-sm mt-0.5">{entries.length} entries total</p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          style={{ transition: "background-color 0.33s" }}
          className="bg-[#3E6AE1] hover:bg-[#2d5bc7] text-white px-5 py-2 rounded text-sm font-medium"
        >
          + New Entry
        </button>
      </div>

      {/* New Entry Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-[#EEEEEE] rounded-xl p-5 space-y-4">
          <h2 className="font-medium text-[#171A20] text-sm">New Journal Entry</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#8E8E8E] font-medium mb-1.5">Position (optional)</label>
              <select
                value={newEntry.positionId}
                onChange={e => setNewEntry(p => ({ ...p, positionId: e.target.value }))}
                className={SELECT_CLS}
              >
                <option value="">None (general)</option>
                {positions.map(p => (
                  <option key={p.id} value={p.id}>{p.ticker} — {p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#8E8E8E] font-medium mb-1.5">Entry Type</label>
              <select
                value={newEntry.entryType}
                onChange={e => setNewEntry(p => ({ ...p, entryType: e.target.value }))}
                className={SELECT_CLS}
              >
                {ENTRY_TYPES.map(t => (
                  <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-[#8E8E8E] font-medium mb-1.5">Content</label>
            <textarea
              value={newEntry.content}
              onChange={e => setNewEntry(p => ({ ...p, content: e.target.value }))}
              placeholder="Write your journal entry..."
              rows={4}
              required
              className={`${INPUT_CLS} resize-y`}
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
              disabled={submitting || !newEntry.content.trim()}
              style={{ transition: "background-color 0.33s" }}
              className="bg-[#3E6AE1] hover:bg-[#2d5bc7] disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2 rounded text-sm font-medium"
            >
              {submitting ? "Saving..." : "Save Entry"}
            </button>
          </div>
        </form>
      )}

      {/* Type filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setTypeFilter("all")}
          style={{ transition: "background-color 0.33s, color 0.33s, border-color 0.33s" }}
          className={`px-3 py-1.5 rounded text-xs font-medium border ${typeFilter === "all" ? "bg-[#3E6AE1] text-white border-[#3E6AE1]" : "bg-white text-[#5C5E62] border-[#EEEEEE] hover:border-[#D0D1D2]"}`}
        >
          All ({entries.length})
        </button>
        {ENTRY_TYPES.map(t => {
          const count = entries.filter(e => e.entryType === t).length;
          if (count === 0) return null;
          return (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              style={{ transition: "background-color 0.33s, color 0.33s, border-color 0.33s" }}
              className={`px-3 py-1.5 rounded text-xs font-medium border capitalize ${typeFilter === t ? "bg-[#3E6AE1] text-white border-[#3E6AE1]" : "bg-white text-[#5C5E62] border-[#EEEEEE] hover:border-[#D0D1D2]"}`}
            >
              {t.replace(/_/g, " ")} ({count})
            </button>
          );
        })}
      </div>

      {/* Journal timeline */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-[#EEEEEE] rounded-xl p-10 text-center text-[#8E8E8E]">
          {typeFilter === "all"
            ? <>No journal entries yet. Run <code className="bg-[#F4F4F4] px-1.5 py-0.5 rounded text-[#5C5E62]">npm run db:seed</code> to add sample data.</>
            : "No entries matching this filter."}
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([date, dayEntries]) => (
            <div key={date}>
              <div className="flex items-center gap-3 mb-3">
                <div className="text-xs text-[#8E8E8E] font-medium">{date}</div>
                <div className="flex-1 h-px bg-[#EEEEEE]" />
                <div className="text-xs text-[#D0D1D2]">{dayEntries.length}</div>
              </div>
              <div className="space-y-2.5">
                {dayEntries.map(entry => (
                  <div
                    key={entry.id}
                    style={{ transition: "border-color 0.33s" }}
                    className="bg-white border border-[#EEEEEE] rounded-xl px-5 py-4 hover:border-[#D0D1D2]"
                  >
                    <div className="flex items-start gap-3 flex-wrap mb-2">
                      <span className={`text-xs font-medium capitalize ${ENTRY_TYPE_COLOR[entry.entryType] ?? "text-[#5C5E62]"}`}>
                        {entry.entryType.replace(/_/g, " ")}
                      </span>
                      {entry.position && (
                        <span className="text-xs font-medium text-[#171A20] bg-[#F4F4F4] px-2 py-0.5 rounded">
                          {entry.position.ticker}
                        </span>
                      )}
                      <span className="text-xs text-[#D0D1D2] ml-auto">{fmtTime(entry.createdAt)}</span>
                    </div>
                    <p className="text-sm text-[#393C41] leading-relaxed whitespace-pre-line">{entry.content}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
