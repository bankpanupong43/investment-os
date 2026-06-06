// Integrity Engine — scans the database for consistency issues.
//
// Each check returns a list of issues with severity: error | warning | info.
// Errors = data is broken. Warnings = data is suspicious. Info = gaps.

import { db } from "./db";

// ─── Types ────────────────────────────────────────────────────────────────────

export type IssueSeverity = "error" | "warning" | "info";

export interface IntegrityIssue {
  check: string;
  severity: IssueSeverity;
  message: string;
  detail?: string;
  affectedIds?: string[];
}

export interface IntegrityReport {
  scannedAt: string;
  passedChecks: number;
  totalChecks: number;
  errors: IntegrityIssue[];
  warnings: IntegrityIssue[];
  infos: IntegrityIssue[];
  allIssues: IntegrityIssue[];
  summary: string;
  healthy: boolean;
}

// ─── Individual checks ────────────────────────────────────────────────────────

async function checkDuplicatePositionTickers(): Promise<IntegrityIssue | null> {
  const positions = await db.position.findMany({ select: { ticker: true, status: true } });
  const active = positions.filter(p => p.status === "active");
  const counts = active.reduce((m, p) => { m.set(p.ticker, (m.get(p.ticker) ?? 0) + 1); return m; }, new Map<string, number>());
  const dupes = [...counts.entries()].filter(([, n]) => n > 1).map(([t]) => t);
  if (dupes.length === 0) return null;
  return {
    check: "duplicate_position_tickers",
    severity: "error",
    message: `Duplicate active position tickers: ${dupes.join(", ")}`,
    detail: "Multiple active positions share the same ticker. Each ticker should have at most one active position.",
    affectedIds: dupes,
  };
}

async function checkDuplicateInvestmentTheses(): Promise<IntegrityIssue | null> {
  const theses = await db.investmentThesis.findMany({ select: { ticker: true, id: true } });
  const counts = theses.reduce((m, t) => { m.set(t.ticker, [...(m.get(t.ticker) ?? []), t.id]); return m; }, new Map<string, string[]>());
  const dupes = [...counts.entries()].filter(([, ids]) => ids.length > 1).map(([t]) => t);
  if (dupes.length === 0) return null;
  return {
    check: "duplicate_investment_theses",
    severity: "error",
    message: `Duplicate InvestmentThesis for tickers: ${dupes.join(", ")}`,
    detail: "InvestmentThesis has a unique constraint on ticker — duplicates indicate a data issue.",
    affectedIds: dupes,
  };
}

async function checkDuplicateUniverseTickers(): Promise<IntegrityIssue | null> {
  const entries = await db.universe.findMany({ select: { ticker: true, id: true } });
  const counts = entries.reduce((m, u) => { m.set(u.ticker, (m.get(u.ticker) ?? 0) + 1); return m; }, new Map<string, number>());
  const dupes = [...counts.entries()].filter(([, n]) => n > 1).map(([t]) => t);
  if (dupes.length === 0) return null;
  return {
    check: "duplicate_universe_tickers",
    severity: "error",
    message: `Duplicate Universe entries for tickers: ${dupes.join(", ")}`,
    affectedIds: dupes,
  };
}

async function checkOrphanEvidence(): Promise<IntegrityIssue | null> {
  const evidenceTickers = await db.evidence.findMany({ select: { ticker: true, id: true }, distinct: ["ticker"] });
  const universeTickers = new Set((await db.universe.findMany({ select: { ticker: true } })).map(u => u.ticker));
  const orphans = evidenceTickers.filter(e => !universeTickers.has(e.ticker)).map(e => e.ticker);
  if (orphans.length === 0) return null;
  return {
    check: "orphan_evidence",
    severity: "warning",
    message: `Evidence records for tickers not in Universe: ${orphans.join(", ")}`,
    detail: "Evidence exists for tickers that are not in the investable universe.",
    affectedIds: orphans,
  };
}

