"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type {
  PortfolioBlueprintData,
  Regime,
  GapItem,
  ScenarioResult,
  CapitalAllocationPlan,
  CIOAnswers,
  BlueprintAllocation,
  ConcentrationRules,
} from "@/lib/architect-engine";

// ─── Design tokens ────────────────────────────────────────────────────────────

const REGIME_STYLE: Record<Regime, { bg: string; text: string; border: string; dot: string }> = {
  "Risk On":  { bg: "#eef7f1", text: "#2d7d46", border: "#c3e6cf", dot: "#2d7d46" },
  "Neutral":  { bg: "#fffbeb", text: "#b45309", border: "#fde68a", dot: "#b45309" },
  "Risk Off": { bg: "#fdf0ee", text: "#c0392b", border: "#f5c6c1", dot: "#c0392b" },
};

const GAP_ACTION: Record<string, { bg: string; text: string; label: string }> = {
  reduce:   { bg: "#fdf0ee", text: "#c0392b", label: "Reduce" },
  increase: { bg: "#eef7f1", text: "#2d7d46", label: "Increase" },
  maintain: { bg: "#F4F4F4", text: "#5C5E62", label: "Maintain" },
};

const PRIORITY_DOT: Record<string, string> = {
  high:   "bg-[#c0392b]",
  medium: "bg-[#b45309]",
  low:    "bg-[#AAAAAA]",
};

const SCENARIO_IMPACT: Record<string, { bg: string; text: string; label: string }> = {
  very_positive: { bg: "#eef7f1", text: "#2d7d46", label: "Very Positive" },
  positive:      { bg: "#f0f5ff", text: "#3E6AE1", label: "Positive" },
  neutral:       { bg: "#F4F4F4", text: "#5C5E62", label: "Neutral" },
  negative:      { bg: "#fffbeb", text: "#b45309", label: "Negative" },
  very_negative: { bg: "#fdf0ee", text: "#c0392b", label: "Very Negative" },
};

const HEDGE_ADEQUACY: Record<string, { text: string; label: string }> = {
  sufficient:   { text: "#2d7d46", label: "Hedge Sufficient" },
  adequate:     { text: "#b45309", label: "Hedge Adequate" },
  insufficient: { text: "#c0392b", label: "Hedge Insufficient" },
};

const MOVER_DIR: Record<string, { text: string; symbol: string }> = {
  up:   { text: "#2d7d46", symbol: "↑" },
  down: { text: "#c0392b", symbol: "↓" },
  flat: { text: "#5C5E62", symbol: "→" },
};

const DEPLOY_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  deploy:         { bg: "#eef7f1", text: "#2d7d46", label: "Deploy" },
  partial_deploy: { bg: "#f0f5ff", text: "#3E6AE1", label: "Partial Deploy" },
  hold:           { bg: "#fffbeb", text: "#b45309", label: "Hold Cash" },
};

type Tab = "blueprint" | "gaps" | "capital" | "scenarios";

// ─── Sub-components ───────────────────────────────────────────────────────────

function AllocationBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 text-xs text-[#5C5E62] text-right shrink-0">{label}</div>
      <div className="flex-1 bg-[#EEEEEE] rounded-full h-2 relative">
        <div
          className="absolute left-0 top-0 h-2 rounded-full"
          style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
        />
      </div>
      <div className="w-10 text-xs text-[#171A20] font-semibold text-right">{pct}%</div>
    </div>
  );
}

