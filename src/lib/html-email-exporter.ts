// HtmlEmailExporter — Phase 12A.1: Quality Layer
//
// Mobile-first HTML email with inline CSS, confidence badges,
// impact scores, decision board, and quality metrics.

import type { CIOBriefDocument, EnrichedMacroTopic, EnrichedGeoRisk, EnrichedRadarEntry, EnrichedThesisStatus } from "./brief-generator";

// ─── Design constants ─────────────────────────────────────────────────────────

const REGIME_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  "Risk On":  { bg: "#eef7f1", text: "#2d7d46", border: "#c3e6cf" },
  "Neutral":  { bg: "#fffbeb", text: "#b45309", border: "#fde68a" },
  "Risk Off": { bg: "#fdf0ee", text: "#c0392b", border: "#f5c6c1" },
};

const SIGNAL_COLOR: Record<string, string> = {
  positive: "#2d7d46",
  neutral:  "#8e8e8e",
  negative: "#c0392b",
  watch:    "#b45309",
};

const CONFIDENCE_COLOR: Record<string, { bg: string; text: string }> = {
  High:   { bg: "#eef7f1", text: "#2d7d46" },
  Medium: { bg: "#fffbeb", text: "#b45309" },
  Low:    { bg: "#f4f4f4", text: "#8e8e8e" },
};

const IMPACT_COLOR = (score: number): { bg: string; text: string } => {
  if (score >= 5) return { bg: "#fdf0ee", text: "#c0392b" };
  if (score >= 4) return { bg: "#fffbeb", text: "#b45309" };
  if (score >= 3) return { bg: "#eef3fd", text: "#3e6ae1" };
  return { bg: "#f4f4f4", text: "#8e8e8e" };
};

const STATUS_COLOR: Record<EnrichedThesisStatus["status"], { text: string }> = {
  strengthened: { text: "#2d7d46" },
  unchanged:    { text: "#8e8e8e" },
  weakened:     { text: "#c0392b" },
};

const GEO_BG: Record<string, string>   = { high: "#fdf0ee", medium: "#fffbeb", low: "#f4f4f4" };
const GEO_TEXT: Record<string, string> = { high: "#c0392b", medium: "#b45309", low: "#8e8e8e" };
const URGENCY_COLOR: Record<string, string> = {
  high: "#c0392b", medium: "#b45309", low: "#5c5e62",
};

// ─── Main export ──────────────────────────────────────────────────────────────

