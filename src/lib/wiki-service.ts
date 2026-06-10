/**
 * wiki-service.ts — Brain OS wiki page generators + index/log maintenance.
 * Markdown-only, Obsidian-compatible, append-never-overwrite for existing thesis sections.
 */

import fs from "fs";
import path from "path";

const BRAIN_OS = path.join(process.cwd(), "brain-os");
const WIKI = path.join(BRAIN_OS, "wiki");
const LOG_FILE = path.join(BRAIN_OS, "logs", "log.md");
const INDEX_FILE = path.join(BRAIN_OS, "index.md");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function appendLog(type: "ingest" | "dossier" | "radar" | "brief" | "decision" | "daily", subject: string) {
  ensureDir(path.dirname(LOG_FILE));
  const entry = `\n## [${today()}] ${type} | ${subject}\n`;
  fs.appendFileSync(LOG_FILE, entry, "utf8");
}

function readFile(filePath: string): string {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function writeFile(filePath: string, content: string) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
}

/** Append content after a section heading, creating the section if absent. */
function appendToSection(filePath: string, sectionHeading: string, newContent: string) {
  let text = readFile(filePath);
  const anchor = `## ${sectionHeading}`;

  if (!text.includes(anchor)) {
    text += `\n${anchor}\n\n${newContent}\n`;
  } else {
    const idx = text.indexOf(anchor) + anchor.length;
    const before = text.slice(0, idx);
    const after = text.slice(idx);
    text = before + "\n\n" + newContent.trim() + after;
  }
  writeFile(filePath, text);
}

// ---------------------------------------------------------------------------
// Company Pages
// ---------------------------------------------------------------------------

export interface CompanyPageInput {
  ticker: string;
  companyName: string;
  sector?: string;
  summary?: string;
  thesis?: string;
  bullCase?: string[];
  bearCase?: string[];
  metrics?: Record<string, string>;
  relatedPages?: string[];
  source?: "dossier" | "manual" | "radar";
}

export function generateCompanyPage(input: CompanyPageInput): string {
  const { ticker, companyName, sector, summary, thesis, bullCase, bearCase, metrics, relatedPages, source } = input;

  const metricsTable = metrics
    ? Object.entries(metrics)
        .map(([k, v]) => `| ${k} | ${v} | ${today()} |`)
        .join("\n")
    : "| — | — | — |";

  const bull = bullCase?.map((b) => `- ${b}`).join("\n") ?? "- TBD";
  const bear = bearCase?.map((b) => `- ${b}`).join("\n") ?? "- TBD";
  const related = relatedPages?.map((r) => `[[${r}]]`).join(" ") ?? "";

  return `# ${ticker} — ${companyName}

**Sector:** ${sector ?? "Unknown"}
**Last Updated:** ${today()}
**Source:** ${source ?? "manual"}

---

## Summary

${summary ?? ""}

## Investment Thesis

${thesis ?? ""}

## Bull Case

${bull}

## Bear Case

${bear}

## Key Metrics

| Metric | Value | As Of |
|--------|-------|-------|
${metricsTable}

## Recent Events

## Decision History

## Related Pages

${related}
`;
}

export function upsertCompanyPage(input: CompanyPageInput) {
  const filePath = path.join(WIKI, "01-Companies", `${input.ticker}.md`);
  const existing = readFile(filePath);

  if (!existing) {
    writeFile(filePath, generateCompanyPage(input));
    appendLog("dossier", input.ticker);
    updateIndexSection("Companies", `- [[${input.ticker}]] — ${input.companyName} (${input.sector ?? ""})`);
  } else {
    // Existing page: only append to Recent Events, never overwrite thesis sections
    if (input.summary) {
      appendToSection(filePath, "Recent Events", `**${today()}:** ${input.summary}`);
    }
    if (input.metrics) {
      const rows = Object.entries(input.metrics)
        .map(([k, v]) => `| ${k} | ${v} | ${today()} |`)
        .join("\n");
      appendToSection(filePath, "Key Metrics", rows);
    }
    appendLog("dossier", input.ticker);
  }
}

// ---------------------------------------------------------------------------
// Theme Pages
// ---------------------------------------------------------------------------

export interface ThemePageInput {
  name: string;
  summary?: string;
  keyCompanies?: Array<{ ticker: string; reason: string }>;
  opportunities?: string[];
  risks?: string[];
  relatedPages?: string[];
  source?: "radar" | "manual";
}

export function generateThemePage(input: ThemePageInput): string {
  const { name, summary, keyCompanies, opportunities, risks, relatedPages, source } = input;

  const companies = keyCompanies?.map((c) => `- [[${c.ticker}]] — ${c.reason}`).join("\n") ?? "";
  const opps = opportunities?.map((o) => `- ${o}`).join("\n") ?? "";
  const rsks = risks?.map((r) => `- ${r}`).join("\n") ?? "";
  const related = relatedPages?.map((r) => `[[${r}]]`).join(" ") ?? "";

  return `# ${name}

**Last Updated:** ${today()}
**Source:** ${source ?? "manual"}

---

## Summary

${summary ?? ""}

## Key Companies

${companies}

## Opportunities

${opps}

## Risks

${rsks}

## Related Pages

${related}
`;
}

export function upsertThemePage(input: ThemePageInput) {
  const slug = input.name.replace(/\s+/g, "-");
  const filePath = path.join(WIKI, "02-Themes", `${slug}.md`);
  const existing = readFile(filePath);

  if (!existing) {
    writeFile(filePath, generateThemePage(input));
    updateIndexSection("Themes", `- [[${input.name}]]`);
  } else {
    if (input.keyCompanies) {
      const rows = input.keyCompanies.map((c) => `- [[${c.ticker}]] — ${c.reason}`).join("\n");
      appendToSection(filePath, "Key Companies", rows);
    }
  }
  appendLog("radar", input.name);
}

