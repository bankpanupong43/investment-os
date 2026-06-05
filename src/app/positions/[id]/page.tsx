"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface Position {
  id: string;
  ticker: string;
  name: string;
  sector: string | null;
  industry: string | null;
  assetClass: string;
  shares: number;
  avgCost: number;
  entryDate: string;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  thesis: {
    id: string;
    version: number;
    originalThesis: string;
    currentAssessment: string | null;
    keyAssumptions: string;
    expectedOutcomes: string;
    risks: string;
    holdingPeriod: string | null;
    holdingPeriodMonths: number | null;
    entryConfidence: number;
    healthStatus: string | null;
    healthScore: number | null;
    lastReviewedAt: string | null;
    updatedAt: string;
    updates: Array<{
      id: string;
      updateType: string;
      content: string;
      triggeredBy: string;
      sourceUrl: string | null;
      createdAt: string;
    }>;
  } | null;
  killConditions: Array<{
    id: string;
    conditionType: string;
    description: string;
    metric: string | null;
    operator: string | null;
    threshold: number | null;
    status: string;
    triggeredAt: string | null;
    triggeredNote: string | null;
    createdAt: string;
  }>;
  journalEntries: Array<{
    id: string;
    entryType: string;
    content: string;
    createdAt: string;
  }>;
  recommendations: Array<{
    id: string;
    action: string;
    reasoning: string;
    thesisReference: string | null;
    confidence: number | null;
    urgency: string;
    status: string;
    acknowledgedAt: string | null;
    createdAt: string;
  }>;
  earningsEvents: Array<{
    id: string;
    ticker: string;
    fiscalPeriod: string;
    reportDate: string;
    epsActual: number | null;
    epsEstimate: number | null;
    revenueActual: number | null;
    revenueEstimate: number | null;
    guidanceSummary: string | null;
    thesisImpact: string | null;
    createdAt: string;
  }>;
}

const HEALTH_STYLE: Record<string, string> = {
  intact: "text-[#2d7d46] bg-[#eef7f1] border-[#c3e6cf]",
  weakening: "text-[#b45309] bg-[#fffbeb] border-[#fde68a]",
  broken: "text-[#c0392b] bg-[#fdf0ee] border-[#f5c6c1]",
  monitoring: "text-[#3E6AE1] bg-[#EEF3FD] border-[#bfcffd]",
};

const STATUS_STYLE: Record<string, string> = {
  active: "text-[#2d7d46] bg-[#eef7f1] border-[#c3e6cf]",
  closed: "text-[#5C5E62] bg-[#F4F4F4] border-[#EEEEEE]",
  trimmed: "text-[#b45309] bg-[#fffbeb] border-[#fde68a]",
};

const KILL_STATUS_STYLE: Record<string, string> = {
  active: "text-[#3E6AE1] bg-[#EEF3FD] border-[#bfcffd]",
  triggered: "text-[#c0392b] bg-[#fdf0ee] border-[#f5c6c1]",
  dismissed: "text-[#8E8E8E] bg-[#F4F4F4] border-[#EEEEEE]",
};

const ACTION_STYLE: Record<string, string> = {
  hold: "text-[#5C5E62] bg-[#F4F4F4]",
  add: "text-[#2d7d46] bg-[#eef7f1]",
  reduce: "text-[#b45309] bg-[#fffbeb]",
  sell: "text-[#c0392b] bg-[#fdf0ee]",
  watch: "text-[#3E6AE1] bg-[#EEF3FD]",
};

const UPDATE_COLOR: Record<string, string> = {
  confirmation: "border-[#c3e6cf] text-[#2d7d46]",
  weakening: "border-[#fde68a] text-[#b45309]",
  neutral: "border-[#EEEEEE] text-[#8E8E8E]",
  breaking: "border-[#f5c6c1] text-[#c0392b]",
};

const ENTRY_TYPE_COLOR: Record<string, string> = {
  buy_rationale: "text-[#2d7d46]",
  thesis_update: "text-[#3E6AE1]",
  decision: "text-[#6d28d9]",
  observation: "text-[#5C5E62]",
  earnings_note: "text-[#b45309]",
  macro: "text-[#0e7490]",
  evaluation: "text-[#4f46e5]",
};

const IMPACT_COLOR: Record<string, string> = {
  positive: "text-[#2d7d46]",
  negative: "text-[#c0392b]",
  neutral: "text-[#8E8E8E]",
  "n/a": "text-[#D0D1D2]",
};

