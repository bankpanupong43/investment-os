"use client";
import { useEffect, useState } from "react";

interface Brief {
  id: string;
  briefType: string;
  content: string;
  deliveredAt: string | null;
  createdAt: string;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function fmtTime(d: string) {
  return new Date(d).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function BriefContent({ content }: { content: string }) {
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { parsed = null; }

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    return (
      <div className="space-y-5">
        {Object.entries(obj).map(([key, val]) => {
          if (!val) return null;
          const label = key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
          return (
            <div key={key}>
              <div className="text-xs text-[#8E8E8E] font-medium mb-2">{label}</div>
              {Array.isArray(val) ? (
                <ul className="space-y-1.5">
                  {(val as unknown[]).map((item, i) => (
                    <li key={i} className="flex gap-3 text-sm text-[#393C41]">
                      <span className="text-[#D0D1D2] shrink-0">·</span>
                      <span>{typeof item === "string" ? item : JSON.stringify(item)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[#393C41] leading-relaxed">{String(val)}</p>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return <p className="text-sm text-[#393C41] leading-relaxed whitespace-pre-line">{content}</p>;
}

export default function BriefingPage() {
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/briefs?limit=30")
      .then(r => r.json())
      .then(d => {
        const data = Array.isArray(d) ? d : [];
        setBriefs(data);
        if (data.length > 0) setExpanded(data[0].id);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = briefs.filter(b => typeFilter === "all" || b.briefType === typeFilter);

  if (loading) {
    return (
      <div className="p-6 lg:p-8 space-y-4 max-w-4xl">
        <div className="h-7 w-48 bg-[#EEEEEE] rounded animate-pulse" />
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-[#EEEEEE] rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-5 max-w-4xl">
      <div>
        <h1 className="text-2xl font-medium text-[#171A20]">Market Briefings</h1>
        <p className="text-[#8E8E8E] text-sm mt-0.5">AI-generated morning & weekly portfolio summaries</p>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {[
          { key: "all", label: "All" },
          { key: "morning", label: "Morning" },
          { key: "weekly", label: "Weekly" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTypeFilter(key)}
            style={{ transition: "background-color 0.33s, color 0.33s, border-color 0.33s" }}
            className={`px-4 py-1.5 rounded text-sm font-medium border ${
              typeFilter === key
                ? "bg-[#3E6AE1] text-white border-[#3E6AE1]"
                : "bg-white text-[#5C5E62] border-[#EEEEEE] hover:border-[#D0D1D2] hover:text-[#393C41]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-[#EEEEEE] rounded-xl p-10 text-center space-y-3">
          <div className="text-[#8E8E8E] text-sm">No briefings available yet.</div>
          <div className="text-xs text-[#D0D1D2]">Run an agent to generate a brief:</div>
          <code className="block bg-[#F4F4F4] text-[#5C5E62] px-3 py-2 rounded text-xs">
            POST /api/agents/run {"{ \"agentType\": \"morning-brief\" }"}
          </code>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(brief => (
            <div
              key={brief.id}
              style={{ transition: "border-color 0.33s" }}
              className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden hover:border-[#D0D1D2]"
            >
              <button
                onClick={() => setExpanded(expanded === brief.id ? null : brief.id)}
                className="w-full px-5 py-4 text-left flex items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className={`text-xs px-2.5 py-0.5 rounded font-medium capitalize ${
                      brief.briefType === "morning"
                        ? "text-[#b45309] bg-[#fffbeb]"
                        : "text-[#6d28d9] bg-[#f5f3ff]"
                    }`}>
                      {brief.briefType}
                    </span>
                    <span className="text-sm font-medium text-[#171A20]">{fmtDate(brief.createdAt)}</span>
                    <span className="text-xs text-[#8E8E8E]">{fmtTime(brief.createdAt)}</span>
                  </div>
                  {expanded !== brief.id && (
                    <p className="text-xs text-[#8E8E8E] mt-1.5 line-clamp-1">
                      {brief.content.slice(0, 200).replace(/[{}"]/g, "")}
                    </p>
                  )}
                </div>
                <div style={{ transition: "transform 0.33s" }} className={`text-[#D0D1D2] ${expanded === brief.id ? "rotate-180" : ""}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </button>

              {expanded === brief.id && (
                <div className="border-t border-[#EEEEEE] px-5 py-5 bg-[#F4F4F4]">
                  <BriefContent content={brief.content} />
                  {brief.deliveredAt && (
                    <div className="mt-4 pt-4 border-t border-[#EEEEEE] text-xs text-[#D0D1D2]">
                      Delivered {fmtDate(brief.deliveredAt)} at {fmtTime(brief.deliveredAt)}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
