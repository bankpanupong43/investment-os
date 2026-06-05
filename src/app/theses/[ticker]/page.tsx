"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { InvestmentThesisItem } from "@/app/api/investment-theses/route";

const SCORE_COLOR = (n: number) => {
  if (n >= 8) return "text-[#2d7d46]";
  if (n >= 6) return "text-[#b45309]";
  return "text-[#c0392b]";
};

const INPUT_CLS = "w-full bg-white border border-[#EEEEEE] text-[#171A20] text-sm rounded px-3 py-2 focus:outline-none focus:border-[#3E6AE1] placeholder:text-[#8E8E8E]";
const TEXTAREA_CLS = "w-full bg-white border border-[#EEEEEE] text-[#171A20] text-sm rounded px-3 py-2.5 focus:outline-none focus:border-[#3E6AE1] resize-vertical min-h-[100px]";

function Section({ label, content }: { label: string; content: string }) {
  return (
    <div>
      <div className="text-xs text-[#8E8E8E] font-medium mb-2">{label}</div>
      <p className="text-sm text-[#393C41] leading-relaxed whitespace-pre-wrap">{content}</p>
    </div>
  );
}

function fmtDate(d: string | null) {
  if (!d) return "Never";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ThesisDetailPage() {
  const params = useParams<{ ticker: string }>();
  const router = useRouter();
  const [thesis, setThesis] = useState<InvestmentThesisItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");
  const [newConfidence, setNewConfidence] = useState<string>("");
  const [reviewType, setReviewType] = useState<"review_completed" | "confidence_changed">("review_completed");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [form, setForm] = useState({
    title: "", thesis: "", whyOwn: "", risks: "", killCriteria: "",
    confidenceScore: 7, reviewFrequency: "quarterly", status: "active",
    isDraft: true, notes: "",
  });

  const load = useCallback(async () => {
    const r = await fetch(`/api/investment-theses/${params.ticker}`);
    if (!r.ok) { setLoading(false); return; }
    const d: InvestmentThesisItem = await r.json();
    setThesis(d);
    setForm({
      title: d.title, thesis: d.thesis, whyOwn: d.whyOwn,
      risks: d.risks, killCriteria: d.killCriteria,
      confidenceScore: d.confidenceScore, reviewFrequency: d.reviewFrequency,
      status: d.status, isDraft: d.isDraft, notes: d.notes ?? "",
    });
    setNewConfidence(String(d.confidenceScore));
    setLoading(false);
  }, [params.ticker]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!thesis) return;
    setSaving(true);
    const r = await fetch(`/api/investment-theses/${params.ticker}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, confidenceScore: Number(form.confidenceScore) }),
    });
    if (r.ok) {
      const d = await r.json();
      setThesis(d);
      setEditing(false);
    }
    setSaving(false);
  }

  async function handleMarkReviewed() {
    setSubmittingReview(true);
    const body: Record<string, unknown> = {
      reviewType,
      notes: reviewNotes || null,
    };
    if (reviewType === "confidence_changed") {
      body.previousConfidence = thesis?.confidenceScore;
      body.newConfidence = Number(newConfidence);
    }
    const r = await fetch(`/api/investment-theses/${params.ticker}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      const d = await r.json();
      setThesis(d);
      setShowReviewForm(false);
      setReviewNotes("");
    }
    setSubmittingReview(false);
  }

  async function handleDelete() {
    if (!confirm(`Delete thesis for ${params.ticker}? This cannot be undone.`)) return;
    setDeleting(true);
    const r = await fetch(`/api/investment-theses/${params.ticker}`, { method: "DELETE" });
    if (r.ok) router.push("/theses");
    else setDeleting(false);
  }

  if (loading) {
    return (
      <div className="p-6 lg:p-8 space-y-6 max-w-4xl">
        <div className="h-8 w-64 bg-[#EEEEEE] rounded animate-pulse" />
        <div className="h-96 bg-[#EEEEEE] rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!thesis) {
    return (
      <div className="p-6 lg:p-8 max-w-4xl">
        <div className="text-[#c0392b] mb-4">Thesis for {params.ticker} not found.</div>
        <Link href="/theses" className="text-[#3E6AE1] text-sm hover:underline">← Back to Theses</Link>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-4xl">
      {/* Breadcrumb */}
      <Link href="/theses" className="text-[#8E8E8E] text-sm hover:text-[#3E6AE1] transition-colors">
        ← Investment Theses
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap mb-1">
            <span className="text-xl font-bold text-[#171A20]">{thesis.ticker}</span>
            <span className={`text-xs px-2 py-0.5 rounded border capitalize ${
              thesis.status === "active" ? "bg-[#EEF3FD] border-[#bfcffd] text-[#3E6AE1]" :
              thesis.status === "watchlist" ? "bg-[#F4F4F4] border-[#EEEEEE] text-[#5C5E62]" :
              "bg-[#fdf0ee] border-[#f5c6c1] text-[#c0392b]"
            }`}>
              {thesis.status}
            </span>
            {thesis.isDraft && (
              <span className="text-xs px-2 py-0.5 bg-[#fffbeb] border border-[#fde68a] text-[#b45309] rounded font-medium">
                AI Draft — Needs Review
              </span>
            )}
          </div>
          {!editing && <h1 className="text-lg font-medium text-[#171A20] leading-snug">{thesis.title}</h1>}
        </div>

        <div className="flex gap-2 shrink-0">
          {!editing && (
            <>
              <button
                onClick={() => setShowReviewForm(!showReviewForm)}
                style={{ transition: "background-color 0.2s" }}
                className="px-4 py-2 text-sm font-medium rounded border border-[#EEEEEE] bg-white text-[#5C5E62] hover:bg-[#F4F4F4]"
              >
                Review
              </button>
              <button
                onClick={() => setEditing(true)}
                style={{ transition: "background-color 0.2s" }}
                className="px-4 py-2 text-sm font-medium rounded bg-[#3E6AE1] hover:bg-[#2d5bc7] text-white"
              >
                Edit
              </button>
            </>
          )}
          {editing && (
            <>
              <button
                onClick={() => setEditing(false)}
                className="px-4 py-2 text-sm font-medium rounded border border-[#EEEEEE] bg-white text-[#5C5E62] hover:bg-[#F4F4F4]"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium rounded bg-[#3E6AE1] hover:bg-[#2d5bc7] text-white disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Confidence + Review Status */}
      {!editing && (
        <div className="flex gap-6 flex-wrap">
          <div>
            <div className="text-xs text-[#8E8E8E] font-medium mb-1.5">Confidence</div>
            <div className="flex items-center gap-3">
              <div className={`text-3xl font-medium tabular-nums ${SCORE_COLOR(thesis.confidenceScore)}`}>
                {thesis.confidenceScore}
              </div>
              <div>
                <div className="text-xs text-[#8E8E8E]">out of 10</div>
                <div className="w-24 h-1.5 bg-[#EEEEEE] rounded-full overflow-hidden mt-1">
                  <div
                    className={`h-full rounded-full ${thesis.confidenceScore >= 8 ? "bg-[#2d7d46]" : thesis.confidenceScore >= 6 ? "bg-[#b45309]" : "bg-[#c0392b]"}`}
                    style={{ width: `${thesis.confidenceScore * 10}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs text-[#8E8E8E] font-medium mb-1.5">Last Reviewed</div>
            <div className="text-sm text-[#171A20]">{fmtDate(thesis.lastReviewedAt)}</div>
            <div className="text-xs mt-0.5">
              {thesis.isReviewDue ? (
                <span className="text-[#c0392b] font-medium">
                  {thesis.daysOverdue != null ? `${thesis.daysOverdue}d overdue` : "Never reviewed"}
                </span>
              ) : (
                <span className="text-[#8E8E8E]">Next: {fmtDate(thesis.reviewDueDate)} ({thesis.reviewFrequency})</span>
              )}
            </div>
          </div>

          <div>
            <div className="text-xs text-[#8E8E8E] font-medium mb-1.5">Reviews Logged</div>
            <div className="text-sm text-[#171A20]">{thesis.reviews.length}</div>
          </div>
        </div>
      )}

      {/* Draft Banner */}
      {thesis.isDraft && !editing && (
        <div className="bg-[#fffbeb] border border-[#fde68a] rounded-xl p-4 flex gap-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <div>
            <div className="text-sm font-medium text-[#b45309]">AI-Generated Draft</div>
            <div className="text-xs text-[#92400e] mt-0.5">
              This thesis was generated as a starting point. Review, edit, and click <strong>Review → Mark as Reviewed</strong> to publish it.
            </div>
          </div>
        </div>
      )}

      {/* Review Form */}
      {showReviewForm && !editing && (
        <div className="bg-white border border-[#EEEEEE] rounded-xl p-5 space-y-4">
          <h3 className="font-medium text-[#171A20] text-sm">Log a Review</h3>
          <div className="flex gap-2">
            <button
              onClick={() => setReviewType("review_completed")}
              className={`px-3 py-1.5 text-xs font-medium rounded border ${reviewType === "review_completed" ? "bg-[#3E6AE1] text-white border-[#3E6AE1]" : "bg-white text-[#5C5E62] border-[#EEEEEE] hover:bg-[#F4F4F4]"}`}
            >
              Mark as Reviewed
            </button>
            <button
              onClick={() => setReviewType("confidence_changed")}
              className={`px-3 py-1.5 text-xs font-medium rounded border ${reviewType === "confidence_changed" ? "bg-[#3E6AE1] text-white border-[#3E6AE1]" : "bg-white text-[#5C5E62] border-[#EEEEEE] hover:bg-[#F4F4F4]"}`}
            >
              Update Confidence
            </button>
          </div>

          {reviewType === "confidence_changed" && (
            <div>
              <label className="text-xs text-[#8E8E8E] font-medium block mb-1.5">New Confidence Score (1–10)</label>
              <input
                type="number" min={1} max={10}
                value={newConfidence}
                onChange={e => setNewConfidence(e.target.value)}
                className={INPUT_CLS + " w-24"}
              />
              {thesis && Number(newConfidence) !== thesis.confidenceScore && (
                <span className="text-xs text-[#8E8E8E] ml-2">
                  {thesis.confidenceScore} → {newConfidence}
                </span>
              )}
            </div>
          )}

          <div>
            <label className="text-xs text-[#8E8E8E] font-medium block mb-1.5">Notes (optional)</label>
            <textarea
              value={reviewNotes}
              onChange={e => setReviewNotes(e.target.value)}
              placeholder="What did you review? Any changes to the thesis outlook?"
              className={TEXTAREA_CLS + " min-h-[80px]"}
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleMarkReviewed}
              disabled={submittingReview}
              className="px-4 py-2 text-sm font-medium rounded bg-[#3E6AE1] hover:bg-[#2d5bc7] text-white disabled:opacity-50"
            >
              {submittingReview ? "Saving…" : "Save Review"}
            </button>
            <button
              onClick={() => setShowReviewForm(false)}
              className="px-4 py-2 text-sm font-medium rounded border border-[#EEEEEE] bg-white text-[#5C5E62] hover:bg-[#F4F4F4]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* View Mode — Thesis Content */}
      {!editing && (
        <div className="bg-white border border-[#EEEEEE] rounded-xl p-6 space-y-6">
          <Section label="INVESTMENT THESIS" content={thesis.thesis} />
          <div className="border-t border-[#EEEEEE]" />
          <Section label="WHY OWN" content={thesis.whyOwn} />
          <div className="border-t border-[#EEEEEE]" />
          <Section label="KEY RISKS" content={thesis.risks} />
          <div className="border-t border-[#EEEEEE]" />
          <Section label="KILL CRITERIA" content={thesis.killCriteria} />
          {thesis.notes && (
            <>
              <div className="border-t border-[#EEEEEE]" />
              <Section label="NOTES" content={thesis.notes} />
            </>
          )}
        </div>
      )}

      {/* Edit Mode */}
      {editing && (
        <div className="bg-white border border-[#EEEEEE] rounded-xl p-6 space-y-5">
          <div>
            <label className="text-xs text-[#8E8E8E] font-medium block mb-1.5">Title</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className={INPUT_CLS} />
          </div>
          <div>
            <label className="text-xs text-[#8E8E8E] font-medium block mb-1.5">Investment Thesis</label>
            <textarea value={form.thesis} onChange={e => setForm(f => ({ ...f, thesis: e.target.value }))} className={TEXTAREA_CLS} rows={5} />
          </div>
          <div>
            <label className="text-xs text-[#8E8E8E] font-medium block mb-1.5">Why Own</label>
            <textarea value={form.whyOwn} onChange={e => setForm(f => ({ ...f, whyOwn: e.target.value }))} className={TEXTAREA_CLS} rows={4} />
          </div>
          <div>
            <label className="text-xs text-[#8E8E8E] font-medium block mb-1.5">Key Risks</label>
            <textarea value={form.risks} onChange={e => setForm(f => ({ ...f, risks: e.target.value }))} className={TEXTAREA_CLS} rows={4} />
          </div>
          <div>
            <label className="text-xs text-[#8E8E8E] font-medium block mb-1.5">Kill Criteria</label>
            <textarea value={form.killCriteria} onChange={e => setForm(f => ({ ...f, killCriteria: e.target.value }))} className={TEXTAREA_CLS} rows={4} />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="text-xs text-[#8E8E8E] font-medium block mb-1.5">Confidence (1–10)</label>
              <input type="number" min={1} max={10} value={form.confidenceScore}
                onChange={e => setForm(f => ({ ...f, confidenceScore: Number(e.target.value) }))}
                className={INPUT_CLS} />
            </div>
            <div>
              <label className="text-xs text-[#8E8E8E] font-medium block mb-1.5">Review Frequency</label>
              <select value={form.reviewFrequency} onChange={e => setForm(f => ({ ...f, reviewFrequency: e.target.value }))}
                className={INPUT_CLS}>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annually">Annually</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-[#8E8E8E] font-medium block mb-1.5">Status</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                className={INPUT_CLS}>
                <option value="active">Active</option>
                <option value="watchlist">Watchlist</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-[#8E8E8E] font-medium block mb-1.5">Draft</label>
              <select value={form.isDraft ? "true" : "false"} onChange={e => setForm(f => ({ ...f, isDraft: e.target.value === "true" }))}
                className={INPUT_CLS}>
                <option value="true">Draft</option>
                <option value="false">Published</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-[#8E8E8E] font-medium block mb-1.5">Notes (optional)</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className={TEXTAREA_CLS} rows={2} />
          </div>
        </div>
      )}

      {/* Review History */}
      {!editing && thesis.reviews.length > 0 && (
        <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#EEEEEE]">
            <h2 className="font-medium text-[#171A20] text-sm">Review History</h2>
          </div>
          <div>
            {thesis.reviews.map((r, idx) => (
              <div key={r.id} className={`px-5 py-3.5 ${idx < thesis.reviews.length - 1 ? "border-b border-[#EEEEEE]" : ""}`}>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                    r.reviewType === "review_completed" ? "bg-[#eef7f1] text-[#2d7d46]" : "bg-[#EEF3FD] text-[#3E6AE1]"
                  }`}>
                    {r.reviewType === "review_completed" ? "Reviewed" : "Confidence Updated"}
                  </span>
                  {r.reviewType === "confidence_changed" && r.previousConfidence != null && r.newConfidence != null && (
                    <span className="text-xs text-[#8E8E8E]">
                      {r.previousConfidence} → <span className={SCORE_COLOR(r.newConfidence)}>{r.newConfidence}</span>
                    </span>
                  )}
                  <span className="text-xs text-[#D0D1D2] ml-auto">{fmtDate(r.reviewedAt)}</span>
                </div>
                {r.notes && <p className="text-xs text-[#5C5E62]">{r.notes}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Danger Zone */}
      {!editing && (
        <div className="border border-[#f5c6c1] rounded-xl p-5">
          <div className="text-xs text-[#8E8E8E] font-medium mb-3">Danger Zone</div>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-4 py-2 text-sm font-medium rounded bg-[#fdf0ee] hover:bg-[#f5c6c1] text-[#c0392b] transition-colors disabled:opacity-50"
          >
            {deleting ? "Deleting…" : `Delete Thesis for ${params.ticker}`}
          </button>
        </div>
      )}
    </div>
  );
}