function fmt(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function safeJson<T>(str: string, fallback: T): T {
  try { return JSON.parse(str) as T; } catch { return fallback; }
}

type Tab = "thesis" | "kills" | "journal" | "recommendations" | "earnings";

export default function PositionDetailPage() {
  const params = useParams();
  const [position, setPosition] = useState<Position | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<Tab>("thesis");

  const id = params?.id as string;

  useEffect(() => {
    if (!id) return;
    fetch(`/api/positions/${id}`)
      .then(r => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      })
      .then(d => { if (d) setPosition(d); })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="p-6 lg:p-8 space-y-4 max-w-5xl">
        <div className="h-5 w-40 bg-[#EEEEEE] rounded animate-pulse" />
        <div className="h-32 bg-[#EEEEEE] rounded-xl animate-pulse" />
        <div className="h-8 bg-[#EEEEEE] rounded animate-pulse" />
        <div className="h-64 bg-[#EEEEEE] rounded-xl animate-pulse" />
      </div>
    );
  }

  if (notFound || !position) {
    return (
      <div className="p-6 lg:p-8 max-w-5xl">
        <div className="bg-white border border-[#EEEEEE] rounded-xl p-10 text-center">
          <div className="text-[#393C41] font-medium mb-2">Position not found</div>
          <Link href="/holdings" style={{ transition: "color 0.33s" }} className="text-[#3E6AE1] hover:text-[#2d5bc7] text-sm font-medium">
            ← Back to Holdings
          </Link>
        </div>
      </div>
    );
  }

  const costBasis = position.shares * position.avgCost;
  const thesis = position.thesis;
  const assumptions = thesis ? safeJson<unknown[]>(thesis.keyAssumptions, []) : [];
  const outcomes = thesis ? safeJson<unknown[]>(thesis.expectedOutcomes, []) : [];
  const risks = thesis ? safeJson<unknown[]>(thesis.risks, []) : [];

  const tabs: Array<{ key: Tab; label: string; count?: number }> = [
    { key: "thesis", label: "Thesis" },
    { key: "kills", label: "Kill Conditions", count: position.killConditions.length },
    { key: "journal", label: "Journal", count: position.journalEntries.length },
    { key: "recommendations", label: "Recommendations", count: position.recommendations.length },
    { key: "earnings", label: "Earnings", count: position.earningsEvents.length },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-5 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-[#8E8E8E]">
        <Link href="/holdings" style={{ transition: "color 0.33s" }} className="hover:text-[#393C41]">Holdings</Link>
        <span>→</span>
        <span className="text-[#393C41]">{position.ticker}</span>
      </div>

      {/* Header card */}
      <div className="bg-white border border-[#EEEEEE] rounded-xl p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-medium text-[#171A20]">{position.ticker}</h1>
              <span className={`text-xs px-2.5 py-1 rounded border font-medium capitalize ${STATUS_STYLE[position.status] ?? "text-[#5C5E62] bg-[#F4F4F4] border-[#EEEEEE]"}`}>
                {position.status}
              </span>
              {thesis?.healthStatus && (
                <span className={`text-xs px-2.5 py-1 rounded border capitalize ${HEALTH_STYLE[thesis.healthStatus] ?? ""}`}>
                  thesis: {thesis.healthStatus}
                  {thesis.healthScore != null ? ` · ${thesis.healthScore.toFixed(1)}/10` : ""}
                </span>
              )}
            </div>
            <p className="text-[#5C5E62] mt-1">{position.name}</p>
            {position.sector && (
              <p className="text-xs text-[#8E8E8E] mt-0.5">
                {position.sector}{position.industry ? ` · ${position.industry}` : ""} · {position.assetClass}
              </p>
            )}
          </div>
          <div className="text-right">
            <div className="text-xs text-[#8E8E8E] mb-1">Cost Basis</div>
            <div className="text-2xl font-medium text-[#171A20] tabular-nums">{fmt(costBasis)}</div>
            <div className="text-xs text-[#8E8E8E] mt-1">
              {position.shares.toLocaleString()} shares @ {fmt(position.avgCost)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-5 border-t border-[#EEEEEE]">
          <div>
            <div className="text-xs text-[#8E8E8E] mb-0.5">Entry Date</div>
            <div className="text-sm font-medium text-[#393C41]">{fmtDate(position.entryDate)}</div>
          </div>
          {thesis?.holdingPeriod && (
            <div>
              <div className="text-xs text-[#8E8E8E] mb-0.5">Holding Period</div>
              <div className="text-sm font-medium text-[#393C41]">{thesis.holdingPeriod}</div>
            </div>
          )}
          {thesis?.entryConfidence != null && (
            <div>
              <div className="text-xs text-[#8E8E8E] mb-0.5">Entry Confidence</div>
              <div className="text-sm font-medium text-[#393C41]">{thesis.entryConfidence}/10</div>
            </div>
          )}
          {thesis?.lastReviewedAt && (
            <div>
              <div className="text-xs text-[#8E8E8E] mb-0.5">Last Reviewed</div>
              <div className="text-sm font-medium text-[#393C41]">{fmtDate(thesis.lastReviewedAt)}</div>
            </div>
          )}
        </div>

        {position.notes && (
          <div className="mt-4 pt-4 border-t border-[#EEEEEE]">
            <div className="text-xs text-[#8E8E8E] mb-1">Notes</div>
            <p className="text-sm text-[#5C5E62]">{position.notes}</p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-[#EEEEEE] flex gap-0 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{ transition: "color 0.33s, border-color 0.33s" }}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 ${
              tab === t.key
                ? "border-[#3E6AE1] text-[#3E6AE1]"
                : "border-transparent text-[#8E8E8E] hover:text-[#393C41]"
            }`}
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className="ml-1.5 text-xs bg-[#F4F4F4] text-[#8E8E8E] px-1.5 py-0.5 rounded">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Thesis */}
      {tab === "thesis" && (
        <div className="space-y-4">
          {!thesis ? (
            <div className="bg-white border border-[#EEEEEE] rounded-xl p-8 text-center text-[#8E8E8E]">No thesis recorded</div>
          ) : (
            <>
              <div className="bg-white border border-[#EEEEEE] rounded-xl p-5 space-y-4">
                <div>
                  <div className="text-xs text-[#8E8E8E] font-medium mb-2">Original Thesis</div>
                  <p className="text-sm text-[#393C41] leading-relaxed">{thesis.originalThesis}</p>
                </div>
                {thesis.currentAssessment && (
                  <div className="pt-4 border-t border-[#EEEEEE]">
                    <div className="text-xs text-[#8E8E8E] font-medium mb-2">Current Assessment</div>
                    <p className="text-sm text-[#393C41] leading-relaxed">{thesis.currentAssessment}</p>
                  </div>
                )}
              </div>

              {assumptions.length > 0 && (
                <div className="bg-white border border-[#EEEEEE] rounded-xl p-5">
                  <div className="text-xs text-[#8E8E8E] font-medium mb-3">Key Assumptions</div>
                  <div className="space-y-2.5">
                    {(assumptions as Array<{ text?: string; importance?: string }>).map((a, i) => (
                      <div key={i} className="flex gap-3 items-start text-sm">
                        <span className="text-[#D0D1D2] shrink-0">{i + 1}.</span>
                        <span className="text-[#393C41] flex-1">{a.text ?? JSON.stringify(a)}</span>
                        {a.importance && (
                          <span className="text-xs text-[#8E8E8E] shrink-0 capitalize">{a.importance}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {outcomes.length > 0 && (
                <div className="bg-white border border-[#EEEEEE] rounded-xl p-5">
                  <div className="text-xs text-[#8E8E8E] font-medium mb-3">Expected Outcomes</div>
                  <div className="space-y-2.5">
                    {(outcomes as Array<{ description?: string; timeframe?: string }>).map((o, i) => (
                      <div key={i} className="flex gap-3 items-start text-sm">
                        <span className="text-[#D0D1D2] shrink-0">{i + 1}.</span>
                        <span className="text-[#393C41] flex-1">{o.description ?? JSON.stringify(o)}</span>
                        {o.timeframe && <span className="text-xs text-[#8E8E8E] shrink-0">{o.timeframe}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {risks.length > 0 && (
                <div className="bg-white border border-[#EEEEEE] rounded-xl p-5">
                  <div className="text-xs text-[#8E8E8E] font-medium mb-3">Risks</div>
                  <div className="space-y-2.5">
                    {(risks as Array<{ description?: string; severity?: string }>).map((r, i) => (
                      <div key={i} className="flex gap-3 items-start text-sm">
                        <span className="text-[#D0D1D2] shrink-0">{i + 1}.</span>
                        <span className="text-[#393C41] flex-1">{r.description ?? JSON.stringify(r)}</span>
                        {r.severity && (
                          <span className={`text-xs shrink-0 capitalize font-medium ${r.severity === "high" ? "text-[#c0392b]" : r.severity === "medium" ? "text-[#b45309]" : "text-[#8E8E8E]"}`}>
                            {r.severity}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {thesis.updates && thesis.updates.length > 0 && (
                <div className="bg-white border border-[#EEEEEE] rounded-xl p-5">
                  <div className="text-xs text-[#8E8E8E] font-medium mb-3">Thesis Updates</div>
                  <div className="space-y-3">
                    {thesis.updates.map(u => (
                      <div key={u.id} className={`border-l-2 pl-4 ${UPDATE_COLOR[u.updateType]?.split(" ")[0] ?? "border-[#EEEEEE]"}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-medium capitalize ${UPDATE_COLOR[u.updateType]?.split(" ")[1] ?? "text-[#8E8E8E]"}`}>
                            {u.updateType}
                          </span>
                          <span className="text-xs text-[#D0D1D2]">· {u.triggeredBy} · {fmtDate(u.createdAt)}</span>
                        </div>
                        <p className="text-sm text-[#393C41]">{u.content}</p>
                        {u.sourceUrl && (
                          <a href={u.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ transition: "color 0.33s" }} className="text-xs text-[#3E6AE1] hover:text-[#2d5bc7] mt-1 block">
                            Source →
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Kill Conditions */}
      {tab === "kills" && (
        <div className="space-y-2.5">
          {position.killConditions.length === 0 ? (
            <div className="bg-white border border-[#EEEEEE] rounded-xl p-8 text-center text-[#8E8E8E]">No kill conditions defined</div>
          ) : (
            position.killConditions.map(kc => (
              <div key={kc.id} className={`bg-white border rounded-xl p-5 ${kc.status === "triggered" ? "border-[#f5c6c1]" : "border-[#EEEEEE]"}`}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs px-2 py-0.5 rounded border font-medium capitalize ${KILL_STATUS_STYLE[kc.status] ?? "text-[#5C5E62] bg-[#F4F4F4] border-[#EEEEEE]"}`}>
                        {kc.status}
                      </span>
                      <span className="text-xs text-[#8E8E8E] capitalize">{kc.conditionType}</span>
                    </div>
                    <p className="text-sm text-[#393C41]">{kc.description}</p>
                    {kc.metric && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-[#8E8E8E]">
                        <span>{kc.metric}</span>
                        <span>{kc.operator}</span>
                        <span className="font-medium text-[#393C41]">{kc.threshold}</span>
                      </div>
                    )}
                    {kc.triggeredNote && (
                      <div className="mt-2 p-2 bg-[#fdf0ee] border border-[#f5c6c1] rounded text-xs text-[#c0392b]">
                        {kc.triggeredNote}
                      </div>
                    )}
                  </div>
                  <div className="text-right text-xs text-[#8E8E8E] shrink-0">
                    {kc.triggeredAt ? (
                      <div className="text-[#c0392b]">Triggered {fmtDate(kc.triggeredAt)}</div>
                    ) : (
                      <div>Added {fmtDate(kc.createdAt)}</div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Journal */}
      {tab === "journal" && (
        <div className="space-y-2.5">
          {position.journalEntries.length === 0 ? (
            <div className="bg-white border border-[#EEEEEE] rounded-xl p-8 text-center text-[#8E8E8E]">No journal entries</div>
          ) : (
            position.journalEntries.map(entry => (
              <div key={entry.id} className="bg-white border border-[#EEEEEE] rounded-xl px-5 py-4">
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <span className={`text-xs font-medium capitalize ${ENTRY_TYPE_COLOR[entry.entryType] ?? "text-[#5C5E62]"}`}>
                    {entry.entryType.replace(/_/g, " ")}
                  </span>
                  <span className="text-xs text-[#D0D1D2] ml-auto">{fmtDate(entry.createdAt)}</span>
                </div>
                <p className="text-sm text-[#393C41] leading-relaxed whitespace-pre-line">{entry.content}</p>
              </div>
            ))
          )}
        </div>
      )}

      {/* Recommendations */}
      {tab === "recommendations" && (
        <div className="space-y-2.5">
          {position.recommendations.length === 0 ? (
            <div className="bg-white border border-[#EEEEEE] rounded-xl p-8 text-center text-[#8E8E8E]">No recommendations</div>
          ) : (
            position.recommendations.map(rec => (
              <div key={rec.id} className="bg-white border border-[#EEEEEE] rounded-xl p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2.5 py-1 rounded font-medium uppercase ${ACTION_STYLE[rec.action] ?? "text-[#5C5E62] bg-[#F4F4F4]"}`}>
                      {rec.action}
                    </span>
                    <span className={`text-xs font-medium capitalize ${
                      rec.urgency === "critical" ? "text-[#c0392b]" :
                      rec.urgency === "high" ? "text-[#b45309]" :
                      rec.urgency === "medium" ? "text-[#3E6AE1]" :
                      "text-[#8E8E8E]"
                    }`}>
                      {rec.urgency} urgency
                    </span>
                    {rec.confidence != null && (
                      <span className="text-xs text-[#8E8E8E]">confidence: {rec.confidence}/10</span>
                    )}
                  </div>
                  <div className="text-right text-xs text-[#8E8E8E] shrink-0">
                    <div className="capitalize">{rec.status}</div>
                    <div>{fmtDate(rec.createdAt)}</div>
                  </div>
                </div>
                <p className="text-sm text-[#393C41] mt-3 leading-relaxed">{rec.reasoning}</p>
                {rec.thesisReference && (
                  <p className="text-xs text-[#8E8E8E] mt-2 pt-2 border-t border-[#EEEEEE]">
                    Thesis reference: {rec.thesisReference}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Earnings */}
      {tab === "earnings" && (
        <div className="space-y-3">
          {position.earningsEvents.length === 0 ? (
            <div className="bg-white border border-[#EEEEEE] rounded-xl p-8 text-center text-[#8E8E8E]">No earnings events recorded</div>
          ) : (
            <>
              <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#EEEEEE] bg-[#F4F4F4]">
                        <th className="px-5 py-3 text-left text-xs text-[#8E8E8E] font-medium">Period</th>
                        <th className="px-5 py-3 text-left text-xs text-[#8E8E8E] font-medium">Date</th>
                        <th className="px-5 py-3 text-right text-xs text-[#8E8E8E] font-medium">EPS Actual</th>
                        <th className="px-5 py-3 text-right text-xs text-[#8E8E8E] font-medium">EPS Est.</th>
                        <th className="px-5 py-3 text-right text-xs text-[#8E8E8E] font-medium">Revenue</th>
                        <th className="px-5 py-3 text-left text-xs text-[#8E8E8E] font-medium">Impact</th>
                      </tr>
                    </thead>
                    <tbody>
                      {position.earningsEvents.map((e, idx) => (
                        <tr
                          key={e.id}
                          style={{ transition: "background-color 0.33s" }}
                          className={`hover:bg-[#F4F4F4] ${idx < position.earningsEvents.length - 1 ? "border-b border-[#EEEEEE]" : ""}`}
                        >
                          <td className="px-5 py-3 font-medium text-[#171A20]">{e.fiscalPeriod}</td>
                          <td className="px-5 py-3 text-[#8E8E8E] text-xs">{fmtDate(e.reportDate)}</td>
                          <td className="px-5 py-3 text-right tabular-nums">
                            {e.epsActual != null ? (
                              <span className={e.epsActual >= 0 ? "text-[#2d7d46]" : "text-[#c0392b]"}>
                                ${e.epsActual.toFixed(2)}
                              </span>
                            ) : <span className="text-[#D0D1D2]">—</span>}
                          </td>
                          <td className="px-5 py-3 text-right tabular-nums text-[#8E8E8E]">
                            {e.epsEstimate != null ? `$${e.epsEstimate.toFixed(2)}` : <span className="text-[#D0D1D2]">—</span>}
                          </td>
                          <td className="px-5 py-3 text-right tabular-nums text-[#393C41]">
                            {e.revenueActual != null
                              ? e.revenueActual >= 1e9
                                ? `$${(e.revenueActual / 1e9).toFixed(2)}B`
                                : `$${(e.revenueActual / 1e6).toFixed(1)}M`
                              : <span className="text-[#D0D1D2]">—</span>}
                          </td>
                          <td className="px-5 py-3">
                            {e.thesisImpact && (
                              <span className={`text-xs font-medium capitalize ${IMPACT_COLOR[e.thesisImpact] ?? "text-[#8E8E8E]"}`}>
                                {e.thesisImpact}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {position.earningsEvents.filter(e => e.guidanceSummary).map(e => (
                <div key={`guidance-${e.id}`} className="bg-white border border-[#EEEEEE] rounded-xl p-5">
                  <div className="text-xs text-[#8E8E8E] font-medium mb-2">{e.fiscalPeriod} Guidance</div>
                  <p className="text-sm text-[#393C41] leading-relaxed">{e.guidanceSummary}</p>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
