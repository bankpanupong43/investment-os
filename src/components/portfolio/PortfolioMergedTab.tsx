"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { THESIS_VERDICT_STYLE, HEALTH_STYLE, STATUS_STYLE, type DecisionReview } from "./shared";

interface MergedRow {
  ticker: string;
  hasHolding: boolean;
  hasPosition: boolean;
  positionId: string | null;
  shares: number | null;
  costBasis: number | null;
  currency: string;
  price: number | null;
  marketValueUsd: number | null;
  marketValueThb: number | null;
  allocationPct: number | null;
  gainLossUsd: number | null;
  gainLossPct: number | null;
  notes: string | null;
  name: string;
  sector: string | null;
  industry: string | null;
  assetClass: string | null;
  entryDate: string | null;
  status: string | null;
  thesisHealth: string | null;
  thesisScore: number | null;
  killConditionCount: number;
  triggeredKillCount: number;
  recommendation: { action: string; urgency: string } | null;
}

interface CashLine {
  id: string;
  accountName: string;
  currency: string;
  balance: number;
  balanceThb: number;
  allocationPct: number | null;
  notes: string | null;
}

interface MergedSnapshot {
  rows: MergedRow[];
  cashAccounts: CashLine[];
  totalValueThb: number;
  totalValueUsd: number;
  totalEquityUsd: number;
  totalEquityThb: number;
  totalCashThb: number;
  usdthb: number;
  priceDate: string;
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtThb(n: number | null | undefined): string {
  if (n == null) return "—";
  return "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}

interface AddForm { ticker: string; shares: string; costBasis: string; currency: string }
const EMPTY_ADD: AddForm = { ticker: "", shares: "", costBasis: "", currency: "USD" };

export default function PortfolioMergedTab() {
  const [snapshot, setSnapshot] = useState<MergedSnapshot | null>(null);
  const [decisionMap, setDecisionMap] = useState<Map<string, DecisionReview>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingTicker, setEditingTicker] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ shares: string; costBasis: string }>({ shares: "", costBasis: "" });
  const [addForm, setAddForm] = useState<AddForm>(EMPTY_ADD);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cashEdits, setCashEdits] = useState<Record<string, string>>({});

  function reload() {
    setLoading(true);
    Promise.all([
      fetch("/api/portfolio-merged").then(r => r.json()),
      fetch("/api/decision-review").then(r => r.json()).catch(() => ({ reviews: [] })),
    ]).then(([mergedData, drData]) => {
      if (mergedData.error) throw new Error(mergedData.error);
      setSnapshot(mergedData as MergedSnapshot);
      const map = new Map<string, DecisionReview>();
      for (const dr of (drData.reviews ?? []) as DecisionReview[]) {
        if (!map.has(dr.ticker)) map.set(dr.ticker, dr);
      }
      setDecisionMap(map);
    }).catch(e => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveHolding(ticker: string, shares: number, costBasis: number | null, currency = "USD") {
    setSaving(true);
    try {
      await fetch(`/api/holdings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, shares, costBasis, currency }),
      });
      reload();
    } finally { setSaving(false); }
  }

  async function deleteHolding(ticker: string) {
    if (!confirm(`Remove ${ticker} from holdings?`)) return;
    await fetch(`/api/holdings/${ticker}`, { method: "DELETE" });
    reload();
  }

  async function updateCash(id: string, balance: number) {
    setSaving(true);
    try {
      await fetch("/api/cash-accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, balance }),
      });
      reload();
    } finally { setSaving(false); }
  }

  if (loading) return <div className="py-12 text-center text-sm text-[#8E8E8E]">Loading portfolio…</div>;
  if (error)   return <div className="text-sm text-[#DC2626] py-4">{error}</div>;
  if (!snapshot) return null;

  const { rows, cashAccounts, totalValueThb, totalValueUsd, totalEquityUsd, totalCashThb, usdthb, priceDate } = snapshot;

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total (THB)", value: fmtThb(totalValueThb) },
          { label: "Total (USD)", value: fmt(totalValueUsd) },
          { label: "USDTHB", value: usdthb.toFixed(2) },
          { label: "Price Date", value: priceDate },
        ].map(m => (
          <div key={m.label} className="bg-white border border-[#EEEEEE] rounded-xl p-3">
            <div className="text-xs text-[#8E8E8E] mb-1">{m.label}</div>
            <div className="text-lg font-semibold text-[#171A20]">{m.value}</div>
          </div>
        ))}
      </div>

      {/* Positions table */}
      <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#EEEEEE]">
          <span className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide">
            Positions ({rows.length})
          </span>
          <button
            onClick={() => setShowAdd(v => !v)}
            className="text-xs font-medium px-3 py-1.5 rounded-lg text-white"
            style={{ backgroundColor: "#3E6AE1" }}
          >
            {showAdd ? "Cancel" : "+ Add"}
          </button>
        </div>

        {/* Add form */}
        {showAdd && (
          <div className="px-4 py-3 bg-[#F4F4F4] border-b border-[#EEEEEE] flex flex-wrap gap-2 items-end">
            {(["ticker", "shares", "costBasis"] as const).map(field => (
              <div key={field}>
                <div className="text-[10px] text-[#8E8E8E] mb-1 capitalize">
                  {field === "costBasis" ? "Cost Basis/share" : field}
                </div>
                <input
                  className="text-sm border border-[#EEEEEE] rounded-lg px-2.5 py-1.5 w-28 focus:outline-none focus:border-[#3E6AE1]"
                  placeholder={field === "ticker" ? "NVDA" : "0"}
                  value={addForm[field]}
                  onChange={e => setAddForm(f => ({ ...f, [field]: e.target.value.toUpperCase() }))}
                />
              </div>
            ))}
            <div>
              <div className="text-[10px] text-[#8E8E8E] mb-1">Currency</div>
              <select
                className="text-sm border border-[#EEEEEE] rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#3E6AE1]"
                value={addForm.currency}
                onChange={e => setAddForm(f => ({ ...f, currency: e.target.value }))}
              >
                <option value="USD">USD</option>
                <option value="THB">THB</option>
              </select>
            </div>
            <button
              disabled={saving || !addForm.ticker || !addForm.shares}
              onClick={() => {
                const shares = parseFloat(addForm.shares);
                const cb = addForm.costBasis ? parseFloat(addForm.costBasis) : null;
                if (!addForm.ticker || isNaN(shares)) return;
                saveHolding(addForm.ticker, shares, cb, addForm.currency);
                setAddForm(EMPTY_ADD);
                setShowAdd(false);
              }}
              className="text-sm font-medium px-4 py-1.5 rounded-lg text-white disabled:opacity-50"
              style={{ backgroundColor: "#15803D" }}
            >
              Save
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#EEEEEE] text-xs text-[#8E8E8E]">
                <th className="text-left px-4 py-3 font-medium">Ticker</th>
                <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Sector</th>
                <th className="text-right px-4 py-3 font-medium">Shares</th>
                <th className="text-right px-4 py-3 font-medium">Price</th>
                <th className="text-right px-4 py-3 font-medium">Mkt Value</th>
                <th className="text-right px-4 py-3 font-medium">Alloc %</th>
                <th className="text-right px-4 py-3 font-medium hidden md:table-cell">Gain/Loss</th>
                <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Entry</th>
                <th className="text-left px-4 py-3 font-medium">Thesis</th>
                <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Alerts</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const dr = decisionMap.get(r.ticker);
                const vs = dr ? THESIS_VERDICT_STYLE[dr.verdict] ?? THESIS_VERDICT_STYLE["Hold"] : null;
                const glColor = r.gainLossPct == null ? "#8E8E8E" : r.gainLossPct >= 0 ? "#15803D" : "#DC2626";
                const isEditing = editingTicker === r.ticker;
                const tickerCell = (
                  <>
                    <div className="font-semibold text-[#171A20]">{r.ticker}</div>
                    <div className="text-xs text-[#8E8E8E] truncate max-w-[150px]">{r.name}</div>
                    {vs && (
                      <span className="mt-0.5 inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: vs.bg, color: vs.text }}>
                        {dr!.verdict}
                      </span>
                    )}
                  </>
                );
                return (
                  <tr key={r.ticker} className={`border-b border-[#EEEEEE] last:border-0 hover:bg-[#F9F9F9] transition-colors ${!r.hasHolding || !r.hasPosition ? "bg-[#FFFBEB]/40" : ""}`}>
                    <td className="px-4 py-2.5">
                      {r.positionId ? (
                        <Link href={`/positions/${r.positionId}`} className="block hover:opacity-80">{tickerCell}</Link>
                      ) : (
                        <div>{tickerCell}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 hidden lg:table-cell">
                      <span className="text-xs text-[#5C5E62]">{r.sector ?? "—"}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[#5C5E62]">
                      {isEditing ? (
                        <input
                          type="number"
                          className="w-20 text-right text-sm border border-[#3E6AE1] rounded px-1.5 py-0.5"
                          value={editForm.shares}
                          onChange={e => setEditForm(f => ({ ...f, shares: e.target.value }))}
                        />
                      ) : r.shares != null ? r.shares.toLocaleString() : (
                        r.hasPosition ? <span className="text-[10px] text-[#D97706]">log shares</span> : "—"
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[#5C5E62]">
                      {r.price != null ? `$${r.price.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-[#171A20] tabular-nums">
                      {fmt(r.marketValueUsd)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[#5C5E62]">
                      {r.allocationPct != null ? r.allocationPct.toFixed(1) + "%" : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium hidden md:table-cell" style={{ color: glColor }}>
                      {isEditing ? (
                        <input
                          type="number"
                          className="w-20 text-right text-sm border border-[#3E6AE1] rounded px-1.5 py-0.5"
                          placeholder="cost/share"
                          value={editForm.costBasis}
                          onChange={e => setEditForm(f => ({ ...f, costBasis: e.target.value }))}
                        />
                      ) : (
                        r.gainLossPct != null
                          ? `${r.gainLossPct >= 0 ? "+" : ""}${r.gainLossPct.toFixed(1)}%`
                          : "—"
                      )}
                    </td>
                    <td className="px-4 py-2.5 hidden sm:table-cell">
                      <span className="text-xs text-[#8E8E8E]">{fmtDate(r.entryDate)}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      {r.thesisHealth ? (
                        <div>
                          <span className={`text-xs px-2 py-0.5 rounded border capitalize ${HEALTH_STYLE[r.thesisHealth] ?? "text-[#5C5E62] bg-[#F4F4F4] border-[#EEEEEE]"}`}>
                            {r.thesisHealth}
                          </span>
                          {r.thesisScore != null && (
                            <div className="text-xs text-[#8E8E8E] mt-0.5 tabular-nums">{r.thesisScore.toFixed(1)}/10</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] text-[#D97706]">no thesis</span>
                      )}
                      {r.status && (
                        <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded border capitalize ${STATUS_STYLE[r.status] ?? "text-[#5C5E62] bg-[#F4F4F4] border-[#EEEEEE]"}`}>
                          {r.status}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 hidden lg:table-cell">
                      {r.triggeredKillCount > 0 && (
                        <span className="text-xs text-[#c0392b] font-medium">{r.triggeredKillCount} kill triggered</span>
                      )}
                      {r.recommendation && r.triggeredKillCount === 0 && (
                        <span className="text-xs text-[#b45309] capitalize">{r.recommendation.action} ({r.recommendation.urgency})</span>
                      )}
                      {r.triggeredKillCount === 0 && !r.recommendation && (
                        <span className="text-[#D0D1D2] text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {r.hasHolding && (
                        isEditing ? (
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              disabled={saving}
                              onClick={() => {
                                const shares = parseFloat(editForm.shares);
                                const cb = editForm.costBasis ? parseFloat(editForm.costBasis) : null;
                                if (!isNaN(shares)) saveHolding(r.ticker, shares, cb, r.currency);
                                setEditingTicker(null);
                              }}
                              className="text-[11px] font-medium px-2 py-1 rounded text-white"
                              style={{ backgroundColor: "#15803D" }}
                            >Save</button>
                            <button
                              onClick={() => setEditingTicker(null)}
                              className="text-[11px] font-medium px-2 py-1 rounded bg-[#EEEEEE] text-[#5C5E62]"
                            >✕</button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              onClick={() => {
                                setEditingTicker(r.ticker);
                                setEditForm({ shares: String(r.shares ?? ""), costBasis: String(r.costBasis ?? "") });
                              }}
                              className="text-[11px] px-2 py-1 rounded bg-[#EEF3FD] text-[#3E6AE1]"
                            >Edit</button>
                            <button
                              onClick={() => deleteHolding(r.ticker)}
                              className="text-[11px] px-2 py-1 rounded bg-[#FEF2F2] text-[#DC2626]"
                            >✕</button>
                          </div>
                        )
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {rows.length === 0 && (
          <p className="text-center text-sm text-[#8E8E8E] py-8">
            No positions yet. Click "+ Add" to log your first holding.
          </p>
        )}
      </div>

      {/* Cash accounts card */}
      <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#EEEEEE]">
          <span className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide">
            Cash Accounts — {fmtThb(totalCashThb)} total
          </span>
        </div>
        <div className="divide-y divide-[#EEEEEE]">
          {cashAccounts.map(c => {
            const key = c.id;
            const isEditingCash = key in cashEdits;
            return (
              <div key={c.id} className="px-4 py-3 flex items-center gap-4">
                <div className="flex-1">
                  <div className="text-sm font-semibold text-[#171A20]">{c.accountName}</div>
                  <div className="text-[11px] text-[#8E8E8E]">{c.currency}</div>
                </div>
                <div className="text-right">
                  {isEditingCash ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        className="w-28 text-right text-sm border border-[#3E6AE1] rounded px-2 py-1"
                        value={cashEdits[key]}
                        onChange={e => setCashEdits(m => ({ ...m, [key]: e.target.value }))}
                      />
                      <button
                        disabled={saving}
                        onClick={() => {
                          const bal = parseFloat(cashEdits[key]);
                          if (!isNaN(bal)) updateCash(c.id, bal);
                          setCashEdits(m => { const n = { ...m }; delete n[key]; return n; });
                        }}
                        className="text-xs font-medium px-2 py-1 rounded text-white"
                        style={{ backgroundColor: "#15803D" }}
                      >Save</button>
                      <button
                        onClick={() => setCashEdits(m => { const n = { ...m }; delete n[key]; return n; })}
                        className="text-xs px-2 py-1 rounded bg-[#EEEEEE] text-[#5C5E62]"
                      >✕</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-sm font-semibold text-[#171A20] tabular-nums">
                          {c.currency === "THB" ? fmtThb(c.balance) : fmt(c.balance)}
                        </div>
                        {c.currency !== "THB" && (
                          <div className="text-[11px] text-[#8E8E8E] tabular-nums">{fmtThb(c.balanceThb)}</div>
                        )}
                        {c.allocationPct != null && (
                          <div className="text-[10px] text-[#AAAAAA]">{c.allocationPct.toFixed(1)}% of portfolio</div>
                        )}
                      </div>
                      <button
                        onClick={() => setCashEdits(m => ({ ...m, [key]: String(c.balance) }))}
                        className="text-xs px-2 py-1 rounded bg-[#EEF3FD] text-[#3E6AE1]"
                      >Edit</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Equity sub-total */}
      {totalEquityUsd > 0 && (
        <div className="bg-[#F4F4F4] border border-[#EEEEEE] rounded-xl px-4 py-3 flex items-center justify-between">
          <span className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wide">Equity Sub-total</span>
          <div className="text-right">
            <div className="text-sm font-semibold text-[#171A20]">{fmt(totalEquityUsd)} USD</div>
            <div className="text-[11px] text-[#8E8E8E]">{fmtThb(snapshot.totalEquityThb)} THB</div>
          </div>
        </div>
      )}
    </div>
  );
}
