// Ticker Extraction Engine — Phase 28B
//
// Converts company mentions in free-text sources (NewsletterItem, MorningBrief)
// into structured CompanyMention records.
//
// Pipeline:
//   1. Build alias map: static name variants + Universe.companyName
//   2. Scan text via word-boundary regex (longest match first)
//   3. Resolve sentiment: explicit portfolioImpact fields > proximity keywords
//   4. Write CompanyMention rows with skipDuplicates (idempotent)
//
// Key constraint: @@unique([ticker, sourceType, sourceId]) — one row per
// company per source article, regardless of how many times it appears.

import { db } from "./db";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MentionSourceType = "newsletter" | "institutional" | "morning_brief";
export type MentionSentiment  = "positive" | "neutral" | "negative";

export interface MentionStats {
  ticker:            string;
  mentionCount7d:    number;
  mentionCount30d:   number;
  mentionCount90d:   number;
  sourceDiversity:   number;   // unique source type count (1–3)
  sourceBreakdown:   { sourceType: string; count: number }[];
  positiveMentions:  number;
  negativeMentions:  number;
  neutralMentions:   number;
  sentimentScore:    number;   // (positive − negative) / total90d, range −1..+1
  latestMentionDate: string | null;
  trend:             "rising" | "stable" | "falling";  // 7d rate vs 30d rate
}

export interface ExtractionResult {
  processed:   number;  // source records touched
  newMentions: number;  // CompanyMention rows inserted
  errors:      number;
}

// ─── Static alias map ─────────────────────────────────────────────────────────
// Lower-cased company name variants → canonical ticker.
// Longer, more specific entries are tried first (enforced at runtime by sort).
// Excludes: single-word common English words (<4 chars), ambiguous acronyms.

