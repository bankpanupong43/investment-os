"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { InvestmentThesisItem, ThesisCoverage, InvestmentThesesResponse } from "@/app/api/investment-theses/route";

type Filter = "all" | "active" | "watchlist" | "overdue" | "draft";

const SCORE_COLOR = (n: number) => {
  if (n >= 8) return "text-[#2d7d46]";
  if (n >= 6) return "text-[#b45309]";
  return "text-[#c0392b]";
};

const SCORE_BG = (n: number) => {
  if (n >= 8) return "bg-[#eef7f1] border-[#c3e6cf] text-[#2d7d46]";
  if (n >= 6) return "bg-[#fffbeb] border-[#fde68a] text-[#b45309]";
  return "bg-[#fdf0ee] border-[#f5c6c1] text-[#c0392b]";
};

const STATUS_STYLE: Record<string, string> = {
  active: "bg-[#EEF3FD] border-[#bfcffd] text-[#3E6AE1]",
  watchlist: "bg-[#F4F4F4] border-[#EEEEEE] text-[#5C5E62]",
  closed: "bg-[#fdf0ee] border-[#f5c6c1] text-[#c0392b]",
};

function MetricCard({ label, value, sub, highlight = false }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl p-5">
      <div className="text-xs text-[#8E8E8E] font-medium mb-2">{label}</div>
      <div className={`text-2xl font-medium tabular-nums ${highlight ? "text-[#c0392b]" : "text-[#171A20]"}`}>{value}</div>
      {sub && <div className="text-xs text-[#8E8E8E] mt-1">{sub}</div>}
    </div>
  );
}

function ReviewDot({ isOverdue, daysOverdue }: { isOverdue: boolean; daysOverdue: number | null }) {
  if (isOverdue) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-[#c0392b] font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-[#c0392b] inline-block" />
        {daysOverdue != null ? `${daysOverdue}d overdue` : "Never reviewed"}
      </span>
    );
  }
  return <span className="text-xs text-[#8E8E8E]">Up to date</span>;
}

function ConfidenceBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-[#EEEEEE] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${score >= 8 ? "bg-[#2d7d46]" : score >= 6 ? "bg-[#b45309]" : "bg-[#c0392b]"}`}
          style={{ width: `${score * 10}%` }}
        />
      </div>
      <span className={`text-xs font-medium tabular-nums ${SCORE_COLOR(score)}`}>{score}/10</span>
    </div>
  );
}