export function renderHtmlEmail(doc: CIOBriefDocument): string {
  const date = new Date(doc.date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const time = new Date(doc.generatedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const regime = doc.marketRegime;
  const rc = REGIME_COLOR[regime] ?? REGIME_COLOR["Neutral"];
  const qm = doc.qualityMetrics;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Daily CIO Brief — ${esc(date)}</title>
</head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="padding:20px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
       style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

${emailHeader(date, time, rc, regime, qm)}
${emailQualitySummary(qm)}
${emailSection1(doc)}
${emailSection2(doc, rc, regime)}
${emailSection3(doc)}
${emailSection4(doc)}
${emailSection5(doc)}
${emailSection6(doc)}
${emailSection7(doc)}
${emailDecisionBoard(doc)}
${emailDiscoveryRadar(doc)}
${emailSection8(doc)}
${emailFooter(doc)}

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ─── Layout helpers ───────────────────────────────────────────────────────────

function sectionWrap(label: string, content: string): string {
  return `
<tr><td style="padding:0 24px 20px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="border:1px solid #eeeeee;border-radius:8px;overflow:hidden;">
    <tr><td style="background:#fafafa;padding:10px 16px;border-bottom:1px solid #eeeeee;">
      <span style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#aaaaaa;">${esc(label)}</span>
    </td></tr>
    <tr><td style="padding:16px;">${content}</td></tr>
  </table>
</td></tr>`;
}

function confidenceBadge(conf: string): string {
  const c = CONFIDENCE_COLOR[conf] ?? CONFIDENCE_COLOR.Low;
  return `<span style="font-size:10px;font-weight:700;background:${c.bg};color:${c.text};padding:2px 6px;border-radius:4px;margin-left:4px;">${esc(conf)}</span>`;
}

function impactBadge(score: number): string {
  const c = IMPACT_COLOR(score);
  return `<span style="font-size:10px;font-weight:700;background:${c.bg};color:${c.text};padding:2px 6px;border-radius:4px;margin-left:4px;">Impact ${score}/5</span>`;
}

function evidenceTag(count: number, sources: string[]): string {
  if (count === 0) return `<span style="font-size:11px;color:#aaaaaa;font-style:italic;">No direct evidence</span>`;
  return `<span style="font-size:11px;color:#8e8e8e;">${count} fact${count > 1 ? "s" : ""} · ${esc(sources.join(", "))}</span>`;
}

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Header ───────────────────────────────────────────────────────────────────

function emailHeader(date: string, time: string, rc: { bg: string; text: string; border: string }, regime: string, qm: CIOBriefDocument["qualityMetrics"]): string {
  return `
<tr><td style="background:#171a20;padding:28px 24px 20px;">
  <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#aaaaaa;">Daily CIO Brief</p>
  <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:#ffffff;">${esc(date)}</h1>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td style="background:${rc.bg};border:1px solid ${rc.border};border-radius:6px;padding:6px 14px;">
        <span style="font-size:12px;font-weight:700;color:${rc.text};">${esc(regime)}</span>
      </td>
      <td style="padding-left:14px;font-size:12px;color:#aaaaaa;">Generated ${esc(time)}</td>
      <td style="padding-left:14px;">
        <span style="font-size:11px;background:#2d3748;color:#a0aec0;padding:3px 8px;border-radius:4px;">~${qm.estimatedReadTimeMin} min read</span>
      </td>
    </tr>
  </table>
</td></tr>`;
}

// ─── Quality Summary ──────────────────────────────────────────────────────────

function emailQualitySummary(qm: CIOBriefDocument["qualityMetrics"]): string {
  return `
<tr><td style="padding:16px 24px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background:#f8f9fa;border-radius:8px;padding:12px;border:1px solid #eeeeee;">
    <tr>
      <td style="padding:0 0 8px;">
        <span style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#aaaaaa;">Brief Quality</span>
      </td>
    </tr>
    <tr>
      <td>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr>
            ${qualityPill("Evidence", `${qm.evidenceCoveragePercent}%`, "#eef3fd", "#3e6ae1")}
            ${qualityPill("High Confidence", `${qm.highConfidenceCount}`, "#eef7f1", "#2d7d46")}
            ${qualityPill("Portfolio Events", `${qm.portfolioRelevantEvents}`, "#fffbeb", "#b45309")}
            ${qualityPill("Noise Removed", `${qm.noiseRemovedCount}`, "#f4f4f4", "#8e8e8e")}
          </tr>
        </table>
      </td>
    </tr>
    ${qm.autoSummarized ? `<tr><td style="padding-top:8px;font-size:11px;color:#b45309;font-style:italic;">Auto-summarized: content trimmed to meet 15-minute read target.</td></tr>` : ""}
  </table>
</td></tr>`;
}

function qualityPill(label: string, value: string, bg: string, text: string): string {
  return `<td style="padding-right:8px;">
    <div style="background:${bg};border-radius:6px;padding:5px 10px;text-align:center;">
      <div style="font-size:14px;font-weight:700;color:${text};">${esc(value)}</div>
      <div style="font-size:10px;color:${text};opacity:0.8;">${esc(label)}</div>
    </div>
  </td>`;
}

// ─── Section 1 ────────────────────────────────────────────────────────────────

function emailSection1(doc: CIOBriefDocument): string {
  const items = doc.executiveSummary
    .map(b => `<tr>
      <td width="14" style="vertical-align:top;padding-top:3px;color:#aaaaaa;font-size:14px;">·</td>
      <td style="padding-bottom:6px;font-size:14px;line-height:1.5;color:#5c5e62;">${esc(b)}</td>
    </tr>`)
    .join("");
  return sectionWrap("Executive Summary", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${items}</table>`);
}

// ─── Section 2 ────────────────────────────────────────────────────────────────

function emailSection2(doc: CIOBriefDocument, rc: { bg: string; text: string }, regime: string): string {
  let content = `<p style="margin:0 0 14px;font-size:16px;font-weight:600;color:#171a20;">
    Regime: <span style="color:${rc.text};">${esc(regime)}</span>
  </p>`;

  if (doc.marketMetrics.length > 0) {
    content += `<table role="presentation" width="100%" cellpadding="6" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:14px;">
      <tr style="background:#f4f4f4;">
        <th align="left" style="font-size:11px;font-weight:600;color:#8e8e8e;padding:6px 10px;">Metric</th>
        <th align="right" style="font-size:11px;font-weight:600;color:#8e8e8e;padding:6px 10px;">Value</th>
        <th align="right" style="font-size:11px;font-weight:600;color:#8e8e8e;padding:6px 10px;">Signal</th>
      </tr>`;
    for (const m of doc.marketMetrics) {
      const sc = SIGNAL_COLOR[m.signal] ?? "#5c5e62";
      content += `<tr style="border-top:1px solid #eeeeee;">
        <td style="font-size:13px;color:#5c5e62;padding:6px 10px;">${esc(m.label)}</td>
        <td align="right" style="font-size:13px;font-weight:600;color:#171a20;padding:6px 10px;font-family:monospace;">${esc(m.value)}</td>
        <td align="right" style="padding:6px 10px;"><span style="font-size:10px;font-weight:700;color:${sc};">${m.signal.toUpperCase()}</span></td>
      </tr>`;
    }
    content += "</table>";
  }

  content += `<p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#aaaaaa;letter-spacing:0.06em;text-transform:uppercase;">Asset Class Impact</p>`;
  content += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">`;
  for (const a of doc.assetClassImpact) {
    content += `<tr><td style="padding-bottom:8px;font-size:13px;line-height:1.5;color:#5c5e62;">
      <strong style="color:#171a20;">${esc(a.asset)}:</strong> ${esc(a.impact)} — ${esc(a.detail)}
    </td></tr>`;
  }
  content += "</table>";

  return sectionWrap("Market Regime", content);
}

// ─── Section 3 ────────────────────────────────────────────────────────────────

function emailSection3(doc: CIOBriefDocument): string {
  let content = "";

  if (doc.macroStance) {
    content += `<p style="margin:0 0 16px;font-size:13px;color:#5c5e62;font-style:italic;border-left:3px solid #eeeeee;padding-left:10px;">${esc(doc.macroStance)}</p>`;
  }

  for (const t of doc.macroTopics) {
    const sc = SIGNAL_COLOR[t.signal] ?? "#8e8e8e";
    const ic = IMPACT_COLOR(t.impactScore);
    content += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
      <tr>
        <td width="8" style="vertical-align:top;padding-top:5px;">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${sc};"></span>
        </td>
        <td style="padding-left:10px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:4px;">
            <tr>
              <td style="font-size:13px;font-weight:600;color:#171a20;padding-right:6px;">${esc(t.topic)}</td>
              <td><span style="font-size:10px;font-weight:700;background:${ic.bg};color:${ic.text};padding:2px 6px;border-radius:4px;">Impact ${t.impactScore}/5</span></td>
              <td>${confidenceBadge(t.evidence.confidence)}</td>
              ${t.value ? `<td style="padding-left:6px;"><span style="font-size:11px;font-family:monospace;background:#f4f4f4;padding:1px 5px;border-radius:3px;">${esc(t.value)}</span></td>` : ""}
              ${t.source ? `<td style="padding-left:6px;"><span style="font-size:11px;background:#eef3fd;color:#3e6ae1;padding:1px 5px;border-radius:3px;">${esc(t.source)}</span></td>` : ""}
            </tr>
          </table>
          <p style="margin:0 0 4px;font-size:13px;line-height:1.5;color:#5c5e62;">${esc(t.insight)}</p>
          <p style="margin:0;font-size:11px;color:#aaaaaa;">${evidenceTag(t.evidence.evidenceCount, t.evidence.sources)}</p>
        </td>
      </tr>
    </table>`;
  }

  const activeGeo = doc.geoRisks.filter(r => !r.filtered);
  if (activeGeo.length > 0) {
    content += `<p style="margin:16px 0 10px;font-size:12px;font-weight:700;color:#aaaaaa;letter-spacing:0.06em;text-transform:uppercase;">Geopolitics</p>`;
    if (doc.geoStance) {
      content += `<p style="margin:0 0 12px;font-size:13px;color:#5c5e62;font-style:italic;">${esc(doc.geoStance)}</p>`;
    }
    for (const r of activeGeo) {
      const gb = GEO_BG[r.level] ?? "#f4f4f4";
      const gt = GEO_TEXT[r.level] ?? "#8e8e8e";
      const ic = IMPACT_COLOR(r.impactScore);
      content += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                   style="margin-bottom:14px;border-left:3px solid ${gt};padding-left:10px;">
        <tr>
          <td>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:2px;">
              <tr>
                <td style="font-size:13px;font-weight:600;color:#171a20;padding-right:6px;">${esc(r.region)}</td>
                <td><span style="font-size:10px;font-weight:700;background:${gb};color:${gt};padding:2px 6px;border-radius:4px;">${r.level.toUpperCase()}</span></td>
                <td><span style="font-size:10px;font-weight:700;background:${ic.bg};color:${ic.text};padding:2px 6px;border-radius:4px;margin-left:4px;">Impact ${r.impactScore}/5</span></td>
                <td>${confidenceBadge(r.evidence.confidence)}</td>
              </tr>
            </table>
            <p style="margin:0 0 4px;font-size:12px;color:#aaaaaa;">${esc(r.portfolioExposure)}</p>
            <p style="margin:0 0 4px;font-size:13px;line-height:1.5;color:#5c5e62;">${esc(r.insight)}</p>
            ${r.latestEvent ? `<p style="margin:0 0 2px;font-size:12px;color:#8e8e8e;font-style:italic;">${esc(r.latestEvent)}</p>` : ""}
            <p style="margin:0;font-size:11px;color:#aaaaaa;">${evidenceTag(r.evidence.evidenceCount, r.evidence.sources)}</p>
          </td>
        </tr>
      </table>`;
    }
  }

  if (doc.qualityMetrics.noiseRemovedCount > 0) {
    content += `<p style="margin:8px 0 0;font-size:11px;color:#aaaaaa;font-style:italic;">Noise filter: ${doc.qualityMetrics.noiseRemovedCount} low-relevance geo item(s) removed.</p>`;
  }

  return sectionWrap("Macro & Geopolitics", content);
}

// ─── Section 4 ────────────────────────────────────────────────────────────────

function emailSection4(doc: CIOBriefDocument): string {
  let content = `<p style="margin:0 0 14px;font-size:13px;color:#5c5e62;font-style:italic;">${esc(doc.portfolioHealth.summary)}</p>`;

  if (doc.portfolioHealth.buckets.length > 0) {
    content += `<table role="presentation" width="100%" cellpadding="6" cellspacing="0" border="0" style="border-collapse:collapse;">
      <tr style="background:#f4f4f4;">
        <th align="left" style="font-size:11px;font-weight:600;color:#8e8e8e;padding:6px 10px;">Category</th>
        <th align="right" style="font-size:11px;font-weight:600;color:#8e8e8e;padding:6px 10px;">Current</th>
        <th align="right" style="font-size:11px;font-weight:600;color:#8e8e8e;padding:6px 10px;">Target</th>
        <th align="right" style="font-size:11px;font-weight:600;color:#8e8e8e;padding:6px 10px;">Drift</th>
      </tr>`;
    for (const b of doc.portfolioHealth.buckets) {
      const abs = Math.abs(b.drift);
      const driftColor = abs >= 5 ? "#c0392b" : abs >= 3 ? "#b45309" : "#2d7d46";
      const driftStr = b.drift > 0 ? `+${b.drift.toFixed(1)}%` : `${b.drift.toFixed(1)}%`;
      content += `<tr style="border-top:1px solid #eeeeee;">
        <td style="font-size:13px;color:#171a20;font-weight:500;padding:7px 10px;text-transform:capitalize;">${esc(b.bucket)}</td>
        <td align="right" style="font-size:13px;color:#5c5e62;padding:7px 10px;">${b.currentPct.toFixed(1)}%</td>
        <td align="right" style="font-size:13px;color:#5c5e62;padding:7px 10px;">${b.targetPct.toFixed(1)}%</td>
        <td align="right" style="font-size:13px;font-weight:600;color:${driftColor};padding:7px 10px;">${esc(driftStr)}</td>
      </tr>`;
    }
    if (doc.portfolioHealth.cashUsd > 0) {
      const cashPct = doc.portfolioHealth.totalCapitalUsd > 0
        ? ((doc.portfolioHealth.cashUsd / doc.portfolioHealth.totalCapitalUsd) * 100).toFixed(1) : "—";
      content += `<tr style="border-top:1px solid #eeeeee;background:#f9f9f9;">
        <td style="font-size:13px;color:#171a20;font-weight:500;padding:7px 10px;">Cash</td>
        <td align="right" style="font-size:13px;color:#5c5e62;padding:7px 10px;">${esc(cashPct)}%</td>
        <td align="right" style="font-size:13px;color:#aaaaaa;padding:7px 10px;">—</td>
        <td align="right" style="font-size:13px;color:#aaaaaa;padding:7px 10px;">—</td>
      </tr>`;
    }
    content += "</table>";
  } else {
    content += `<p style="font-size:13px;color:#aaaaaa;">No allocation targets configured.</p>`;
  }
  return sectionWrap("Portfolio Health", content);
}

// ─── Section 5 ────────────────────────────────────────────────────────────────

function radarEntryHtml(e: EnrichedRadarEntry): string {
  const ic = IMPACT_COLOR(e.impactScore);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="margin-bottom:12px;border:1px solid #eeeeee;border-radius:6px;overflow:hidden;">
    <tr>
      <td style="padding:10px 14px;background:#fafafa;border-bottom:1px solid #eeeeee;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="font-size:14px;font-weight:700;color:#171a20;padding-right:8px;">${esc(e.ticker)}</td>
            <td><span style="font-size:11px;background:#eef3fd;color:#3e6ae1;padding:2px 7px;border-radius:4px;font-weight:600;">Score: ${e.score}/100</span></td>
            <td><span style="font-size:10px;font-weight:700;background:${ic.bg};color:${ic.text};padding:2px 6px;border-radius:4px;margin-left:6px;">Impact ${e.impactScore}/5</span></td>
            <td>${confidenceBadge(e.evidence.confidence)}</td>
          </tr>
        </table>
      </td>
    </tr>
    <tr><td style="padding:10px 14px;">
      <p style="margin:0 0 2px;font-size:12px;color:#aaaaaa;font-weight:600;">Why now</p>
      <p style="margin:0 0 8px;font-size:13px;color:#5c5e62;line-height:1.4;">${esc(e.whyNow)}</p>
      <p style="margin:0 0 2px;font-size:12px;color:#aaaaaa;font-weight:600;">Key risk</p>
      <p style="margin:0 0 6px;font-size:13px;color:#5c5e62;line-height:1.4;">${esc(e.keyRisk)}</p>
      <p style="margin:0;font-size:11px;color:#aaaaaa;">${evidenceTag(e.evidence.evidenceCount, e.evidence.sources)}</p>
    </td></tr>
  </table>`;
}

function emailSection5(doc: CIOBriefDocument): string {
  const total = doc.highConviction.length + doc.disagreement.length + doc.emerging.length;
  if (total === 0) {
    return sectionWrap("Watchlist & Opportunity Radar", `<p style="font-size:13px;color:#aaaaaa;">No entries. Run opportunity_refresh.</p>`);
  }
  let content = "";
  const group = (label: string, desc: string, entries: EnrichedRadarEntry[]) => {
    if (!entries.length) return "";
    let g = `<p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#aaaaaa;letter-spacing:0.06em;text-transform:uppercase;">${esc(label)}</p>`;
    if (desc) g += `<p style="margin:0 0 10px;font-size:12px;color:#aaaaaa;font-style:italic;">${esc(desc)}</p>`;
    g += entries.map(radarEntryHtml).join("");
    return g;
  };
  content += group("A. High Conviction", "", doc.highConviction);
  content += group("B. Disagreement Opportunities", "System rates highly — no or contrarian committee verdict.", doc.disagreement);
  content += group("C. Emerging", "", doc.emerging);
  return sectionWrap("Watchlist & Opportunity Radar", content);
}

// ─── Section 6 ────────────────────────────────────────────────────────────────

function emailSection6(doc: CIOBriefDocument): string {
  if (!doc.thesisMonitoring.length) {
    return sectionWrap("Thesis Monitoring", `<p style="font-size:13px;color:#aaaaaa;">No active holdings with thesis data.</p>`);
  }

  const groups: { status: EnrichedThesisStatus["status"]; label: string }[] = [
    { status: "strengthened", label: "Thesis Strengthened" },
    { status: "unchanged",    label: "Thesis Unchanged"    },
    { status: "weakened",     label: "Thesis Weakened"     },
  ];

  let content = "";
  for (const { status, label } of groups) {
    const items = doc.thesisMonitoring.filter(t => t.status === status);
    if (!items.length) continue;
    const tc = STATUS_COLOR[status];
    const ic = IMPACT_COLOR(items[0].impactScore);
    content += `<p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#aaaaaa;letter-spacing:0.06em;text-transform:uppercase;">${esc(label)}</p>`;
    for (const t of items) {
      content += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                   style="margin-bottom:10px;border-left:3px solid ${tc.text};">
        <tr><td style="padding:4px 10px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:3px;">
            <tr>
              <td style="font-size:13px;font-weight:700;color:#171a20;padding-right:6px;">${esc(t.ticker)}</td>
              <td style="font-size:12px;color:#8e8e8e;padding-right:6px;">${esc(t.name)}</td>
              <td><span style="font-size:10px;font-weight:700;background:${ic.bg};color:${ic.text};padding:2px 6px;border-radius:4px;">Impact ${t.impactScore}/5</span></td>
              <td>${confidenceBadge(t.evidenceTag.confidence)}</td>
            </tr>
          </table>
          <p style="margin:0 0 2px;font-size:13px;color:#5c5e62;line-height:1.4;">${esc(t.evidence)}</p>
          <p style="margin:0;font-size:11px;color:#aaaaaa;">${evidenceTag(t.evidenceTag.evidenceCount, t.evidenceTag.sources)}</p>
        </td></tr>
      </table>`;
    }
  }
  return sectionWrap("Thesis Monitoring", content);
}

// ─── Section 7 ────────────────────────────────────────────────────────────────

function emailSection7(doc: CIOBriefDocument): string {
  if (!doc.todaysActions.length) {
    return sectionWrap("Today's Actions", `<p style="font-size:14px;color:#2d7d46;font-weight:600;">No action required today.</p>`);
  }
  let content = "";
  for (const a of doc.todaysActions) {
    const uc = URGENCY_COLOR[a.urgency] ?? "#5c5e62";
    content += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px;">
      <tr>
        <td width="24" style="vertical-align:top;padding-top:2px;">
          <span style="display:inline-block;width:22px;height:22px;border-radius:50%;background:#f4f4f4;font-size:11px;font-weight:700;color:#5c5e62;text-align:center;line-height:22px;">${a.priority}</span>
        </td>
        <td style="padding-left:10px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:4px;">
            <tr>
              <td style="font-size:14px;font-weight:600;color:#171a20;padding-right:8px;">${esc(a.action)}</td>
              <td><span style="font-size:10px;font-weight:700;color:${uc};background:#f4f4f4;padding:2px 7px;border-radius:4px;">${a.urgency.toUpperCase()}</span></td>
            </tr>
          </table>
          <p style="margin:0;font-size:12px;color:#8e8e8e;line-height:1.4;">${esc(a.reason)}</p>
        </td>
      </tr>
    </table>`;
  }
  return sectionWrap("Today's Actions", content);
}

// ─── Decision Board ───────────────────────────────────────────────────────────

function emailDecisionBoard(doc: CIOBriefDocument): string {
  const db = doc.decisionBoard;
  let content = "";

  if (db.actNow.length > 0) {
    content += `<p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#c0392b;letter-spacing:0.06em;text-transform:uppercase;">Act Now</p>`;
    for (const d of db.actNow) {
      const ic = IMPACT_COLOR(d.impactScore ?? 3);
      content += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;border-left:3px solid #c0392b;">
        <tr><td style="padding:4px 10px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:2px;">
            <tr>
              <td style="font-size:13px;font-weight:600;color:#171a20;padding-right:6px;">${esc(d.item)}</td>
              ${d.impactScore ? `<td><span style="font-size:10px;font-weight:700;background:${ic.bg};color:${ic.text};padding:2px 6px;border-radius:4px;">Impact ${d.impactScore}/5</span></td>` : ""}
            </tr>
          </table>
          <p style="margin:0;font-size:12px;color:#8e8e8e;">${esc(d.reason)}</p>
        </td></tr>
      </table>`;
    }
  }

  if (db.monitor.length > 0) {
    content += `<p style="margin:${db.actNow.length ? "14px" : "0"} 0 8px;font-size:12px;font-weight:700;color:#b45309;letter-spacing:0.06em;text-transform:uppercase;">Monitor</p>`;
    for (const d of db.monitor) {
      content += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;border-left:3px solid #b45309;">
        <tr><td style="padding:4px 10px;">
          <p style="margin:0 0 2px;font-size:13px;font-weight:500;color:#171a20;">${esc(d.item)}</p>
          <p style="margin:0;font-size:12px;color:#8e8e8e;">${esc(d.reason)}</p>
        </td></tr>
      </table>`;
    }
  }

  if (db.ignoreCount > 0) {
    content += `<p style="margin:14px 0 4px;font-size:12px;font-weight:700;color:#aaaaaa;letter-spacing:0.06em;text-transform:uppercase;">Ignore</p>`;
    content += `<p style="margin:0;font-size:12px;color:#aaaaaa;font-style:italic;">${db.ignoreCount} low-relevance item${db.ignoreCount > 1 ? "s" : ""} filtered — not portfolio-relevant.</p>`;
  }

  if (!db.actNow.length && !db.monitor.length && db.ignoreCount === 0) {
    content = `<p style="font-size:13px;color:#2d7d46;font-weight:600;">No decisions required. Portfolio in good standing.</p>`;
  }

  return sectionWrap("Decision Board", content);
}

// ─── Discovery Radar ─────────────────────────────────────────────────────────

function emailDiscoveryRadar(doc: CIOBriefDocument): string {
  const dr = doc.discoveryRadar;
  if (!dr || (dr.tierA.length === 0 && dr.portfolioGapCount === 0)) return "";

  let content = `<p style="margin:0 0 10px;font-size:12px;color:#aaaaaa;">${dr.totalCandidates} candidates active · ${dr.portfolioGapCount} portfolio gap(s)</p>`;

  if (dr.tierA.length > 0) {
    content += `<p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#c0392b;letter-spacing:0.06em;text-transform:uppercase;">Tier A — Research Now</p>`;
    for (const c of dr.tierA) {
      const themes = c.themes.length > 0 ? ` · ${c.themes.slice(0, 2).join(", ")}` : "";
      content += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:10px;border-left:3px solid #c0392b;">
        <tr><td style="padding:4px 10px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:2px;">
            <tr>
              <td style="font-size:13px;font-weight:700;color:#171a20;padding-right:8px;">${esc(c.ticker)}</td>
              <td><span style="font-size:10px;font-weight:700;background:#fdf0ee;color:#c0392b;padding:2px 6px;border-radius:4px;">${c.radarScore}/100</span></td>
              <td><span style="font-size:10px;font-weight:600;background:#f4f4f4;color:#5c5e62;padding:2px 6px;border-radius:4px;margin-left:4px;">${esc(c.discoveryCategory)}</span></td>
              ${themes ? `<td style="font-size:11px;color:#aaaaaa;padding-left:6px;">${esc(themes)}</td>` : ""}
            </tr>
          </table>
          <p style="margin:0;font-size:12px;color:#8e8e8e;line-height:1.4;">${esc(c.discoveryReason)}</p>
        </td></tr>
      </table>`;
    }
  }

  if (dr.topThemes.length > 0) {
    content += `<p style="margin:12px 0 6px;font-size:12px;font-weight:700;color:#aaaaaa;letter-spacing:0.06em;text-transform:uppercase;">Top Themes</p>`;
    content += dr.topThemes.map(t =>
      `<span style="display:inline-block;font-size:11px;background:#f3eef9;color:#7c3aed;padding:2px 8px;border-radius:4px;margin:2px 4px 2px 0;">${esc(t)}</span>`
    ).join("");
  }

  return sectionWrap("Discovery Radar", content);
}

// ─── Section 8 ────────────────────────────────────────────────────────────────

function emailSection8(doc: CIOBriefDocument): string {
  const qm = doc.qualityMetrics;
  const srcs = doc.sources.length > 0
    ? doc.sources
    : ["Portfolio database (positions, theses, filings, committee sessions)"];
  const items = srcs.map(s => `<li style="font-size:12px;color:#8e8e8e;line-height:1.6;">${esc(s)}</li>`).join("");
  const summary = `<p style="margin:0 0 10px;font-size:12px;color:#aaaaaa;">External sources: <strong style="color:#5c5e62;">${qm.externalSourcesCount}</strong> &nbsp;·&nbsp; Internal sources: <strong style="color:#5c5e62;">${qm.internalSourcesCount}</strong></p>`;
  return sectionWrap("Sources", summary + `<ul style="margin:0;padding-left:18px;">${items}</ul>`);
}

// ─── Narrative Email ──────────────────────────────────────────────────────────
// Simple <p>-only layout optimised for iPhone Speak Screen.
// No tables, no badges, no special characters — just readable paragraphs.

export function renderNarrativeEmail(narrative: string, doc: CIOBriefDocument): string {
  const date = new Date(doc.date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const regime = doc.marketRegime;
  const rc = REGIME_COLOR[regime] ?? REGIME_COLOR["Neutral"];
  const qm = doc.qualityMetrics;

  const htmlBody = narrative
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p style="margin:0 0 22px;font-size:16px;line-height:1.75;color:#2d2d2d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${esc(p)}</p>`)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Daily CIO Brief — ${esc(date)}</title>
</head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="padding:20px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
       style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

<tr><td style="background:#171a20;padding:28px 24px 20px;">
  <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#aaaaaa;">Daily CIO Brief</p>
  <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:#ffffff;">${esc(date)}</h1>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td style="background:${rc.bg};border:1px solid ${rc.border};border-radius:6px;padding:6px 14px;">
        <span style="font-size:12px;font-weight:700;color:${rc.text};">${esc(regime)}</span>
      </td>
      <td style="padding-left:14px;">
        <span style="font-size:11px;background:#2d3748;color:#a0aec0;padding:3px 8px;border-radius:4px;">~${qm.estimatedReadTimeMin} min · ${qm.evidenceCoveragePercent}% evidence</span>
      </td>
    </tr>
  </table>
</td></tr>

<tr><td style="padding:28px 28px 8px;">
${htmlBody}
</td></tr>

<tr><td style="padding:16px 24px;border-top:1px solid #eeeeee;">
  <p style="margin:0;font-size:11px;color:#aaaaaa;text-align:center;">
    Daily CIO Brief · ${esc(doc.date)} · Investment OS · High confidence: ${qm.highConfidenceCount} · Noise removed: ${qm.noiseRemovedCount}
  </p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function emailFooter(doc: CIOBriefDocument): string {
  const qm = doc.qualityMetrics;
  return `
<tr><td style="padding:16px 24px;border-top:1px solid #eeeeee;">
  <p style="margin:0 0 4px;font-size:11px;color:#aaaaaa;text-align:center;">
    Daily CIO Brief · ${esc(doc.date)} · Investment OS
  </p>
  <p style="margin:0;font-size:11px;color:#cccccc;text-align:center;">
    Read time: ~${qm.estimatedReadTimeMin} min · Evidence: ${qm.evidenceCoveragePercent}% · High confidence: ${qm.highConfidenceCount}
  </p>
</td></tr>`;
}
