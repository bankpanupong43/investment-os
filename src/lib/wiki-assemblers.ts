/**
 * wiki-assemblers.ts — Compose wiki pages into structured context blocks.
 * Read-only. No writes, no DB mutations.
 */

import {
  getCompanyPage,
  getThemePage,
  getPortfolioPage,
  getRecentDailyNotes,
  getRecentMacroNotes,
  getRecentGeopoliticsNotes,
  getDecisionPages,
} from "./wiki-service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractSection(content: string, heading: string): string {
  const lines = content.split("\n");
  let inSection = false;
  const result: string[] = [];

  for (const line of lines) {
    if (line.trim() === `## ${heading}`) { inSection = true; continue; }
    if (inSection && /^#{1,2} /.test(line)) break;
    if (inSection) result.push(line);
  }

  return result.join("\n").trim();
}

/** Extract lines that look like structured macro/geo entries: **Key** (signal): text */
function extractStructuredLines(content: string, max = 6): string {
  return content.split("\n")
    .filter(l => /^\*\*\w/.test(l))
    .slice(0, max)
    .join("\n");
}

function mentionsTicker(content: string, ticker: string): boolean {
  return content.toUpperCase().includes(ticker.toUpperCase());
}

// ---------------------------------------------------------------------------
// Ticker Context
// ---------------------------------------------------------------------------

