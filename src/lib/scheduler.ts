// Scheduler — runs Investment OS automation jobs.
//
// Each job is a named async function. Jobs are run in a fixed nightly sequence.
// Every run is recorded in the Job DB table for the dashboard and audit trail.

import { db } from "./db";
import { backupFull } from "./backup-service";
import { runIntegrityChecks } from "./integrity-engine";
import { ingestPortfolioFilings } from "./sec-ingestion";
import { evaluatePortfolioThesisImpacts } from "./thesis-impact-engine";
import { computeOpportunities, saveOpportunityScores } from "./opportunity-engine";
import { generateMorningBrief, saveMorningBrief } from "./morning-brief-engine";
import { generateRadarCandidates, saveRadarCandidates } from "./radar-engine";
import { generateBlueprint, saveBlueprint } from "./architect-engine";
import { generateArchitectureReview, saveArchitectureReview, writeHedgeAuditToWiki } from "./architecture-review-engine";
import { runMacroIngestion } from "./macro-ingestion";
import { runNewsletterRefresh } from "./newsletter-engine";
import { generatePortfolioDecisionReviews, saveDecisionReview } from "./decision-review-engine";
import { generateThemeScoutReport, saveThemeScoutData, writeThemeScoutToWiki } from "./theme-scout-engine";
import { refreshResearchQueueDossiers } from "./research-dossier-engine";
import { extractNewMentions } from "./ticker-extractor";
import { buildDiscoveryCandidates } from "./discovery-intelligence-engine";
import { generateCompanyScoutReport } from "./company-scout-engine";
import { generatePrivateScoutReport } from "./private-scout-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JobResult {
  success: boolean;
  summary: string;
  error?: string;
}

export interface JobRecord {
  id: string;
  jobName: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  resultSummary: string | null;
  errorMessage: string | null;
}

export interface ScheduleStatus {
  lastRunAt: string | null;
  lastRunSuccessful: boolean | null;
  nextRunAt: string;
  runningJob: string | null;
  recentJobs: JobRecord[];
}

export interface NightlyRunResult {
  startedAt: string;
  completedAt: string;
  durationMs: number;
  jobsRun: number;
  jobsPassed: number;
  jobsFailed: number;
  results: { jobName: string; success: boolean; summary: string; durationMs: number }[];
  dailySummary: string;
}

// ─── Job definitions ──────────────────────────────────────────────────────────

export const JOB_NAMES = [
  "backup",
  "integrity_check",
  "macro_ingestion",
  "sec_filing_refresh",
  "earnings_refresh",
  "fmp_refresh",
  "universe_rescore",
  "opportunity_refresh",
  "dossier_refresh",
  "portfolio_review_refresh",
  "newsletter_refresh",
  "morning_brief",
  "ticker_extraction",
  "discovery_intelligence",
  "company_scout",
  "brain_os_export",
  "radar_refresh",
  "portfolio_architect",
  "portfolio_architecture_review",
  "decision_review",
  "theme_scout",
  "research_dossier",
  "private_scout",
] as const;

export type JobName = typeof JOB_NAMES[number];

// email_delivery is not in JOB_NAMES (not a scheduled job) but records appear in job history
export const EMAIL_JOB_LABEL = "Email Delivery";

export const JOB_LABELS: Record<JobName, string> = {
  backup: "Backup",
  integrity_check: "Integrity Check",
  macro_ingestion: "Macro Intelligence Ingestion",
  sec_filing_refresh: "SEC Filing Refresh",
  earnings_refresh: "Earnings Refresh",
  fmp_refresh: "FMP Fundamentals Refresh",
  universe_rescore: "Universe Rescore",
  opportunity_refresh: "Opportunity Refresh",
  dossier_refresh: "Dossier Refresh",
  portfolio_review_refresh: "Portfolio Review Refresh",
  newsletter_refresh: "Newsletter Intelligence",
  ticker_extraction:       "Ticker Extraction",
  discovery_intelligence:  "Discovery Intelligence",
  company_scout:           "Company Scout",
  brain_os_export:         "Brain OS Export",
  morning_brief: "Morning Brief",
  radar_refresh: "Discovery Radar",
  portfolio_architect: "Portfolio Architect",
  portfolio_architecture_review: "Portfolio Architecture Review",
  decision_review:   "Decision Review",
  theme_scout:       "Theme Scout",
  research_dossier:  "Research Dossier Agent",
  private_scout:     "Private Market Scout",
};

