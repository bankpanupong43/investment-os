// NarrativeBriefRenderer — Phase 12C.3: Morning Investment Podcast
//
// Writes as a CIO speaking directly to the investor — not a structured report.
// Target: 750–1,500 words (5–10 minutes at 150 wpm).
// Section order: Exec Summary → Portfolio Impact → Key Risks → Market Context → Opportunities → Actions
//
// Guarantees:
//   - No machine terminology (Risk On/Off, Kill Criteria, Impact X/5, High Confidence, etc.)
//   - HTML entities decoded; SEC filing boilerplate never surfaces
//   - Internal job / system names never appear
//   - CPI raw index values stripped — only YoY % shown
//   - Each ticker mentioned at most once in the opportunities section
//   - Natural spoken transitions throughout — sounds like a private investment podcast

import type {
  CIOBriefDocument,
  EnrichedRadarEntry,
  EnrichedThesisStatus,
} from "./brief-generator";

// ─── HTML entity decoder ──────────────────────────────────────────────────────

export const NAMED_ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">",
  "&quot;": '"', "&apos;": "'", "&nbsp;": " ",
  "&ndash;": "–", "&mdash;": "—",
  "&lsquo;": "'", "&rsquo;": "'",
  "&ldquo;": '"', "&rdquo;": '"',
  "&hellip;": "...", "&bull;": "",
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&[a-z]+;/gi, m => NAMED_ENTITIES[m.toLowerCase()] ?? "")
    .replace(/&#x[\dA-Fa-f]+;/g, "")
    .replace(/&#\d+;/g, "");
}

// ─── Content sanitizer ────────────────────────────────────────────────────────

export const SEC_BOILERPLATE: RegExp[] = [
  /\bItem\s+\d+[A-Z]?\b/,
  /DOCUMENTS\s+INCORPORATED\s+BY\s+REFERENCE/i,
  /Indicate\s+by\s+check\s+mark/i,
  /\bcheck\s+mark\s+whether/i,
  /registrant\s+has\s+submitted/i,
  /pursuant\s+to\s+(Rule|Section)\s+\d/i,
  /\b(Exchange\s+Act|Securities\s+Act)\s+of\s+\d{4}/i,
];

export const INTERNAL_REFS: [RegExp, string][] = [
  [/—?\s*run\s+[a-z_]+\s+to\s+[^.]+\./gi,       ""],
  [/—?\s*trigger\s+[a-z_]+\s+to\s+[^.]+\./gi,   ""],
  [/\brun\s+[a-z]+_[a-z]+\b[^.]*\.?/gi,          ""],
  [/\bFRED\b/g,                                    ""],
  [/\bFMP\b/g,                                     ""],
  [/\(FRED[^)]*\)/g,                               ""],
  [/\(Yahoo Finance[^)]*\)/g,                      ""],
  [/\(FMP[^)]*\)/g,                                ""],
  [/macro_ingestion|opportunity_refresh|radar_refresh/gi, ""],
];

export function hasSECBoilerplate(s: string): boolean {
  return SEC_BOILERPLATE.some(p => p.test(s));
}

export function clean(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = decodeEntities(raw);
  for (const [pattern, replacement] of INTERNAL_REFS) {
    s = s.replace(pattern, replacement);
  }
  return s.replace(/\s{2,}/g, " ").replace(/^[,;:\s]+/, "").replace(/,\s*\./g, ".").trim();
}

export function isUnavailable(s: string): boolean {
  return /unavailable|not available|no data/i.test(s);
}

// ─── CPI index-value guard ────────────────────────────────────────────────────

export function looksLikeCpiIndex(value: string | undefined): boolean {
  if (!value) return false;
  const n = parseFloat(value.replace(/[^\d.]/g, ""));
  return !isNaN(n) && n > 50;
}

