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
  "sec_filing_refresh",
  "earnings_refresh",
  "fmp_refresh",
  "universe_rescore",
  "opportunity_refresh",
  "dossier_refresh",
  "portfolio_review_refresh",
  "brain_os_export",
] as const;

export type JobName = typeof JOB_NAMES[number];

export const JOB_LABELS: Record<JobName, string> = {
  backup: "Backup",
  integrity_check: "Integrity Check",
  sec_filing_refresh: "SEC Filing Refresh",
  earnings_refresh: "Earnings Refresh",
  fmp_refresh: "FMP Fundamentals Refresh",
  universe_rescore: "Universe Rescore",
  opportunity_refresh: "Opportunity Refresh",
  dossier_refresh: "Dossier Refresh",
  portfolio_review_refresh: "Portfolio Review Refresh",
  brain_os_export: "Brain OS Export",
};

// Each job function returns a JobResult
const JOB_RUNNERS: Record<JobName, () => Promise<JobResult>> = {
  backup: runBackup,
  integrity_check: runIntegrityCheck,
  sec_filing_refresh: runSecFilingRefresh,
  earnings_refresh: runEarningsRefresh,
  fmp_refresh: runFmpRefresh,
  universe_rescore: runUniverseRescore,
  opportunity_refresh: runOpportunityRefresh,
  dossier_refresh: runDossierRefresh,
  portfolio_review_refresh: runPortfolioReviewRefresh,
  brain_os_export: runBrainOsExport,
};

// ─── Individual job implementations ──────────────────────────────────────────

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
    const scores = computeScores(entry.fundamentals);
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

  const tickers = [...new Set([...positions.map(p => p.ticker), ...watchlist.map(w => w.ticker)])].slice(0, 10);
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
  const { generateReview } = await import("@/app/api/portfolio-review/route");
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