async function checkOrphanFilings(): Promise<IntegrityIssue | null> {
  const filingTickers = await db.filing.findMany({ select: { ticker: true }, distinct: ["ticker"] });
  const [positionTickers, watchlistTickers] = await Promise.all([
    db.position.findMany({ select: { ticker: true } }),
    db.watchlist.findMany({ select: { ticker: true } }),
  ]);
  const knownTickers = new Set([
    ...positionTickers.map(p => p.ticker),
    ...watchlistTickers.map(w => w.ticker),
  ]);
  const orphans = filingTickers.filter(f => !knownTickers.has(f.ticker)).map(f => f.ticker);
  if (orphans.length === 0) return null;
  return {
    check: "orphan_filings",
    severity: "info",
    message: `Filings for tickers not in portfolio or watchlist: ${orphans.join(", ")}`,
    detail: "These tickers have filings but are not tracked as positions or watchlist items.",
    affectedIds: orphans,
  };
}

async function checkOrphanEarnings(): Promise<IntegrityIssue | null> {
  const broken = await db.earningsEvent.findMany({
    where: { positionId: { not: null } },
    select: { id: true, ticker: true, positionId: true },
  });
  const orphans: string[] = [];
  for (const e of broken) {
    if (e.positionId) {
      const pos = await db.position.findUnique({ where: { id: e.positionId }, select: { id: true } });
      if (!pos) orphans.push(e.id);
    }
  }
  if (orphans.length === 0) return null;
  return {
    check: "orphan_earnings",
    severity: "warning",
    message: `${orphans.length} EarningsEvent record(s) reference deleted positions`,
    detail: "These earnings events have positionId pointing to non-existent positions.",
    affectedIds: orphans,
  };
}

async function checkBrokenDossierReferences(): Promise<IntegrityIssue | null> {
  const dossierTickers = await db.researchDossier.findMany({ select: { ticker: true } });
  const universeTickers = new Set((await db.universe.findMany({ select: { ticker: true } })).map(u => u.ticker));
  const broken = dossierTickers.filter(d => !universeTickers.has(d.ticker)).map(d => d.ticker);
  if (broken.length === 0) return null;
  return {
    check: "broken_dossier_references",
    severity: "warning",
    message: `Research dossiers for tickers not in Universe: ${broken.join(", ")}`,
    detail: "Dossiers exist for tickers that have been removed from the universe.",
    affectedIds: broken,
  };
}

async function checkMissingAllocationTargets(): Promise<IntegrityIssue | null> {
  const positions = await db.position.findMany({
    where: { status: "active", NOT: { ticker: "CASH" } },
    select: { ticker: true },
  });
  const targets = new Set((await db.allocationTarget.findMany({ select: { ticker: true } })).map(t => t.ticker));
  const missing = positions.filter(p => !targets.has(p.ticker)).map(p => p.ticker);
  if (missing.length === 0) return null;
  return {
    check: "missing_allocation_targets",
    severity: "warning",
    message: `Active positions without allocation targets: ${missing.join(", ")}`,
    detail: "These positions exist but have no allocation target, so they can't be tracked in rebalancing.",
    affectedIds: missing,
  };
}

async function checkMissingUniverseScores(): Promise<IntegrityIssue | null> {
  const withFundamentals = await db.universe.findMany({
    where: { fundamentals: { isNot: null }, status: "active" },
    select: { ticker: true, scores: { select: { id: true } } },
  });
  const missing = withFundamentals.filter(u => u.scores.length === 0).map(u => u.ticker);
  if (missing.length === 0) return null;
  return {
    check: "missing_universe_scores",
    severity: "info",
    message: `${missing.length} universe entries with fundamentals but no scores: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""}`,
    detail: "These tickers have fundamental data but haven't been scored. Run the scoring engine.",
    affectedIds: missing,
  };
}