// Each job function returns a JobResult
const JOB_RUNNERS: Record<JobName, () => Promise<JobResult>> = {
  backup: runBackup,
  integrity_check: runIntegrityCheck,
  macro_ingestion: runMacroIngestion_,
  sec_filing_refresh: runSecFilingRefresh,
  earnings_refresh: runEarningsRefresh,
  fmp_refresh: runFmpRefresh,
  universe_rescore: runUniverseRescore,
  opportunity_refresh: runOpportunityRefresh,
  dossier_refresh: runDossierRefresh,
  portfolio_review_refresh: runPortfolioReviewRefresh,
  newsletter_refresh: runNewsletterRefresh_,
  ticker_extraction:      runTickerExtraction,
  discovery_intelligence: runDiscoveryIntelligence,
  company_scout:          runCompanyScout,
  brain_os_export:        runBrainOsExport,
  morning_brief: runMorningBrief,
  radar_refresh: runRadarRefresh,
  portfolio_architect: runPortfolioArchitect,
  portfolio_architecture_review: runPortfolioArchitectureReview,
  decision_review:  runDecisionReview,
  theme_scout:      runThemeScout,
  research_dossier: runResearchDossier,
  private_scout:    runPrivateScout,
};

// ─── Individual job implementations ──────────────────────────────────────────

async function runMacroIngestion_(): Promise<JobResult> {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    return { success: false, summary: "Skipped — FMP_API_KEY not set", error: "FMP_API_KEY env var missing" };
  }
  const result = await runMacroIngestion(apiKey);
  const summary = `Macro: ${result.macroPointsStored} FRED points, ${result.marketPointsStored} market points, ${result.geoEventsStored} geo events.${result.errors.length > 0 ? ` Errors: ${result.errors.slice(0, 2).join("; ")}` : ""}`;
  return { success: result.errors.length === 0 || result.macroPointsStored + result.marketPointsStored > 0, summary };
}

async function runBackup(): Promise<JobResult> {
  const result = await backupFull("nightly");
  return {
    success: true,
    summary: `Full snapshot created: ${result.filePath} (${(result.fileSize / 1024).toFixed(1)} KB)`,
  };
}

async function runIntegrityCheck(): Promise<JobResult> {
  const report = await runIntegrityChecks();
  const summary = `${report.passedChecks}/${report.totalChecks} checks passed. ${report.summary}`;
  return { success: report.errors.length === 0, summary };
}

async function runSecFilingRefresh(): Promise<JobResult> {
  const result = await ingestPortfolioFilings();
  const tickerCount = result.results.length;
  const summary = `${result.totalNew} new filings ingested for ${tickerCount} tickers. ${result.totalErrors} errors.`;
  return { success: result.totalErrors < tickerCount, summary };
}

async function runEarningsRefresh(): Promise<JobResult> {
  // Evaluate thesis impacts for any unanalyzed filings from the last 30 days
  const impacts = await evaluatePortfolioThesisImpacts({
    since: new Date(Date.now() - 30 * 86400 * 1000),
  });
  return {
    success: true,
    summary: `${impacts.length} thesis impacts evaluated from recent filings.`,
  };
}

async function runFmpRefresh(): Promise<JobResult> {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    return { success: false, summary: "Skipped — FMP_API_KEY not set", error: "FMP_API_KEY env var missing" };
  }

  // Lazy import to avoid loading FMP client unless needed
  const { ingestUniverse } = await import("./ingestion");
  const result = await ingestUniverse(apiKey);
  const summary = `FMP refresh: ${result.successCount} success, ${result.partialCount} partial, ${result.failedCount} failed, ${result.skippedCount} skipped in ${(result.totalMs / 1000).toFixed(1)}s`;
  return { success: result.failedCount < result.results.length, summary };
}

