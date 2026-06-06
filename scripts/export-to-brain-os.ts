import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

// ─── Config ───────────────────────────────────────────────────────────────────

const BRAIN_OS_ROOT = "G:\\คอมพิวเตอร์เครื่องอื่นๆ\\คอมพิวเตอร์ของฉัน\\Shared\\Brain OS";
const EXPORT_BASE = path.join(BRAIN_OS_ROOT, "07 Investment", "Investment OS");

const db = new PrismaClient({ log: ["error"] });

// ─── File helpers ─────────────────────────────────────────────────────────────

function write(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
  const rel = path.relative(BRAIN_OS_ROOT, filePath).replace(/\\/g, "/");
  console.log(`  ✓ ${rel}`);
}

function isoDate(d: Date | string): string {
  return typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);
}

const NOW = new Date();
const EXPORTED_AT = NOW.toISOString();
const EXPORTED_DATE = isoDate(NOW);

// ─── Thesis markdown ──────────────────────────────────────────────────────────

function renderThesis(t: {
  ticker: string; title: string; thesis: string; whyOwn: string;
  risks: string; killCriteria: string; confidenceScore: number;
  reviewFrequency: string; lastReviewedAt: Date | null;
  status: string; isDraft: boolean; notes: string | null;
  createdAt: Date;
  reviews: Array<{
    reviewType: string; previousConfidence: number | null;
    newConfidence: number | null; notes: string | null; reviewedAt: Date;
  }>;
}): string {
  const freqDays = t.reviewFrequency === "monthly" ? 30 : t.reviewFrequency === "quarterly" ? 90 : 365;
  let isReviewDue = true;
  let daysOverdue: number | null = null;
  if (t.lastReviewedAt) {
    const due = new Date(t.lastReviewedAt);
    due.setDate(due.getDate() + freqDays);
    isReviewDue = due < NOW;
    if (isReviewDue) daysOverdue = Math.floor((NOW.getTime() - due.getTime()) / 86_400_000);
  }

  const statusBadge = t.isDraft ? "🟡 Draft" : "✅ Published";
  const reviewBadge = isReviewDue ? ` | ⚠️ Review overdue${daysOverdue ? ` (${daysOverdue}d)` : ""}` : "";

  const reviewHistory = t.reviews.length === 0
    ? "_No reviews recorded._"
    : t.reviews
        .map(r => {
          const conf = r.newConfidence ? ` (confidence: ${r.previousConfidence} → ${r.newConfidence})` : "";
          const note = r.notes ? `: ${r.notes}` : "";
          return `- **${isoDate(r.reviewedAt)}** — ${r.reviewType}${conf}${note}`;
        })
        .join("\n");

  const notesSection = t.notes ? `\n---\n\n## Notes\n\n${t.notes}\n` : "";

  return `---
title: "${t.ticker} — ${t.title}"
ticker: ${t.ticker}
tags: [investment-os, thesis, ${t.status}]
confidence: ${t.confidenceScore}
status: ${t.status}
isDraft: ${t.isDraft}
reviewFrequency: ${t.reviewFrequency}
lastReviewedAt: ${t.lastReviewedAt ? isoDate(t.lastReviewedAt) : "never"}
exportedAt: ${EXPORTED_AT}
source: investment-os
---

# ${t.ticker} — ${t.title}

> [[Investment OS/_Index|← Investment OS Index]]

**Confidence:** ${t.confidenceScore}/10 | ${statusBadge} | **Review:** ${t.reviewFrequency}${reviewBadge}

---

## Core Thesis

${t.thesis}

---

## Why I Own It

${t.whyOwn}

---

## Key Risks

${t.risks}

---

## Kill Criteria

${t.killCriteria}
${notesSection}
---

## Review History

${reviewHistory}

---

*Exported from Investment OS · ${EXPORTED_DATE}*
`;
}

// ─── Portfolio Review markdown ─────────────────────────────────────────────────

type ReviewCard = { ticker: string | null; headline: string; detail: string; severity: string };