export default function ThesesPage() {
  const [data, setData] = useState<InvestmentThesesResponse | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/investment-theses")
      .then(r => r.json())
      .then(d => setData(d))
      .finally(() => setLoading(false));
  }, []);

  const coverage: ThesisCoverage | null = data?.coverage ?? null;

  const filtered = (data?.theses ?? []).filter(t => {
    if (filter === "active") return t.status === "active";
    if (filter === "watchlist") return t.status === "watchlist";
    if (filter === "overdue") return t.isReviewDue;
    if (filter === "draft") return t.isDraft;
    return true;
  });

  const FILTERS: { key: Filter; label: string; count: (theses: InvestmentThesisItem[]) => number }[] = [
    { key: "all", label: "All", count: ts => ts.length },
    { key: "active", label: "Active", count: ts => ts.filter(t => t.status === "active").length },
    { key: "watchlist", label: "Watchlist", count: ts => ts.filter(t => t.status === "watchlist").length },
    { key: "overdue", label: "Review Due", count: ts => ts.filter(t => t.isReviewDue).length },
    { key: "draft", label: "Drafts", count: ts => ts.filter(t => t.isDraft).length },
  ];

  if (loading) {
    return (
      <div className="p-6 lg:p-8 space-y-6 max-w-7xl">
        <div className="h-8 w-56 bg-[#EEEEEE] rounded animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-[#EEEEEE] rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium text-[#171A20]">Investment Theses</h1>
          <p className="text-[#8E8E8E] text-sm mt-0.5">Decision-support records for every position and watchlist item</p>
        </div>
        <Link
          href="/theses/new"
          style={{ transition: "background-color 0.33s" }}
          className="shrink-0 bg-[#3E6AE1] hover:bg-[#2d5bc7] text-white px-5 py-2 rounded text-sm font-medium"
        >
          + New Thesis
        </Link>
      </div>

      {/* Coverage Cards */}
      {coverage && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard label="Total Theses" value={String(coverage.total)} sub={`${coverage.active} active · ${coverage.watchlist} watchlist`} />
          <MetricCard label="Avg Confidence" value={`${coverage.avgConfidence.toFixed(1)} / 10`} sub={`${coverage.confidenceDistribution.high} high · ${coverage.confidenceDistribution.medium} med · ${coverage.confidenceDistribution.low} low`} />
          <MetricCard label="Reviews Due" value={String(coverage.overdueCount)} sub="overdue or never reviewed" highlight={coverage.overdueCount > 0} />
          <MetricCard label="Draft Theses" value={String(coverage.draftCount)} sub="require human review" highlight={coverage.draftCount > 0} />
        </div>
      )}

      {/* Confidence Distribution Bar */}
      {coverage && coverage.total > 0 && (
        <div className="bg-white border border-[#EEEEEE] rounded-xl p-5">
          <div className="text-xs text-[#8E8E8E] font-medium mb-3">Confidence Distribution</div>
          <div className="flex rounded-full overflow-hidden h-2.5">
            {coverage.confidenceDistribution.high > 0 && (
              <div className="bg-[#2d7d46]" style={{ width: `${(coverage.confidenceDistribution.high / coverage.total) * 100}%` }} title={`High (8-10): ${coverage.confidenceDistribution.high}`} />
            )}
            {coverage.confidenceDistribution.medium > 0 && (
              <div className="bg-[#b45309]" style={{ width: `${(coverage.confidenceDistribution.medium / coverage.total) * 100}%` }} title={`Medium (6-7): ${coverage.confidenceDistribution.medium}`} />
            )}
            {coverage.confidenceDistribution.low > 0 && (
              <div className="bg-[#c0392b]" style={{ width: `${(coverage.confidenceDistribution.low / coverage.total) * 100}%` }} title={`Low (1-5): ${coverage.confidenceDistribution.low}`} />
            )}
          </div>
          <div className="flex gap-4 mt-2.5">
            <span className="text-xs text-[#2d7d46]">■ High 8-10 ({coverage.confidenceDistribution.high})</span>
            <span className="text-xs text-[#b45309]">■ Medium 6-7 ({coverage.confidenceDistribution.medium})</span>
            <span className="text-xs text-[#c0392b]">■ Low 1-5 ({coverage.confidenceDistribution.low})</span>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-1 flex-wrap">
        {FILTERS.map(f => {
          const count = f.count(data?.theses ?? []);
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{ transition: "background-color 0.2s, color 0.2s" }}
              className={`px-3.5 py-1.5 rounded text-sm font-medium ${
                active ? "bg-[#3E6AE1] text-white" : "bg-white border border-[#EEEEEE] text-[#5C5E62] hover:bg-[#F4F4F4]"
              }`}
            >
              {f.label} <span className={`ml-1 ${active ? "opacity-80" : "text-[#8E8E8E]"}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Thesis Table */}
      <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-5 py-12 text-center text-[#8E8E8E] text-sm">
            No theses match this filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#EEEEEE] bg-[#F4F4F4]">
                  {["Ticker", "Title", "Confidence", "Status", "Review Status", "Frequency"].map((h, i) => (
                    <th key={h} className={`px-5 py-3 text-xs text-[#8E8E8E] font-medium ${i === 0 ? "text-left" : "text-left"}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((t, idx) => (
                  <tr
                    key={t.id}
                    className={`hover:bg-[#F4F4F4] group ${idx < filtered.length - 1 ? "border-b border-[#EEEEEE]" : ""}`}
                    style={{ transition: "background-color 0.2s" }}
                  >
                    <td className="px-5 py-3.5">
                      <Link href={`/theses/${t.ticker}`} className="block">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-[#171A20] group-hover:text-[#3E6AE1]" style={{ transition: "color 0.2s" }}>
                            {t.ticker}
                          </span>
                          {t.isDraft && (
                            <span className="text-xs px-1.5 py-0.5 bg-[#fffbeb] border border-[#fde68a] text-[#b45309] rounded">
                              Draft
                            </span>
                          )}
                        </div>
                      </Link>
                    </td>
                    <td className="px-5 py-3.5">
                      <Link href={`/theses/${t.ticker}`} className="text-[#5C5E62] hover:text-[#171A20] line-clamp-1 max-w-xs" style={{ transition: "color 0.2s" }}>
                        {t.title}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5">
                      <ConfidenceBar score={t.confidenceScore} />
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-xs px-2 py-0.5 rounded border capitalize ${STATUS_STYLE[t.status] ?? "bg-[#F4F4F4] text-[#5C5E62] border-[#EEEEEE]"}`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <ReviewDot isOverdue={t.isReviewDue} daysOverdue={t.daysOverdue} />
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs text-[#8E8E8E] capitalize">{t.reviewFrequency}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