const STATIC_ALIASES: Record<string, string> = {
  // ── AI / Semiconductors ──────────────────────────────────────────────────
  "nvidia corporation": "NVDA",
  "nvidia corp":        "NVDA",
  "nvidia":             "NVDA",

  "advanced micro devices": "AMD",

  "intel corporation": "INTC",
  "intel corp":        "INTC",
  "intel":             "INTC",

  "taiwan semiconductor manufacturing": "TSM",
  "taiwan semiconductor":               "TSM",
  "tsmc":                               "TSM",

  "asml holding": "ASML",
  "asml":         "ASML",

  "broadcom inc":  "AVGO",
  "broadcom":      "AVGO",

  "qualcomm incorporated": "QCOM",
  "qualcomm":              "QCOM",

  "micron technology": "MU",
  "micron":            "MU",

  "arm holdings": "ARM",

  "super micro computer": "SMCI",
  "super micro":          "SMCI",
  "supermicro":           "SMCI",

  "applied materials": "AMAT",

  // ── Platform AI / Cloud ──────────────────────────────────────────────────
  "microsoft corporation": "MSFT",
  "microsoft corp":        "MSFT",
  "microsoft":             "MSFT",

  "alphabet inc": "GOOGL",
  "alphabet":     "GOOGL",
  "google":       "GOOGL",

  "amazon.com":  "AMZN",
  "amazon":      "AMZN",
  "aws":         "AMZN",

  "meta platforms": "META",
  "meta":           "META",
  "facebook":       "META",

  "apple inc": "AAPL",
  "apple":     "AAPL",

  "tesla inc":    "TSLA",
  "tesla motors": "TSLA",
  "tesla":        "TSLA",

  // ── Software / SaaS ──────────────────────────────────────────────────────
  "salesforce.com": "CRM",
  "salesforce":     "CRM",

  "adobe inc": "ADBE",
  "adobe":     "ADBE",

  "oracle corporation": "ORCL",
  "oracle corp":        "ORCL",
  "oracle":             "ORCL",

  "palantir technologies": "PLTR",
  "palantir":              "PLTR",

  "snowflake inc": "SNOW",
  "snowflake":     "SNOW",

  "cloudflare inc": "NET",
  "cloudflare":     "NET",

  "crowdstrike holdings": "CRWD",
  "crowdstrike":          "CRWD",

  "palo alto networks": "PANW",
  "palo alto":          "PANW",

  "servicenow inc": "NOW",
  "servicenow":     "NOW",

  "workday inc": "WDAY",
  "workday":     "WDAY",

  "datadog inc": "DDOG",
  "datadog":     "DDOG",

  "mongodb inc": "MDB",
  "mongodb":     "MDB",

  "zscaler inc": "ZS",
  "zscaler":     "ZS",

  "okta inc": "OKTA",
  "okta":     "OKTA",

  "confluent inc": "CFLT",
  "confluent":     "CFLT",

  "elastic nv": "ESTC",

  "hashicorp": "HCP",

  "gitlab inc": "GTLB",
  "gitlab":     "GTLB",

  // ── Cybersecurity ────────────────────────────────────────────────────────
  "sentinelone": "S",
  "sentinel one": "S",

  "fortinet inc": "FTNT",
  "fortinet":     "FTNT",

  "cyberark software": "CYBR",
  "cyberark":          "CYBR",

  "rapid7 inc":  "RPD",
  "rapid7":      "RPD",

  "tenable holdings": "TENB",
  "tenable":          "TENB",

  // ── Healthcare / GLP-1 ───────────────────────────────────────────────────
  "novo nordisk": "NVO",

  "eli lilly and company": "LLY",
  "eli lilly":             "LLY",
  "lilly":                 "LLY",

  "johnson & johnson": "JNJ",
  "johnson and johnson": "JNJ",

  "unitedhealth group": "UNH",
  "unitedhealth":       "UNH",

  "abbvie inc": "ABBV",
  "abbvie":     "ABBV",

  "pfizer inc": "PFE",
  "pfizer":     "PFE",

  "intuitive surgical": "ISRG",

  "dexcom inc": "DXCM",
  "dexcom":     "DXCM",

  "moderna inc": "MRNA",
  "moderna":     "MRNA",

  "amgen inc": "AMGN",
  "amgen":     "AMGN",

  "merck & co":  "MRK",
  "merck":       "MRK",

  "regeneron pharmaceuticals": "REGN",
  "regeneron":                 "REGN",

  "vertex pharmaceuticals": "VRTX",
  "vertex":                 "VRTX",

  // ── Payments / Fintech ───────────────────────────────────────────────────
  "visa inc":       "V",
  "visa":           "V",

  "mastercard inc": "MA",
  "mastercard":     "MA",

  "paypal holdings": "PYPL",
  "paypal":          "PYPL",

  "block inc": "SQ",

  "affirm holdings": "AFRM",
  "affirm":          "AFRM",

  "adyen nv": "ADYEY",
  "adyen":    "ADYEY",

  // ── Energy ───────────────────────────────────────────────────────────────
  "exxon mobil corporation": "XOM",
  "exxonmobil":              "XOM",
  "exxon mobil":             "XOM",
  "exxon":                   "XOM",

  "chevron corporation": "CVX",
  "chevron corp":        "CVX",
  "chevron":             "CVX",

  "conocophillips": "COP",

  "nextera energy":   "NEE",
  "nextera":          "NEE",

  "first solar inc":  "FSLR",
  "first solar":      "FSLR",

  "enphase energy":   "ENPH",
  "enphase":          "ENPH",

  "schlumberger": "SLB",

  // ── Defense ──────────────────────────────────────────────────────────────
  "lockheed martin corporation": "LMT",
  "lockheed martin":             "LMT",
  "lockheed":                    "LMT",

  "raytheon technologies": "RTX",
  "rtx corp":              "RTX",
  "raytheon":              "RTX",

  "northrop grumman corporation": "NOC",
  "northrop grumman":             "NOC",
  "northrop":                     "NOC",

  "general dynamics corporation": "GD",
  "general dynamics":             "GD",

  "boeing company": "BA",
  "boeing co":      "BA",
  "boeing":         "BA",

  "l3harris technologies": "LHX",
  "l3harris":              "LHX",
  "l3 harris":             "LHX",

  "leidos holdings": "LDOS",
  "leidos":          "LDOS",

  // ── Financials ───────────────────────────────────────────────────────────
  "jpmorgan chase & co": "JPM",
  "jpmorgan chase":      "JPM",
  "jpmorgan":            "JPM",
  "jp morgan":           "JPM",

  "goldman sachs group": "GS",
  "goldman sachs":       "GS",
  "goldman":             "GS",

  "morgan stanley": "MS",

  "blackrock inc": "BLK",
  "blackrock":     "BLK",

  "berkshire hathaway": "BRK.B",
  "berkshire":          "BRK.B",

  "bank of america corporation": "BAC",
  "bank of america":             "BAC",
  "bofa":                        "BAC",

  "wells fargo & company": "WFC",
  "wells fargo":           "WFC",

  "citigroup inc": "C",
  "citigroup":     "C",
  "citibank":      "C",
  "citi":          "C",

  "charles schwab": "SCHW",

  "blackstone inc": "BX",
  "blackstone":     "BX",

  "apollo global management": "APO",
  "apollo global":            "APO",

  // ── Consumer ─────────────────────────────────────────────────────────────
  "walmart inc":        "WMT",
  "walmart":            "WMT",

  "costco wholesale corporation": "COST",
  "costco wholesale":             "COST",
  "costco":                       "COST",

  "starbucks corporation": "SBUX",
  "starbucks corp":        "SBUX",
  "starbucks":             "SBUX",

  "nike inc":  "NKE",
  "nike":      "NKE",

  "lvmh moët hennessy": "LVMHF",
  "lvmh":                "LVMHF",

  "amazon prime": "AMZN",

  "uber technologies": "UBER",
  "uber":              "UBER",

  "lyft inc":  "LYFT",
  "lyft":      "LYFT",

  "airbnb inc": "ABNB",
  "airbnb":     "ABNB",

  "doordash inc": "DASH",
  "doordash":     "DASH",

  "spotify technology": "SPOT",
  "spotify":            "SPOT",

  "netflix inc": "NFLX",
  "netflix":     "NFLX",

  "disney":              "DIS",
  "walt disney":         "DIS",
  "walt disney company": "DIS",

  // ── ETFs ─────────────────────────────────────────────────────────────────
  "spdr s&p 500 etf": "SPY",
  "invesco qqq":      "QQQ",
  "ishares gold trust": "IAU",
  "spdr gold shares":   "GLD",
  "spdr gold minishares": "GLDM",
  "ishares 20+ year treasury": "TLT",
};