function BlueprintSection({
  regime,
  evidence,
  target,
  rules,
  answers,
  reasoning,
}: {
  regime: Regime;
  evidence: string[];
  target: BlueprintAllocation;
  rules: ConcentrationRules;
  answers: CIOAnswers;
  reasoning: string;
}) {
  const rs = REGIME_STYLE[regime];
  return (
    <div className="space-y-5">
      {/* Regime */}
      <div className="bg-white border border-[#EEEEEE] rounded-xl p-5">
        <div className="flex items-center gap-3 mb-3">
          <span
            className="px-3 py-1 rounded-full text-sm font-semibold border"
            style={{ background: rs.bg, color: rs.text, borderColor: rs.border }}
          >
            {regime}
          </span>
          <h2 className="text-sm font-semibold text-[#171A20]">Market Regime</h2>
        </div>
        <ul className="space-y-1">
          {evidence.map((e, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-[#5C5E62]">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: rs.dot }} />
              {e}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-[#5C5E62] leading-relaxed border-t border-[#EEEEEE] pt-3">{reasoning}</p>
      </div>

      {/* Target allocation */}
      <div className="bg-white border border-[#EEEEEE] rounded-xl p-5">
        <h2 className="text-sm font-semibold text-[#171A20] mb-4">Recommended Blueprint</h2>
        <div className="space-y-5">
          <div>
            <div className="text-xs font-semibold text-[#AAAAAA] uppercase tracking-widest mb-2">Style</div>
            <div className="space-y-2">
              <AllocationBar label="Growth" pct={target.growthPct} color="#3E6AE1" />
              <AllocationBar label="Value / Defensive" pct={target.valuePct} color="#2d7d46" />
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-[#AAAAAA] uppercase tracking-widest mb-2">Size</div>
            <div className="space-y-2">
              <AllocationBar label="Large Cap" pct={target.largeCap} color="#3E6AE1" />
              <AllocationBar label="Mid Cap"   pct={target.midCap}   color="#6890E6" />
              <AllocationBar label="Small Cap" pct={target.smallCap} color="#A0B4F0" />
              <AllocationBar label="International" pct={target.international} color="#8E8E8E" />
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-[#AAAAAA] uppercase tracking-widest mb-2">Risk</div>
            <div className="space-y-2">
              <AllocationBar label="Hedge / Gold" pct={target.hedge} color="#b45309" />
              <AllocationBar label="Cash Reserve" pct={target.cash}  color="#AAAAAA" />
            </div>
          </div>
        </div>
      </div>

      {/* Concentration rules */}
      <div className="bg-white border border-[#EEEEEE] rounded-xl p-5">
        <h2 className="text-sm font-semibold text-[#171A20] mb-3">Concentration Rules</h2>
        <div className="grid grid-cols-3 gap-4 mb-3">
          {[
            { label: "Max Positions", value: `≤${rules.maxPositions}` },
            { label: "Max Single Stock", value: `≤${rules.maxSingleStockPct}%` },
            { label: "Max Sector", value: `≤${rules.maxSectorPct}%` },
          ].map(r => (
            <div key={r.label} className="bg-[#F4F4F4] rounded-lg p-3 text-center">
              <div className="text-base font-semibold text-[#171A20]">{r.value}</div>
              <div className="text-xs text-[#8E8E8E] mt-0.5">{r.label}</div>
            </div>
          ))}
        </div>
        {rules.rationale && (
          <p className="text-xs text-[#5C5E62]">{rules.rationale}</p>
        )}
      </div>

      {/* CIO Answers */}
      <div className="bg-white border border-[#EEEEEE] rounded-xl p-5">
        <h2 className="text-sm font-semibold text-[#171A20] mb-4">CIO Answers</h2>
        <div className="space-y-4">
          {[
            {
              q: "Should I own small caps?",
              answer: answers.shouldOwnSmallCaps.answer === "yes" ? `Yes — ${answers.shouldOwnSmallCaps.pct}% target` :
                      answers.shouldOwnSmallCaps.answer === "no" ? "No" : `Small position — ${answers.shouldOwnSmallCaps.pct}%`,
              reason: answers.shouldOwnSmallCaps.reason,
              positive: answers.shouldOwnSmallCaps.answer === "yes",
              negative: answers.shouldOwnSmallCaps.answer === "no",
            },
            {
              q: "Should I own mid caps?",
              answer: answers.shouldOwnMidCaps.answer === "yes" ? `Yes — ${answers.shouldOwnMidCaps.pct}% target` :
                      answers.shouldOwnMidCaps.answer === "no" ? "No" : `Small position — ${answers.shouldOwnMidCaps.pct}%`,
              reason: answers.shouldOwnMidCaps.reason,
              positive: answers.shouldOwnMidCaps.answer === "yes",
              negative: answers.shouldOwnMidCaps.answer === "no",
            },
            {
              q: "Should I hedge?",
              answer: answers.shouldHedge.answer === "yes" ? `Yes — ${answers.shouldHedge.hedgePct}% hedge` :
                      answers.shouldHedge.answer === "no" ? "No" : `Partial — ${answers.shouldHedge.hedgePct}%`,
              reason: answers.shouldHedge.reason,
              positive: answers.shouldHedge.answer !== "no",
              negative: false,
            },
            {
              q: "How much cash should I hold?",
              answer: `${answers.targetCashPct.pct}% — $${answers.targetCashPct.usd.toLocaleString()}`,
              reason: answers.targetCashPct.reason,
              positive: false,
              negative: false,
            },
            {
              q: "How many stocks should I own?",
              answer: `${answers.targetPositionCount.min}–${answers.targetPositionCount.max} positions (currently ${answers.targetPositionCount.current})`,
              reason: answers.targetPositionCount.reason,
              positive: answers.targetPositionCount.current >= answers.targetPositionCount.min && answers.targetPositionCount.current <= answers.targetPositionCount.max,
              negative: answers.targetPositionCount.current < answers.targetPositionCount.min || answers.targetPositionCount.current > answers.targetPositionCount.max,
            },
          ].map(item => (
            <div key={item.q} className="border-b border-[#EEEEEE] pb-4 last:border-0 last:pb-0">
              <div className="flex items-start justify-between gap-4 mb-1">
                <div className="text-sm text-[#5C5E62]">{item.q}</div>
                <div
                  className="text-sm font-semibold shrink-0"
                  style={{ color: item.positive ? "#2d7d46" : item.negative ? "#c0392b" : "#171A20" }}
                >
                  {item.answer}
                </div>
              </div>
              <div className="text-xs text-[#8E8E8E] leading-relaxed">{item.reason}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GapSection({ gaps }: { gaps: GapItem[] }) {
  if (gaps.length === 0) {
    return (
      <div className="bg-white border border-[#EEEEEE] rounded-xl p-8 text-center text-sm text-[#8E8E8E]">
        Portfolio allocation is within target ranges — no significant gaps detected.
      </div>
    );
  }
  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[#EEEEEE]">
        <h2 className="text-sm font-semibold text-[#171A20]">Gap Analysis — Current vs Recommended</h2>
        <p className="text-xs text-[#8E8E8E] mt-0.5">Sorted by priority. Addresses single-stock, sector, size, and cash targets.</p>
      </div>
      <div className="divide-y divide-[#EEEEEE]">
        {gaps.map((gap, i) => {
          const as = GAP_ACTION[gap.action];
          return (
            <div key={i} className="px-5 py-4 flex items-start gap-4">
              <div className="mt-1.5">
                <span className={`inline-block w-2 h-2 rounded-full ${PRIORITY_DOT[gap.priority]}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-4 mb-1">
                  <div className="text-sm font-medium text-[#171A20]">{gap.dimension}</div>
                  <span
                    className="text-xs font-medium px-2 py-0.5 rounded-full shrink-0"
                    style={{ background: as.bg, color: as.text }}
                  >
                    {as.label}
                  </span>
                </div>
                <div className="flex items-center gap-6 mb-2">
                  <div className="text-xs text-[#5C5E62]">
                    <span className="text-[#8E8E8E]">Current</span>{" "}
                    <span className="font-semibold">{gap.current}%</span>
                  </div>
                  <div className="text-[#EEEEEE]">→</div>
                  <div className="text-xs text-[#5C5E62]">
                    <span className="text-[#8E8E8E]">Target</span>{" "}
                    <span className="font-semibold">{gap.target}%</span>
                  </div>
                  <div className="text-xs font-semibold" style={{ color: gap.gap > 0 ? "#2d7d46" : "#c0392b" }}>
                    {gap.gap > 0 ? "+" : ""}{gap.gap}%
                  </div>
                </div>
                {/* Visual bar */}
                <div className="relative h-1.5 bg-[#EEEEEE] rounded-full mb-2">
                  <div
                    className="absolute left-0 top-0 h-1.5 rounded-full bg-[#AAAAAA]"
                    style={{ width: `${Math.min(gap.current, 100)}%` }}
                  />
                  <div
                    className="absolute top-0 h-1.5 rounded-full"
                    style={{
                      left: `${Math.min(Math.min(gap.current, gap.target), 100)}%`,
                      width: `${Math.abs(gap.target - gap.current)}%`,
                      backgroundColor: gap.gap > 0 ? "#2d7d46" : "#c0392b",
                      opacity: 0.4,
                    }}
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3"
                    style={{ left: `${Math.min(gap.target, 100)}%`, backgroundColor: gap.gap > 0 ? "#2d7d46" : "#c0392b" }}
                  />
                </div>
                <p className="text-xs text-[#5C5E62]">{gap.reason}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CapitalSection({ plan }: { plan: CapitalAllocationPlan }) {
  const ds = DEPLOY_STYLE[plan.recommendation];
  return (
    <div className="space-y-4">
      {/* Summary card */}
      <div className="bg-white border border-[#EEEEEE] rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[#171A20]">Capital Allocation</h2>
          <span
            className="text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ background: ds.bg, color: ds.text }}
          >
            {ds.label}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="bg-[#F4F4F4] rounded-lg p-3 text-center">
            <div className="text-base font-semibold text-[#171A20]">${plan.availableCashUsd.toLocaleString()}</div>
            <div className="text-xs text-[#8E8E8E] mt-0.5">Available Cash</div>
          </div>
          <div className="bg-[#F4F4F4] rounded-lg p-3 text-center">
            <div className="text-base font-semibold text-[#2d7d46]">${plan.deployAmountUsd.toLocaleString()}</div>
            <div className="text-xs text-[#8E8E8E] mt-0.5">Deploy</div>
          </div>
          <div className="bg-[#F4F4F4] rounded-lg p-3 text-center">
            <div className="text-base font-semibold text-[#b45309]">${plan.holdAmountUsd.toLocaleString()}</div>
            <div className="text-xs text-[#8E8E8E] mt-0.5">Hold as Reserve</div>
          </div>
        </div>
        <div className="space-y-2 text-sm text-[#5C5E62]">
          {plan.deployAmountUsd > 0 && <p><span className="font-medium text-[#2d7d46]">Deploy:</span> {plan.deployReason}</p>}
          <p><span className="font-medium text-[#b45309]">Hold:</span> {plan.holdReason}</p>
        </div>
      </div>

      {/* Suggestions */}
      {plan.suggestions.length > 0 && (
        <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#EEEEEE]">
            <h3 className="text-sm font-semibold text-[#171A20]">Deployment Suggestions</h3>
            <p className="text-xs text-[#8E8E8E] mt-0.5">Ranked by committee conviction and opportunity score</p>
          </div>
          <div className="divide-y divide-[#EEEEEE]">
            {plan.suggestions.map((s, i) => (
              <div key={i} className="px-5 py-4">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/research?ticker=${s.ticker}`}
                        className="text-sm font-semibold text-[#3E6AE1] hover:underline"
                      >
                        {s.ticker}
                      </Link>
                      {s.committeeConviction && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-[#EEF3FD] text-[#3E6AE1]">
                          {s.committeeConviction}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[#8E8E8E]">{s.companyName}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-[#171A20]">${s.suggestedDollarAmount.toLocaleString()}</div>
                    <div className="text-xs text-[#8E8E8E]">
                      target {s.targetWeightPct}% · max {s.maxWeightPct}%
                    </div>
                  </div>
                </div>
                <p className="text-xs text-[#5C5E62]">{s.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {plan.suggestions.length === 0 && (
        <div className="bg-white border border-[#EEEEEE] rounded-xl p-8 text-center text-sm text-[#8E8E8E]">
          No deployment suggestions — committee Buy/Strong Buy signals pending or all candidates already in portfolio.
        </div>
      )}
    </div>
  );
}

function ScenarioCard({ sc }: { sc: ScenarioResult }) {
  const is = SCENARIO_IMPACT[sc.portfolioImpact];
  const ha = HEDGE_ADEQUACY[sc.hedgeAdequacy];
  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[#EEEEEE] flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[#171A20]">{sc.scenario}</h3>
          <p className="text-xs text-[#8E8E8E] mt-0.5">{sc.description}</p>
        </div>
        <div className="text-right shrink-0">
          <span
            className="inline-block text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ background: is.bg, color: is.text }}
          >
            {is.label}
          </span>
          <div className="text-xs font-semibold text-[#171A20] mt-1">{sc.estimatedReturnRange}</div>
        </div>
      </div>
      <div className="px-5 py-4">
        {/* Key movers */}
        {sc.keyMovers.length > 0 && (
          <div className="mb-4">
            <div className="text-xs font-semibold text-[#AAAAAA] uppercase tracking-widest mb-2">Key Movers</div>
            <div className="space-y-1.5">
              {sc.keyMovers.map(m => {
                const dir = MOVER_DIR[m.direction];
                return (
                  <div key={m.ticker} className="flex items-start gap-3 text-sm">
                    <span className="font-semibold w-14 shrink-0" style={{ color: dir.text }}>
                      {dir.symbol} {m.ticker}
                    </span>
                    <span className="text-xs text-[#5C5E62]">{m.magnitude} — {m.reason}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {/* Recommendation */}
        <div className="mb-3">
          <div className="text-xs font-semibold text-[#AAAAAA] uppercase tracking-widest mb-1">Recommendation</div>
          <p className="text-sm text-[#5C5E62]">{sc.recommendation}</p>
        </div>
        {/* Action items */}
        {sc.actionItems.length > 0 && (
          <div className="mb-3">
            <div className="text-xs font-semibold text-[#AAAAAA] uppercase tracking-widest mb-1">Actions</div>
            <ul className="space-y-1">
              {sc.actionItems.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-[#5C5E62]">
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-[#AAAAAA] shrink-0" />
                  {a}
                </li>
              ))}
            </ul>
          </div>
        )}
        {/* Hedge adequacy */}
        <div className="text-xs font-semibold" style={{ color: ha.text }}>{ha.label}</div>
      </div>
    </div>
  );
}

function EmptyState({ generating, onGenerate }: { generating: boolean; onGenerate: () => void }) {
  return (
    <div className="flex-1 flex items-center justify-center py-24">
      <div className="text-center max-w-sm">
        <div className="w-12 h-12 rounded-xl bg-[#F4F4F4] flex items-center justify-center mx-auto mb-4">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#AAAAAA" strokeWidth="1.5">
            <path d="M3 3h18v18H3z" rx="2" /><path d="M9 9h6M9 12h6M9 15h4" />
          </svg>
        </div>
        <h2 className="text-sm font-semibold text-[#171A20] mb-1">No Blueprint Yet</h2>
        <p className="text-sm text-[#8E8E8E] mb-4">Generate a portfolio blueprint to get CIO-level portfolio construction guidance.</p>
        <button
          onClick={onGenerate}
          disabled={generating}
          className="px-4 py-2 bg-[#3E6AE1] text-white text-sm font-medium rounded-lg hover:bg-[#3560d4] disabled:opacity-50"
        >
          {generating ? "Generating…" : "Generate Blueprint"}
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ArchitectPage() {
  const [blueprint, setBlueprint] = useState<(PortfolioBlueprintData & { id: string; createdAt: Date }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("blueprint");

  const fetchBlueprint = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/architect");
      const json = await res.json();
      setBlueprint(json.blueprint ?? null);
    } catch {
      setError("Failed to load blueprint");
    } finally {
      setLoading(false);
    }
  };

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/architect", { method: "POST" });
      if (!res.ok) throw new Error("Generation failed");
      const json = await res.json();
      setBlueprint(json.blueprint);
    } catch {
      setError("Generation failed — check server logs");
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => { fetchBlueprint(); }, []);

  const TABS: { key: Tab; label: string }[] = [
    { key: "blueprint",  label: "Blueprint" },
    { key: "gaps",       label: "Gap Analysis" },
    { key: "capital",    label: "Capital Allocation" },
    { key: "scenarios",  label: "Scenarios" },
  ];

  return (
    <div className="flex-1 bg-[#F4F4F4] flex flex-col min-h-0">
      {/* Header */}
      <div className="bg-white border-b border-[#EEEEEE] px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-[#171A20]">Portfolio Architect</h1>
            <p className="text-xs text-[#8E8E8E] mt-0.5">CIO-level portfolio construction guidance</p>
          </div>
          <div className="flex items-center gap-3">
            {blueprint && (
              <div className="text-xs text-[#AAAAAA]">
                Updated {new Date(blueprint.createdAt).toLocaleDateString()}
              </div>
            )}
            <button
              onClick={generate}
              disabled={generating || loading}
              className="px-3 py-1.5 bg-[#3E6AE1] text-white text-xs font-medium rounded-lg hover:bg-[#3560d4] disabled:opacity-50"
            >
              {generating ? "Generating…" : blueprint ? "Regenerate" : "Generate Blueprint"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 px-4 py-3 bg-[#fdf0ee] border border-[#f5c6c1] rounded-lg text-sm text-[#c0392b]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-sm text-[#8E8E8E]">Loading…</div>
        </div>
      ) : !blueprint ? (
        <EmptyState generating={generating} onGenerate={generate} />
      ) : (
        <>
          {/* Regime banner */}
          {(() => {
            const rs = REGIME_STYLE[blueprint.marketRegime as Regime];
            return (
              <div className="px-6 pt-5">
                <div
                  className="rounded-xl px-5 py-3 flex items-center justify-between border"
                  style={{ background: rs.bg, borderColor: rs.border }}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: rs.text }}>
                      {blueprint.marketRegime}
                    </span>
                    <span className="text-xs text-[#5C5E62]">
                      {blueprint.regimeEvidence[0]}
                    </span>
                  </div>
                  <div className="text-xs text-[#8E8E8E]">
                    Target cash {blueprint.targetAllocation.cash}% · Hedge {blueprint.targetAllocation.hedge}% · Max {blueprint.concentrationRules.maxPositions} positions
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Tabs */}
          <div className="px-6 pt-4">
            <div className="flex gap-1 bg-white border border-[#EEEEEE] rounded-xl p-1 w-fit">
              {TABS.map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    tab === t.key
                      ? "bg-[#3E6AE1] text-white"
                      : "text-[#5C5E62] hover:text-[#171A20]"
                  }`}
                >
                  {t.label}
                  {t.key === "gaps" && blueprint.gapAnalysis.length > 0 && (
                    <span className="ml-1.5 bg-white/30 rounded-full px-1.5 text-[10px]">
                      {blueprint.gapAnalysis.length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-auto px-6 py-5">
            {tab === "blueprint" && (
              <BlueprintSection
                regime={blueprint.marketRegime as Regime}
                evidence={blueprint.regimeEvidence}
                target={blueprint.targetAllocation}
                rules={blueprint.concentrationRules}
                answers={blueprint.cioAnswers}
                reasoning={blueprint.reasoning}
              />
            )}
            {tab === "gaps" && <GapSection gaps={blueprint.gapAnalysis} />}
            {tab === "capital" && <CapitalSection plan={blueprint.capitalAllocation} />}
            {tab === "scenarios" && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {blueprint.scenarioAnalysis.map(sc => (
                  <ScenarioCard key={sc.scenario} sc={sc} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
