// Newsletter Content Processor — Phase 14
//
// Rules-based extraction of structured intelligence from raw newsletter text.
// No external API calls — operates entirely on the raw text content.
//
// For every article produces:
//   summary              — 3-5 bullet points
//   keyPoints            — 5-10 key facts
//   marketImplications   — per asset class (equities, bonds, gold, oil, usd)
//   geopoliticalImplications — sentences mentioning geo topics
//   portfolioRelevance   — bullish | neutral | bearish
//   confidence           — 0-100 based on content richness

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProcessedArticle {
  summary: string[];
  keyPoints: string[];
  marketImplications: {
    equities: string;
    bonds: string;
    gold: string;
    oil: string;
    usd: string;
  };
  geopoliticalImplications: string[];
  portfolioRelevance: "bullish" | "neutral" | "bearish";
  confidence: number;
}

// ─── Keyword sets ─────────────────────────────────────────────────────────────

const BULLISH_WORDS = [
  "growth", "rally", "surge", "upgrade", "strong", "beat", "outperform",
  "expansion", "recovery", "upside", "accelerat", "robust", "resilient",
  "breakout", "momentum", "optimistic", "positive", "buy", "overweight",
  "opportunity", "exceed", "record high", "improve",
];

const BEARISH_WORDS = [
  "recession", "decline", "fall", "drop", "downgrade", "weak", "miss",
  "contraction", "risk", "downside", "slowdown", "concern", "caution",
  "sell", "underperform", "warning", "threat", "deteriorat", "worsen",
  "headwind", "pressure", "loss", "deficit", "crisis",
];

const GEO_WORDS = [
  "china", "russia", "ukraine", "taiwan", "middle east", "iran", "israel",
  "geopolit", "sanctions", "conflict", "war", "trade war", "tariff",
  "opec", "saudi", "india", "japan", "europe", "nato",
];

const EQUITY_WORDS  = ["stock", "equit", "share", "market", "s&p", "nasdaq", "dow", "earnings", "dividend", "ipo", "valuation"];
const BOND_WORDS    = ["bond", "yield", "treasury", "rate", "fed", "fomc", "interest rate", "spread", "credit", "debt", "fixed income"];
const GOLD_WORDS    = ["gold", "precious metal", "safe haven", "commodit", "gld", "inflation hedge"];
const OIL_WORDS     = ["oil", "energy", "crude", "brent", "wti", "opec", "barrel", "natural gas", "petroleum"];
const USD_WORDS     = ["dollar", "usd", "currency", "forex", "dxy", "fx", "exchange rate", "dollar index"];

// Keywords that indicate a sentence contains a key fact
const KEY_FACT_WORDS = [
  /\d+\.?\d*%/,           // percentages
  /\$[\d,]+/,             // dollar amounts
  /\b\d{4}\b/,            // years
  /basis points?/i,
  /billion|trillion|million/i,
  /q[1-4] \d{4}/i,        // quarterly references
  /year-over-year|yoy|ytd|qoq/i,
];

// ─── Main processor ───────────────────────────────────────────────────────────

export function processArticle(rawText: string, title: string): ProcessedArticle {
  const sentences = splitSentences(rawText);
  const titleWords = title.toLowerCase();

  // Summary: first meaningful sentences (avoid short/header lines)
  const summary = sentences
    .filter(s => s.length > 60 && s.length < 400)
    .slice(0, 5);

  // Key points: sentences with numbers, percentages, or strong financial terms
  const keyPoints = sentences
    .filter(s => s.length > 40 && isKeyFact(s))
    .slice(0, 10);

  // Market implications per asset class
  const marketImplications = {
    equities: buildImplication(sentences, titleWords, EQUITY_WORDS),
    bonds:    buildImplication(sentences, titleWords, BOND_WORDS),
    gold:     buildImplication(sentences, titleWords, GOLD_WORDS),
    oil:      buildImplication(sentences, titleWords, OIL_WORDS),
    usd:      buildImplication(sentences, titleWords, USD_WORDS),
  };

  // Geopolitical implications
  const geopoliticalImplications = sentences
    .filter(s => GEO_WORDS.some(w => s.toLowerCase().includes(w)))
    .filter(s => s.length > 40)
    .slice(0, 5);

  // Portfolio relevance scoring
  const portfolioRelevance = scoreRelevance(rawText + " " + title);

  // Confidence: based on content richness
  const confidence = computeConfidence(rawText, summary, keyPoints);

  return {
    summary,
    keyPoints,
    marketImplications,
    geopoliticalImplications,
    portfolioRelevance,
    confidence,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.replace(/\s+/g, " ").trim())
    .filter(s => s.length > 20);
}

function isKeyFact(sentence: string): boolean {
  return KEY_FACT_WORDS.some(pattern => pattern.test(sentence));
}

function buildImplication(sentences: string[], titleWords: string, keywords: string[]): string {
  const lower = (s: string) => s.toLowerCase();

  // Find sentences mentioning this asset class
  const relevant = sentences.filter(s =>
    keywords.some(kw => lower(s).includes(kw))
  );

  if (relevant.length === 0) {
    // Check title for indirect relevance
    if (keywords.some(kw => titleWords.includes(kw))) {
      return "Indirect relevance — monitor for follow-through.";
    }
    return "No direct mention.";
  }

  // Return the most information-dense relevant sentence
  const best = relevant.sort((a, b) => {
    const scoreA = (isKeyFact(a) ? 2 : 0) + (a.length > 80 ? 1 : 0);
    const scoreB = (isKeyFact(b) ? 2 : 0) + (b.length > 80 ? 1 : 0);
    return scoreB - scoreA;
  })[0];

  return best.slice(0, 250);
}

function scoreRelevance(text: string): "bullish" | "neutral" | "bearish" {
  const lower = text.toLowerCase();

  let bullScore = 0;
  let bearScore = 0;

  for (const w of BULLISH_WORDS) {
    // Count occurrences
    const count = (lower.match(new RegExp(w, "g")) ?? []).length;
    bullScore += count;
  }

  for (const w of BEARISH_WORDS) {
    const count = (lower.match(new RegExp(w, "g")) ?? []).length;
    bearScore += count;
  }

  const diff = bullScore - bearScore;
  if (diff >= 3) return "bullish";
  if (diff <= -3) return "bearish";
  return "neutral";
}

function computeConfidence(
  rawText: string,
  summary: string[],
  keyPoints: string[]
): number {
  let score = 30; // baseline

  // Text richness
  if (rawText.length > 500)  score += 10;
  if (rawText.length > 2000) score += 10;
  if (rawText.length > 5000) score += 10;

  // Summary quality
  score += Math.min(summary.length * 5, 15);

  // Key facts extracted
  score += Math.min(keyPoints.length * 3, 15);

  // Has percentages or dollar figures
  if (/\d+\.?\d*%/.test(rawText))   score += 5;
  if (/\$[\d,]+/.test(rawText))     score += 5;

  return Math.min(score, 95);
}