// Source classification
const NEWSLETTER_SOURCES    = new Set(["bloomberg_money_stuff", "daily_upside", "axios_markets", "sherwood_news"]);
const INSTITUTIONAL_SOURCES = new Set(["blackrock", "morgan_stanley", "jpmorgan"]);

// Proximity sentiment keyword lists
const POSITIVE_KW = [
  "beat", "beats", "surge", "record", "strong", "outperform", "grew", "growth",
  "rally", "gain", "profit", "boom", "breakthrough", "wins", "lead", "accelerat",
  "raised guidance", "upgrade", "bullish", "expand", "upside", "record quarter",
  "new high", "exceeded", "topped", "raised", "lifted",
];
const NEGATIVE_KW = [
  "miss", "misses", "missed", "decline", "fell", "cut", "warn", "below",
  "disappoint", "concern", "loss", "headwind", "weak", "slow", "drop",
  "layoff", "restructur", "regulat", "downgrade", "bearish", "downside",
  "competi", "pressure", "investigation", "lawsuit", "recall", "fine",
  "lowered guidance", "reduced", "missed estimates",
];

// ─── Alias map (lazy singleton) ───────────────────────────────────────────────

let _sorted: [string, string][] | null = null;

async function getSortedAliases(): Promise<[string, string][]> {
  if (_sorted) return _sorted;

  const map = new Map<string, string>();

  // 1. Static aliases (highest priority)
  for (const [name, ticker] of Object.entries(STATIC_ALIASES)) {
    map.set(name.toLowerCase(), ticker);
  }

  // 2. Universe.companyName → ticker (dynamic extension)
  const universe = await db.universe.findMany({
    where: { status: "active" },
    select: { ticker: true, companyName: true },
  });

  for (const u of universe) {
    const full = u.companyName.toLowerCase();
    if (!map.has(full)) map.set(full, u.ticker);

    // Also try without common legal suffixes
    const stripped = u.companyName
      .replace(/\s+(inc\.?|corp\.?|ltd\.?|llc|co\.?|plc|holdings?|group|technologies?|technology|systems?|corporation)\.?\s*$/gi, "")
      .trim()
      .toLowerCase();
    if (stripped.length >= 5 && !map.has(stripped)) {
      map.set(stripped, u.ticker);
    }
  }

  // Sort longest-first so more specific names match before shorter prefixes
  _sorted = [...map.entries()].sort((a, b) => b[0].length - a[0].length);
  return _sorted;
}

// Called after Universe table changes to force alias rebuild on next use
export function invalidateAliasCache(): void {
  _sorted = null;
}

