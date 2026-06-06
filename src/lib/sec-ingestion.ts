// SEC Ingestion Layer — discovers, downloads, stores, and deduplicates SEC filings.
//
// Source: SEC EDGAR (free, no API key)
// Flow: discover filings → check deduplication → download text → extract content → store

import { db } from "./db";
import {
  fetchRecentFilings,
  downloadFilingText,
  buildFilingUrl,
  getCik,
  type SupportedFilingType,
  type SecFilingMeta,
} from "./sec-client";
import { analyzeFilingContent, type FilingAnalysis } from "./filing-analyzer";
import { evaluateThesisImpact } from "./thesis-impact-engine";

export interface IngestionOptions {
  types?: SupportedFilingType[];
  maxPerType?: number;
  downloadContent?: boolean;
  runAnalysis?: boolean;
}

export interface FilingIngestionResult {
  ticker: string;
  discovered: number;
  newFilings: number;
  skippedDuplicates: number;
  errors: string[];
  filingIds: string[];
}

export interface BulkIngestionResult {
  results: FilingIngestionResult[];
  totalNew: number;
  totalErrors: number;
}

// ─── Single ticker ingestion ──────────────────────────────────────────────────

export async function ingestFilingsForTicker(
  ticker: string,
  options: IngestionOptions = {},
): Promise<FilingIngestionResult> {
  const {
    types = ["10-K", "10-Q", "8-K"],
    maxPerType = 3,
    downloadContent = true,
    runAnalysis = true,
  } = options;

  const result: FilingIngestionResult = {
    ticker,
    discovered: 0,
    newFilings: 0,
    skippedDuplicates: 0,
    errors: [],
    filingIds: [],
  };

  let metas: SecFilingMeta[];
  try {
    metas = await fetchRecentFilings(ticker, types, maxPerType);
    result.discovered = metas.length;
  } catch (err) {
    result.errors.push(`Discovery failed: ${err instanceof Error ? err.message : String(err)}`);
    return result;
  }

  for (const meta of metas) {
    try {
      // Deduplication by accessionNumber
      const existing = await db.filing.findUnique({
        where: { accessionNumber: meta.accessionNumber },
        select: { id: true },
      });

      if (existing) {
        result.skippedDuplicates++;
        continue;
      }

      let rawContent: string | null = null;
      if (downloadContent && meta.primaryDocument) {
        try {
          const full = await downloadFilingText(meta.cik, meta.accessionNumber, meta.primaryDocument);
          rawContent = full.slice(0, 100_000); // cap at 100K chars to keep DB manageable
        } catch (err) {
          result.errors.push(`Download failed for ${meta.accessionNumber}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      const sourceUrl = buildFilingUrl(meta.cik, meta.accessionNumber);

      const filing = await db.filing.create({
        data: {
          ticker: ticker.toUpperCase(),
          filingType: meta.filingType,
          accessionNumber: meta.accessionNumber,
          filingDate: new Date(meta.filingDate),
          periodEndDate: meta.periodEndDate ? new Date(meta.periodEndDate) : null,
          title: meta.title || meta.filingType,
          rawContent,
          sourceUrl,
        },
      });

      result.newFilings++;
      result.filingIds.push(filing.id);

      // Run analysis if we have content
      if (runAnalysis && rawContent) {
        try {
          const analysis = analyzeFilingContent(rawContent, meta.filingType, ticker);
          await db.filing.update({
            where: { id: filing.id },
            data: { summary: buildSummary(analysis) },
          });

          // Evaluate thesis impact
          const thesis = await db.investmentThesis.findUnique({ where: { ticker: ticker.toUpperCase() } });
          if (thesis) {
            await evaluateThesisImpact(filing.id, ticker, analysis, thesis);
          }
        } catch (err) {
          result.errors.push(`Analysis failed for ${meta.accessionNumber}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } catch (err) {
      result.errors.push(`Filing ${meta.accessionNumber} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

// ─── Bulk ingestion ───────────────────────────────────────────────────────────

export async function ingestFilingsForTickers(
  tickers: string[],
  options: IngestionOptions = {},
): Promise<BulkIngestionResult> {
  const results: FilingIngestionResult[] = [];

  for (const ticker of tickers) {
    const r = await ingestFilingsForTicker(ticker, options);
    results.push(r);
  }

  return {
    results,
    totalNew: results.reduce((s, r) => s + r.newFilings, 0),
    totalErrors: results.reduce((s, r) => s + r.errors.length, 0),
  };
}

// ─── Portfolio-wide ingestion ─────────────────────────────────────────────────

export async function ingestPortfolioFilings(options: IngestionOptions = {}): Promise<BulkIngestionResult> {
  const [positions, watchlist] = await Promise.all([
    db.position.findMany({ where: { status: "active", NOT: { ticker: "CASH" } }, select: { ticker: true } }),
    db.watchlist.findMany({ select: { ticker: true } }),
  ]);

  const tickers = [...new Set([
    ...positions.map(p => p.ticker),
    ...watchlist.map(w => w.ticker),
  ])];

  return ingestFilingsForTickers(tickers, options);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSummary(analysis: FilingAnalysis): string {
  const parts: string[] = [];

  if (analysis.businessChanges.length > 0) {
    parts.push(`Business: ${analysis.businessChanges.slice(0, 2).join("; ")}`);
  }
  if (analysis.riskChanges.length > 0) {
    parts.push(`Risks: ${analysis.riskChanges.slice(0, 2).join("; ")}`);
  }
  if (analysis.capitalAllocationChanges.length > 0) {
    parts.push(`Capital: ${analysis.capitalAllocationChanges.slice(0, 1).join("; ")}`);
  }
  if (analysis.guidanceChanges.length > 0) {
    parts.push(`Guidance: ${analysis.guidanceChanges.slice(0, 1).join("; ")}`);
  }

  return parts.join(" | ") || "Filing ingested — no structured analysis available.";
}