async function runUniverseRescore(): Promise<JobResult> {
  const { computeScores } = await import("./scoring-engine");

  const entries = await db.universe.findMany({
    where: { status: "active" },
    include: { fundamentals: true },
  });

  let scored = 0;
  let skipped = 0;

  for (const entry of entries) {
    if (!entry.fundamentals) { skipped++; continue; }
    const scores = computeScores(entry.fundamentals ? { ...entry.fundamentals, sector: entry.sector } : null);
    await db.universeScore.create({
      data: {
        universeId: entry.id,
        businessQuality: scores.businessQuality,
        growth: scores.growth,
        financialStrength: scores.financialStrength,
        capitalAllocation: scores.capitalAllocation,
        valuation: scores.valuation,
        totalScore: scores.totalScore,
      },
    });
    scored++;
  }

  return {
    success: true,
    summary: `Rescored ${scored} universe entries. ${skipped} skipped (no fundamentals).`,
  };
}

async function runOpportunityRefresh(): Promise<JobResult> {
  const result = await computeOpportunities();
  await saveOpportunityScores(result.entries);
  return {
    success: true,
    summary: `${result.entries.length} opportunities scored. Top: ${result.entries.slice(0, 3).map(e => e.ticker).join(", ")}`,
  };
}

async function runDossierRefresh(): Promise<JobResult> {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    return { success: false, summary: "Skipped — FMP_API_KEY not set", error: "FMP_API_KEY env var missing" };
  }

  const { generateDossier, saveDossier } = await import("./dossier-engine");

  const [positions, watchlist] = await Promise.all([
    db.position.findMany({ where: { status: "active", NOT: { ticker: "CASH" } }, select: { ticker: true } }),
    db.watchlist.findMany({ select: { ticker: true } }),
  ]);

  const tickers = [...new Set([...positions.map(p => p.ticker), ...watchlist.map(w => w.ticker)])];
  let generated = 0;
  const errors: string[] = [];

  for (const ticker of tickers) {
    try {
      const data = await generateDossier(ticker, apiKey);
      await saveDossier(data);
      generated++;
    } catch (err) {
      errors.push(`${ticker}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    success: errors.length < tickers.length,
    summary: `${generated}/${tickers.length} dossiers refreshed.${errors.length > 0 ? ` Errors: ${errors.slice(0, 2).join("; ")}` : ""}`,
  };
}

async function runPortfolioReviewRefresh(): Promise<JobResult> {
  const { generateReview } = await import("@/lib/portfolio-review");
  const review = await generateReview(null);
  return {
    success: true,
    summary: `Portfolio review generated. Risk: ${review.riskAnalysis.overallRiskLevel}. ${review.topOpportunities.length} opportunities.`,
  };
}

async function runBrainOsExport(): Promise<JobResult> {
  const { backupBrainOs } = await import("./backup-service");
  const result = await backupBrainOs("nightly");
  return {
    success: true,
    summary: `Brain OS snapshot exported: ${result.filePath} (${(result.fileSize / 1024).toFixed(1)} KB)`,
  };
}

async function runPortfolioArchitect(): Promise<JobResult> {
  const data = await generateBlueprint();
  const record = await saveBlueprint(data);
  const topGap = data.gapAnalysis[0];
  return {
    success: true,
    summary: `Blueprint generated: ${data.marketRegime} regime. ${data.gapAnalysis.length} gaps. ${topGap ? `Top gap: ${topGap.dimension} (${topGap.gap > 0 ? "+" : ""}${topGap.gap.toFixed(0)}%)` : "No critical gaps."}. Blueprint ID: ${record.id}`,
  };
}

async function runPortfolioArchitectureReview(): Promise<JobResult> {
  // Monthly gate — skip unless today is the 1st of the month
  const today = new Date();
  if (today.getDate() !== 1) {
    return { success: true, summary: "Skipped — portfolio architecture review runs on the 1st of each month" };
  }
  const data = await generateArchitectureReview();
  const record = await saveArchitectureReview(data);
  if (data.hedgeAudit) writeHedgeAuditToWiki(data.hedgeAudit, data.reviewDate);
  const topRec = data.recommendations[0];
  return {
    success: true,
    summary: `Architecture review: ${data.architectureScore.total}/100 (${data.architectureScore.grade} — ${data.architectureScore.label}). ${data.recommendations.length} recommendations.${topRec ? ` Top: [${topRec.priority}] ${topRec.action}` : ""} Record ID: ${record.id}`,
  };
}

async function runDecisionReview(): Promise<JobResult> {
  // Monthly gate — first Saturday of the month only
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun, 6=Sat
  const dayOfMonth = today.getDate();
  if (dayOfWeek !== 6 || dayOfMonth > 7) {
    return { success: true, summary: "Skipped — decision review runs on first Saturday of the month" };
  }

  const reviews = await generatePortfolioDecisionReviews();
  const saved: string[] = [];
  const errors: string[] = [];

  for (const review of reviews) {
    try {
      await saveDecisionReview(review);
      saved.push(review.ticker);

      // Wiki: create review page + bidirectional backlink
      try {
        const { createReviewPage, addReviewBacklinkToCompanyPage } = await import("./wiki-service");
        const slug = createReviewPage(review.ticker, {
          ticker: review.ticker,
          reviewDate: review.reviewDate,
          originalThesis: review.originalThesis,
          thesisStatus: review.thesisStatus,
          evidenceFor: review.evidenceFor,
          evidenceAgainst: review.evidenceAgainst,
          opportunityScore: review.opportunityScore,
          architectureContext: review.architectureContext,
          verdict: review.verdict,
          confidence: review.confidence,
          lessonLearned: review.lessonLearned,
        });
        addReviewBacklinkToCompanyPage(review.ticker, slug);
      } catch (wikiErr) {
        console.error(`[decision_review] wiki failed for ${review.ticker}:`, wikiErr);
      }
    } catch (err) {
      errors.push(`${review.ticker}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const verdictCounts = reviews.reduce<Record<string, number>>((acc, r) => {
    acc[r.verdict] = (acc[r.verdict] ?? 0) + 1;
    return acc;
  }, {});
  const verdictSummary = Object.entries(verdictCounts).map(([v, n]) => `${n} ${v}`).join(", ");

  return {
    success: errors.length < Math.max(reviews.length, 1),
    summary: `Decision reviews: ${saved.length} saved (${verdictSummary}).${errors.length > 0 ? ` Errors: ${errors.slice(0, 2).join("; ")}` : ""}`,
  };
}

async function runRadarRefresh(): Promise<JobResult> {
  const candidates = await generateRadarCandidates();
  const saved = await saveRadarCandidates(candidates);
  const topTicker = candidates[0]?.ticker ?? "—";

  // Update Brain OS wiki themes + company pages from radar output
  try {
    const { upsertThemePage, upsertCompanyPage } = await import("./wiki-service");
    // Aggregate candidates by theme
    const themeMap = new Map<string, string[]>();
    for (const c of candidates) {
      for (const theme of (c.themes ?? [])) {
        const existing = themeMap.get(theme) ?? [];
        existing.push(c.ticker);
        themeMap.set(theme, existing);
      }
    }
    for (const [theme, tickers] of themeMap.entries()) {
      upsertThemePage({
        name: theme,
        keyCompanies: tickers.map(t => ({ ticker: t, reason: candidates.find(c => c.ticker === t)?.discoveryReason ?? "" })),
        source: "radar",
      });
    }
    for (const c of candidates.slice(0, 10)) {
      upsertCompanyPage({
        ticker: c.ticker,
        companyName: c.companyName ?? c.ticker,
        summary: c.discoveryReason,
        source: "radar",
      });
    }
  } catch (err) {
    console.error("[wiki] radar upsert failed:", err);
  }

  return {
    success: true,
    summary: `Discovery Radar: ${saved.length} candidates. Top: ${topTicker} (${candidates[0]?.radarScore?.toFixed(0) ?? 0})`,
  };
}

async function runNewsletterRefresh_(): Promise<JobResult> {
  const result = await runNewsletterRefresh();
  const sourceSummary = Object.entries(result.bySource)
    .map(([src, n]) => `${src}:${n}`)
    .join(", ");
  const summary = `Newsletter: ${result.newItems} new items (${result.fetched} fetched, ${result.duplicatesSkipped} dupes).${sourceSummary ? ` Sources: ${sourceSummary}.` : ""}${result.errors.length > 0 ? ` Errors: ${result.errors.slice(0, 2).join("; ")}` : ""}`;
  return { success: result.errors.length === 0 || result.newItems >= 0, summary };
}

async function runMorningBrief(): Promise<JobResult> {
  const data = await generateMorningBrief();
  const record = await saveMorningBrief(data);

  // Build CIO brief document, generate narrative, archive to Brain OS, then email
  try {
    const { buildCIOBrief, renderCIOBriefMarkdown } = await import("./brief-generator");
    const { renderNarrativeEmail } = await import("./html-email-exporter");
    const { renderNarrativeBrief } = await import("./narrative-brief");
    const { archiveBrief, archiveNarrative } = await import("./brief-archive-service");

    const doc = await buildCIOBrief(data);
    const md = renderCIOBriefMarkdown(doc);
    const narrative = renderNarrativeBrief(doc);
    const narrativeHtml = renderNarrativeEmail(narrative, doc);

    archiveBrief(data.briefingDate, md, narrativeHtml);
    archiveNarrative(data.briefingDate, narrative);

    // Send narrative email — failure is recorded but does not fail morning_brief
    const { sendBriefEmailWithTracking } = await import("./email-service");
    const summary = doc.executiveSummary?.join(" ") ?? data.marketRegime;
    await sendBriefEmailWithTracking(narrativeHtml, data.briefingDate, summary);
  } catch (err) {
    console.error("[morning_brief] CIO brief archive/email failed:", err);
  }

  // Update Brain OS wiki daily note + macro/geo pages from morning brief
  try {
    const { upsertDailyNote, appendMacroNote, appendGeopoliticsNote } = await import("./wiki-service");
    const dateStr = data.briefingDate.toISOString().slice(0, 10);

    const macroText = data.macroSummary.topics
      .map((t: { topic: string; signal: string; insight: string }) => `**${t.topic}** (${t.signal}): ${t.insight}`)
      .join("\n");
    const geoText = data.geopoliticalSummary.risks
      .map((r: { region: string; level: string; insight: string }) => `**${r.region}** (${r.level}): ${r.insight}`)
      .join("\n");

    appendMacroNote(macroText, dateStr);
    appendGeopoliticsNote(geoText, dateStr);

    // Append institutional research and newsletter consensus to macro wiki page
    const institutionalItems: { source: string; title: string; summary: string[] }[] = data.institutionalResearch ?? [];
    const newsletterItems: { source: string; title: string; summary: string[] }[]    = data.newsletterConsensus ?? [];

    if (institutionalItems.length > 0) {
      const institutionalText = "### Institutional Research\n" +
        institutionalItems.map(i => `**${i.source}** — ${i.title}\n${(i.summary ?? []).slice(0, 2).join(" ")}`).join("\n\n");
      appendMacroNote(institutionalText, dateStr);
    }

    if (newsletterItems.length > 0) {
      const newsletterText = "### Newsletter Consensus\n" +
        newsletterItems.map(i => `**${i.source}** — ${i.title}\n${(i.summary ?? []).slice(0, 2).join(" ")}`).join("\n\n");
      appendMacroNote(newsletterText, dateStr);
    }

    upsertDailyNote({
      date: dateStr,
      regime: data.marketRegime,
      keyEvents: data.marketRegimeEvidence ?? [],
      macroUpdates: macroText,
      geopoliticsUpdates: geoText,
      actions: data.recommendedActions.map((a: { action: string }) => a.action),
    });
  } catch (err) {
    console.error("[wiki] morning brief upsert failed:", err);
  }

  const actionCount = data.recommendedActions.length;
  const positivePct = data.portfolioImpact.positive.length;
  return {
    success: true,
    summary: `Morning brief generated: ${data.marketRegime} regime. ${actionCount} actions. ${positivePct} positive positions. Brief ID: ${record.id}`,
  };
}

async function runThemeScout(): Promise<JobResult> {
  const report = await generateThemeScoutReport();
  await saveThemeScoutData(report.all);
  writeThemeScoutToWiki(report.all);

  const emerging     = report.emerging.length;
  const accelerating = report.accelerating.length;
  const weakening    = report.weakening.length;
  const top = report.emerging[0] ?? report.accelerating[0];

  return {
    success: true,
    summary: `Theme Scout: ${report.all.length} themes scored. ${emerging} emerging, ${accelerating} accelerating, ${weakening} weakening.${top ? ` Top: ${top.theme} (${top.score})` : ""}`,
  };
}

async function runResearchDossier(): Promise<JobResult> {
  const result = await refreshResearchQueueDossiers();
  if (result.generated === 0 && result.skipped === 0) {
    return { success: true, summary: "Research Dossier: No themes with priority ≥70 — run Theme Scout first." };
  }
  return {
    success: result.generated > 0,
    summary: `Research Dossier: Generated ${result.generated} dossier(s).${result.generated > 0 ? ` Themes: ${result.themes.slice(0, 3).join(", ")}${result.themes.length > 3 ? "…" : ""}` : ""}${result.skipped > 0 ? ` Skipped: ${result.skipped}` : ""}`,
  };
}

async function runTickerExtraction(): Promise<JobResult> {
  const result = await extractNewMentions();
  if (result.processed === 0) {
    return { success: true, summary: "Ticker Extraction: No new sources to process." };
  }
  return {
    success: true,
    summary: `Ticker Extraction: Processed ${result.processed} source(s), wrote ${result.newMentions} new mention(s).${result.errors > 0 ? ` Errors: ${result.errors}` : ""}`,
  };
}

async function runDiscoveryIntelligence(): Promise<JobResult> {
  const result = await buildDiscoveryCandidates();
  return {
    success: true,
    summary: `Discovery Intelligence: ${result.processed} ticker${result.processed !== 1 ? "s" : ""} scored, ${result.promoted} candidate${result.promoted !== 1 ? "s" : ""} promoted, ${result.queued} added to watchlist.${result.errors > 0 ? ` Errors: ${result.errors}` : ""}`,
  };
}

async function runCompanyScout(): Promise<JobResult> {
  const report = await generateCompanyScoutReport();
  const audit  = report.coverageAudit;
  const cats   = [
    report.consensus.length    > 0 ? `${report.consensus.length} Consensus`    : "",
    report.hiddenGems.length   > 0 ? `${report.hiddenGems.length} Hidden Gem`  : "",
    report.emerging.length     > 0 ? `${report.emerging.length} Emerging`      : "",
    report.accelerating.length > 0 ? `${report.accelerating.length} Accelerating` : "",
  ].filter(Boolean).join(", ") || "all Monitoring";
  return {
    success: true,
    summary: `Company Scout: ${audit.totalTracked} tracked, ${audit.newCompanies} new (${(audit.newCompanies / Math.max(audit.totalTracked, 1) * 100).toFixed(0)}% discovery). Categories: ${cats}. Auto-queued: ${report.autoQueued}.${audit.biasDetected ? " BIAS DETECTED." : ""}`,
  };
}

async function runPrivateScout(): Promise<JobResult> {
  const report = await generatePrivateScoutReport();
  const top3   = report.topCandidates.slice(0, 3).map(c => `${c.companyName} (${c.discoveryScore})`).join(", ");
  return {
    success: true,
    summary: `Private Scout: ${report.totalScanned} private companies scanned. Top: ${top3 || "none"}. Beneficiary tickers: ${report.topPublicBeneficiaries.slice(0, 5).map(b => b.ticker).join(", ")}.`,
  };
}

// ─── Job runner ───────────────────────────────────────────────────────────────

export async function runJob(jobName: string): Promise<JobRecord> {
  const runner = JOB_RUNNERS[jobName as JobName];
  if (!runner) {
    throw new Error(`Unknown job: ${jobName}`);
  }

  const job = await db.job.create({
    data: { jobName, status: "running", startedAt: new Date() },
  });

  const start = Date.now();
  let result: JobResult;

  try {
    result = await runner();
  } catch (err) {
    result = {
      success: false,
      summary: "Job threw an unexpected error",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const durationMs = Date.now() - start;
  const updated = await db.job.update({
    where: { id: job.id },
    data: {
      status: result.success ? "completed" : "failed",
      completedAt: new Date(),
      durationMs,
      resultSummary: result.summary,
      errorMessage: result.error ?? null,
    },
  });

  return serializeJob(updated);
}

// ─── Nightly sequence ─────────────────────────────────────────────────────────

export async function runNightlySequence(): Promise<NightlyRunResult> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const results: NightlyRunResult["results"] = [];

  for (const jobName of JOB_NAMES) {
    const t1 = Date.now();
    try {
      const record = await runJob(jobName);
      results.push({
        jobName,
        success: record.status === "completed",
        summary: record.resultSummary ?? "",
        durationMs: record.durationMs ?? 0,
      });
    } catch (err) {
      // Continue remaining jobs even if one fails
      results.push({
        jobName,
        success: false,
        summary: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - t1,
      });
    }
  }

  const completedAt = new Date().toISOString();
  const durationMs = Date.now() - t0;
  const jobsPassed = results.filter(r => r.success).length;
  const jobsFailed = results.filter(r => !r.success).length;

  const dailySummary = generateDailySummary(results, durationMs);

  return {
    startedAt,
    completedAt,
    durationMs,
    jobsRun: results.length,
    jobsPassed,
    jobsFailed,
    results,
    dailySummary,
  };
}

// ─── Retry failed jobs ────────────────────────────────────────────────────────

export async function retryFailedJobs(since?: Date): Promise<JobRecord[]> {
  const since24h = since ?? new Date(Date.now() - 86400 * 1000);
  const failed = await db.job.findMany({
    where: { status: "failed", startedAt: { gte: since24h } },
    orderBy: { startedAt: "desc" },
    distinct: ["jobName"],
  });

  const results: JobRecord[] = [];
  for (const job of failed) {
    const record = await runJob(job.jobName);
    results.push(record);
  }
  return results;
}

// ─── Schedule status ──────────────────────────────────────────────────────────

export async function getScheduleStatus(): Promise<ScheduleStatus> {
  const [recent, running] = await Promise.all([
    db.job.findMany({ orderBy: { startedAt: "desc" }, take: 30 }),
    db.job.findFirst({ where: { status: "running" }, orderBy: { startedAt: "desc" } }),
  ]);

  const nightlyJobs = recent.filter(j => JOB_NAMES.includes(j.jobName as JobName));
  const lastNightly = nightlyJobs[0];

  const now = new Date();
  const nextRun = new Date(now);
  nextRun.setUTCHours(22, 0, 0, 0); // 22:00 UTC = ~05:00 Bangkok
  if (nextRun <= now) nextRun.setUTCDate(nextRun.getUTCDate() + 1);

  return {
    lastRunAt: lastNightly?.completedAt?.toISOString() ?? null,
    lastRunSuccessful: lastNightly ? lastNightly.status === "completed" : null,
    nextRunAt: nextRun.toISOString(),
    runningJob: running?.jobName ?? null,
    recentJobs: recent.map(serializeJob),
  };
}

// ─── Job history ──────────────────────────────────────────────────────────────

export async function getJobHistory(jobName?: string, limit = 50): Promise<JobRecord[]> {
  const where = jobName ? { jobName } : {};
  const jobs = await db.job.findMany({
    where,
    orderBy: { startedAt: "desc" },
    take: limit,
  });
  return jobs.map(serializeJob);
}

// ─── Daily summary ────────────────────────────────────────────────────────────

function generateDailySummary(
  results: NightlyRunResult["results"],
  durationMs: number
): string {
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success);
  const lines: string[] = [
    `Nightly run completed in ${(durationMs / 1000).toFixed(1)}s — ${passed}/${results.length} jobs passed.`,
  ];

  const secResult = results.find(r => r.jobName === "sec_filing_refresh");
  if (secResult?.summary) lines.push(`SEC: ${secResult.summary}`);

  const integrityResult = results.find(r => r.jobName === "integrity_check");
  if (integrityResult?.summary) lines.push(`Integrity: ${integrityResult.summary}`);

  const oppResult = results.find(r => r.jobName === "opportunity_refresh");
  if (oppResult?.summary) lines.push(`Opportunities: ${oppResult.summary}`);

  const briefResult = results.find(r => r.jobName === "morning_brief");
  if (briefResult?.summary) lines.push(`Brief: ${briefResult.summary}`);

  if (failed.length > 0) {
    lines.push(`Failed: ${failed.map(f => JOB_LABELS[f.jobName as JobName] ?? f.jobName).join(", ")}`);
  }

  return lines.join(" | ");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function serializeJob(j: {
  id: string; jobName: string; status: string;
  startedAt: Date; completedAt: Date | null;
  durationMs: number | null; resultSummary: string | null; errorMessage: string | null;
}): JobRecord {
  return {
    id: j.id,
    jobName: j.jobName,
    status: j.status,
    startedAt: j.startedAt.toISOString(),
    completedAt: j.completedAt?.toISOString() ?? null,
    durationMs: j.durationMs,
    resultSummary: j.resultSummary,
    errorMessage: j.errorMessage,
  };
}
