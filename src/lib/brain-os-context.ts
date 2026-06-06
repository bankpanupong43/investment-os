import fs from "fs";
import path from "path";

const BRAIN_OS_ROOT = "G:\\คอมพิวเตอร์เครื่องอื่นๆ\\คอมพิวเตอร์ของฉัน\\Shared\\Brain OS";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BrainContextInfluence {
  source: string;       // relative path within Brain OS
  insight: string;      // what was extracted and why it matters
  appliesTo: string[];  // which review sections this influences
  excerpt: string;      // verbatim quote from the note
}

export interface BrainContextInvestor {
  name: string;
  age: number;
  riskTolerance: "high" | "medium" | "low";
  primaryGoal: string;
  constraints: string[];
  investmentStyle: string;
}

export interface BrainContextPhilosophy {
  market: string;
  horizon: string;
  style: string;
  decisionFilter: string;
  qualityMetrics: string[];
}

export interface BrainOSContext {
  loaded: boolean;
  loadedAt: string;
  sources: string[];
  missingFiles: string[];
  investor: BrainContextInvestor;
  philosophy: BrainContextPhilosophy;
  summary: string;
  influences: BrainContextInfluence[];
}

// ─── Source file registry ─────────────────────────────────────────────────────

const SOURCES: Record<string, string> = {
  "AI Profile":                "08 AI/AI Profile.md",
  "About Me":                  "05 Life/About Me.md",
  "Personal Mission":          "05 Life/Personal Mission.md",
  "Portfolio Strategy":        "07 Investment/Portfolio Strategy.md",
  "Stock Selection Framework": "07 Investment/Stock Selection Framework.md",
};

function readFile(relativePath: string): string | null {
  try {
    const content = fs.readFileSync(path.join(BRAIN_OS_ROOT, relativePath), "utf-8");
    return content.trim().length > 10 ? content : null;
  } catch {
    return null;
  }
}

// ─── Fallback (Brain OS unavailable) ─────────────────────────────────────────

const FALLBACK: BrainOSContext = {
  loaded: false,
  loadedAt: new Date().toISOString(),
  sources: [],
  missingFiles: Object.values(SOURCES),
  investor: {
    name: "Unknown",
    age: 0,
    riskTolerance: "medium",
    primaryGoal: "",
    constraints: [],
    investmentStyle: "",
  },
  philosophy: {
    market: "US stocks",
    horizon: "long-term",
    style: "",
    decisionFilter: "",
    qualityMetrics: [],
  },
  summary: "",
  influences: [],
};

// ─── Main loader ──────────────────────────────────────────────────────────────

