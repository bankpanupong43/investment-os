"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

type MarketRegime = "Risk On" | "Neutral" | "Risk Off";
type CIOCategory = "BUY" | "ADD" | "HOLD" | "REDUCE" | "EXIT" | "WATCH";

interface CIOAction {
  priority: number;
  category: CIOCategory;
  ticker?: string;
  title: string;
  reason: string;
  confidence: number;
  evidence: string[];
  sourceSystems: string[];
}

interface MorningBrief {
  id: string;
  briefingDate: string;
  marketRegime: MarketRegime;
  marketRegimeEvidence: string[];
  newsletterConsensus?: { source: string; title: string; portfolioRelevance: "bullish" | "neutral" | "bearish"; summary: string[] }[];
}

interface ArchitectureReview {
  id: string;
  reviewDate: string;
  marketRegime: string;
  architectureScore: { total: number; diversification: number; concentration: number; hedgeQuality: number; regimeResilience: number; grade: string; label: string };
  hedgeAudit?: { hedgeScore: number; verdict: string } | null;
}

interface OpportunityEntry {
  ticker: string;
  companyName: string;
  objectiveScore: number;
  recommendation: string;
}

interface DecisionReview {
  id: string;
  ticker: string;
  thesisStatus: string;
  verdict: string;
  confidence: number;
  reviewDate: string;
}