export function assembleTickerContext(ticker: string): string {
  const t = ticker.toUpperCase();
  const company = getCompanyPage(t);
  const decisions = getDecisionPages(t);
  const dailyNotes = getRecentDailyNotes(7);
  const macroNotes = getRecentMacroNotes(3);

  const out: string[] = [`# Ticker Context: ${t}`, ""];

  // Company Summary
  out.push("## Company Summary", "");
  out.push(company.exists
    ? extractSection(company.content, "Summary") || "_No summary recorded._"
    : "_No company page found._"
  );

  // Investment Thesis
  out.push("", "## Investment Thesis", "");
  if (company.exists) {
    const thesis = extractSection(company.content, "Investment Thesis");
    const bull   = extractSection(company.content, "Bull Case");
    const bear   = extractSection(company.content, "Bear Case");
    out.push(thesis || "_No thesis recorded._");
    if (bull) out.push("", "**Bull Case:**", bull);
    if (bear) out.push("", "**Bear Case:**", bear);
  } else {
    out.push("_No thesis found._");
  }

  // Recent Decisions
  out.push("", "## Recent Decisions", "");
  if (decisions.length > 0) {
    for (const d of decisions.slice(0, 5)) {
      const header    = d.content.split("\n")[0]?.replace(/^# /, "") ?? "";
      const reasoning = extractSection(d.content, "Reasoning");
      out.push(`### ${header}`, reasoning || "_No reasoning recorded._", "");
    }
  } else {
    out.push("_No decisions recorded._");
  }

  // Recent Developments — daily notes mentioning this ticker
  out.push("", "## Recent Developments", "");
  const relevant = dailyNotes.filter(n => mentionsTicker(n.content, t));
  if (relevant.length > 0) {
    for (const note of relevant.slice(0, 3)) {
      const date    = note.content.split("\n")[0]?.replace(/^# /, "") ?? "";
      const actions = extractSection(note.content, "Actions Taken");
      const events  = extractSection(note.content, "Key Events");
      const body    = [actions, events].filter(Boolean).join("\n");
      if (body) out.push(`**${date}:**`, body, "");
    }
  } else {
    out.push("_No recent daily note mentions._");
  }

  // Macro Context
  out.push("", "## Macro Context", "");
  if (macroNotes.length > 0) {
    const latest = macroNotes[0];
    const date   = latest.content.split("\n")[0]?.replace(/^# /, "") ?? "";
    const lines  = extractStructuredLines(latest.content);
    out.push(`**${date}:**`, lines || "_No structured macro data._");
  } else {
    out.push("_No macro notes available._");
  }

  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Theme Context
// ---------------------------------------------------------------------------

export function assembleThemeContext(theme: string): string {
  const themePage = getThemePage(theme);
  const macroNotes = getRecentMacroNotes(3);
  const geoNotes   = getRecentGeopoliticsNotes(3);

  const out: string[] = [`# Theme Context: ${theme}`, ""];

  // Theme Summary
  out.push("## Theme Summary", "");
  out.push(themePage.exists
    ? extractSection(themePage.content, "Summary") || "_No summary recorded._"
    : "_No theme page found._"
  );

  // Key Companies
  out.push("", "## Key Companies", "");
  out.push(themePage.exists
    ? extractSection(themePage.content, "Key Companies") || "_No companies listed._"
    : "_No theme page found._"
  );

  // Recent Developments — macro notes touching theme keywords
  out.push("", "## Recent Developments", "");
  const keywords = theme.toLowerCase().replace(/-/g, " ").split(/\s+/);
  const relMacro  = macroNotes.filter(n =>
    keywords.some(kw => n.content.toLowerCase().includes(kw))
  );
  if (relMacro.length > 0) {
    for (const note of relMacro.slice(0, 2)) {
      const date  = note.content.split("\n")[0]?.replace(/^# /, "") ?? "";
      const lines = extractStructuredLines(note.content, 3);
      if (lines) out.push(`**${date}:**`, lines, "");
    }
  } else {
    out.push("_No recent macro developments._");
  }

  // Macro Context
  out.push("", "## Macro Context", "");
  if (macroNotes.length > 0) {
    const latest = macroNotes[0];
    const date   = latest.content.split("\n")[0]?.replace(/^# /, "") ?? "";
    const lines  = extractStructuredLines(latest.content);
    out.push(`**${date}:**`, lines || "_No structured macro data._");
  } else {
    out.push("_No macro notes available._");
  }

  // Risks
  out.push("", "## Risks", "");
  out.push(themePage.exists
    ? extractSection(themePage.content, "Risks") || "_No risks recorded._"
    : "_No theme page found._"
  );

  // Geopolitics addendum
  if (geoNotes.length > 0) {
    const latest = geoNotes[0];
    const date   = latest.content.split("\n")[0]?.replace(/^# /, "") ?? "";
    const lines  = extractStructuredLines(latest.content, 3);
    if (lines) out.push("", `_Geopolitics (${date}):_`, lines);
  }

  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Portfolio Context
// ---------------------------------------------------------------------------

export function assemblePortfolioContext(): string {
  const portfolio  = getPortfolioPage();
  const decisions  = getDecisionPages();
  const dailyNotes = getRecentDailyNotes(7);

  const out: string[] = ["# Portfolio Context", ""];

  // Portfolio overview (full wiki page)
  out.push("## Portfolio Overview", "");
  out.push(portfolio.exists ? portfolio.content : "_No portfolio page found. Run portfolio hub initialization._");

  // Recent Decisions
  out.push("", "## Recent Decisions", "");
  if (decisions.length > 0) {
    for (const d of decisions.slice(0, 10)) {
      const header    = d.content.split("\n")[0]?.replace(/^# /, "") ?? "";
      const reasoning = extractSection(d.content, "Reasoning");
      out.push(`### ${header}`, reasoning || "_No reasoning recorded._", "");
    }
  } else {
    out.push("_No decisions recorded._");
  }

  // Recent Daily Notes summary
  out.push("", "## Recent Daily Notes", "");
  for (const note of dailyNotes) {
    const date    = note.content.split("\n")[0]?.replace(/^# /, "") ?? "";
    const regime  = note.content.match(/\*\*Market Regime:\*\*\s*(.+)/)?.[1]?.trim() ?? "";
    const actions = extractSection(note.content, "Actions Taken");
    const majDec  = extractSection(note.content, "Major Decisions");
    out.push(`**${date}**${regime ? ` — ${regime}` : ""}:`);
    if (actions) out.push(actions);
    if (majDec)  out.push(majDec);
    out.push("");
  }

  return out.join("\n");
}