async function checkMissingOpportunityScores(): Promise<IntegrityIssue | null> {
  const universe = await db.universe.findMany({ where: { status: "active" }, select: { ticker: true } });
  const scored = new Set((await db.opportunityScore.findMany({ select: { ticker: true }, distinct: ["ticker"] })).map(o => o.ticker));
  const missing = universe.filter(u => !scored.has(u.ticker)).map(u => u.ticker);
  if (missing.length === 0) return null;
  return {
    check: "missing_opportunity_scores",
    severity: "info",
    message: `${missing.length} universe entries without opportunity scores`,
    detail: "Run the opportunity engine to generate scores for all universe entries.",
    affectedIds: missing.slice(0, 10),
  };
}

async function checkOrphanThesisImpacts(): Promise<IntegrityIssue | null> {
  const impacts = await db.thesisImpactRecord.findMany({
    select: { id: true, filingId: true },
  });
  const filingIds = new Set((await db.filing.findMany({ select: { id: true } })).map(f => f.id));
  const orphans = impacts.filter(i => !filingIds.has(i.filingId)).map(i => i.id);
  if (orphans.length === 0) return null;
  return {
    check: "orphan_thesis_impacts",
    severity: "warning",
    message: `${orphans.length} ThesisImpactRecord(s) reference deleted filings`,
    affectedIds: orphans,
  };
}

async function checkInvestmentThesisWithoutKnownTicker(): Promise<IntegrityIssue | null> {
  const theses = await db.investmentThesis.findMany({ select: { ticker: true, status: true } });
  const [positions, watchlist] = await Promise.all([
    db.position.findMany({ select: { ticker: true } }),
    db.watchlist.findMany({ select: { ticker: true } }),
  ]);
  const known = new Set([...positions.map(p => p.ticker), ...watchlist.map(w => w.ticker)]);
  const stale = theses.filter(t => !known.has(t.ticker) && t.status !== "closed").map(t => t.ticker);
  if (stale.length === 0) return null;
  return {
    check: "stale_investment_theses",
    severity: "info",
    message: `Investment theses for tickers not in portfolio or watchlist: ${stale.join(", ")}`,
    detail: "These theses belong to tickers that have been removed. Consider marking them 'closed'.",
    affectedIds: stale,
  };
}

// ─── Main runner ──────────────────────────────────────────────────────────────

export async function runIntegrityChecks(): Promise<IntegrityReport> {
  const scannedAt = new Date().toISOString();
  const checks = [
    checkDuplicatePositionTickers,
    checkDuplicateInvestmentTheses,
    checkDuplicateUniverseTickers,
    checkOrphanEvidence,
    checkOrphanFilings,
    checkOrphanEarnings,
    checkBrokenDossierReferences,
    checkMissingAllocationTargets,
    checkMissingUniverseScores,
    checkMissingOpportunityScores,
    checkOrphanThesisImpacts,
    checkInvestmentThesisWithoutKnownTicker,
  ];

  const results = await Promise.all(checks.map(fn => fn().catch(err => ({
    check: fn.name,
    severity: "error" as IssueSeverity,
    message: `Check failed: ${err instanceof Error ? err.message : String(err)}`,
  }))));

  const allIssues = results.filter((r): r is IntegrityIssue => r !== null);
  const errors = allIssues.filter(i => i.severity === "error");
  const warnings = allIssues.filter(i => i.severity === "warning");
  const infos = allIssues.filter(i => i.severity === "info");
  const passedChecks = checks.length - allIssues.length;
  const healthy = errors.length === 0 && warnings.length === 0;

  let summary: string;
  if (healthy) {
    summary = `All ${checks.length} integrity checks passed.`;
  } else {
    const parts = [];
    if (errors.length > 0) parts.push(`${errors.length} error(s)`);
    if (warnings.length > 0) parts.push(`${warnings.length} warning(s)`);
    if (infos.length > 0) parts.push(`${infos.length} info item(s)`);
    summary = `${parts.join(", ")} found in ${checks.length} checks.`;
  }

  return { scannedAt, passedChecks, totalChecks: checks.length, errors, warnings, infos, allIssues, summary, healthy };
}