interface PortfolioValue {
  totalValueThb: number;
  totalValueUsd: number;
  usdthb: number;
  totalCashThb: number;
  totalEquityUsd: number;
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bg-[#EEEEEE] rounded-xl animate-pulse ${className}`} />;
}

// ─── CIO Actions Card ─────────────────────────────────────────────────────────

const CATEGORY_STYLE: Record<CIOCategory, { bg: string; text: string; border: string }> = {
  EXIT:   { bg: "#FEF2F2", text: "#991B1B", border: "#FCA5A5" },
  REDUCE: { bg: "#FFF7ED", text: "#92400E", border: "#FED7AA" },
  ADD:    { bg: "#F0FDF4", text: "#15803D", border: "#86EFAC" },
  BUY:    { bg: "#EEF3FD", text: "#3E6AE1", border: "#BFDBFE" },
  WATCH:  { bg: "#FFFBEB", text: "#D97706", border: "#FDE68A" },
  HOLD:   { bg: "#F4F4F4", text: "#5C5E62", border: "#DDDDDD" },
};

function actionLink(action: CIOAction & { bucket?: string }): string {
  if (!action.ticker) {
    // Bucket-level allocation action — deep-link to allocation tab not possible without URL routing;
    // send to portfolio page so user can open Allocation tab
    return "/portfolio";
  }
  if (action.category === "EXIT" || action.category === "REDUCE" || action.category === "ADD") {
    return `/portfolio/${action.ticker}`;
  }
  if (action.category === "BUY" || action.category === "WATCH") {
    return `/research?q=${action.ticker}`;
  }
  return `/portfolio/${action.ticker}`;
}

function CioActionsCard({ actions, loading }: { actions: CIOAction[]; loading: boolean }) {
  const top5 = actions.slice(0, 5);

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest">CIO Actions</div>
          <div className="text-xs text-[#8E8E8E] mt-0.5">What should I do next?</div>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/ask" className="text-[11px] text-[#3E6AE1] hover:underline font-medium">Ask CIO →</Link>
          <Link href="/portfolio" className="text-[11px] text-[#8E8E8E] hover:underline">All →</Link>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14" />)}
        </div>
      ) : top5.length === 0 ? (
        <div className="py-6 text-center text-sm text-[#8E8E8E]">
          No actions generated. Ensure opportunities are scored and decision reviews exist.
        </div>
      ) : (
        <div className="space-y-2">
          {top5.map((action, i) => {
            const s = CATEGORY_STYLE[action.category];
            const href = actionLink(action);
            return (
              <Link
                key={i}
                href={href}
                className="flex items-center gap-3 p-3 rounded-xl border hover:bg-[#F4F4F4] transition-colors"
                style={{ borderColor: s.border }}
              >
                {/* Priority + category badge */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="w-5 text-xs text-[#AAAAAA] font-medium tabular-nums">{action.priority}.</span>
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide"
                    style={{ backgroundColor: s.bg, color: s.text }}
                  >
                    {action.category}
                  </span>
                </div>

                {/* Title + reason */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-[#171A20] leading-tight">{action.title}</div>
                  <div className="text-xs text-[#8E8E8E] truncate mt-0.5">{action.reason}</div>
                </div>

                {/* Confidence + sources */}
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span
                    className="text-xs font-bold tabular-nums"
                    style={{ color: action.confidence >= 85 ? "#15803D" : action.confidence >= 70 ? "#D97706" : "#DC2626" }}
                  >
                    {action.confidence}%
                  </span>
                  <div className="flex gap-1 flex-wrap justify-end">
                    {action.sourceSystems.slice(0, 2).map(src => (
                      <span key={src} className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-[#F4F4F4] text-[#8E8E8E]">
                        {src.split(" ")[0]}
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Regime Card ──────────────────────────────────────────────────────────────

const REGIME_STYLES: Record<MarketRegime, { bg: string; border: string; badge: string; text: string; dot: string }> = {
  "Risk On":  { bg: "#F0FDF4", border: "#86EFAC", badge: "#15803D", text: "#14532D", dot: "#15803D" },
  "Neutral":  { bg: "#EEF3FD", border: "#93C5FD", badge: "#3E6AE1", text: "#1E40AF", dot: "#3E6AE1" },
  "Risk Off": { bg: "#FEF2F2", border: "#FCA5A5", badge: "#DC2626", text: "#991B1B", dot: "#DC2626" },
};

function RegimeCard({ brief }: { brief: MorningBrief | null }) {
  if (!brief) return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl p-5">
      <div className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest mb-3">Current Regime</div>
      <div className="text-sm text-[#8E8E8E]">No brief available — run Morning Brief to generate.</div>
    </div>
  );

  const regime = brief.marketRegime;
  const s = REGIME_STYLES[regime] ?? REGIME_STYLES["Neutral"];
  const evidence = (brief.marketRegimeEvidence ?? []).slice(0, 3);

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest">Current Regime</div>
        <Link href="/intelligence" className="text-[11px] text-[#3E6AE1] hover:underline">Brief →</Link>
      </div>
      <div className="flex items-center gap-3">
        <div
          className="px-3 py-1.5 rounded-lg text-sm font-semibold"
          style={{ backgroundColor: s.bg, color: s.badge, border: `1px solid ${s.border}` }}
        >
          {regime}
        </div>
        <div className="text-xs text-[#5C5E62]">{new Date(brief.briefingDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
      </div>
      {evidence.length > 0 && (
        <ul className="space-y-1">
          {evidence.map((e, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-[#5C5E62]">
              <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: s.dot }} />
              {e}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Portfolio Health Card ────────────────────────────────────────────────────

function ScoreGauge({ label, score, color }: { label: string; score: number | null; color: string }) {
  const pct = score ?? 0;
  const display = score == null ? "—" : score.toFixed(0);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-[#5C5E62]">{label}</span>
        <span className="text-xs font-semibold" style={{ color }}>{display}</span>
      </div>
      <div className="h-1.5 bg-[#EEEEEE] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function fmtThb(n: number): string {
  return "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function PortfolioHealthCard({ review, portValue }: { review: ArchitectureReview | null; portValue: PortfolioValue | null }) {
  const arch  = review?.architectureScore;
  const grade = arch?.grade;
  const gradeColor = grade === "A" ? "#15803D" : grade === "B" ? "#3E6AE1" : grade === "C" ? "#D97706" : "#DC2626";

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest">Portfolio</div>
        <Link href="/portfolio" className="text-[11px] text-[#3E6AE1] hover:underline">Portfolio →</Link>
      </div>

      {/* Live value from PortfolioHolding + CashAccount */}
      {portValue && portValue.totalValueThb > 0 ? (
        <div className="space-y-1">
          <div className="text-2xl font-semibold text-[#171A20] tabular-nums">{fmtThb(portValue.totalValueThb)}</div>
          <div className="text-xs text-[#8E8E8E] tabular-nums">
            ${Math.round(portValue.totalValueUsd).toLocaleString()} USD · 1 USD = {portValue.usdthb.toFixed(2)} THB
          </div>
          <div className="flex gap-4 pt-1 text-xs text-[#5C5E62]">
            <span>Equity <span className="font-semibold text-[#171A20]">${Math.round(portValue.totalEquityUsd).toLocaleString()}</span></span>
            <span>Cash <span className="font-semibold text-[#171A20]">{fmtThb(portValue.totalCashThb)}</span></span>
          </div>
        </div>
      ) : (
        <div className="text-sm text-[#8E8E8E]">Add holdings on the Portfolio page to see live value.</div>
      )}

      {/* Architecture score if available */}
      {arch && grade && (
        <div className="flex items-center gap-3 pt-1 border-t border-[#F4F4F4]">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2"
            style={{ color: gradeColor, borderColor: gradeColor }}>
            {grade}
          </div>
          <div>
            <div className="text-sm font-semibold text-[#171A20]">{arch.total}/100</div>
            <div className="text-[11px] text-[#8E8E8E]">{arch.label}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Top Opportunities Card ───────────────────────────────────────────────────

function TopOpportunitiesCard({ opportunities }: { opportunities: OpportunityEntry[] }) {
  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest">Top Opportunities</div>
        <Link href="/opportunities" className="text-[11px] text-[#3E6AE1] hover:underline">All →</Link>
      </div>
      {opportunities.length === 0 ? (
        <div className="text-sm text-[#8E8E8E]">No opportunities scored.</div>
      ) : (
        <ol className="space-y-2">
          {opportunities.slice(0, 5).map((o, i) => (
            <li key={o.ticker} className="flex items-center gap-3">
              <span className="w-5 text-xs text-[#AAAAAA] font-medium tabular-nums">{i + 1}.</span>
              <span className="font-semibold text-sm text-[#171A20] w-12">{o.ticker}</span>
              <span className="text-xs text-[#8E8E8E] flex-1 truncate">{o.companyName}</span>
              <span className="text-xs font-medium text-[#3E6AE1] tabular-nums">{o.objectiveScore.toFixed(0)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ─── Decision Alerts Card ─────────────────────────────────────────────────────

const VERDICT_STYLE: Record<string, { bg: string; text: string }> = {
  "Exit":   { bg: "#FEF2F2", text: "#991B1B" },
  "Reduce": { bg: "#FFFBEB", text: "#92400E" },
  "Broken": { bg: "#FEF2F2", text: "#991B1B" },
};

function DecisionAlertsCard({ reviews }: { reviews: DecisionReview[] }) {
  const alerts = reviews.filter(r => r.verdict === "Exit" || r.verdict === "Reduce" || r.thesisStatus === "Broken");
  if (alerts.length === 0) return null;

  return (
    <div className="bg-white border border-[#FCA5A5] rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold text-[#DC2626] uppercase tracking-widest">Decision Alerts</div>
        <Link href="/portfolio" className="text-[11px] text-[#3E6AE1] hover:underline">Review →</Link>
      </div>
      <div className="space-y-2">
        {alerts.map(r => {
          const key = r.verdict === "Exit" ? "Exit" : r.verdict === "Reduce" ? "Reduce" : "Broken";
          const s = VERDICT_STYLE[key];
          return (
            <Link key={r.id} href={`/portfolio/${r.ticker}`} className="flex items-center justify-between gap-2 hover:bg-[#F4F4F4] rounded-lg p-1 -mx-1 transition-colors">
              <div className="flex items-center gap-2">
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wide"
                  style={{ backgroundColor: s.bg, color: s.text }}
                >
                  {key}
                </span>
                <span className="text-sm font-semibold text-[#171A20]">{r.ticker}</span>
              </div>
              <span className="text-[11px] text-[#8E8E8E]">{r.thesisStatus}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ─── Allocation Alignment Card ───────────────────────────────────────────────

interface AllocationAlignmentData {
  alignmentPct: number;
  allocationGrade: string;
  regime: string;
  largestUnderweight: { label: string; gapPct: number } | null;
  largestOverweight: { label: string; gapPct: number } | null;
  topDriver: string;
  largestThemeGap: { label: string; gapPct: number } | null;
  largestThemeOverweight: { label: string; gapPct: number } | null;
}

function AllocationAlignmentCard({ data, loading }: { data: AllocationAlignmentData | null; loading: boolean }) {
  const gradeColor = data
    ? (data.allocationGrade === "A" ? "#15803D" : data.allocationGrade === "B" ? "#3E6AE1" : data.allocationGrade === "C" ? "#D97706" : "#DC2626")
    : "#8E8E8E";

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest">Allocation &amp; Themes</div>
        <Link href="/portfolio" className="text-[11px] text-[#3E6AE1] hover:underline">Portfolio →</Link>
      </div>
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-40" />
        </div>
      ) : !data ? (
        <div className="text-sm text-[#8E8E8E]">No allocation data — run morning brief to generate.</div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold border-2"
              style={{ color: gradeColor, borderColor: gradeColor }}
            >
              {data.allocationGrade}
            </div>
            <div>
              <div className="text-xl font-semibold text-[#171A20]">{data.alignmentPct}%</div>
              <div className="text-xs text-[#8E8E8E]">aligned to {data.regime} target</div>
            </div>
          </div>
          <div className="space-y-1.5">
            {data.largestUnderweight && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#5C5E62]">Bucket Gap</span>
                <span className="font-semibold text-[#15803D]">
                  {data.largestUnderweight.label} +{data.largestUnderweight.gapPct.toFixed(1)}%
                </span>
              </div>
            )}
            {data.largestOverweight && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#5C5E62]">Bucket Excess</span>
                <span className="font-semibold text-[#DC2626]">
                  {data.largestOverweight.label} {data.largestOverweight.gapPct.toFixed(1)}%
                </span>
              </div>
            )}
            {data.largestThemeGap && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#5C5E62]">Theme Gap</span>
                <span className="font-semibold text-[#15803D]">
                  {data.largestThemeGap.label} +{data.largestThemeGap.gapPct.toFixed(1)}%
                </span>
              </div>
            )}
            {data.largestThemeOverweight && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#5C5E62]">Theme Excess</span>
                <span className="font-semibold text-[#DC2626]">
                  {data.largestThemeOverweight.label} {data.largestThemeOverweight.gapPct.toFixed(1)}%
                </span>
              </div>
            )}
            {data.topDriver && data.topDriver !== "Neutral allocation — no active drivers" && (
              <div className="flex items-start justify-between text-xs gap-2">
                <span className="text-[#5C5E62] shrink-0">Top Driver</span>
                <span className="font-medium text-[#5C5E62] text-right leading-tight">{data.topDriver}</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Newsletter Consensus Card ────────────────────────────────────────────────

const REL_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
  bullish: { bg: "#F0FDF4", text: "#15803D", dot: "#15803D" },
  neutral: { bg: "#F4F4F4", text: "#5C5E62", dot: "#8E8E8E" },
  bearish: { bg: "#FEF2F2", text: "#DC2626", dot: "#DC2626" },
};

function NewsletterConsensusCard({ brief }: { brief: MorningBrief | null }) {
  const items = brief?.newsletterConsensus ?? [];

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest">Newsletter Consensus</div>
        <Link href="/intelligence" className="text-[11px] text-[#3E6AE1] hover:underline">Intelligence →</Link>
      </div>
      {items.length === 0 ? (
        <div className="text-sm text-[#8E8E8E]">No newsletter data — run intelligence refresh to populate.</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.slice(0, 6).map((item, i) => {
            const rel = item.portfolioRelevance;
            const s = REL_STYLE[rel] ?? REL_STYLE.neutral;
            const label = rel.charAt(0).toUpperCase() + rel.slice(1);
            const topic = item.title.split(/[:\-–]/)[0].trim().slice(0, 24);
            return (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                style={{ backgroundColor: s.bg, color: s.text }}
                title={item.title}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: s.dot }} />
                {label} {topic}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Emerging Themes Card ─────────────────────────────────────────────────────

type ThemeStatus   = "emerging" | "accelerating" | "weakening" | "stable";
type ThemeMomentum = "Rising" | "Stable" | "Falling";

interface ThemeScoutEntry {
  theme:      string;
  score:      number;
  status:     ThemeStatus;
  momentum:   ThemeMomentum;
  confidence: string;
  drivers:    string[];
  candidates: { ticker: string; reason: string; radarScore: number }[];
  isExtended: boolean;
}

interface ThemeScoutReport {
  emerging:     ThemeScoutEntry[];
  accelerating: ThemeScoutEntry[];
  weakening:    ThemeScoutEntry[];
  all:          ThemeScoutEntry[];
  generatedAt:  string;
}

const STATUS_STYLE: Record<ThemeStatus, { bg: string; text: string; label: string }> = {
  emerging:     { bg: "#EEF3FD", text: "#3E6AE1", label: "Emerging"     },
  accelerating: { bg: "#F0FDF4", text: "#15803D", label: "Accelerating" },
  weakening:    { bg: "#FEF2F2", text: "#991B1B", label: "Weakening"    },
  stable:       { bg: "#F4F4F4", text: "#5C5E62", label: "Stable"       },
};

const MOMENTUM_ARROW: Record<ThemeMomentum, string> = {
  Rising:  "↑",
  Stable:  "→",
  Falling: "↓",
};

function EmergingThemesCard({ report, loading }: { report: ThemeScoutReport | null; loading: boolean }) {
  const top = report
    ? [...report.emerging, ...report.accelerating].slice(0, 5)
    : [];

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest">Emerging Themes</div>
          <div className="text-xs text-[#8E8E8E] mt-0.5">What should I be researching next?</div>
        </div>
        <Link href="/ask?q=What+themes+are+emerging%3F" className="text-[11px] text-[#3E6AE1] hover:underline">Ask →</Link>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : top.length === 0 ? (
        <div className="text-sm text-[#8E8E8E]">
          No theme signals yet — run the Theme Scout from the Automation page.
        </div>
      ) : (
        <ol className="space-y-2">
          {top.map((t, i) => {
            const s = STATUS_STYLE[t.status] ?? STATUS_STYLE.stable;
            const arrow = MOMENTUM_ARROW[t.momentum] ?? "→";
            const arrowColor = t.momentum === "Rising" ? "#15803D" : t.momentum === "Falling" ? "#DC2626" : "#8E8E8E";
            return (
              <li key={t.theme} className="flex items-start gap-3 p-2 rounded-xl hover:bg-[#F4F4F4] transition-colors">
                <span className="w-5 text-xs text-[#AAAAAA] font-medium tabular-nums mt-0.5">{i + 1}.</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[#171A20] truncate">{t.theme}</span>
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0"
                      style={{ backgroundColor: s.bg, color: s.text }}
                    >
                      {s.label}
                    </span>
                  </div>
                  {t.drivers[0] && (
                    <div className="text-xs text-[#8E8E8E] truncate mt-0.5">{t.drivers[0]}</div>
                  )}
                  {t.candidates.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {t.candidates.slice(0, 3).map(c => (
                        <Link
                          key={c.ticker}
                          href={`/research?q=${c.ticker}`}
                          className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#EEF3FD] text-[#3E6AE1] hover:bg-[#3E6AE1] hover:text-white transition-colors"
                        >
                          {c.ticker}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-sm font-bold text-[#171A20] tabular-nums">{t.score}</span>
                  <span className="text-sm font-bold" style={{ color: arrowColor }}>{arrow}</span>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {report && (
        <div className="pt-2 border-t border-[#F4F4F4] flex items-center justify-between">
          <span className="text-[10px] text-[#AAAAAA]">
            {report.emerging.length} emerging · {report.accelerating.length} accelerating · {report.weakening.length} weakening
          </span>
          <span className="text-[10px] text-[#AAAAAA]">
            {new Date(report.generatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [cioActions, setCioActions] = useState<CIOAction[]>([]);
  const [cioLoading, setCioLoading] = useState(true);
  const [brief, setBrief] = useState<MorningBrief | null>(null);
  const [archReview, setArchReview] = useState<ArchitectureReview | null>(null);
  const [opportunities, setOpportunities] = useState<OpportunityEntry[]>([]);
  const [decisionReviews, setDecisionReviews] = useState<DecisionReview[]>([]);
  const [allocationData, setAllocationData] = useState<AllocationAlignmentData | null>(null);
  const [allocationLoading, setAllocationLoading] = useState(true);
  const [portValue, setPortValue] = useState<PortfolioValue | null>(null);
  const [loading, setLoading] = useState(true);
  const [themeScout, setThemeScout] = useState<ThemeScoutReport | null>(null);
  const [themeScoutLoading, setThemeScoutLoading] = useState(true);

  useEffect(() => {
    // CIO actions load independently (may be slow)
    fetch("/api/cio-actions").then(r => r.ok ? r.json() : null).then(d => {
      if (d?.actions) setCioActions(d.actions);
    }).catch(() => {}).finally(() => setCioLoading(false));

    // Theme Scout loads independently
    fetch("/api/theme-scout").then(r => r.ok ? r.json() : null).then(d => {
      if (d?.all) setThemeScout(d as ThemeScoutReport);
    }).catch(() => {}).finally(() => setThemeScoutLoading(false));

    // Allocation + theme reviews load in parallel (both feed the same card)
    Promise.all([
      fetch("/api/allocation-review").then(r => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/theme-allocation").then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([alloc, theme]) => {
      if (alloc) setAllocationData({
        alignmentPct: alloc.alignmentPct,
        allocationGrade: alloc.allocationGrade,
        regime: alloc.regime,
        largestUnderweight: alloc.largestUnderweight,
        largestOverweight: alloc.largestOverweight,
        topDriver: alloc.topDriver ?? "",
        largestThemeGap: theme?.largestThemeGap ?? null,
        largestThemeOverweight: theme?.largestThemeOverweight ?? null,
      });
    }).catch(() => {}).finally(() => setAllocationLoading(false));

    // Everything else in parallel
    Promise.all([
      fetch("/api/morning-brief").then(r => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/portfolio-architecture").then(r => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/opportunities").then(r => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/decision-review").then(r => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/portfolio-value").then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([briefData, archData, oppData, decData, pvData]) => {
      if (briefData) setBrief(briefData);
      if (archData?.review) setArchReview(archData.review);
      if (oppData?.entries) setOpportunities((oppData.entries as OpportunityEntry[]).slice(0, 5));
      if (decData?.reviews) setDecisionReviews(decData.reviews);
      if (pvData?.totalValueThb) setPortValue(pvData as PortfolioValue);
    }).finally(() => setLoading(false));
  }, []);

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const alerts = decisionReviews.filter(r => r.verdict === "Exit" || r.verdict === "Reduce" || r.thesisStatus === "Broken");

  if (loading && cioLoading) {
    return (
      <div className="p-6 lg:p-8 space-y-6 max-w-5xl">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-medium text-[#171A20]">Dashboard</h1>
        <p className="text-[#8E8E8E] text-sm mt-0.5">{today}</p>
      </div>

      {/* Row 0: CIO Actions — always first */}
      <CioActionsCard actions={cioActions} loading={cioLoading} />

      {/* Row 1: Regime + Portfolio Health + Allocation Alignment */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <RegimeCard brief={brief} />
        <PortfolioHealthCard review={archReview} portValue={portValue} />
        <AllocationAlignmentCard data={allocationData} loading={allocationLoading} />
      </div>

      {/* Row 2: Top Opportunities + Decision Alerts (conditional) */}
      <div className={`grid grid-cols-1 gap-4 ${alerts.length > 0 ? "md:grid-cols-2" : ""}`}>
        <TopOpportunitiesCard opportunities={opportunities} />
        {alerts.length > 0 && <DecisionAlertsCard reviews={decisionReviews} />}
      </div>

      {/* Row 3: Emerging Themes + Newsletter Consensus */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <EmergingThemesCard report={themeScout} loading={themeScoutLoading} />
        <NewsletterConsensusCard brief={brief} />
      </div>
    </div>
  );
}
