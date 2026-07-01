/**
 * wiki-service.ts — Brain OS wiki page generators + index/log maintenance.
 * Markdown-only, Obsidian-compatible, append-never-overwrite for existing thesis sections.
 *
 * Path resolution order:
 *   1. BRAIN_OS_ROOT env var
 *   2. resolveBrainOsPath() → D:\Projects\shared\Brain OS (or G: drive equivalent)
 *   3. process.cwd()/brain-os (local fallback for machines without shared storage)
 */

import fs from "fs";
import path from "path";
import { resolveBrainOsPath } from "./shared-paths";

const BRAIN_OS_ROOT = process.env.BRAIN_OS_ROOT ?? resolveBrainOsPath() ?? path.join(process.cwd(), "brain-os");
const WIKI = path.join(BRAIN_OS_ROOT, "07 Investment", "Wiki");
const LOG_FILE = path.join(BRAIN_OS_ROOT, "03 Knowledge", "log.md");
const INDEX_FILE = path.join(BRAIN_OS_ROOT, "03 Knowledge", "index.md");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** Append content to a wiki file, creating its directory first. Rethrows on failure so callers' job wrappers record it. */
export function appendToWikiFile(filePath: string, content: string) {
  try {
    ensureDir(path.dirname(filePath));
    fs.appendFileSync(filePath, content, "utf8");
  } catch (err) {
    throw new Error(`Failed to write ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function appendLog(type: "ingest" | "dossier" | "radar" | "brief" | "decision" | "daily" | "review", subject: string) {
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
  const filePath = path.join(WIKI, "Companies", `${input.ticker}.md`);
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
  const filePath = path.join(WIKI, "Themes", `${slug}.md`);
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
  const filePath = path.join(WIKI, "Macro", `${date}.md`);
  if (!readFile(filePath)) {
    writeFile(filePath, `# Macro — ${date}\n\n${content}\n`);
  } else {
    fs.appendFileSync(filePath, `\n---\n\n${content}\n`, "utf8");
  }
}

export function appendGeopoliticsNote(content: string, date = today()) {
  const filePath = path.join(WIKI, "Geopolitics", `${date}.md`);
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

[[Portfolio]] [[Macro/${date}]] [[Geopolitics/${date}]]
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

  const filePath = path.join(WIKI, "Decisions", `${date}-${input.action.toLowerCase()}-${input.ticker}.md`);

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
// Read Layer (Phase 15)
// ---------------------------------------------------------------------------

export interface WikiPage {
  path: string;
  content: string;
  exists: boolean;
}

function listDateFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith(".md") && /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort()
    .reverse();
}

export function getCompanyPage(ticker: string): WikiPage {
  const filePath = path.join(WIKI, "Companies", `${ticker.toUpperCase()}.md`);
  const content = readFile(filePath);
  return { path: filePath, content, exists: content.length > 0 };
}

export function getThemePage(theme: string): WikiPage {
  const slug = theme.replace(/\s+/g, "-");
  const filePath = path.join(WIKI, "Themes", `${slug}.md`);
  const content = readFile(filePath);
  return { path: filePath, content, exists: content.length > 0 };
}

export function getPortfolioPage(): WikiPage {
  const filePath = path.join(WIKI, "Portfolio", "Portfolio.md");
  const content = readFile(filePath);
  return { path: filePath, content, exists: content.length > 0 };
}

export function getRecentDailyNotes(limit = 7): WikiPage[] {
  const dir = path.join(WIKI, "Daily");
  return listDateFiles(dir).slice(0, limit).map(f => {
    const filePath = path.join(dir, f);
    const content = readFile(filePath);
    return { path: filePath, content, exists: content.length > 0 };
  });
}

export function getRecentMacroNotes(limit = 7): WikiPage[] {
  const dir = path.join(WIKI, "Macro");
  return listDateFiles(dir).slice(0, limit).map(f => {
    const filePath = path.join(dir, f);
    const content = readFile(filePath);
    return { path: filePath, content, exists: content.length > 0 };
  });
}

export function getRecentGeopoliticsNotes(limit = 7): WikiPage[] {
  const dir = path.join(WIKI, "Geopolitics");
  return listDateFiles(dir).slice(0, limit).map(f => {
    const filePath = path.join(dir, f);
    const content = readFile(filePath);
    return { path: filePath, content, exists: content.length > 0 };
  });
}

export function getDecisionPages(ticker?: string): WikiPage[] {
  const dir = path.join(WIKI, "Decisions");
  if (!fs.existsSync(dir)) return [];
  let files = fs.readdirSync(dir).filter(f => f.endsWith(".md"));
  if (ticker) {
    const t = ticker.toLowerCase();
    files = files.filter(f => f.toLowerCase().endsWith(`-${t}.md`));
  }
  return files.sort().reverse().map(f => {
    const filePath = path.join(dir, f);
    const content = readFile(filePath);
    return { path: filePath, content, exists: content.length > 0 };
  });
}

// ---------------------------------------------------------------------------
// Decision Reviews (Phase 17)
// ---------------------------------------------------------------------------

export interface ReviewPageInput {
  ticker: string;
  reviewDate: Date;
  originalThesis: string;
  thesisStatus: string;
  evidenceFor: string[];
  evidenceAgainst: string[];
  opportunityScore: number;
  architectureContext: { score: number; grade: string; tickerNotes: string[] };
  verdict: string;
  confidence: number;
  lessonLearned: string;
}

/** Creates wiki/Decisions/Reviews/YYYY-MM-TICKER-Review.md and returns the file slug. */
export function createReviewPage(ticker: string, input: ReviewPageInput): string {
  const month = input.reviewDate.toISOString().slice(0, 7); // "2026-07"
  const slug = `${month}-${ticker}-Review`;
  const filePath = path.join(WIKI, "Decisions", "Reviews", `${slug}.md`);

  const forBullets = input.evidenceFor.length > 0
    ? input.evidenceFor.map((e) => `- ${e}`).join("\n")
    : "- No supporting evidence in recent intelligence";
  const againstBullets = input.evidenceAgainst.length > 0
    ? input.evidenceAgainst.map((e) => `- ${e}`).join("\n")
    : "- No contradicting evidence in recent intelligence";

  const archNotes = input.architectureContext.tickerNotes.length > 0
    ? input.architectureContext.tickerNotes.map((n) => `- ${n}`).join("\n")
    : "- No specific architecture notes for this position";

  const content = `# Decision Review — ${ticker}

**Review Date:** ${input.reviewDate.toISOString().slice(0, 10)}
**Generated:** ${today()}

---

## Original Thesis

${input.originalThesis || "No thesis on record."}

## Current Evidence

### Supporting

${forBullets}

### Contradicting

${againstBullets}

## Thesis Drift

${input.thesisStatus}

## Opportunity Context

Score: ${input.opportunityScore.toFixed(0)}/100

## Architecture Context

Grade: ${input.architectureContext.grade} (${input.architectureContext.score.toFixed(0)}/100)

${archNotes}

## Verdict

${input.verdict}

## Confidence

${input.confidence}

## Lessons Learned

${input.lessonLearned}

## Related Pages

[[${ticker}]] [[Portfolio]]
`;

  writeFile(filePath, content);
  appendLog("review", `${ticker} ${month}`);
  updateIndexSection("Decisions", `- [[${slug}]] — ${ticker} review ${month}`);
  return slug;
}

/** Adds a wikilink backlink to the ## Decision History section of the company page. */
export function addReviewBacklinkToCompanyPage(ticker: string, reviewSlug: string) {
  const filePath = path.join(WIKI, "Companies", `${ticker.toUpperCase()}.md`);
  if (!readFile(filePath)) return; // company page doesn't exist yet — skip
  appendToSection(filePath, "Decision History", `- [[${reviewSlug}]] — review`);
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
