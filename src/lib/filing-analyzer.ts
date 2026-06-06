// Filing Analyzer — extracts structured intelligence from SEC filing text.
//
// All extraction is rules-based / pattern-driven. No AI API calls.
// Output is evidence-backed observations per category.

export interface FilingObservation {
  text: string;
  excerpt: string;       // source excerpt from the filing
  confidence: "high" | "medium" | "low";
}

export interface FilingAnalysis {
  filingType: string;
  ticker: string;
  businessChanges: string[];
  riskChanges: string[];
  capitalAllocationChanges: string[];
  guidanceChanges: string[];
  observations: FilingObservation[];
  extractedMetrics: Record<string, string>;
}

// ─── Keyword banks ────────────────────────────────────────────────────────────

const BUSINESS_KEYWORDS = [
  /new (product|service|segment|market|capability|partnership|acquisition)/i,
  /acquired?|acquisition|merger|divest/i,
  /launched?|introduced?|deployed?/i,
  /expand(ed|ing|ion)|grow(th|ing)|scale/i,
  /restructur(ed|ing)/i,
  /discontinu(ed|ing)/i,
  /revenue.*grew|revenue.*increas/i,
  /market share/i,
];

const RISK_KEYWORDS = [
  /material(ly)? adversely?/i,
  /risk factor/i,
  /uncertainty|uncertain/i,
  /litigation|lawsuit|legal proceeding/i,
  /regulatory|regulation|compliance/i,
  /competitive pressure|competition/i,
  /cybersecurity|data breach/i,
  /supply chain/i,
  /macroeconomic|recession|inflation/i,
  /impairment/i,
];

const CAPITAL_KEYWORDS = [
  /share repurchase|buyback|repurchas/i,
  /dividend|special dividend/i,
  /capital return/i,
  /capital expenditure|capex/i,
  /debt|borrow|credit facility|notes due/i,
  /free cash flow/i,
  /cash and cash equivalents/i,
  /return of capital/i,
];

const GUIDANCE_KEYWORDS = [
  /guidance|outlook|forecast/i,
  /expect(s|ed)? (revenue|earnings|growth|margin)/i,
  /full[- ]year|fiscal (year|quarter)/i,
  /range of|between \$[\d,]+ and \$[\d,]+/i,
  /rais(ed|ing|es) (guidance|outlook)/i,
  /lower(ed|ing|s) (guidance|outlook)/i,
  /withdraw(n|ing|s) guidance/i,
];

// ─── Sentence extraction ──────────────────────────────────────────────────────

function extractSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 20 && s.length < 800);
}

function matchesSome(sentence: string, patterns: RegExp[]): boolean {
  return patterns.some(p => p.test(sentence));
}

function extractMatching(sentences: string[], patterns: RegExp[], maxResults = 8): string[] {
  return sentences
    .filter(s => matchesSome(s, patterns))
    .slice(0, maxResults);
}

// ─── Metric extraction ────────────────────────────────────────────────────────

function extractMetrics(text: string): Record<string, string> {
  const metrics: Record<string, string> = {};
  const truncated = text.slice(0, 40_000);

  const patterns: Array<[string, RegExp]> = [
    ["revenue", /revenue(?:s)? (?:of|was|were|totaled?) \$?([\d,]+\.?\d*)\s*(billion|million|B|M)?/i],
    ["net_income", /net income (?:of|was|were|totaled?) \$?([\d,]+\.?\d*)\s*(billion|million|B|M)?/i],
    ["eps", /earnings per (?:diluted )?share (?:of|was)? \$?([\d.]+)/i],
    ["operating_margin", /operating margin (?:of|was|were) ([\d.]+)%/i],
    ["gross_margin", /gross margin (?:of|was|were) ([\d.]+)%/i],
    ["free_cash_flow", /free cash flow (?:of|was|were|totaled?) \$?([\d,]+\.?\d*)\s*(billion|million|B|M)?/i],
    ["shares_repurchased", /repurchased? (?:approximately )?\$?([\d,]+\.?\d*)\s*(billion|million|B|M)? (?:of )?(?:common )?shares?/i],
    ["dividend", /dividend (?:of|at) \$?([\d.]+) per share/i],
  ];

  for (const [key, pattern] of patterns) {
    const m = truncated.match(pattern);
    if (m) {
      const value = m[1].replace(/,/g, "");
      const unit = m[2] ?? "";
      metrics[key] = unit ? `${value} ${unit}` : value;
    }
  }

  return metrics;
}

// ─── Main analyzer ────────────────────────────────────────────────────────────

export function analyzeFilingContent(
  rawContent: string,
  filingType: string,
  ticker: string,
): FilingAnalysis {
  const sentences = extractSentences(rawContent);

  const businessChanges = extractMatching(sentences, BUSINESS_KEYWORDS)
    .map(s => summarizeSentence(s));

  const riskChanges = extractMatching(sentences, RISK_KEYWORDS)
    .map(s => summarizeSentence(s));

  const capitalAllocationChanges = extractMatching(sentences, CAPITAL_KEYWORDS)
    .map(s => summarizeSentence(s));

  const guidanceChanges = extractMatching(sentences, GUIDANCE_KEYWORDS)
    .map(s => summarizeSentence(s));

  const observations: FilingObservation[] = [
    ...sentences.filter(s => matchesSome(s, BUSINESS_KEYWORDS)).slice(0, 3).map(s => ({
      text: summarizeSentence(s), excerpt: s, confidence: "medium" as const,
    })),
    ...sentences.filter(s => matchesSome(s, RISK_KEYWORDS)).slice(0, 3).map(s => ({
      text: `Risk factor: ${summarizeSentence(s)}`, excerpt: s, confidence: "medium" as const,
    })),
  ];

  const extractedMetrics = extractMetrics(rawContent);

  return {
    filingType,
    ticker,
    businessChanges,
    riskChanges,
    capitalAllocationChanges,
    guidanceChanges,
    observations,
    extractedMetrics,
  };
}

function summarizeSentence(s: string): string {
  return s.length > 200 ? s.slice(0, 197) + "…" : s;
}

// ─── Filing type context ──────────────────────────────────────────────────────

export function filingTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    "10-K": "Annual Report",
    "10-Q": "Quarterly Report",
    "8-K": "Material Event",
    "20-F": "Annual Report (Foreign)",
  };
  return labels[type] ?? type;
}

export function filingPriority(type: string): "high" | "medium" | "low" {
  if (type === "10-K" || type === "20-F") return "high";
  if (type === "10-Q") return "medium";
  return "low";
}
