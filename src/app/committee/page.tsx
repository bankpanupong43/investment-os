"use client";
import { useEffect, useState, useCallback } from "react";
import type {
  BullCase, BearCase, RiskAssessment, ThesisAudit, FinalDecision, DecisionState
} from "@/lib/committee-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SessionSummary {
  id: string;
  ticker: string;
  companyName: string;
  sector: string | null;
  universeTier: string;
  conviction: DecisionState;
  bullScore: number;
  bearScore: number;
  convictionLevel: number;
  createdAt: string;
}

interface SessionDetail extends SessionSummary {
  evidenceCount?: number;
  bullCase: BullCase;
  bearCase: BearCase;
  riskAssessment: RiskAssessment;
  thesisAudit: ThesisAudit;
  finalDecision: FinalDecision;
}

interface UniverseEntry {
  ticker: string;
  companyName: string;
  sector: string | null;
  universeTier: string;
  latestScore?: { totalScore: number } | null;
}

// ─── Decision badge ───────────────────────────────────────────────────────────

const DECISION_STYLES: Record<DecisionState, { bg: string; text: string; border: string }> = {
  "Strong Buy": { bg: "#F0FDF4", text: "#14532D", border: "#86EFAC" },
  "Buy":        { bg: "#EEF3FD", text: "#1E3A8A", border: "#93C5FD" },
  "Watch":      { bg: "#FFFBEB", text: "#78350F", border: "#FCD34D" },
  "Hold":       { bg: "#F4F4F4", text: "#393C41", border: "#D1D5DB" },
  "Pass":       { bg: "#FEF2F2", text: "#7F1D1D", border: "#FCA5A5" },
};

function DecisionBadge({ d, size = "sm" }: { d: DecisionState; size?: "sm" | "lg" }) {
  const s = DECISION_STYLES[d] ?? DECISION_STYLES["Watch"];
  return (
    <span
      className={`font-semibold rounded border ${size === "lg" ? "text-sm px-3 py-1" : "text-xs px-2 py-0.5"}`}
      style={{ backgroundColor: s.bg, color: s.text, borderColor: s.border }}
    >
      {d}
    </span>
  );
}

function ConvictionBar({ level }: { level: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex gap-0.5">
        {Array.from({ length: 10 }, (_, i) => (
          <div
            key={i}
            className="w-2 h-2.5 rounded-sm"
            style={{ backgroundColor: i < level ? "#3E6AE1" : "#EEEEEE" }}
          />
        ))}
      </div>
      <span className="text-xs text-[#8E8E8E]">{level}/10</span>
    </div>
  );
}

function ScoreBar({ bull, bear }: { bull: number; bear: number }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-[#14532D] font-medium w-16">Bull {bull}</span>
      <div className="flex-1 h-2 rounded-full bg-[#EEEEEE] overflow-hidden flex">
        <div className="h-full bg-[#22C55E] rounded-l-full" style={{ width: `${bull}%` }} />
      </div>
      <div className="flex-1 h-2 rounded-full bg-[#EEEEEE] overflow-hidden flex justify-end">
        <div className="h-full bg-[#EF4444] rounded-r-full" style={{ width: `${bear}%` }} />
      </div>
      <span className="text-[#991B1B] font-medium w-16 text-right">Bear {bear}</span>
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function MemberHeader({ title, subtitle, color }: { title: string; subtitle: string; color: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-1 h-5 rounded-full" style={{ backgroundColor: color }} />
      <div>
        <div className="text-sm font-semibold text-[#171A20]">{title}</div>
        <div className="text-xs text-[#8E8E8E]">{subtitle}</div>
      </div>
    </div>
  );
}

// ─── Severity badge ───────────────────────────────────────────────────────────

function SevBadge({ s }: { s: "critical" | "high" | "medium" }) {
  const styles = {
    critical: { bg: "#7F1D1D", text: "#FEF2F2" },
    high: { bg: "#FEF2F2", text: "#991B1B" },
    medium: { bg: "#FFFBEB", text: "#92400E" },
  }[s];
  return (
    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase" style={{ backgroundColor: styles.bg, color: styles.text }}>
      {s}
    </span>
  );
}

function ProbBadge({ p }: { p: "high" | "medium" | "low" }) {
  const styles = {
    high: { bg: "#FEF2F2", text: "#991B1B" },
    medium: { bg: "#FFFBEB", text: "#92400E" },
    low: { bg: "#F0FDF4", text: "#14532D" },
  }[p];
  return (
    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: styles.bg, color: styles.text }}>
      {p} probability
    </span>
  );
}