// ─── Text extraction ──────────────────────────────────────────────────────────

interface ExtractedMention {
  ticker:      string;
  companyName: string;
  context:     string;
}

function extractFromText(
  text: string,
  sortedAliases: [string, string][],
): ExtractedMention[] {
  const found = new Map<string, ExtractedMention>(); // keyed by ticker
  if (!text.trim()) return [];

  for (const [name, ticker] of sortedAliases) {
    if (found.has(ticker)) continue;
    if (name.length < 3) continue;

    try {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Word-boundary substitute: not preceded/followed by a lowercase letter
      const regex = new RegExp(`(?<![a-z])${escaped}(?![a-z])`, "gi");
      const match = regex.exec(text);
      if (!match) continue;

      const idx   = match.index;
      const start = Math.max(0, idx - 75);
      const end   = Math.min(text.length, idx + match[0].length + 75);
      const context = text.slice(start, end).replace(/\s+/g, " ").trim();

      found.set(ticker, { ticker, companyName: name, context });
    } catch {
      // Malformed regex — skip
    }
  }

  return [...found.values()];
}

// ─── Sentiment helpers ────────────────────────────────────────────────────────

function proximitySentiment(context: string): MentionSentiment {
  const lower = context.toLowerCase();
  let pos = 0;
  let neg = 0;
  for (const kw of POSITIVE_KW) if (lower.includes(kw)) pos++;
  for (const kw of NEGATIVE_KW) if (lower.includes(kw)) neg++;
  if (pos > neg) return "positive";
  if (neg > pos) return "negative";
  return "neutral";
}

function mapRelevance(r: string): MentionSentiment {
  if (r === "bullish")  return "positive";
  if (r === "bearish")  return "negative";
  return "neutral";
}

function classifySource(source: string): MentionSourceType {
  if (INSTITUTIONAL_SOURCES.has(source)) return "institutional";
  if (NEWSLETTER_SOURCES.has(source))    return "newsletter";
  return "newsletter";
}

// ─── JSON helper ─────────────────────────────────────────────────────────────

