// Newsletter Intelligence Engine — Phase 14
//
// Orchestrates:
//   1. Gmail newsletter ingestion (bloomberg_money_stuff, daily_upside, axios_markets, sherwood_news)
//   2. Institutional web RSS ingestion (blackrock, morgan_stanley, jpmorgan)
//   3. Deduplication against existing DB records
//   4. Rules-based content processing
//   5. DB storage
//   6. Wiki integration (macro + geopolitics pages)
//   7. Logging to brain-os/logs/newsletter.md

import * as fs from "fs";
import * as path from "path";
import { db } from "./db";
import { fetchRecentNewsletterEmails, deduplicateByHash, isGmailConfigured } from "./gmail-newsletter";
import { fetchAllInstitutionalResearch } from "./institutional-research";
import { processArticle } from "./newsletter-processor";
import { appendMacroNote, appendGeopoliticsNote } from "./wiki-service";
import { resolveBrainOsPath } from "./shared-paths";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NewsletterRunResult {
  fetched: number;
  newItems: number;
  duplicatesSkipped: number;
  errors: string[];
  bySource: Record<string, number>;
}

export interface NewsletterInsight {
  source: string;
  title: string;
  summary: string[];
  portfolioRelevance: "bullish" | "neutral" | "bearish";
  publishedAt: string;
  url?: string;
}

// Source category mapping
const INSTITUTIONAL_SOURCES = new Set(["blackrock", "morgan_stanley", "jpmorgan"]);
const NEWSLETTER_SOURCES    = new Set(["bloomberg_money_stuff", "daily_upside", "axios_markets", "sherwood_news"]);

export const SOURCE_LABELS: Record<string, string> = {
  bloomberg_money_stuff: "Bloomberg Money Stuff",
  daily_upside:          "The Daily Upside",
  axios_markets:         "Axios Markets",
  sherwood_news:         "Sherwood News",
  blackrock:             "BlackRock Investment Institute",
  morgan_stanley:        "Morgan Stanley",
  jpmorgan:              "J.P. Morgan",
};

// ─── Main runner ──────────────────────────────────────────────────────────────