export function loadBrainContext(): BrainOSContext {
  const raw: Record<string, string | null> = {};
  const sources: string[] = [];
  const missingFiles: string[] = [];

  for (const [name, relPath] of Object.entries(SOURCES)) {
    const content = readFile(relPath);
    if (content) {
      raw[name] = content;
      sources.push(relPath);
    } else {
      missingFiles.push(relPath);
    }
  }

  if (sources.length === 0) return FALLBACK;

  // ── Investor profile ───────────────────────────────────────────────────────
  const investor: BrainContextInvestor = {
    name: "Bank",
    age: 25,
    riskTolerance: "high",
    primaryGoal: "Build a business valued at THB 100 million or more",
    constraints: [
      "Scholarship bond: must repay military scholarship before resigning from Royal Thai Air Force",
      "Time-constrained: demanding military officer role limits bandwidth for research",
      "Capital-constrained: every investment dollar counts toward the scholarship repayment and independence runway",
    ],
    investmentStyle: "Quality businesses at reasonable prices — Buffett/Lynch influenced, long-term US equity portfolio",
  };

  // ── Investment philosophy ──────────────────────────────────────────────────
  const philosophy: BrainContextPhilosophy = {
    market: "US stock market (primary)",
    horizon: "Long-term — years, not months",
    style: "Quality businesses at reasonable prices (Buffett/Lynch influenced)",
    decisionFilter: "Does this accelerate capital accumulation and move me closer to financial independence before 40?",
    qualityMetrics: [
      "Circle of competence: can explain the business in one paragraph",
      "Competitive moat: brand, network effect, switching cost, or cost advantage",
      "Financial strength: Debt/Equity < 1, ROE > 15%, ROIC > 10%",
      "Earnings growth: EPS CAGR >15% (fast grower) or >8% (stable)",
      "Management quality: rational capital allocation, honest shareholder communication",
      "Valuation: PEG < 1.5, not excessively above industry average P/E",
      "Lynch check: low institutional ownership, large runway, underfollowed",
    ],
  };

  // ── Influences mapping ─────────────────────────────────────────────────────
  const influences: BrainContextInfluence[] = [];

  if (raw["AI Profile"]) {
    influences.push({
      source: SOURCES["AI Profile"],
      insight: "Capital accumulation is the highest near-term priority due to a scholarship bond. High risk tolerance at 25 — overly conservative recommendations are inappropriate.",
      appliesTo: ["biggestRisk", "biggestOpportunity", "mostUnderallocated"],
      excerpt: "I am a military officer on a government scholarship bond... capital accumulation the highest near-term priority — everything else is secondary to building the financial runway to exit.",
    });
    influences.push({
      source: SOURCES["AI Profile"],
      insight: "Invests with Buffett/Lynch framework — every thesis must pass quality-at-reasonable-price criteria.",
      appliesTo: ["weakestThesis", "reviewsDue"],
      excerpt: "Style: Quality businesses at reasonable prices (Buffett/Lynch influenced). Framework: Stock Selection Framework.",
    });
  }

  if (raw["Personal Mission"]) {
    influences.push({
      source: SOURCES["Personal Mission"],
      insight: "North Star: THB 100M business. Secondary: financial independence before 40. Portfolio decisions must serve these goals.",
      appliesTo: ["biggestOpportunity", "mostUnderallocated", "biggestRisk"],
      excerpt: "Every major decision should be evaluated based on whether it moves me closer to building a successful and scalable business.",
    });
  }

  if (raw["About Me"]) {
    influences.push({
      source: SOURCES["About Me"],
      insight: "Age 25 with deliberately high risk tolerance. Willing to accept short-term volatility for long-term compounding. Not a conservative investor.",
      appliesTo: ["biggestRisk", "weakestThesis"],
      excerpt: "At 25 years old, I am willing to take calculated risks in pursuit of high returns. I am willing to accept short-term uncertainty if it increases my probability of achieving long-term financial freedom.",
    });
  }

  if (raw["Stock Selection Framework"]) {
    influences.push({
      source: SOURCES["Stock Selection Framework"],
      insight: "10-step scoring framework with 90 max points. Buy ≥70, Watchlist 60–69, Pass <60. Thesis quality must satisfy business quality, financial strength, profitability, and valuation criteria.",
      appliesTo: ["weakestThesis", "reviewsDue"],
      excerpt: "Step 2: Business Quality — strong brand? network effect? switching cost? Will the company still be strong in 10 years? ... Decision: 80–90 Strong Buy, 70–79 Buy, 60–69 Watchlist.",
    });
  }

  if (raw["Portfolio Strategy"]) {
    influences.push({
      source: SOURCES["Portfolio Strategy"],
      insight: "Portfolio strategy note loaded.",
      appliesTo: ["biggestOpportunity", "mostUnderallocated"],
      excerpt: raw["Portfolio Strategy"]!.slice(0, 200),
    });
  }

  // ── Synthesized summary ────────────────────────────────────────────────────
  const summary =
    "Bank is a 25-year-old Thai investor with a high risk tolerance and long-term horizon. " +
    "Capital accumulation is his highest near-term priority — he must repay a military scholarship bond before he can leave the Royal Thai Air Force. " +
    "He invests in US equities using a Buffett/Lynch quality framework: quality businesses at reasonable prices, held for years. " +
    "His North Star is a THB 100M business and financial independence before 40. " +
    "Portfolio recommendations should be calibrated to aggressive compounding, not capital preservation. " +
    "Generic or overly conservative advice that ignores these constraints should be rejected.";

  return {
    loaded: true,
    loadedAt: new Date().toISOString(),
    sources,
    missingFiles,
    investor,
    philosophy,
    summary,
    influences,
  };
}