function safeJson<T>(s: string, fallback: T): T {
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

// ─── Per-source processors ────────────────────────────────────────────────────

interface RawMention {
  ticker:      string;
  companyName: string;
  sourceType:  MentionSourceType;
  sourceId:    string;
  sentiment:   MentionSentiment;
  context:     string | null;
  mentionDate: Date;
}

function processNewsletterItem(
  item: {
    id: string;
    source: string;
    title: string;
    summary: string;
    keyPoints: string;
    publishedAt: Date;
    portfolioRelevance: string;
  },
  sortedAliases: [string, string][],
): RawMention[] {
  const bullets  = [
    ...safeJson<string[]>(item.summary,   []),
    ...safeJson<string[]>(item.keyPoints, []),
  ];
  const fullText = [item.title, ...bullets].join(" ");
  const articleSentiment = mapRelevance(item.portfolioRelevance);
  const sourceType       = classifySource(item.source);

  const extracted = extractFromText(fullText, sortedAliases);

  return extracted.map(e => ({
    ticker:      e.ticker,
    companyName: e.companyName,
    sourceType,
    sourceId:    item.id,
    // Use explicit article-level sentiment when non-neutral; else proximity
    sentiment: articleSentiment !== "neutral"
      ? articleSentiment
      : proximitySentiment(e.context),
    context:     e.context.slice(0, 150) || null,
    mentionDate: item.publishedAt,
  }));
}

function processMorningBrief(
  brief: {
    id:                 string;
    briefingDate:       Date;
    portfolioImpact:    string;
    technologySummary:  string;
    newsletterConsensus: string;
  },
  sortedAliases: [string, string][],
): RawMention[] {
  const mentionMap = new Map<string, RawMention>(); // keyed by ticker (dedup)
  const briefDate  = brief.briefingDate;

  // ── 1. portfolioImpact — explicit per-ticker sentiment (highest precision) ──
  const impact = safeJson<{
    positive?: { ticker: string; reason?: string }[];
    neutral?:  { ticker: string; reason?: string }[];
    negative?: { ticker: string; reason?: string }[];
  }>(brief.portfolioImpact, {});

  const addImpact = (
    items: { ticker: string; reason?: string }[] | undefined,
    sentiment: MentionSentiment,
  ) => {
    for (const item of items ?? []) {
      const t = item.ticker?.toUpperCase();
      if (!t || t.length > 6 || mentionMap.has(t)) continue;
      mentionMap.set(t, {
        ticker:      t,
        companyName: t,
        sourceType:  "morning_brief",
        sourceId:    brief.id,
        sentiment,
        context:     item.reason?.slice(0, 150) ?? null,
        mentionDate: briefDate,
      });
    }
  };
  addImpact(impact.positive, "positive");
  addImpact(impact.negative, "negative");
  addImpact(impact.neutral,  "neutral");

  // ── 2. technologySummary.themes[].holdingRelevance — pre-resolved tickers ──
  const techSummary = safeJson<{
    themes?: {
      theme:             string;
      signal?:           string;
      holdingRelevance?: string[];
      insight?:          string;
    }[];
  }>(brief.technologySummary, {});

  for (const t of techSummary.themes ?? []) {
    const signal: MentionSentiment =
      t.signal === "positive" ? "positive"
      : t.signal === "negative" ? "negative"
      : "neutral";

    for (const rawTicker of t.holdingRelevance ?? []) {
      const ticker = rawTicker.toUpperCase();
      if (mentionMap.has(ticker)) continue;
      mentionMap.set(ticker, {
        ticker,
        companyName: ticker,
        sourceType:  "morning_brief",
        sourceId:    brief.id,
        sentiment:   signal,
        context:     t.insight?.slice(0, 150) ?? null,
        mentionDate: briefDate,
      });
    }
  }

  // ── 3. newsletterConsensus — text scan for any additional names ─────────────
  const consensus = safeJson<{ source?: string; title?: string; summary?: string[] }[]>(
    brief.newsletterConsensus, []
  );
  const consensusText = consensus
    .flatMap(c => [c.title ?? "", ...(c.summary ?? [])])
    .join(" ");

  const textExtracted = extractFromText(consensusText, sortedAliases);
  for (const e of textExtracted) {
    if (mentionMap.has(e.ticker)) continue;
    mentionMap.set(e.ticker, {
      ticker:      e.ticker,
      companyName: e.companyName,
      sourceType:  "morning_brief",
      sourceId:    brief.id,
      sentiment:   proximitySentiment(e.context),
      context:     e.context.slice(0, 150) || null,
      mentionDate: briefDate,
    });
  }

  return [...mentionMap.values()];
}

// ─── Batch writer ─────────────────────────────────────────────────────────────

async function writeMentions(mentions: RawMention[]): Promise<number> {
  if (mentions.length === 0) return 0;

  // SQLite/Prisma doesn't type skipDuplicates; use upsert with no-op update.
  const results = await Promise.allSettled(
    mentions.map(m =>
      db.companyMention.upsert({
        where: {
          ticker_sourceType_sourceId: {
            ticker:     m.ticker,
            sourceType: m.sourceType,
            sourceId:   m.sourceId,
          },
        },
        update: {},
        create: {
          ticker:      m.ticker,
          companyName: m.companyName,
          sourceType:  m.sourceType,
          sourceId:    m.sourceId,
          sentiment:   m.sentiment,
          context:     m.context,
          mentionDate: m.mentionDate,
        },
      }),
    ),
  );

  return results.filter(r => r.status === "fulfilled").length;
}

// ─── Public exports ───────────────────────────────────────────────────────────

export async function backfillAllMentions(): Promise<ExtractionResult> {
  const aliases = await getSortedAliases();
  let processed   = 0;
  let newMentions = 0;
  let errors      = 0;

  const [items, briefs] = await Promise.all([
    db.newsletterItem.findMany({
      orderBy: { publishedAt: "asc" },
      select: {
        id: true, source: true, title: true,
        summary: true, keyPoints: true,
        publishedAt: true, portfolioRelevance: true,
      },
    }),
    db.morningBrief.findMany({
      orderBy: { briefingDate: "asc" },
      select: {
        id: true, briefingDate: true,
        portfolioImpact: true, technologySummary: true, newsletterConsensus: true,
      },
    }),
  ]);

  for (const item of items) {
    try {
      const mentions = processNewsletterItem(item, aliases);
      newMentions += await writeMentions(mentions);
      processed++;
    } catch {
      errors++;
    }
  }

  for (const brief of briefs) {
    try {
      const mentions = processMorningBrief(brief, aliases);
      newMentions += await writeMentions(mentions);
      processed++;
    } catch {
      errors++;
    }
  }

  return { processed, newMentions, errors };
}

export async function extractNewMentions(): Promise<ExtractionResult> {
  const aliases = await getSortedAliases();
  let processed   = 0;
  let newMentions = 0;
  let errors      = 0;

  // Watermark: most recent mentionDate per source category
  const [lastNL, lastBrief] = await Promise.all([
    db.companyMention.findFirst({
      where:   { sourceType: { in: ["newsletter", "institutional"] } },
      orderBy: { mentionDate: "desc" },
      select:  { mentionDate: true },
    }),
    db.companyMention.findFirst({
      where:   { sourceType: "morning_brief" },
      orderBy: { mentionDate: "desc" },
      select:  { mentionDate: true },
    }),
  ]);

  const [newItems, newBriefs] = await Promise.all([
    db.newsletterItem.findMany({
      where:   lastNL ? { publishedAt: { gt: lastNL.mentionDate } } : undefined,
      orderBy: { publishedAt: "asc" },
      select: {
        id: true, source: true, title: true,
        summary: true, keyPoints: true,
        publishedAt: true, portfolioRelevance: true,
      },
    }),
    db.morningBrief.findMany({
      where:   lastBrief ? { briefingDate: { gt: lastBrief.mentionDate } } : undefined,
      orderBy: { briefingDate: "asc" },
      select: {
        id: true, briefingDate: true,
        portfolioImpact: true, technologySummary: true, newsletterConsensus: true,
      },
    }),
  ]);

  for (const item of newItems) {
    try {
      const mentions = processNewsletterItem(item, aliases);
      newMentions += await writeMentions(mentions);
      processed++;
    } catch {
      errors++;
    }
  }

  for (const brief of newBriefs) {
    try {
      const mentions = processMorningBrief(brief, aliases);
      newMentions += await writeMentions(mentions);
      processed++;
    } catch {
      errors++;
    }
  }

  return { processed, newMentions, errors };
}

export async function getMentionStats(ticker: string): Promise<MentionStats> {
  const t    = ticker.toUpperCase();
  const now  = new Date();
  const d7   = new Date(now.getTime() -  7 * 86_400_000);
  const d30  = new Date(now.getTime() - 30 * 86_400_000);
  const d90  = new Date(now.getTime() - 90 * 86_400_000);

  const [count7d, count30d, all90d] = await Promise.all([
    db.companyMention.count({ where: { ticker: t, mentionDate: { gte: d7  } } }),
    db.companyMention.count({ where: { ticker: t, mentionDate: { gte: d30 } } }),
    db.companyMention.findMany({
      where:  { ticker: t, mentionDate: { gte: d90 } },
      select: { sentiment: true, sourceType: true, mentionDate: true },
    }),
  ]);

  const count90d         = all90d.length;
  const positiveMentions = all90d.filter(m => m.sentiment === "positive").length;
  const negativeMentions = all90d.filter(m => m.sentiment === "negative").length;
  const neutralMentions  = count90d - positiveMentions - negativeMentions;
  const sentimentScore   = count90d > 0
    ? Math.round(((positiveMentions - negativeMentions) / count90d) * 100) / 100
    : 0;

  const sourceTypes = new Set(all90d.map(m => m.sourceType));
  const sourceBreakdown = [...sourceTypes].map(st => ({
    sourceType: st,
    count: all90d.filter(m => m.sourceType === st).length,
  }));

  const latestMentionDate = all90d.length > 0
    ? all90d
        .sort((a, b) => b.mentionDate.getTime() - a.mentionDate.getTime())[0]
        .mentionDate.toISOString().slice(0, 10)
    : null;

  // Trend: compare 7d cadence vs 30d baseline cadence
  const rate7d  = count7d / 7;
  const rate30d = count30d / 30;
  const trend: MentionStats["trend"] =
    rate7d > rate30d * 1.5 ? "rising"
    : rate7d < rate30d * 0.5 ? "falling"
    : "stable";

  return {
    ticker: t,
    mentionCount7d:  count7d,
    mentionCount30d: count30d,
    mentionCount90d: count90d,
    sourceDiversity: sourceTypes.size,
    sourceBreakdown,
    positiveMentions,
    negativeMentions,
    neutralMentions,
    sentimentScore,
    latestMentionDate,
    trend,
  };
}