export function stripRawCpiNumbers(s: string): string {
  return s
    .replace(/\bCPI\s+\d{3,}[.,]\d+%[^,.\n]*(,\s*)?/gi, "")
    .replace(/\bCore\s+CPI\s+\d{3,}[.,]\d+%[^,.\n]*(,\s*)?/gi, "")
    .replace(/,\s*,/g, ",")
    .replace(/^[,;:\s]+/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ─── Machine language sanitizer ──────────────────────────────────────────────
// Converts report-style jargon into natural spoken language.

const MACHINE_TERMS: [RegExp, string][] = [
  [/\bkill criteria? triggered\b/gi,       "the investment case warrants careful review"],
  [/\bkill criteria?\b/gi,                 "exit threshold"],
  [/\bthesis weakened\b/gi,                "has some things worth reviewing"],
  [/\bthesis strengthened\b/gi,            "has gotten stronger recently"],
  [/\bmonitor closely\b/gi,                "keep a close eye on"],
  [/\b(high|medium|low)\s+confidence\b/gi, ""],
  [/\bimpact\s+\d+\/\d+\b/gi,             ""],
  [/\breview thesis\b/gi,                  "revisit the investment rationale"],
  [/\bact now\b/gi,                        ""],
  [/\brisk[\s-]off\b/gi,                  "defensive market conditions"],
  [/\brisk[\s-]on\b/gi,                   "constructive market conditions"],
];

function sanitize(raw: string | null | undefined): string {
  let s = clean(raw);
  for (const [pattern, replacement] of MACHINE_TERMS) {
    s = s.replace(pattern, replacement);
  }
  return s.replace(/\s{2,}/g, " ").replace(/^[,;:\s]+/, "").replace(/,\s*\./g, ".").trim();
}

// ─── Sentence helpers ─────────────────────────────────────────────────────────

function cap(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function lc(s: string): string {
  if (!s) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

// ─── Section: Executive Summary ───────────────────────────────────────────────
// "If you only remember three things today..."

function buildExecSummarySection(doc: CIOBriefDocument): string {
  const lines = doc.executiveSummary
    .map(sanitize)
    .filter(s => s.length > 10 && !isUnavailable(s))
    .map(stripRawCpiNumbers)
    .filter(Boolean)
    .slice(0, 3);

  if (lines.length === 0) return "";

  if (lines.length === 1) {
    return `The single most important thing today: ${lc(lines[0])}${lines[0].endsWith(".") ? "" : "."}`;
  }

  const labels = ["First", "Second", "Third"];
  const points = lines.map((l, i) => `${labels[i]}: ${lc(l)}${l.endsWith(".") ? "" : "."}`);
  return `If you only remember three things today — ${points.join(" ")}`;
}

// ─── Section: Portfolio Health ────────────────────────────────────────────────

function buildPortfolioSection(
  doc: CIOBriefDocument,
  thesisMonitoring: EnrichedThesisStatus[],
  mentioned: Set<string>,
): string {
  const ph = doc.portfolioHealth;
  const parts: string[] = [];

  // Portfolio health summary
  const summary = sanitize(ph.summary);
  if (summary && !isUnavailable(summary)) parts.push(cap(summary) + (summary.endsWith(".") ? "" : "."));

  // Meaningful drift (≥3%)
  const drifted = ph.buckets.filter(b => Math.abs(b.drift) >= 3);
  if (drifted.length > 0) {
    const driftParts = drifted.map(b => {
      const dir = b.drift > 0 ? "running a bit heavy" : "running light";
      return `your ${b.bucket.toLowerCase()} exposure is ${dir} at ${b.currentPct.toFixed(0)} percent, versus a target of ${b.targetPct.toFixed(0)} percent`;
    });
    parts.push(`Worth noting: ${driftParts.join(", ")}.`);
  }

  if (ph.cashUsd > 0) {
    const c = ph.cashUsd;
    const cashStr = c >= 1_000_000
      ? `${(c / 1_000_000).toFixed(1)} million dollars`
      : `${Math.round(c / 1000)} thousand dollars`;
    parts.push(`You have ${cashStr} in cash — capital ready to put to work.`);
  }

  // Good news: strengthened theses
  const strengthened = thesisMonitoring.filter(t => t.status === "strengthened");
  if (strengthened.length > 0) {
    const names = strengthened.map(t => { mentioned.add(t.ticker); return t.ticker; }).join(" and ");
    const ev = sanitize(strengthened[0].evidence);
    const evUsable = ev && !hasSECBoilerplate(ev) && !isUnavailable(ev) && ev.length > 15;
    if (evUsable) {
      parts.push(`Good news on ${names}: the investment case here has gotten stronger. ${cap(ev)}`);
    } else {
      parts.push(`Good news on ${names}: recent developments are positive, and the original thesis is playing out as expected.`);
    }
  }

  // Unchanged: brief mention
  const unchanged = thesisMonitoring
    .filter(t => t.status === "unchanged" && !mentioned.has(t.ticker))
    .map(t => { mentioned.add(t.ticker); return t.ticker; });
  if (unchanged.length > 0) {
    const countStr = unchanged.length === 1 ? "position" : "positions";
    parts.push(
      `Your other ${countStr} — ${unchanged.join(", ")} — ${unchanged.length === 1 ? "is" : "are"} holding to plan, with no new developments worth flagging.`,
    );
  }

  if (parts.length === 0) return "";
  return parts.join(" ");
}

// ─── Section: Key Risks ───────────────────────────────────────────────────────
// Weakened theses + high-impact geo risks

function buildRisksSection(
  doc: CIOBriefDocument,
  mentioned: Set<string>,
): string {
  const parts: string[] = [];

  // Weakened theses
  const weakened = doc.thesisMonitoring.filter(t => t.status === "weakened");
  for (const t of weakened) {
    mentioned.add(t.ticker);
    const ev = sanitize(t.evidence);
    const evUsable = ev && !hasSECBoilerplate(ev) && !isUnavailable(ev) && ev.length > 15;
    if (evUsable) {
      parts.push(`On ${t.ticker}: ${cap(ev)}. This is worth a closer look before adding more.`);
    } else {
      parts.push(`${t.ticker} is worth a closer look right now — some new developments have emerged that weren't in the original picture.`);
    }
  }

  // High-impact geo risks (impactScore >= 4)
  const highGeo = doc.geoRisks
    .filter(r => !r.filtered && r.impactScore >= 4)
    .slice(0, 2);

  for (const r of highGeo) {
    let insight = sanitize(r.insight);
    if (!insight || isUnavailable(insight)) continue;
    insight = insight.replace(/^Latest:\s*[""]?[^""]{0,200}[""]?\.\s*/i, "").trim();
    if (hasSECBoilerplate(insight)) continue;

    const latestEvent = r.latestEvent ? sanitize(r.latestEvent) : null;
    const usableEvent = latestEvent && !hasSECBoilerplate(latestEvent) && latestEvent.length > 10
      ? latestEvent : null;

    let s = `On the geopolitical side, ${r.region} remains a watchpoint. ${cap(insight)}`;
    if (usableEvent) s += ` The latest: ${usableEvent}.`;
    parts.push(s);
  }

  if (parts.length === 0) return "";
  return `Now for the risks worth keeping front of mind. ${parts.join(" ")}`;
}

// ─── Section: Market Context ──────────────────────────────────────────────────

function buildMarketSection(doc: CIOBriefDocument): string {
  const regime = doc.marketRegime;

  const REGIME_DESC: Record<string, string> = {
    "Risk On":  "markets are in constructive territory — risk appetite is healthy, and the backdrop is broadly favorable for growth assets",
    "Neutral":  "markets are in a holding pattern, with mixed signals and no strong directional conviction in either direction",
    "Risk Off": "markets have shifted into a more defensive posture — risk appetite has contracted, and selective positioning is warranted",
  };

  const desc = REGIME_DESC[regime] ?? `markets are in a ${regime.toLowerCase()} environment`;
  let para = `Looking at the broader market, ${desc}.`;

  // One evidence line
  const ev = doc.marketRegimeEvidence
    .map(sanitize)
    .find(e => e.length > 10 && !isUnavailable(e));
  if (ev) para += ` ${ev}`;

  // Key metrics
  const metricParts: string[] = [];
  for (const m of doc.marketMetrics) {
    if (m.label === "VIX") {
      const v = parseFloat(m.value);
      if (!isNaN(v)) {
        metricParts.push(v < 20
          ? `the VIX is at ${m.value}, suggesting the market is relatively calm`
          : `the VIX has climbed to ${m.value}, a sign of elevated uncertainty`);
      }
    } else if (m.label === "US 10Y Yield") {
      metricParts.push(`ten-year Treasury yields are at ${m.value}`);
    } else if (m.label === "Fed Funds Rate") {
      metricParts.push(`the Fed's policy rate is at ${m.value}`);
    } else if (m.label === "CPI (YoY)" && !looksLikeCpiIndex(m.value)) {
      metricParts.push(`inflation is running at ${m.value} year-over-year`);
    }
  }
  if (metricParts.length > 0) {
    para += ` Worth noting: ${metricParts.join(", ")}.`;
  }

  const growth = doc.assetClassImpact.find(a => a.asset === "Growth");
  if (growth) {
    const detail = sanitize(growth.detail);
    if (detail && !isUnavailable(detail)) {
      para += ` For the growth stocks in your portfolio, the outlook is ${growth.impact.toLowerCase()}: ${lc(detail.replace(/\.$/, ""))}.`;
    }
  }

  return para;
}

// ─── Section: Macro Commentary ────────────────────────────────────────────────
// Limit to 2 macro topics for podcast pacing.

function buildMacroSection(doc: CIOBriefDocument): string {
  const sentences: string[] = [];

  let stance = sanitize(doc.macroStance);
  if (stance && !isUnavailable(stance)) {
    stance = stripRawCpiNumbers(stance).replace(/^Macro:\s*/i, "").trim();
    if (stance.length > 15) {
      sentences.push(cap(stance) + (stance.endsWith(".") ? "" : "."));
    }
  }

  const TOPIC_LEAD: Record<string, string> = {
    "Inflation":           "On inflation",
    "Interest Rates":      "On the rate side",
    "Treasury Yields":     "On Treasury yields",
    "Employment & Growth": "On the labor market",
  };

  for (const t of doc.macroTopics.slice(0, 2)) {
    let insight = sanitize(t.insight);
    if (!insight || isUnavailable(insight)) continue;
    insight = stripRawCpiNumbers(insight);
    if (!insight || insight.length < 15) continue;
    insight = insight.replace(/^On [^:]+:\s*/i, "");
    const lead = TOPIC_LEAD[t.topic] ?? `On ${t.topic.toLowerCase()}`;
    sentences.push(`${lead}: ${lc(insight)}${insight.endsWith(".") ? "" : "."}`);
  }

  if (sentences.length === 0) return "";
  return sentences.join(" ");
}

// ─── Section: Geopolitics (lower-impact only) ─────────────────────────────────
// High-impact geo is handled in buildRisksSection. This covers the rest.

function buildGeoSection(doc: CIOBriefDocument): string {
  const active = doc.geoRisks.filter(r => !r.filtered && r.impactScore < 4);
  if (active.length === 0) return "";

  const sorted = [...active].sort((a, b) => b.impactScore - a.impactScore);
  const items: string[] = [];

  for (const r of sorted.slice(0, 2)) {
    let insight = sanitize(r.insight);
    if (!insight || isUnavailable(insight)) continue;
    insight = insight.replace(/^Latest:\s*[""]?[^""]{0,200}[""]?\.\s*/i, "").trim();
    if (hasSECBoilerplate(insight)) continue;
    items.push(`${r.region}: ${lc(insight)}`);
  }

  if (items.length === 0) return "";

  const geoStance = sanitize(doc.geoStance);
  const opener = geoStance && !isUnavailable(geoStance)
    ? `On the geopolitical front — ${lc(geoStance)} `
    : "On the geopolitical front — ";

  return opener + items.join(". ") + ".";
}

// ─── Section: Investment Opportunities ───────────────────────────────────────

function buildRadarSection(doc: CIOBriefDocument, mentioned: Set<string>): string {
  const seen = new Set<string>();
  const all: EnrichedRadarEntry[] = [];
  for (const e of [...doc.highConviction, ...doc.disagreement, ...doc.emerging]) {
    if (!mentioned.has(e.ticker) && !seen.has(e.ticker)) {
      seen.add(e.ticker);
      all.push(e);
    }
  }
  if (all.length === 0) return "";

  const [top, ...rest] = all;
  mentioned.add(top.ticker);

  const topWhy  = sanitize(top.whyNow);
  const topRisk = sanitize(top.keyRisk);
  const topWhyUsable  = topWhy  && !isUnavailable(topWhy)  && topWhy.length  > 10;
  const topRiskUsable = topRisk && !isUnavailable(topRisk) && topRisk.length > 10;

  let lead = `If you have capital ready to put to work, ${top.ticker} stands out as the strongest candidate right now.`;
  if (topWhyUsable)  lead += ` ${cap(topWhy)}`;
  if (topRiskUsable) lead += ` The main thing to watch on the downside: ${lc(topRisk.replace(/\.$/, ""))}.`;

  const secondaryParts = rest
    .slice(0, 3)
    .filter(e => { mentioned.add(e.ticker); return true; })
    .map(e => {
      const why = sanitize(e.whyNow);
      const whyUsable = why && !isUnavailable(why) && why.length > 10;
      return whyUsable ? `${e.ticker}: ${lc(why)}` : e.ticker;
    })
    .filter(Boolean);

  if (secondaryParts.length === 0) return lead;
  return lead + `\n\nOther names worth a look: ${secondaryParts.join(". ")}.`;
}

// ─── Section: Actions ─────────────────────────────────────────────────────────

function buildActionsSection(doc: CIOBriefDocument): string {
  const { todaysActions, decisionBoard } = doc;
  const parts: string[] = [];

  const actNow = decisionBoard.actNow.filter(d => {
    const r = sanitize(d.reason);
    return d.item.length > 3 && !hasSECBoilerplate(d.item) && !isUnavailable(r);
  });

  if (actNow.length > 0) {
    const [first, ...others] = actNow;
    parts.push(`The most pressing item today: ${sanitize(first.item)}. ${sanitize(first.reason)}`);
    if (others.length > 0) {
      const otherStr = others.map(d => sanitize(d.item)).filter(Boolean).join("; ");
      if (otherStr) parts.push(`Also on the list: ${otherStr}.`);
    }
  } else {
    const high = todaysActions.filter(a => a.urgency === "high");
    if (high.length > 0) {
      const a = high[0];
      const reason = sanitize(a.reason);
      parts.push(`Today's priority: ${sanitize(a.action)}.${reason ? " " + cap(reason) : ""}`);
    } else {
      parts.push(`No urgent portfolio actions are required today.`);
    }
  }

  const monitor = decisionBoard.monitor.filter(d => {
    const r = sanitize(d.reason);
    return d.item.length > 3 && !hasSECBoilerplate(d.item) && !isUnavailable(r);
  }).slice(0, 3);

  if (monitor.length > 0) {
    const monStr = monitor.map(d => sanitize(d.item)).filter(Boolean).join("; ");
    if (monStr) parts.push(`Keep a close eye on: ${monStr}.`);
  }

  if (parts.length === 0) return "";
  return `Before wrapping up — ${parts.join(" ")}`;
}

// ─── Section: Discovery Radar ────────────────────────────────────────────────

function buildDiscoverySection(doc: CIOBriefDocument, mentioned: Set<string>): string {
  const dr = doc.discoveryRadar;
  if (!dr || (dr.tierA.length === 0 && dr.portfolioGapCount === 0)) return "";

  const parts: string[] = [
    `The discovery radar is tracking ${dr.totalCandidates} potential additions, with ${dr.portfolioGapCount} portfolio ${dr.portfolioGapCount === 1 ? "gap" : "gaps"} identified.`,
  ];

  const newNames = dr.tierA.filter(c => !mentioned.has(c.ticker));
  if (newNames.length > 0) {
    const nameStrs = newNames.map(c => {
      mentioned.add(c.ticker);
      const reason = sanitize(c.discoveryReason);
      const usable = reason && !isUnavailable(reason) && reason.length > 10;
      return usable ? `${c.ticker} (${lc(reason)})` : c.ticker;
    });
    parts.push(`Names flagged for immediate research: ${nameStrs.join("; ")}.`);
  }

  if (dr.topThemes.length > 0) {
    parts.push(`The dominant themes driving these discoveries are ${dr.topThemes.join(", ")}.`);
  }

  return parts.join(" ");
}

// ─── Main renderer ────────────────────────────────────────────────────────────

export function renderNarrativeBrief(doc: CIOBriefDocument): string {
  const dateStr = new Date(doc.date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const mentioned = new Set<string>();
  const paras: string[] = [];

  // ── Opening ──────────────────────────────────────────────────────────────────
  paras.push(`Good morning. Today is ${dateStr}.`);

  // ── Executive Summary ("If you only remember three things today...") ─────────
  const execText = buildExecSummarySection(doc);
  if (execText) paras.push(execText);

  // ── A. Portfolio Impact (health + strengthened + unchanged) ───────────────────
  const portText = buildPortfolioSection(doc, doc.thesisMonitoring, mentioned);
  if (portText) paras.push(`For your portfolio specifically. ${portText}`);

  // ── B. Key Risks (weakened thesis + high-impact geo) ─────────────────────────
  const risksText = buildRisksSection(doc, mentioned);
  if (risksText) paras.push(risksText);

  // ── C. Market Context (regime + metrics + asset class) ───────────────────────
  const marketText = buildMarketSection(doc);
  if (marketText) paras.push(marketText);

  // ── Macro commentary ──────────────────────────────────────────────────────────
  const macroText = buildMacroSection(doc);
  if (macroText) paras.push(macroText);

  // ── Geopolitics (lower-impact, not already in risks) ─────────────────────────
  const geoText = buildGeoSection(doc);
  if (geoText) paras.push(geoText);

  // ── Investment Opportunities ──────────────────────────────────────────────────
  const radarText = buildRadarSection(doc, mentioned);
  if (radarText) paras.push(`Turning to new opportunities. ${radarText}`);

  // ── Actions ───────────────────────────────────────────────────────────────────
  const actionsText = buildActionsSection(doc);
  if (actionsText) paras.push(actionsText);

  // ── Discovery Radar ───────────────────────────────────────────────────────────
  const discoveryText = buildDiscoverySection(doc, mentioned);
  if (discoveryText) paras.push(discoveryText);

  // ── Closing ───────────────────────────────────────────────────────────────────
  paras.push(`That's today's briefing for ${dateStr}. Good investing.`);

  return paras.join("\n\n");
}
