"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

interface Position {
  id: string;
  ticker: string;
  name: string;
  sector: string | null;
  shares: number;
  avgCost: number;
  thesis: {
    id: string;
    version: number;
    originalThesis: string;
    currentAssessment: string | null;
    healthStatus: string | null;
    healthScore: number | null;
    entryConfidence: number;
    holdingPeriod: string | null;
    holdingPeriodMonths: number | null;
    lastReviewedAt: string | null;
    updatedAt: string;
    updates: Array<{
      id: string;
      updateType: string;
      content: string;
      triggeredBy: string;
      createdAt: string;
    }>;
  } | null;
}

const HEALTH_STYLE: Record<string, string> = {
  intact: "text-[#2d7d46] bg-[#eef7f1] border-[#c3e6cf]",
  weakening: "text-[#b45309] bg-[#fffbeb] border-[#fde68a]",
  broken: "text-[#c0392b] bg-[#fdf0ee] border-[#f5c6c1]",
  monitoring: "text-[#3E6AE1] bg-[#EEF3FD] border-[#bfcffd]",
};

const HEALTH_BAR: Record<string, string> = {
  intact: "bg-[#2d7d46]",
  weakening: "bg-[#b45309]",
  broken: "bg-[#c0392b]",
  monitoring: "bg-[#3E6AE1]",
};