export async function runNewsletterRefresh(): Promise<NewsletterRunResult> {
  const result: NewsletterRunResult = {
    fetched: 0,
    newItems: 0,
    duplicatesSkipped: 0,
    errors: [],
    bySource: {},
  };

  // Load existing hashes for deduplication
  const existing = await db.newsletterItem.findMany({
    where: { publishedAt: { gte: new Date(Date.now() - 30 * 86400 * 1000) } },
    select: { rawContentHash: true },
  });
  const existingHashes = new Set(existing.map(e => e.rawContentHash));

  // Collect articles from all sources
  const [gmailEmails, webArticles] = await Promise.allSettled([
    isGmailConfigured() ? fetchRecentNewsletterEmails() : Promise.resolve([]),
    fetchAllInstitutionalResearch(),
  ]);

  const gmailItems = gmailEmails.status === "fulfilled" ? gmailEmails.value : [];
  const webItems   = webArticles.status === "fulfilled"  ? webArticles.value  : [];

  if (gmailEmails.status === "rejected") {
    result.errors.push(`Gmail: ${gmailEmails.reason instanceof Error ? gmailEmails.reason.message : String(gmailEmails.reason)}`);
  }
  if (webArticles.status === "rejected") {
    result.errors.push(`Web RSS: ${webArticles.reason instanceof Error ? webArticles.reason.message : String(webArticles.reason)}`);
  }

  // Combine and deduplicate
  const allItems = [
    ...deduplicateByHash(gmailItems, existingHashes),
    ...webItems.filter(a => !existingHashes.has(a.rawHash)),
  ];

  result.fetched = gmailItems.length + webItems.length;
  result.duplicatesSkipped = result.fetched - allItems.length;

  // Track seen hashes within this run too (dedup across multiple feeds)
  const seenThisRun = new Set<string>();
  const uniqueItems = allItems.filter(a => {
    if (seenThisRun.has(a.rawHash)) return false;
    seenThisRun.add(a.rawHash);
    return true;
  });

  // Process and store each new item
  for (const item of uniqueItems) {
    try {
      const processed = processArticle(item.rawText, item.title);

      await db.newsletterItem.create({
        data: {
          source:                   item.source,
          title:                    item.title,
          url:                      ("url" in item ? item.url : undefined) ?? null,
          publishedAt:              item.publishedAt,
          summary:                  JSON.stringify(processed.summary),
          keyPoints:                JSON.stringify(processed.keyPoints),
          marketImplications:       JSON.stringify(processed.marketImplications),
          geopoliticalImplications: JSON.stringify(processed.geopoliticalImplications),
          portfolioRelevance:       processed.portfolioRelevance,
          confidence:               processed.confidence,
          rawContentHash:           item.rawHash,
        },
      });

      result.newItems++;
      result.bySource[item.source] = (result.bySource[item.source] ?? 0) + 1;

      // Wiki integration — append geo implications to geopolitics page, macro to macro page
      const dateStr = item.publishedAt.toISOString().slice(0, 10);
      if (processed.geopoliticalImplications.length > 0) {
        const geoText = `**${SOURCE_LABELS[item.source] ?? item.source}** — ${item.title}\n${processed.geopoliticalImplications.join("\n")}`;
        appendGeopoliticsNote(geoText, dateStr);
      }
      if (processed.summary.length > 0) {
        const macroText = `**${SOURCE_LABELS[item.source] ?? item.source}** — ${item.title}\n${processed.summary.slice(0, 2).join("\n")}`;
        appendMacroNote(macroText, dateStr);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Skip unique constraint violations (harmless race condition)
      if (!msg.includes("Unique constraint")) {
        result.errors.push(`${item.source}/${item.title.slice(0, 40)}: ${msg}`);
      }
    }
  }

  // Append to newsletter log
  appendNewsletterLog(result, uniqueItems);

  return result;
}

// ─── Morning Brief integration ────────────────────────────────────────────────

export async function getNewsletterInsightsForBrief(since?: Date): Promise<{
  institutional: NewsletterInsight[];
  newsletters: NewsletterInsight[];
}> {
  const cutoff = since ?? new Date(Date.now() - 7 * 86400 * 1000);

  const items = await db.newsletterItem.findMany({
    where: { publishedAt: { gte: cutoff } },
    orderBy: { publishedAt: "desc" },
    take: 30,
  });

  const toInsight = (item: typeof items[0]): NewsletterInsight => ({
    source:            SOURCE_LABELS[item.source] ?? item.source,
    title:             item.title,
    summary:           JSON.parse(item.summary) as string[],
    portfolioRelevance: item.portfolioRelevance as "bullish" | "neutral" | "bearish",
    publishedAt:       item.publishedAt.toISOString().slice(0, 10),
    url:               item.url ?? undefined,
  });

  // Deduplicate by source — keep most recent per source
  const bySource = new Map<string, typeof items[0]>();
  for (const item of items) {
    if (!bySource.has(item.source)) bySource.set(item.source, item);
  }

  const deduped = [...bySource.values()];

  return {
    institutional: deduped.filter(i => INSTITUTIONAL_SOURCES.has(i.source)).map(toInsight),
    newsletters:   deduped.filter(i => NEWSLETTER_SOURCES.has(i.source)).map(toInsight),
  };
}

// ─── Newsletter consensus summary ────────────────────────────────────────────

export function buildConsensusText(insights: NewsletterInsight[]): string {
  if (insights.length === 0) return "No newsletter data available.";

  const bullish = insights.filter(i => i.portfolioRelevance === "bullish").length;
  const bearish = insights.filter(i => i.portfolioRelevance === "bearish").length;
  const total   = insights.length;

  let stance: string;
  if (bullish > bearish && bullish >= Math.ceil(total / 2)) stance = "leaning bullish";
  else if (bearish > bullish && bearish >= Math.ceil(total / 2)) stance = "leaning bearish";
  else stance = "mixed / neutral";

  return `${total} source${total !== 1 ? "s" : ""} — consensus ${stance} (${bullish} bullish, ${bearish} bearish, ${total - bullish - bearish} neutral).`;
}

// ─── Log writer ───────────────────────────────────────────────────────────────

function appendNewsletterLog(result: NewsletterRunResult, items: { source: string; title: string; publishedAt: Date; rawHash: string }[]): void {
  try {
    const brainOsRoot = process.env.BRAIN_OS_ROOT ?? resolveBrainOsPath() ?? path.join(process.cwd(), "brain-os");
    const logDir = path.join(brainOsRoot, "03 Knowledge");
    const logFile = path.join(logDir, "newsletter.md");

    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

    const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);
    const lines: string[] = [`\n---\n\n**Run: ${timestamp}** — ${result.newItems} new, ${result.duplicatesSkipped} skipped, ${result.errors.length} errors\n`];

    for (const item of items) {
      lines.push(`\n[newsletter]\nsource: ${SOURCE_LABELS[item.source] ?? item.source}\ntitle: ${item.title}\ndate: ${item.publishedAt.toISOString().slice(0, 10)}\nstatus: stored\n`);
    }

    if (result.errors.length > 0) {
      lines.push(`\nErrors:\n${result.errors.map(e => `- ${e}`).join("\n")}\n`);
    }

    fs.appendFileSync(logFile, lines.join(""), "utf-8");
  } catch {
    // Logging failure never blocks main flow
  }
}
