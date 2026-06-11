// Institutional Research Fetcher — Phase 14
//
// Fetches latest articles from BlackRock, Morgan Stanley, and JPMorgan
// via RSS feeds. All fetches are best-effort — returns [] on any failure.
//
// Sources:
//   BlackRock Investment Institute + iShares ETF Perspectives
//   Morgan Stanley Five Ideas + Global Investment Committee
//   J.P. Morgan In Context + The Know / In Focus

import * as crypto from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ResearchArticle {
  source: string;
  title: string;
  url: string;
  publishedAt: Date;
  rawText: string;
  rawHash: string;
}

// ─── RSS feed catalog ─────────────────────────────────────────────────────────

const RSS_FEEDS: { source: string; url: string }[] = [
  // BlackRock — Investment Institute
  {
    source: "blackrock",
    url: "https://www.blackrock.com/us/individual/insights/blackrock-investment-institute/rss",
  },
  // iShares ETF Perspectives (also BlackRock)
  {
    source: "blackrock",
    url: "https://www.ishares.com/us/insights/rss",
  },
  // Morgan Stanley Ideas
  {
    source: "morgan_stanley",
    url: "https://www.morganstanley.com/ideas/rss",
  },
  // JPMorgan Insights
  {
    source: "jpmorgan",
    url: "https://www.jpmorgan.com/insights/rss.xml",
  },
  // JPMorgan Asset Management — In Context
  {
    source: "jpmorgan",
    url: "https://am.jpmorgan.com/us/en/asset-management/adv/insights/rss",
  },
];

const MAX_AGE_MS = 14 * 86400 * 1000; // 14 days
const MAX_PER_FEED = 10;
const FETCH_TIMEOUT_MS = 12_000;

// ─── Main fetch ───────────────────────────────────────────────────────────────

export async function fetchAllInstitutionalResearch(): Promise<ResearchArticle[]> {
  const results = await Promise.allSettled(
    RSS_FEEDS.map(feed => fetchRssFeed(feed.source, feed.url))
  );

  const articles: ResearchArticle[] = [];
  const seen = new Set<string>();

  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const a of r.value) {
      if (!seen.has(a.rawHash)) {
        seen.add(a.rawHash);
        articles.push(a);
      }
    }
  }

  return articles;
}

// ─── RSS fetcher ──────────────────────────────────────────────────────────────

async function fetchRssFeed(source: string, url: string): Promise<ResearchArticle[]> {
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Investment OS Research Aggregator/1.0",
        "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!resp.ok) return [];

    const xml = await resp.text();
    return parseRss(xml, source);
  } catch {
    return [];
  }
}

// ─── RSS / Atom parser ────────────────────────────────────────────────────────

function parseRss(xml: string, source: string): ResearchArticle[] {
  const articles: ResearchArticle[] = [];

  // Handle both RSS <item> and Atom <entry> elements
  const itemPattern = /<(?:item|entry)[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemPattern.exec(xml)) !== null) {
    const item = match[1];

    const title       = xmlText(item, "title");
    const link        = xmlLink(item);
    const pubDate     = xmlText(item, "pubDate") ||
                        xmlText(item, "published") ||
                        xmlText(item, "updated") ||
                        xmlText(item, "dc:date");
    const description = xmlText(item, "description") ||
                        xmlText(item, "content:encoded") ||
                        xmlText(item, "content") ||
                        xmlText(item, "summary");

    if (!title || title.length < 5) continue;

    const publishedAt = pubDate ? new Date(pubDate) : new Date();
    if (isNaN(publishedAt.getTime())) continue;

    // Skip items older than MAX_AGE_MS
    if (Date.now() - publishedAt.getTime() > MAX_AGE_MS) continue;

    const rawText = stripHtml(description).slice(0, 5_000);
    const rawHash = sha256(title + source + publishedAt.toISOString().slice(0, 10));

    articles.push({
      source,
      title: cleanText(title),
      url: cleanText(link),
      publishedAt,
      rawText,
      rawHash,
    });

    if (articles.length >= MAX_PER_FEED) break;
  }

  return articles;
}

// ─── XML helpers ──────────────────────────────────────────────────────────────

function xmlText(xml: string, tag: string): string {
  // CDATA
  const cdataMatch = xml.match(
    new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`, "i")
  );
  if (cdataMatch) return cdataMatch[1].trim();

  // Plain text
  const plainMatch = xml.match(
    new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i")
  );
  return plainMatch ? plainMatch[1].trim() : "";
}

function xmlLink(xml: string): string {
  // Atom <link href="..."/>
  const hrefMatch = xml.match(/<link[^>]+href=["']([^"']+)["'][^>]*\/>/i) ||
                    xml.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i);
  if (hrefMatch) return hrefMatch[1];

  // RSS <link>...</link>
  return xmlText(xml, "link");
}

// ─── Text utilities ───────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, " ")
    .replace(/\s{3,}/g, "\n\n")
    .trim();
}

function cleanText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}