function parseReview(r: {
  id: string; generatedAt: Date; notes: string | null;
  portfolioSummary: string; allocationAnalysis: string;
  thesisCoverageAnalysis: string; riskAnalysis: string;
  cashAllocationReview: string; watchlistPrioritization: string;
  biggestRisk: string; biggestOpportunity: string;
  mostUnderallocated: string; weakestThesis: string; reviewsDue: string;
}) {
  return {
    id: r.id,
    generatedAt: r.generatedAt,
    notes: r.notes,
    portfolioSummary:        JSON.parse(r.portfolioSummary),
    allocationAnalysis:      JSON.parse(r.allocationAnalysis),
    thesisCoverageAnalysis:  JSON.parse(r.thesisCoverageAnalysis),
    riskAnalysis:            JSON.parse(r.riskAnalysis),
    cashAllocationReview:    JSON.parse(r.cashAllocationReview),
    watchlistPrioritization: JSON.parse(r.watchlistPrioritization),
    biggestRisk:             JSON.parse(r.biggestRisk) as ReviewCard,
    biggestOpportunity:      JSON.parse(r.biggestOpportunity) as ReviewCard,
    mostUnderallocated:      JSON.parse(r.mostUnderallocated) as ReviewCard,
    weakestThesis:           JSON.parse(r.weakestThesis) as ReviewCard,
    reviewsDue:              JSON.parse(r.reviewsDue) as ReviewCard[],
  };
}

function card(c: ReviewCard): string {
  return `**${c.headline}** \`${c.severity}\`\n${c.detail}`;
}