// ---------------------------------------------------------------------------
// Macro / Geopolitics pages (daily append)
// ---------------------------------------------------------------------------

export function appendMacroNote(content: string, date = today()) {
  const filePath = path.join(WIKI, "03-Macro", `${date}.md`);
  if (!readFile(filePath)) {
    writeFile(filePath, `# Macro — ${date}\n\n${content}\n`);
  } else {
    fs.appendFileSync(filePath, `\n---\n\n${content}\n`, "utf8");
  }
}

export function appendGeopoliticsNote(content: string, date = today()) {
  const filePath = path.join(WIKI, "04-Geopolitics", `${date}.md`);
  if (!readFile(filePath)) {
    writeFile(filePath, `# Geopolitics — ${date}\n\n${content}\n`);
  } else {
    fs.appendFileSync(filePath, `\n---\n\n${content}\n`, "utf8");
  }
}

// ---------------------------------------------------------------------------
// Daily Notes
// ---------------------------------------------------------------------------

export interface DailyNoteInput {
  date?: string;
  regime?: string;
  keyEvents?: string[];
  macroUpdates?: string;
  geopoliticsUpdates?: string;
  actions?: string[];
  radarChanges?: string[];
  majorDecisions?: string[];
}

export function upsertDailyNote(input: DailyNoteInput) {
  const date = input.date ?? today();
  const filePath = path.join(WIKI, "Daily", `${date}.md`);
  const existing = readFile(filePath);

  if (!existing) {
    const events = input.keyEvents?.map((e) => `- ${e}`).join("\n") ?? "";
    const actions = input.actions?.map((a) => `- ${a}`).join("\n") ?? "";
    const radar = input.radarChanges?.map((r) => `- ${r}`).join("\n") ?? "";
    const decisions = input.majorDecisions?.map((d) => `- ${d}`).join("\n") ?? "";

    const content = `# ${date}

**Market Regime:** ${input.regime ?? "Unknown"}

---

## Key Events

${events}

## Macro Updates

${input.macroUpdates ?? ""}

## Geopolitics Updates

${input.geopoliticsUpdates ?? ""}

## Actions Taken

${actions}

## Radar Changes

${radar}

## Major Decisions

${decisions}

## Related Pages

[[Portfolio]] [[03-Macro/${date}]] [[04-Geopolitics/${date}]]
`;
    writeFile(filePath, content);
  } else {
    if (input.keyEvents?.length) {
      appendToSection(filePath, "Key Events", input.keyEvents.map((e) => `- ${e}`).join("\n"));
    }
    if (input.macroUpdates) appendToSection(filePath, "Macro Updates", input.macroUpdates);
    if (input.geopoliticsUpdates) appendToSection(filePath, "Geopolitics Updates", input.geopoliticsUpdates);
    if (input.actions?.length) {
      appendToSection(filePath, "Actions Taken", input.actions.map((a) => `- ${a}`).join("\n"));
    }
    if (input.radarChanges?.length) {
      appendToSection(filePath, "Radar Changes", input.radarChanges.map((r) => `- ${r}`).join("\n"));
    }
  }
  appendLog("daily", date);
}

// ---------------------------------------------------------------------------
// Decision Journal
// ---------------------------------------------------------------------------

export interface DecisionInput {
  date?: string;
  action: "Buy" | "Sell" | "Hold" | "Pass" | "Watch";
  ticker: string;
  reasoning: string;
  evidence?: string[];
  alternativesConsidered?: string[];
  expectedOutcome?: string;
  reviewDate?: string;
}

export function createDecisionPage(input: DecisionInput): string {
  const date = input.date ?? today();
  const evidence = input.evidence?.map((e) => `- ${e}`).join("\n") ?? "";
  const alts = input.alternativesConsidered?.map((a) => `- ${a}`).join("\n") ?? "";

  const filePath = path.join(WIKI, "06-Decisions", `${date}-${input.action.toLowerCase()}-${input.ticker}.md`);

  const content = `# Decision: ${input.action} ${input.ticker} — ${date}

**Decision:** ${input.action}
**Ticker:** ${input.ticker}
**Date:** ${date}

---

## Reasoning

${input.reasoning}

## Evidence

${evidence}

## Alternatives Considered

${alts}

## Expected Outcome

${input.expectedOutcome ?? ""}

## Review Date

${input.reviewDate ?? ""}

## Outcome

<!-- Fill in on review date -->

## Related Pages

[[${input.ticker}]] [[Portfolio]]
`;

  writeFile(filePath, content);
  appendLog("decision", `${input.action} ${input.ticker}`);
  updateIndexSection("Decisions", `- [[${date}-${input.action.toLowerCase()}-${input.ticker}]] — ${input.action} ${input.ticker}`);
  return filePath;
}

// ---------------------------------------------------------------------------
// Index maintenance
// ---------------------------------------------------------------------------

function updateIndexSection(section: string, newLine: string) {
  const text = readFile(INDEX_FILE);
  if (!text) return;

  const startTag = `<!-- ${section.toUpperCase()}_START -->`;
  const endTag = `<!-- ${section.toUpperCase()}_END -->`;

  if (!text.includes(startTag)) return;
  if (text.includes(newLine)) return; // already present

  const updated = text.replace(startTag, `${startTag}\n${newLine}`);
  writeFile(INDEX_FILE, updated);
}