// ─── Evidence ID pill ─────────────────────────────────────────────────────────

function EvidencePill({ id }: { id: string }) {
  return (
    <span className="text-[10px] font-mono px-1 py-0.5 rounded" style={{ backgroundColor: "#EEF3FD", color: "#3E6AE1" }}>
      {id.length > 12 ? id.slice(0, 10) + "…" : id}
    </span>
  );
}

// ─── Bull Case panel ──────────────────────────────────────────────────────────

function BullPanel({ data }: { data: BullCase }) {
  return (
    <div className="bg-white border border-[#EEEEEE] rounded p-4 space-y-4">
      <MemberHeader title="Bull Analyst" subtitle="Strongest buy case with supporting evidence" color="#22C55E" />

      <div>
        <div className="text-xs font-semibold text-[#5C5E62] uppercase tracking-wider mb-1.5">Bull Thesis</div>
        <p className="text-sm text-[#393C41] leading-relaxed">{data.thesis}</p>
      </div>

      {data.supportingEvidence.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-[#5C5E62] uppercase tracking-wider mb-1.5">Supporting Evidence</div>
          <div className="flex flex-wrap gap-1.5">
            {data.supportingEvidence.map(e => (
              <div key={e.id} className="flex items-center gap-1 text-xs border border-[#EEEEEE] rounded px-2 py-1">
                <span className="text-[#8E8E8E]">{e.label}:</span>
                <span className="font-medium text-[#393C41]">{e.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="text-xs font-semibold text-[#5C5E62] uppercase tracking-wider mb-2">Key Drivers</div>
        <div className="space-y-2">
          {data.keyDrivers.map((d, i) => (
            <div key={i} className="flex gap-2">
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${d.strength === "strong" ? "bg-[#22C55E]" : "bg-[#F59E0B]"}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[#393C41]">{d.driver}</p>
                {d.evidenceIds.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {d.evidenceIds.slice(0, 3).map(id => <EvidencePill key={id} id={id} />)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold text-[#5C5E62] uppercase tracking-wider mb-2">Upside Scenarios</div>
        <div className="space-y-2.5">
          {data.upsideScenarios.map((s, i) => (
            <div key={i} className="border border-[#EEEEEE] rounded p-2.5">
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className="text-sm font-medium text-[#393C41]">{s.scenario}</p>
                <ProbBadge p={s.probability} />
              </div>
              <p className="text-xs text-[#5C5E62]">{s.condition}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="pt-2 border-t border-[#EEEEEE]">
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#8E8E8E]">Bull Score</span>
          <span className="text-lg font-bold text-[#22C55E]">{data.bullScore}</span>
        </div>
        <div className="mt-1 h-2 bg-[#EEEEEE] rounded-full overflow-hidden">
          <div className="h-full bg-[#22C55E] rounded-full transition-all" style={{ width: `${data.bullScore}%` }} />
        </div>
      </div>
    </div>
  );
}

// ─── Bear Case panel ──────────────────────────────────────────────────────────

function BearPanel({ data }: { data: BearCase }) {
  return (
    <div className="bg-white border border-[#EEEEEE] rounded p-4 space-y-4">
      <MemberHeader title="Bear Analyst" subtitle="Strongest case against — risks, red flags, failure scenarios" color="#EF4444" />

      <div>
        <div className="text-xs font-semibold text-[#5C5E62] uppercase tracking-wider mb-1.5">Bear Thesis</div>
        <p className="text-sm text-[#393C41] leading-relaxed">{data.thesis}</p>
      </div>

      {data.contradictingEvidence.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-[#5C5E62] uppercase tracking-wider mb-1.5">Contradicting Evidence</div>
          <div className="flex flex-wrap gap-1.5">
            {data.contradictingEvidence.map(e => (
              <div key={e.id} className="flex items-center gap-1 text-xs border border-[#FCA5A5] rounded px-2 py-1">
                <span className="text-[#8E8E8E]">{e.label}:</span>
                <span className="font-medium text-[#991B1B]">{e.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="text-xs font-semibold text-[#5C5E62] uppercase tracking-wider mb-2">Red Flags</div>
        <div className="space-y-2">
          {data.redFlags.map((f, i) => (
            <div key={i} className="flex gap-2">
              <SevBadge s={f.severity} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[#393C41]">{f.flag}</p>
                {f.evidenceIds.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {f.evidenceIds.slice(0, 2).map(id => <EvidencePill key={id} id={id} />)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold text-[#5C5E62] uppercase tracking-wider mb-2">Failure Scenarios</div>
        <div className="space-y-2.5">
          {data.failureScenarios.map((s, i) => (
            <div key={i} className="border border-[#FCA5A5] rounded p-2.5">
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className="text-sm font-medium text-[#393C41]">{s.scenario}</p>
                <ProbBadge p={s.probability} />
              </div>
              <p className="text-xs text-[#5C5E62]">{s.trigger}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="pt-2 border-t border-[#EEEEEE]">
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#8E8E8E]">Bear Score</span>
          <span className="text-lg font-bold text-[#EF4444]">{data.bearScore}</span>
        </div>
        <div className="mt-1 h-2 bg-[#EEEEEE] rounded-full overflow-hidden">
          <div className="h-full bg-[#EF4444] rounded-full transition-all" style={{ width: `${data.bearScore}%` }} />
        </div>
      </div>
    </div>
  );
}

// ─── Risk Manager panel ───────────────────────────────────────────────────────

function RiskPanel({ data }: { data: RiskAssessment }) {
  const lvlColor = (l: "high" | "medium" | "low") =>
    l === "high" ? "#EF4444" : l === "medium" ? "#F59E0B" : "#22C55E";

  return (
    <div className="bg-white border border-[#EEEEEE] rounded p-4 space-y-4">
      <MemberHeader title="Risk Manager" subtitle="Portfolio impact, concentration, correlation, sizing" color="#F59E0B" />

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Portfolio Risk", value: `${data.portfolioRiskScore}/100`, color: data.portfolioRiskScore > 60 ? "#EF4444" : data.portfolioRiskScore > 35 ? "#F59E0B" : "#22C55E" },
          { label: "Suggested Size", value: `${data.positionSizeRecommendation.suggestedPct}%`, color: "#3E6AE1" },
          { label: "Max Size", value: `${data.positionSizeRecommendation.maxPct}%`, color: "#8E8E8E" },
        ].map(m => (
          <div key={m.label} className="text-center p-2 bg-[#F4F4F4] rounded">
            <div className="text-lg font-bold" style={{ color: m.color }}>{m.value}</div>
            <div className="text-[10px] text-[#8E8E8E] mt-0.5">{m.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 text-center text-xs">
        {[
          { label: "Starter", val: `${data.positionSizeRecommendation.starterPct}%` },
          { label: "Suggested", val: `${data.positionSizeRecommendation.suggestedPct}%` },
          { label: "Max", val: `${data.positionSizeRecommendation.maxPct}%` },
        ].map(r => (
          <div key={r.label} className="border border-[#EEEEEE] rounded p-1.5">
            <div className="font-medium text-[#393C41]">{r.val}</div>
            <div className="text-[10px] text-[#8E8E8E]">{r.label}</div>
          </div>
        ))}
      </div>

      <p className="text-xs text-[#5C5E62] italic">{data.positionSizeRecommendation.rationale}</p>

      {[
        { label: "Concentration Risk", level: data.concentrationRisk.level, detail: data.concentrationRisk.reasoning, extra: data.concentrationRisk.sectorExposure },
        { label: "Correlation Risk", level: data.correlationRisk.level, detail: data.correlationRisk.reasoning, extra: data.correlationRisk.correlatedTickers.length > 0 ? `Related: ${data.correlationRisk.correlatedTickers.join(", ")}` : "No correlated positions" },
      ].map(r => (
        <div key={r.label} className="border border-[#EEEEEE] rounded p-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-[#393C41]">{r.label}</span>
            <span className="text-xs font-bold" style={{ color: lvlColor(r.level) }}>{r.level.toUpperCase()}</span>
          </div>
          <p className="text-xs text-[#5C5E62]">{r.detail}</p>
          {r.extra && <p className="text-xs font-medium text-[#393C41] mt-1">{r.extra}</p>}
        </div>
      ))}

      <div className="border border-[#EEEEEE] rounded p-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold text-[#393C41]">Diversification Impact</span>
          <span className="text-xs font-bold" style={{ color: data.diversificationImpact.positive ? "#22C55E" : "#EF4444" }}>
            {data.diversificationImpact.positive ? "POSITIVE" : "NEGATIVE"}
          </span>
        </div>
        <p className="text-xs text-[#5C5E62]">{data.diversificationImpact.reasoning}</p>
      </div>
    </div>
  );
}

// ─── Thesis Auditor panel ─────────────────────────────────────────────────────

function AuditPanel({ data }: { data: ThesisAudit }) {
  const verdictStyle = {
    "well-supported": { color: "#14532D", bg: "#F0FDF4" },
    "partially-supported": { color: "#78350F", bg: "#FFFBEB" },
    "evidence-gaps": { color: "#7F1D1D", bg: "#FEF2F2" },
  }[data.overallVerdict];

  return (
    <div className="bg-white border border-[#EEEEEE] rounded p-4 space-y-4">
      <MemberHeader title="Thesis Auditor" subtitle="Verifies all claims — detects unsupported statements and evidence gaps" color="#8B5CF6" />

      <div className="flex items-center gap-3">
        <div className="text-center">
          <div className="text-3xl font-bold text-[#393C41]">{data.auditScore}</div>
          <div className="text-xs text-[#8E8E8E]">Audit Score</div>
        </div>
        <div className="flex-1">
          <div className="h-3 bg-[#EEEEEE] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${data.auditScore}%`, backgroundColor: data.auditScore >= 80 ? "#22C55E" : data.auditScore >= 60 ? "#F59E0B" : "#EF4444" }}
            />
          </div>
          <div className="mt-1.5">
            <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ color: verdictStyle.color, backgroundColor: verdictStyle.bg }}>
              {data.overallVerdict.replace(/-/g, " ")}
            </span>
          </div>
        </div>
      </div>

      {data.unsupportedClaims.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-[#5C5E62] uppercase tracking-wider mb-2">Unsupported Claims ({data.unsupportedClaims.length})</div>
          <div className="space-y-2">
            {data.unsupportedClaims.map((c, i) => (
              <div key={i} className="border border-[#FCA5A5] rounded p-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase ${c.source === "bull" ? "bg-[#F0FDF4] text-[#14532D]" : "bg-[#FEF2F2] text-[#991B1B]"}`}>{c.source}</span>
                </div>
                <p className="text-xs text-[#393C41] mb-1">{c.claim.slice(0, 120)}</p>
                <p className="text-xs text-[#991B1B]">⚠ {c.issue}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.missingEvidence.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-[#5C5E62] uppercase tracking-wider mb-2">Missing Evidence ({data.missingEvidence.length})</div>
          <div className="space-y-1">
            {data.missingEvidence.map((m, i) => (
              <p key={i} className="text-xs text-[#5C5E62]">• {m}</p>
            ))}
          </div>
        </div>
      )}

      {data.confidenceAdjustments.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-[#5C5E62] uppercase tracking-wider mb-2">Confidence Adjustments</div>
          <div className="space-y-1">
            {data.confidenceAdjustments.map((a, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="font-mono font-bold" style={{ color: a.adjustment < 0 ? "#EF4444" : "#22C55E" }}>
                  {a.adjustment > 0 ? "+" : ""}{a.adjustment}
                </span>
                <span className="text-[#8E8E8E]">{a.metric}</span>
                <span className="text-[#5C5E62] flex-1">— {a.reason.slice(0, 80)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.unsupportedClaims.length === 0 && (
        <p className="text-sm text-[#14532D] bg-[#F0FDF4] rounded p-2.5">All claims are backed by evidence IDs. No unsupported statements detected.</p>
      )}
    </div>
  );
}

// ─── Final Decision panel ─────────────────────────────────────────────────────

function DecisionPanel({ data, ticker }: { data: FinalDecision; ticker: string }) {
  const ds = DECISION_STYLES[data.recommendation] ?? DECISION_STYLES["Watch"];

  return (
    <div className="bg-white border-2 rounded p-5 space-y-4" style={{ borderColor: ds.border }}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold text-[#8E8E8E] uppercase tracking-wider mb-1">Portfolio Manager — Final Decision</div>
          <DecisionBadge d={data.recommendation} size="lg" />
        </div>
        <div className="text-right">
          <div className="text-xs text-[#8E8E8E] mb-1">Conviction Level</div>
          <ConvictionBar level={data.convictionLevel} />
        </div>
      </div>

      <ScoreBar bull={data.bullScore} bear={data.bearScore} />

      <p className="text-sm text-[#393C41] leading-relaxed border-l-2 pl-3" style={{ borderColor: ds.border }}>
        {data.summaryReasoning}
      </p>

      <div className="grid grid-cols-3 gap-3 text-center text-xs">
        <div className="bg-[#F4F4F4] rounded p-2">
          <div className="text-base font-bold text-[#3E6AE1]">{data.suggestedAllocation.pct}%</div>
          <div className="text-[#8E8E8E]">Suggested allocation</div>
        </div>
        <div className="bg-[#F4F4F4] rounded p-2">
          <div className="text-base font-bold text-[#393C41]">${data.suggestedAllocation.usd.toLocaleString()}</div>
          <div className="text-[#8E8E8E]">Estimated USD</div>
        </div>
        <div className="bg-[#F4F4F4] rounded p-2">
          <div className="text-base font-bold text-[#393C41]">{data.committeeSplit.bullStrength}/{data.committeeSplit.bearStrength}</div>
          <div className="text-[#8E8E8E]">Bull/Bear</div>
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold text-[#5C5E62] uppercase tracking-wider mb-2">Key Risks Acknowledged</div>
        <div className="space-y-1">
          {data.keyRisksAcknowledged.map((r, i) => (
            <p key={i} className="text-xs text-[#5C5E62]">▪ {r}</p>
          ))}
        </div>
      </div>

      <p className="text-xs text-[#8E8E8E] italic">{data.committeeSplit.reasoning}</p>
    </div>
  );
}

// ─── Session detail ───────────────────────────────────────────────────────────

type MemberTab = "bull" | "bear" | "risk" | "audit" | "decision";

function SessionDetail({ session }: { session: SessionDetail }) {
  const [tab, setTab] = useState<MemberTab>("decision");

  const tabs: { id: MemberTab; label: string; color: string }[] = [
    { id: "decision", label: "Final Decision", color: "#3E6AE1" },
    { id: "bull", label: "Bull Case", color: "#22C55E" },
    { id: "bear", label: "Bear Case", color: "#EF4444" },
    { id: "risk", label: "Risk Manager", color: "#F59E0B" },
    { id: "audit", label: "Thesis Audit", color: "#8B5CF6" },
  ];

  return (
    <div className="space-y-4">
      {/* Session header */}
      <div className="bg-white border border-[#EEEEEE] rounded p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl font-bold text-[#171A20]">{session.ticker}</span>
              <DecisionBadge d={session.conviction} size="lg" />
            </div>
            <div className="text-sm text-[#5C5E62]">{session.companyName}</div>
            <div className="flex items-center gap-2 mt-1">
              {session.sector && <span className="text-xs text-[#8E8E8E]">{session.sector}</span>}
              <span className="text-xs text-[#8E8E8E]">•</span>
              <span className="text-xs text-[#8E8E8E]">{session.universeTier.replace("tier", "Tier ")}</span>
              {session.evidenceCount != null && (
                <>
                  <span className="text-xs text-[#8E8E8E]">•</span>
                  <span className="text-xs text-[#8E8E8E]">{session.evidenceCount} facts</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div>
              <div className="text-xs text-[#8E8E8E] mb-1">Conviction</div>
              <ConvictionBar level={session.finalDecision.convictionLevel} />
            </div>
            <div className="text-right text-xs text-[#8E8E8E]">
              {new Date(session.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </div>
          </div>
        </div>
        <div className="mt-3">
          <ScoreBar bull={session.finalDecision.bullScore} bear={session.finalDecision.bearScore} />
        </div>
      </div>

      {/* Member tabs */}
      <div className="flex gap-1 flex-wrap">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="px-3 py-1.5 rounded text-xs font-medium transition-colors"
            style={tab === t.id
              ? { backgroundColor: t.color, color: "#fff" }
              : { backgroundColor: "#F4F4F4", color: "#5C5E62" }
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "decision" && <DecisionPanel data={session.finalDecision} ticker={session.ticker} />}
      {tab === "bull" && <BullPanel data={session.bullCase} />}
      {tab === "bear" && <BearPanel data={session.bearCase} />}
      {tab === "risk" && <RiskPanel data={session.riskAssessment} />}
      {tab === "audit" && <AuditPanel data={session.thesisAudit} />}
    </div>
  );
}

// ─── Universe queue item ──────────────────────────────────────────────────────

function QueueItem({
  entry,
  onReview,
  loading,
}: {
  entry: UniverseEntry;
  onReview: (ticker: string) => void;
  loading: boolean;
}) {
  return (
    <div className="bg-white border border-[#EEEEEE] rounded p-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-sm text-[#171A20]">{entry.ticker}</span>
          <span className="text-xs text-[#8E8E8E]">{entry.universeTier.replace("tier", "T")}</span>
        </div>
        <div className="text-xs text-[#5C5E62] truncate">{entry.companyName}</div>
        {entry.sector && <div className="text-xs text-[#8E8E8E] truncate">{entry.sector}</div>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {entry.latestScore && (
          <div className="text-center">
            <div className="text-sm font-bold text-[#3E6AE1]">{Math.round(entry.latestScore.totalScore)}</div>
            <div className="text-[9px] text-[#8E8E8E]">score</div>
          </div>
        )}
        <button
          onClick={() => onReview(entry.ticker)}
          disabled={loading}
          className="px-2.5 py-1 text-xs font-medium rounded border transition-colors disabled:opacity-50"
          style={{ borderColor: "#3E6AE1", color: "#3E6AE1" }}
        >
          {loading ? "…" : "Review"}
        </button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CommitteePage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSession, setActiveSession] = useState<SessionDetail | null>(null);
  const [universe, setUniverse] = useState<UniverseEntry[]>([]);
  const [tab, setTab] = useState<"queue" | "history">("history");
  const [loadingTicker, setLoadingTicker] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queueSearch, setQueueSearch] = useState("");

  const loadSessions = useCallback(async () => {
    const res = await fetch("/api/committee");
    const data = await res.json();
    setSessions(data.sessions ?? []);
  }, []);

  const loadUniverse = useCallback(async () => {
    const res = await fetch("/api/universe");
    const data = await res.json();
    setUniverse(data.items ?? []);
  }, []);

  useEffect(() => {
    loadSessions();
    loadUniverse();
  }, [loadSessions, loadUniverse]);

  const runReview = async (ticker: string) => {
    setLoadingTicker(ticker);
    setError(null);
    try {
      const res = await fetch("/api/committee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unknown error");
      setActiveSession(data as SessionDetail);
      setSessions(prev => [{ id: data.id, ticker: data.ticker, companyName: data.companyName, sector: data.sector, universeTier: data.universeTier, conviction: data.conviction, bullScore: data.finalDecision.bullScore, bearScore: data.finalDecision.bearScore, convictionLevel: data.finalDecision.convictionLevel, createdAt: data.createdAt }, ...prev]);
      setTab("history");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to run review");
    } finally {
      setLoadingTicker(null);
    }
  };

  const loadSessionDetail = async (id: string) => {
    const res = await fetch(`/api/committee/${id}`);
    const data = await res.json();
    const summary = sessions.find(s => s.id === id);
    setActiveSession({ ...summary!, ...data } as SessionDetail);
  };

  const filteredUniverse = universe.filter(e =>
    queueSearch === "" ||
    e.ticker.toLowerCase().includes(queueSearch.toLowerCase()) ||
    e.companyName.toLowerCase().includes(queueSearch.toLowerCase())
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#171A20]">Investment Committee</h1>
          <p className="text-sm text-[#8E8E8E] mt-0.5">Evidence-based debate system — every recommendation is challenged before capital is deployed</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[#8E8E8E]">{sessions.length} session{sessions.length !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {error && (
        <div className="bg-[#FEF2F2] border border-[#FCA5A5] text-[#991B1B] text-sm px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        {/* Left: queue + history */}
        <div className="space-y-4">
          <div className="flex gap-1">
            {(["history", "queue"] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="flex-1 py-1.5 text-xs font-medium rounded transition-colors"
                style={tab === t ? { backgroundColor: "#3E6AE1", color: "#fff" } : { backgroundColor: "#F4F4F4", color: "#5C5E62" }}
              >
                {t === "history" ? `Reviews (${sessions.length})` : "Queue"}
              </button>
            ))}
          </div>

          {tab === "history" && (
            <div className="space-y-4">
              {sessions.length === 0 && (
                <div className="text-center py-8 text-sm text-[#8E8E8E]">
                  No reviews yet. Open the Queue to start your first review.
                </div>
              )}
              {(["Strong Buy", "Buy", "Watch", "Hold", "Pass"] as const)
                .map(group => {
                  const grouped = sessions.filter(s => s.conviction === group);
                  if (grouped.length === 0) return null;
                  return (
                    <div key={group}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <DecisionBadge d={group} />
                        <span className="text-[10px] text-[#AAAAAA]">{grouped.length}</span>
                      </div>
                      <div className="space-y-1.5">
                        {grouped.map(s => (
                          <button
                            key={s.id}
                            onClick={() => loadSessionDetail(s.id)}
                            className={`w-full text-left bg-white border rounded p-3 transition-colors hover:border-[#3E6AE1] ${activeSession?.id === s.id ? "border-[#3E6AE1]" : "border-[#EEEEEE]"}`}
                          >
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="font-semibold text-sm text-[#171A20]">{s.ticker}</span>
                              <span className="text-[10px] text-[#8E8E8E]">
                                {new Date(s.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                              </span>
                            </div>
                            <div className="text-xs text-[#5C5E62] truncate mb-1">{s.companyName}</div>
                            <div className="flex items-center justify-between">
                              <ConvictionBar level={s.convictionLevel} />
                              <div className="flex items-center gap-1 text-[10px]">
                                <span className="text-[#22C55E]">▲ {s.bullScore}</span>
                                <span className="text-[#8E8E8E]">vs</span>
                                <span className="text-[#EF4444]">▼ {s.bearScore}</span>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })
              }
            </div>
          )}

          {tab === "queue" && (
            <div className="space-y-2">
              <input
                type="text"
                value={queueSearch}
                onChange={e => setQueueSearch(e.target.value)}
                placeholder="Search ticker or company…"
                className="w-full px-3 py-2 text-sm border border-[#EEEEEE] rounded bg-white focus:outline-none focus:border-[#3E6AE1]"
              />
              <div className="space-y-1.5 max-h-[calc(100vh-300px)] overflow-y-auto pr-0.5">
                {filteredUniverse.map(e => (
                  <QueueItem
                    key={e.ticker}
                    entry={e}
                    onReview={runReview}
                    loading={loadingTicker === e.ticker}
                  />
                ))}
                {filteredUniverse.length === 0 && (
                  <p className="text-sm text-center text-[#8E8E8E] py-6">No tickers match your search.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: active session detail */}
        <div>
          {loadingTicker && (
            <div className="bg-white border border-[#EEEEEE] rounded p-8 text-center space-y-3">
              <div className="text-[#3E6AE1] font-semibold">Running committee review for {loadingTicker}…</div>
              <p className="text-sm text-[#8E8E8E]">Bull Analyst, Bear Analyst, Risk Manager, Thesis Auditor, and Portfolio Manager are reviewing all available evidence.</p>
              <div className="flex justify-center gap-1 mt-2">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-2 h-2 rounded-full bg-[#3E6AE1] animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          )}
          {!loadingTicker && activeSession && <SessionDetail session={activeSession} />}
          {!loadingTicker && !activeSession && (
            <div className="bg-white border border-[#EEEEEE] rounded p-8 text-center space-y-3">
              <div className="text-4xl mb-2">⚖️</div>
              <div className="text-sm font-medium text-[#393C41]">No active session</div>
              <p className="text-sm text-[#8E8E8E]">
                Select a past review from the history, or open the Queue tab and click <strong>Review</strong> to start a new committee debate.
              </p>
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                {["NVDA", "NVO", "META", "MSFT"].map(t => (
                  <button
                    key={t}
                    onClick={() => { setTab("queue"); runReview(t); }}
                    disabled={!!loadingTicker}
                    className="px-3 py-1.5 text-xs font-medium rounded border border-[#3E6AE1] text-[#3E6AE1] hover:bg-[#EEF3FD] transition-colors disabled:opacity-50"
                  >
                    Review {t}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