const UPDATE_COLOR: Record<string, string> = {
  confirmation: "text-[#2d7d46]",
  weakening: "text-[#b45309]",
  neutral: "text-[#8E8E8E]",
  breaking: "text-[#c0392b]",
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function scoreColor(score: number | null) {
  if (score == null) return "text-[#8E8E8E]";
  if (score >= 8) return "text-[#2d7d46]";
  if (score >= 6) return "text-[#3E6AE1]";
  if (score >= 4) return "text-[#b45309]";
  return "text-[#c0392b]";
}

export default function ThesisPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/positions")
      .then(r => r.json())
      .then(d => setPositions(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = positions.filter(p => filter === "all" || p.thesis?.healthStatus === filter);

  const counts = positions.reduce((acc, p) => {
    const h = p.thesis?.healthStatus ?? "unreviewed";
    acc[h] = (acc[h] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (loading) {
    return (
      <div className="p-6 lg:p-8 space-y-4 max-w-5xl">
        <div className="h-7 w-48 bg-[#EEEEEE] rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-48 bg-[#EEEEEE] rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  const filterBtns = [
    { key: "all", label: `All (${positions.length})` },
    { key: "intact", label: `Intact (${counts.intact ?? 0})` },
    { key: "monitoring", label: `Monitoring (${counts.monitoring ?? 0})` },
    { key: "weakening", label: `Weakening (${counts.weakening ?? 0})` },
    { key: "broken", label: `Broken (${counts.broken ?? 0})` },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-5 max-w-5xl">
      <div>
        <h1 className="text-2xl font-medium text-[#171A20]">Thesis Tracker</h1>
        <p className="text-[#8E8E8E] text-sm mt-0.5">Investment thesis health across {positions.length} position{positions.length !== 1 ? "s" : ""}</p>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2">
        {filterBtns.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            style={{ transition: "background-color 0.33s, color 0.33s, border-color 0.33s" }}
            className={`px-3 py-1.5 rounded text-sm font-medium border ${
              filter === key
                ? "bg-[#3E6AE1] text-white border-[#3E6AE1]"
                : "bg-white text-[#5C5E62] border-[#EEEEEE] hover:border-[#D0D1D2] hover:text-[#393C41]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Thesis Cards */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-[#EEEEEE] rounded-xl p-10 text-center text-[#8E8E8E]">
          No positions found. Run{" "}
          <code className="bg-[#F4F4F4] px-1.5 py-0.5 rounded text-[#5C5E62]">npm run db:seed</code>
          {" "}to add sample data.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(p => {
            const thesis = p.thesis;
            const isExpanded = expanded === p.id;
            const scoreBarWidth = thesis?.healthScore != null ? (thesis.healthScore / 10) * 100 : 0;
            const latestUpdate = thesis?.updates?.[0];

            return (
              <div
                key={p.id}
                style={{ transition: "border-color 0.33s" }}
                className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden hover:border-[#D0D1D2]"
              >
                <div className="px-5 py-4 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <Link
                        href={`/positions/${p.id}`}
                        style={{ transition: "color 0.33s" }}
                        className="font-medium text-[#171A20] hover:text-[#3E6AE1] text-lg"
                      >
                        {p.ticker}
                      </Link>
                      <span className="text-sm text-[#8E8E8E] truncate">{p.name}</span>
                      {thesis?.healthStatus ? (
                        <span className={`text-xs px-2 py-0.5 rounded border capitalize ${HEALTH_STYLE[thesis.healthStatus] ?? "text-[#5C5E62] bg-[#F4F4F4] border-[#EEEEEE]"}`}>
                          {thesis.healthStatus}
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded border text-[#8E8E8E] bg-[#F4F4F4] border-[#EEEEEE]">Unreviewed</span>
                      )}
                    </div>

                    {thesis?.healthScore != null && (
                      <div className="mt-3 flex items-center gap-3">
                        <div className="flex-1 h-0.5 bg-[#EEEEEE] rounded-full overflow-hidden max-w-[180px]">
                          <div
                            className={`h-full rounded-full ${HEALTH_BAR[thesis.healthStatus ?? ""] ?? "bg-[#D0D1D2]"}`}
                            style={{ width: `${scoreBarWidth}%` }}
                          />
                        </div>
                        <span className={`text-sm font-medium tabular-nums ${scoreColor(thesis.healthScore)}`}>
                          {thesis.healthScore.toFixed(1)}/10
                        </span>
                        <span className="text-xs text-[#8E8E8E]">confidence: {thesis.entryConfidence}/10</span>
                      </div>
                    )}

                    {thesis && (
                      <p className="text-sm text-[#5C5E62] mt-2 line-clamp-2">
                        {thesis.currentAssessment ?? thesis.originalThesis}
                      </p>
                    )}
                    {!thesis && (
                      <p className="text-sm text-[#D0D1D2] mt-2">No thesis recorded</p>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    {thesis?.holdingPeriod && (
                      <div className="text-xs text-[#8E8E8E] mb-1">{thesis.holdingPeriod}</div>
                    )}
                    {thesis?.lastReviewedAt ? (
                      <div className="text-xs text-[#8E8E8E]">Reviewed {fmtDate(thesis.lastReviewedAt)}</div>
                    ) : (
                      <div className="text-xs text-[#D0D1D2]">Not yet reviewed</div>
                    )}
                    {thesis && (
                      <button
                        onClick={() => setExpanded(isExpanded ? null : p.id)}
                        style={{ transition: "color 0.33s" }}
                        className="mt-2 text-xs text-[#3E6AE1] hover:text-[#2d5bc7] font-medium"
                      >
                        {isExpanded ? "Collapse ↑" : "Expand ↓"}
                      </button>
                    )}
                  </div>
                </div>

                {latestUpdate && !isExpanded && (
                  <div className="px-5 pb-4">
                    <div className={`text-xs inline-flex items-center gap-1.5 ${UPDATE_COLOR[latestUpdate.updateType] ?? "text-[#8E8E8E]"}`}>
                      <span className="font-medium capitalize">{latestUpdate.updateType}</span>
                      <span className="text-[#D0D1D2]">·</span>
                      <span className="text-[#8E8E8E] line-clamp-1">{latestUpdate.content}</span>
                      <span className="text-[#D0D1D2]">·</span>
                      <span className="text-[#8E8E8E]">{fmtDate(latestUpdate.createdAt)}</span>
                    </div>
                  </div>
                )}

                {isExpanded && thesis && (
                  <div className="border-t border-[#EEEEEE] px-5 py-4 space-y-4 bg-[#F4F4F4]">
                    <div>
                      <div className="text-xs text-[#8E8E8E] font-medium mb-2">Original Thesis</div>
                      <p className="text-sm text-[#393C41] leading-relaxed">{thesis.originalThesis}</p>
                    </div>

                    {thesis.updates && thesis.updates.length > 0 && (
                      <div>
                        <div className="text-xs text-[#8E8E8E] font-medium mb-2">Recent Updates</div>
                        <div className="space-y-2">
                          {thesis.updates.slice(0, 4).map(u => (
                            <div key={u.id} className="flex gap-3 text-sm">
                              <span className={`text-xs font-medium shrink-0 pt-0.5 capitalize ${UPDATE_COLOR[u.updateType] ?? "text-[#8E8E8E]"}`}>
                                {u.updateType}
                              </span>
                              <span className="text-[#5C5E62] flex-1">{u.content}</span>
                              <span className="text-[#8E8E8E] text-xs shrink-0">{fmtDate(u.createdAt)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end">
                      <Link
                        href={`/positions/${p.id}`}
                        style={{ transition: "color 0.33s" }}
                        className="text-sm text-[#3E6AE1] hover:text-[#2d5bc7] font-medium"
                      >
                        Full position detail →
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