function usd(n: number) {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function renderReview(r: ReturnType<typeof parseReview>, filename: string): string {
  const date = isoDate(r.generatedAt);
  const ps  = r.portfolioSummary;
  const aa  = r.allocationAnalysis;
  const tc  = r.thesisCoverageAnalysis;
  const ra  = r.riskAnalysis;
  const wp  = r.watchlistPrioritization;

  const sectorRows = ps.sectors
    .map((s: { sector: string; valueUsd: number; pct: number }) =>
      `| ${s.sector} | ${usd(s.valueUsd)} | ${s.pct.toFixed(1)}% |`)
    .join("\n");

  const gapRows = aa.topGaps
    .map((g: { ticker: string; name: string; gapUsd: number; pctFunded: number; bucket: string }) =>
      `| [[Theses/${g.ticker}\\|${g.ticker}]] | ${g.name} | ${usd(g.gapUsd)} | ${g.pctFunded.toFixed(0)}% | ${g.bucket} |`)
    .join("\n");

  const watchlistRows = wp.items
    .map((w: { ticker: string; interestReason: string; targetEntryPrice: number | null; hasThesis: boolean; isDraftThesis: boolean }) =>
      `| ${w.ticker} | ${w.interestReason} | ${w.targetEntryPrice ? usd(w.targetEntryPrice) : "—"} | ${w.hasThesis ? (w.isDraftThesis ? "draft" : "✅") : "none"} |`)
    .join("\n");

  const reviewsDueList = r.reviewsDue
    .map(c => `- **${c.headline}**: ${c.detail}`)
    .join("\n");

  const notesSection = r.notes ? `\n> ${r.notes}\n` : "";

  return `---
title: "Portfolio Review — ${date}"
date: ${date}
tags: [investment-os, portfolio-review]
riskLevel: ${ra.overallRiskLevel}
exportedAt: ${EXPORTED_AT}
source: investment-os
---

# Portfolio Review — ${date}

> [[Investment OS/_Index|← Investment OS Index]]
${notesSection}
---

## AI Review Cards

### Biggest Risk

${card(r.biggestRisk)}

### Biggest Opportunity

${card(r.biggestOpportunity)}

### Most Underallocated

${card(r.mostUnderallocated)}

### Weakest Thesis

${card(r.weakestThesis)}

### Reviews Due

${reviewsDueList}

---

## Portfolio Summary

- **Positions:** ${ps.totalPositions}
- **Invested:** ${usd(ps.totalInvestedUsd)}
- **Cash:** ${usd(ps.cashUsd)} (${ps.cashPct.toFixed(1)}%)
- **Avg Confidence:** ${ps.avgConfidenceScore.toFixed(1)}/10

### Sector Breakdown

| Sector | Value | % |
|--------|-------|---|
${sectorRows}

---

## Allocation Analysis

- **Total Target:** ${usd(aa.totalTargetUsd)}
- **Deployed:** ${usd(aa.totalDeployedUsd)} (${aa.pctFunded.toFixed(0)}% funded)
- **Total Gap:** ${usd(aa.totalGapUsd)}
- **Can fully fund from cash:** ${aa.canFullyFund ? "Yes ✅" : "No ❌"} ${aa.canFullyFund ? "" : `(shortfall: ${usd(aa.shortfallUsd)})`}

### Top Allocation Gaps

| Ticker | Name | Gap | % Funded | Bucket |
|--------|------|-----|----------|--------|
${gapRows}

---

## Thesis Coverage

- **Total:** ${tc.total} | **Active:** ${tc.active} | **Watchlist:** ${tc.watchlist}
- **Published:** ${tc.published} | **Drafts:** ${tc.drafts} | **Overdue Reviews:** ${tc.overdueReviews}
- **Avg Confidence:** ${tc.avgConfidence.toFixed(1)}/10

**Weakest:** ${tc.weakest.map((w: { ticker: string; score: number }) => `${w.ticker} (${w.score}/10)`).join(", ")}
**Strongest:** ${tc.strongest.map((w: { ticker: string; score: number }) => `${w.ticker} (${w.score}/10)`).join(", ")}

---

## Risk Analysis

**Risk Level:** \`${ra.overallRiskLevel.toUpperCase()}\` | **Pending Actions:** ${ra.pendingActions}

${ra.triggeredKills.length > 0
  ? ra.triggeredKills.map((k: { ticker: string; description: string }) => `- ⚠️ **${k.ticker}** kill condition triggered: ${k.description}`).join("\n")
  : "- No triggered kill conditions."}

---

## Watchlist Prioritization

**Top Candidate:** ${wp.topCandidate ?? "None"}

| Ticker | Interest | Target Entry | Thesis |
|--------|----------|--------------|--------|
${watchlistRows}

---

*Exported from Investment OS · ${EXPORTED_DATE}*
`;
}

// ─── Watchlist markdown ────────────────────────────────────────────────────────

function renderWatchlist(items: Array<{
  ticker: string; name: string | null; interestReason: string;
  draftThesis: string | null; targetEntryPrice: number | null; addedAt: Date;
}>): string {
  const summaryRows = items
    .map(w => `| ${w.ticker} | ${w.name ?? "—"} | ${w.interestReason} | ${w.targetEntryPrice ? usd(w.targetEntryPrice) : "—"} | ${isoDate(w.addedAt)} |`)
    .join("\n");

  const details = items
    .map(w => {
      const draftSection = w.draftThesis ? `\n\n### Draft Thesis\n\n${w.draftThesis}` : "";
      const entryLine = w.targetEntryPrice ? ` | **Target Entry:** ${usd(w.targetEntryPrice)}` : "";
      return `## ${w.ticker}${w.name ? ` — ${w.name}` : ""}

**Added:** ${isoDate(w.addedAt)}${entryLine}

**Interest:** ${w.interestReason}${draftSection}`;
    })
    .join("\n\n---\n\n");

  return `---
title: Watchlist
tags: [investment-os, watchlist]
exportedAt: ${EXPORTED_AT}
source: investment-os
count: ${items.length}
---

# Watchlist

> [[Investment OS/_Index|← Investment OS Index]]

| Ticker | Name | Interest | Target Entry | Added |
|--------|------|----------|--------------|-------|
${summaryRows}

---

${details}

---

*Exported from Investment OS · ${EXPORTED_DATE}*
`;
}

// ─── Journal markdown ──────────────────────────────────────────────────────────

function renderJournalDay(
  date: string,
  entries: Array<{
    entryType: string; content: string; createdAt: Date;
    position: { ticker: string } | null;
  }>
): string {
  const sections = entries
    .map(e => {
      const label = e.position ? `[${e.position.ticker}] ${e.entryType}` : e.entryType;
      const time = e.createdAt.toISOString().slice(11, 16);
      return `## ${label} <small>${time}</small>\n\n${e.content}`;
    })
    .join("\n\n---\n\n");

  return `---
title: "Investment Journal — ${date}"
date: ${date}
tags: [investment-os, journal]
exportedAt: ${EXPORTED_AT}
source: investment-os
entryCount: ${entries.length}
---

# Investment Journal — ${date}

> [[Investment OS/_Index|← Investment OS Index]]

${sections}

---

*Exported from Investment OS · ${EXPORTED_DATE}*
`;
}

// ─── Index markdown ────────────────────────────────────────────────────────────

function renderIndex(
  theses: Array<{ ticker: string; title: string; confidenceScore: number; status: string; isDraft: boolean }>,
  reviewDates: string[],
  watchlistCount: number,
  journalDates: string[]
): string {
  const activeTheses = theses.filter(t => t.status === "active");
  const watchlistTheses = theses.filter(t => t.status === "watchlist");

  const thesisRows = theses
    .map(t => {
      const badge = t.isDraft ? "🟡" : "✅";
      const statusLabel = t.status === "active" ? "active" : "watchlist";
      return `| [[Theses/${t.ticker}\\|${t.ticker}]] | ${t.title} | ${t.confidenceScore}/10 | ${statusLabel} | ${badge} |`;
    })
    .join("\n");

  const reviewLinks = reviewDates
    .map(d => `- [[Reviews/${d}|${d}]]`)
    .join("\n");

  const journalLinks = journalDates
    .slice(-10)
    .reverse()
    .map(d => `- [[Journal/${d}|${d}]]`)
    .join("\n");

  return `---
title: Investment OS — Index
tags: [investment-os, index]
exportedAt: ${EXPORTED_AT}
source: investment-os
---

# Investment OS — Index

> Auto-generated export from Investment OS. Do not edit manually.
> Human notes live in [[Investment MOC|07 Investment/]].

**Last exported:** ${EXPORTED_DATE}

---

## Architecture

\`\`\`mermaid
graph TD
    IOS["Investment OS<br/>(Next.js + Prisma + SQLite)"]

    IOS -->|export| THESES["📄 Theses<br/>Investment OS/Theses/"]
    IOS -->|export| REVIEWS["📊 Portfolio Reviews<br/>Investment OS/Reviews/"]
    IOS -->|export| WATCHLIST["👁 Watchlist<br/>Investment OS/Watchlist.md"]
    IOS -->|export| JOURNAL["📓 Journal<br/>Investment OS/Journal/"]

    THESES -->|wikilinks| HUMAN["🧠 Human Notes<br/>07 Investment/TICKER.md"]

    subgraph "Brain OS — 07 Investment"
        HUMAN
        THESES
        REVIEWS
        WATCHLIST
        JOURNAL
    end

    style IOS fill:#3E6AE1,color:#fff
    style HUMAN fill:#f4f4f4,stroke:#3E6AE1
\`\`\`

---

## Holdings Theses (${activeTheses.length} active)

| Ticker | Title | Confidence | Status | State |
|--------|-------|-----------|--------|-------|
${thesisRows}

---

## Portfolio Reviews (${reviewDates.length} total)

${reviewLinks || "_No reviews yet._"}

---

## Watchlist

[[Watchlist]] — ${watchlistCount} items

---

## Journal (recent 10 days)

${journalLinks || "_No journal entries._"}

---

*Exported from Investment OS · ${EXPORTED_DATE}*
`;
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Exporting Investment OS → Brain OS...\n");
  console.log(`Target: ${EXPORT_BASE}\n`);

  // ── Theses ──────────────────────────────────────────────────────────────────
  const rawTheses = await db.investmentThesis.findMany({
    include: { reviews: { orderBy: { reviewedAt: "desc" } } },
    orderBy: [{ status: "asc" }, { confidenceScore: "desc" }],
  });

  console.log(`Theses (${rawTheses.length}):`);
  for (const t of rawTheses) {
    write(path.join(EXPORT_BASE, "Theses", `${t.ticker}.md`), renderThesis(t));
  }

  // ── Portfolio Reviews ────────────────────────────────────────────────────────
  const rawReviews = await db.portfolioReview.findMany({
    orderBy: { generatedAt: "desc" },
    take: 20,
  });

  console.log(`\nPortfolio Reviews (${rawReviews.length}):`);
  const reviewDates: string[] = [];
  const seenDates = new Set<string>();
  for (const r of rawReviews) {
    const parsed = parseReview(r);
    const date = isoDate(parsed.generatedAt);
    const filename = seenDates.has(date) ? `${date}-${r.id.slice(0, 8)}.md` : `${date}.md`;
    if (!seenDates.has(date)) reviewDates.push(date);
    seenDates.add(date);
    write(path.join(EXPORT_BASE, "Reviews", filename), renderReview(parsed, filename));
  }

  // ── Watchlist ────────────────────────────────────────────────────────────────
  const watchlistItems = await db.watchlist.findMany({ orderBy: { addedAt: "desc" } });

  console.log(`\nWatchlist (${watchlistItems.length} items):`);
  write(path.join(EXPORT_BASE, "Watchlist.md"), renderWatchlist(watchlistItems));

  // ── Journal ──────────────────────────────────────────────────────────────────
  const entries = await db.journalEntry.findMany({
    include: { position: { select: { ticker: true } } },
    orderBy: { createdAt: "asc" },
  });

  const byDate = new Map<string, typeof entries>();
  for (const e of entries) {
    const date = e.createdAt.toISOString().slice(0, 10);
    const arr = byDate.get(date) ?? [];
    arr.push(e);
    byDate.set(date, arr);
  }

  console.log(`\nJournal (${byDate.size} days, ${entries.length} entries):`);
  const journalDates: string[] = [];
  for (const [date, dayEntries] of byDate) {
    journalDates.push(date);
    write(path.join(EXPORT_BASE, "Journal", `${date}.md`), renderJournalDay(date, dayEntries));
  }

  // ── Index ────────────────────────────────────────────────────────────────────
  console.log("\nIndex:");
  write(
    path.join(EXPORT_BASE, "_Index.md"),
    renderIndex(rawTheses, reviewDates, watchlistItems.length, journalDates)
  );

  await db.$disconnect();
  console.log("\nExport complete.");
}

main().catch(async err => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
