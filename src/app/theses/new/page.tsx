"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const INPUT_CLS = "w-full bg-white border border-[#EEEEEE] text-[#171A20] text-sm rounded px-3 py-2 focus:outline-none focus:border-[#3E6AE1] placeholder:text-[#8E8E8E]";
const TEXTAREA_CLS = "w-full bg-white border border-[#EEEEEE] text-[#171A20] text-sm rounded px-3 py-2.5 focus:outline-none focus:border-[#3E6AE1] resize-vertical";

export default function NewThesisPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    ticker: "", title: "", thesis: "", whyOwn: "", risks: "", killCriteria: "",
    confidenceScore: 7, reviewFrequency: "quarterly", status: "active",
    isDraft: true, notes: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const r = await fetch("/api/investment-theses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, confidenceScore: Number(form.confidenceScore) }),
    });
    if (r.ok) {
      const d = await r.json();
      router.push(`/theses/${d.ticker}`);
    } else {
      const d = await r.json();
      setError(d.error ?? "Failed to create thesis");
      setSaving(false);
    }
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-3xl">
      <Link href="/theses" className="text-[#8E8E8E] text-sm hover:text-[#3E6AE1] transition-colors">
        ← Investment Theses
      </Link>

      <div>
        <h1 className="text-2xl font-medium text-[#171A20]">New Investment Thesis</h1>
        <p className="text-[#8E8E8E] text-sm mt-0.5">Document your investment rationale for a position or watchlist item.</p>
      </div>

      {error && (
        <div className="bg-[#fdf0ee] border border-[#f5c6c1] text-[#c0392b] text-sm px-4 py-3 rounded-xl">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="bg-white border border-[#EEEEEE] rounded-xl p-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-[#8E8E8E] font-medium block mb-1.5">Ticker *</label>
            <input value={form.ticker} onChange={e => setForm(f => ({ ...f, ticker: e.target.value.toUpperCase() }))}
              placeholder="AAPL" required className={INPUT_CLS} />
          </div>
          <div>
            <label className="text-xs text-[#8E8E8E] font-medium block mb-1.5">Status</label>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className={INPUT_CLS}>
              <option value="active">Active Position</option>
              <option value="watchlist">Watchlist</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs text-[#8E8E8E] font-medium block mb-1.5">Title *</label>
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="e.g. Consumer Ecosystem Lock-in + Services Monetisation" required className={INPUT_CLS} />
        </div>
        <div>
          <label className="text-xs text-[#8E8E8E] font-medium block mb-1.5">Investment Thesis * — Why does this asset warrant ownership?</label>
          <textarea value={form.thesis} onChange={e => setForm(f => ({ ...f, thesis: e.target.value }))}
            placeholder="Core thesis: what makes this a compelling investment..." required
            className={TEXTAREA_CLS} rows={5} />
        </div>
        <div>
          <label className="text-xs text-[#8E8E8E] font-medium block mb-1.5">Why Own *</label>
          <textarea value={form.whyOwn} onChange={e => setForm(f => ({ ...f, whyOwn: e.target.value }))}
            placeholder="One-paragraph ownership rationale..." required
            className={TEXTAREA_CLS} rows={3} />
        </div>
        <div>
          <label className="text-xs text-[#8E8E8E] font-medium block mb-1.5">Key Risks *</label>
          <textarea value={form.risks} onChange={e => setForm(f => ({ ...f, risks: e.target.value }))}
            placeholder="What could go wrong..." required
            className={TEXTAREA_CLS} rows={3} />
        </div>
        <div>
          <label className="text-xs text-[#8E8E8E] font-medium block mb-1.5">Kill Criteria *</label>
          <textarea value={form.killCriteria} onChange={e => setForm(f => ({ ...f, killCriteria: e.target.value }))}
            placeholder="Concrete conditions that would cause an exit..." required
            className={TEXTAREA_CLS} rows={3} />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-[#8E8E8E] font-medium block mb-1.5">Confidence Score (1–10)</label>
            <input type="number" min={1} max={10} value={form.confidenceScore}
              onChange={e => setForm(f => ({ ...f, confidenceScore: Number(e.target.value) }))} className={INPUT_CLS} />
          </div>
          <div>
            <label className="text-xs text-[#8E8E8E] font-medium block mb-1.5">Review Frequency</label>
            <select value={form.reviewFrequency} onChange={e => setForm(f => ({ ...f, reviewFrequency: e.target.value }))} className={INPUT_CLS}>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annually">Annually</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[#8E8E8E] font-medium block mb-1.5">Draft?</label>
            <select value={form.isDraft ? "true" : "false"} onChange={e => setForm(f => ({ ...f, isDraft: e.target.value === "true" }))} className={INPUT_CLS}>
              <option value="true">Yes — Draft</option>
              <option value="false">No — Published</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs text-[#8E8E8E] font-medium block mb-1.5">Notes (optional)</label>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            className={TEXTAREA_CLS} rows={2} />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving}
            className="px-6 py-2 text-sm font-medium rounded bg-[#3E6AE1] hover:bg-[#2d5bc7] text-white disabled:opacity-50 transition-colors">
            {saving ? "Creating…" : "Create Thesis"}
          </button>
          <Link href="/theses" className="px-6 py-2 text-sm font-medium rounded border border-[#EEEEEE] text-[#5C5E62] hover:bg-[#F4F4F4] transition-colors">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
