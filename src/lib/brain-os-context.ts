import fs from "fs";
import path from "path";

const BRAIN_OS_ROOT = "G:\\คอมพิวเตอร์เครื่องอื่นๆ\\คอมพิวเตอร์ของฉัน\\Shared\\Brain OS";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BrainContextInfluence {
  source: string;
  insight: string;
  appliesTo: string[];
  excerpt: string;
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

// ─── New Phase 6.1 types — principles over percentages ────────────────────────

export interface InvestmentPrinciple {
  principle: string;
  rationale: string;
}

export interface RiskRule {
  rule: string;
  context: string;
}

export interface PortfolioConstructionRule {
  rule: string;
  category: "core" | "hedge" | "income" | "sizing";
  rationale: string;
}

export interface HistoricalAllocationProposal {
  name: string;
  dateNoted: string;
  context: string;
  allocations: { assetClass: string; proposedPct: number; purpose: string }[];
  isBindingTarget: false;
  note: string;
}

export interface InvestmentPhilosophyContext {
  timeHorizon: string;
  riskPhilosophy: string[];
  portfolioConstruction: string[];
  geopoliticalPhilosophy: string[];
  decisionFramework: { priority: number; criterion: string }[];
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
  // Phase 6.1 — extracted strategy context
  investmentPrinciples: InvestmentPrinciple[];
  riskPhilosophy: RiskRule[];
  portfolioConstructionRules: PortfolioConstructionRule[];
  historicalProposals: HistoricalAllocationProposal[];
  investmentPhilosophy: InvestmentPhilosophyContext | null;
}

// ─── Source file registry ─────────────────────────────────────────────────────

const SOURCES: Record<string, string> = {
  "AI Profile":                "08 AI/AI Profile.md",
  "About Me":                  "05 Life/About Me.md",
  "Personal Mission":          "05 Life/Personal Mission.md",
  "Portfolio Strategy":        "07 Investment/Portfolio Strategy.md",
  "Stock Selection Framework": "07 Investment/Stock Selection Framework.md",
  "Investment Philosophy":     "07 Investment/Investment Philosophy.md",
};

function readFile(relativePath: string): string | null {
  try {
    const content = fs.readFileSync(path.join(BRAIN_OS_ROOT, relativePath), "utf-8");
    return content.trim().length > 10 ? content : null;
  } catch {
    return null;
  }
}

// ─── Portfolio Strategy parser ────────────────────────────────────────────────
// Extracts structured context from Portfolio Strategy.md.
// NEVER reads allocation percentages as binding targets.

function extractMarkdownSection(content: string, heading: string): string {
  // Find "## {heading}" and extract until next "## " or end
  const lines = content.split("\n");
  let inSection = false;
  const sectionLines: string[] = [];

  for (const line of lines) {
    if (line.trim() === `## ${heading}`) {
      inSection = true;
      continue;
    }
    if (inSection && /^## /.test(line)) break;
    if (inSection) sectionLines.push(line);
  }

  return sectionLines.join("\n").trim();
}

function parseInvestmentPrinciples(content: string): InvestmentPrinciple[] {
  const section = extractMarkdownSection(content, "Investment Principles");
  if (!section) return [];

  const principles: InvestmentPrinciple[] = [];
  // Match: "1. **Principle text.** Rationale..."
  const lines = section.split("\n");
  for (const line of lines) {
    const m = line.match(/^\d+\.\s+\*\*(.+?)\*\*\s+(.*)/);
    if (m) {
      principles.push({ principle: m[1].trim().replace(/\.$/, ""), rationale: m[2].trim() });
    }
  }
  return principles;
}

function parseRiskPhilosophy(content: string): RiskRule[] {
  const section = extractMarkdownSection(content, "Risk Philosophy");
  if (!section) return [];

  const rules: RiskRule[] = [];
  // Match bullet: "- **Rule text.** Context..."
  const lines = section.split("\n");
  for (const line of lines) {
    const m = line.match(/^- \*\*(.+?)\*\*\s+(.*)/);
    if (m) {
      rules.push({ rule: m[1].trim().replace(/\.$/, ""), context: m[2].trim() });
    }
  }
  return rules;
}

function parsePortfolioConstructionRules(content: string): PortfolioConstructionRule[] {
  const section = extractMarkdownSection(content, "Portfolio Construction Philosophy");
  if (!section) return [];

  const rules: PortfolioConstructionRule[] = [];

  // Layer structure bullets
  const layerMatches = section.matchAll(/- \*\*(.+?)\s*(?:\(.+?\))?\s*:\*\*\s+(.*)/g);
  for (const m of layerMatches) {
    const name = m[1].trim();
    const category: PortfolioConstructionRule["category"] =
      /hedge/i.test(name) ? "hedge" :
      /dividend|stability|income/i.test(name) ? "income" :
      /sizing|size/i.test(name) ? "sizing" : "core";
    rules.push({ rule: name, category, rationale: m[2].trim() });
  }

  // Sizing rules section
  const sizingSection = section.match(/### Sizing Rules([\s\S]*?)(?=###|$)/)?.[1] ?? "";
  for (const line of sizingSection.split("\n")) {
    const m = line.match(/^- (.+)/);
    if (m) {
      rules.push({ rule: m[1].trim(), category: "sizing", rationale: "" });
    }
  }

  return rules;
}

function parseHistoricalProposals(content: string): HistoricalAllocationProposal[] {
  const section = extractMarkdownSection(content, "Historical Allocation Proposals");
  if (!section) return [];

  const proposals: HistoricalAllocationProposal[] = [];

  // Find proposal headers: "### Proposal: Name (YYYY-MM-DD)"
  const proposalBlocks = section.split(/^### /m).filter(s => s.startsWith("Proposal:"));

  for (const block of proposalBlocks) {
    const titleMatch = block.match(/^Proposal:\s+(.+?)\s+\((\d{4}-\d{2}-\d{2})\)/);
    if (!titleMatch) continue;

    const name = titleMatch[1].trim();
    const dateNoted = titleMatch[2];

    const contextMatch = block.match(/\*\*Context:\*\*\s+(.+?)(?=\n\n|\*\*)/s);
    const context = contextMatch ? contextMatch[1].trim() : "";

    // Parse the markdown table — extract rows, skip header and separator
    const tableRows = block.split("\n").filter(l => /^\|/.test(l) && !/^[\|\s\-]+$/.test(l));
    const allocations: { assetClass: string; proposedPct: number; purpose: string }[] = [];

    for (const row of tableRows.slice(1)) { // skip header row
      const cells = row.split("|").map(c => c.trim()).filter(Boolean);
      if (cells.length < 2) continue;
      const assetClass = cells[0].replace(/\*\*/g, "");
      const rawPct = cells[1].replace(/[^0-9.]/g, "");
      const proposedPct = parseFloat(rawPct);
      const purpose = cells[2] ?? "";
      if (!isNaN(proposedPct) && assetClass && assetClass !== "Total") {
        allocations.push({ assetClass, proposedPct, purpose });
      }
    }

    proposals.push({
      name,
      dateNoted,
      context,
      allocations,
      isBindingTarget: false,
      note: "Historical proposal. Do not import as allocation targets.",
    });
  }

  return proposals;
}

// ─── Investment Philosophy parser ────────────────────────────────────────────
// Reads from Investment Philosophy.md — plain bullet format (no bold markers).
// Historical Allocation Proposals section is deliberately ignored.

function extractPlainBullets(content: string, heading: string): string[] {
  const section = extractMarkdownSection(content, heading);
  if (!section) return [];
  return section.split("\n")
    .map(l => l.match(/^- (.+)/)?.[1]?.trim() ?? "")
    .filter(Boolean);
}

function parseDecisionFramework(content: string): { priority: number; criterion: string }[] {
  const section = extractMarkdownSection(content, "Decision Framework");
  if (!section) return [];
  return section.split("\n")
    .map(l => { const m = l.match(/^(\d+)\.\s+(.+)/); return m ? { priority: parseInt(m[1]), criterion: m[2].trim().replace(/\.$/, "") } : null; })
    .filter((x): x is { priority: number; criterion: string } => x !== null);
}

function parseInvestmentPhilosophy(content: string): InvestmentPhilosophyContext {
  return {
    timeHorizon: extractMarkdownSection(content, "Time Horizon").trim() || "20–40 years",
    riskPhilosophy: extractPlainBullets(content, "Risk Philosophy"),
    portfolioConstruction: extractPlainBullets(content, "Portfolio Construction Philosophy"),
    geopoliticalPhilosophy: extractPlainBullets(content, "Geopolitical Philosophy"),
    decisionFramework: parseDecisionFramework(content),
    // "Historical Allocation Proposals" section is ignored — not binding targets
  };
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
  investmentPrinciples: [],
  riskPhilosophy: [],
  portfolioConstructionRules: [],
  historicalProposals: [],
  investmentPhilosophy: null,
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

  // ── Parse Portfolio Strategy — principles only, never percentages ──────────
  const strategyContent = raw["Portfolio Strategy"] ?? "";
  const investmentPrinciples = parseInvestmentPrinciples(strategyContent);
  const riskPhilosophy = parseRiskPhilosophy(strategyContent);
  const portfolioConstructionRules = parsePortfolioConstructionRules(strategyContent);
  const historicalProposals = parseHistoricalProposals(strategyContent);

  // ── Parse Investment Philosophy — principles only, Historical Proposals ignored
  const investmentPhilosophy: InvestmentPhilosophyContext | null =
    raw["Investment Philosophy"] ? parseInvestmentPhilosophy(raw["Investment Philosophy"]) : null;

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

  if (investmentPrinciples.length > 0) {
    // Principle-based influence — uses extracted principles, not raw allocation data
    const principleExcerpt = investmentPrinciples.slice(0, 3)
      .map((p, i) => `${i + 1}. ${p.principle}: ${p.rationale}`)
      .join(" | ");
    influences.push({
      source: SOURCES["Portfolio Strategy"],
      insight: `Investment principles: ${investmentPrinciples[0].principle}. Risk philosophy: ${riskPhilosophy[0]?.rule ?? "catastrophic loss avoidance is non-negotiable"}. Portfolio construction follows layered architecture: Growth Core → Dividend Layer → Geopolitical Hedge.`,
      appliesTo: ["biggestRisk", "biggestOpportunity", "mostUnderallocated", "riskAnalysis"],
      excerpt: principleExcerpt,
    });
    if (riskPhilosophy.length > 0) {
      influences.push({
        source: SOURCES["Portfolio Strategy"],
        insight: "Scenario-based portfolio construction: portfolio must function across base case, rising tensions, and major disruption. Geopolitical hedge layer is explicitly called for.",
        appliesTo: ["biggestRisk", "riskAnalysis"],
        excerpt: "Scenario-based portfolio construction: Every configuration must be evaluated across at least three scenarios: (1) base case, (2) rising tensions, (3) major disruption. The portfolio should have positioned winners in each.",
      });
    }
  } else if (raw["Portfolio Strategy"]) {
    // Fallback if parsing found nothing — still never use raw percentages
    influences.push({
      source: SOURCES["Portfolio Strategy"],
      insight: "Portfolio strategy note loaded (principles extraction unavailable).",
      appliesTo: ["biggestOpportunity", "mostUnderallocated"],
      excerpt: "Portfolio strategy principles: aggressive compounding, catastrophic loss avoidance, scenario resilience.",
    });
  }

  // ── Investment Philosophy influences — 4 sections as distinct signals ──────
  if (investmentPhilosophy) {
    if (investmentPhilosophy.riskPhilosophy.length > 0) {
      influences.push({
        source: SOURCES["Investment Philosophy"],
        insight: `Risk philosophy: ${investmentPhilosophy.riskPhilosophy[0]}. ${investmentPhilosophy.riskPhilosophy[1] ?? ""}`.trim(),
        appliesTo: ["biggestRisk", "riskAnalysis"],
        excerpt: investmentPhilosophy.riskPhilosophy.slice(0, 2).join(" | "),
      });
    }
    if (investmentPhilosophy.portfolioConstruction.length > 0) {
      influences.push({
        source: SOURCES["Investment Philosophy"],
        insight: `Portfolio construction: ${investmentPhilosophy.portfolioConstruction[0]}. Defensive assets act as hedges, not core positions.`,
        appliesTo: ["mostUnderallocated", "biggestOpportunity"],
        excerpt: investmentPhilosophy.portfolioConstruction.slice(0, 2).join(" | "),
      });
    }
    if (investmentPhilosophy.geopoliticalPhilosophy.length > 0) {
      influences.push({
        source: SOURCES["Investment Philosophy"],
        insight: `Geopolitical context: ${investmentPhilosophy.geopoliticalPhilosophy[0]}. Small allocations to defense, energy, and gold serve as hedges. Hedges should remain minority positions.`,
        appliesTo: ["biggestRisk", "riskAnalysis"],
        excerpt: investmentPhilosophy.geopoliticalPhilosophy.slice(0, 2).join(" | "),
      });
    }
    if (investmentPhilosophy.decisionFramework.length > 0) {
      const top3 = investmentPhilosophy.decisionFramework.slice(0, 3)
        .map(d => `${d.priority}. ${d.criterion}`).join("; ");
      influences.push({
        source: SOURCES["Investment Philosophy"],
        insight: `Decision framework priority order: ${top3}. Evaluate opportunities in this sequence — compounding potential ranks before portfolio fit.`,
        appliesTo: ["biggestOpportunity", "mostUnderallocated", "weakestThesis"],
        excerpt: top3,
      });
    }
  }

  // ── Synthesized summary ────────────────────────────────────────────────────
  const principlesSummary = investmentPrinciples.length > 0
    ? ` Key principles: ${investmentPrinciples[0].principle}; ${investmentPrinciples[2]?.principle ?? "build a portfolio that can survive multiple futures"}.`
    : "";

  const riskSummary = riskPhilosophy.length > 0
    ? ` Risk rule: ${riskPhilosophy[0].rule}.`
    : "";

  const summary =
    "Bank is a 25-year-old Thai investor with a high risk tolerance and long-term horizon. " +
    "Capital accumulation is his highest near-term priority — he must repay a military scholarship bond before he can leave the Royal Thai Air Force. " +
    "He invests in US equities using a Buffett/Lynch quality framework: quality businesses at reasonable prices, held for years. " +
    "His North Star is a THB 100M business and financial independence before 40. " +
    "Portfolio recommendations should be calibrated to aggressive compounding, not capital preservation." +
    principlesSummary +
    riskSummary +
    " Generic or overly conservative advice that ignores these constraints should be rejected.";

  return {
    loaded: true,
    loadedAt: new Date().toISOString(),
    sources,
    missingFiles,
    investor,
    philosophy,
    summary,
    influences,
    investmentPrinciples,
    riskPhilosophy,
    portfolioConstructionRules,
    historicalProposals,
    investmentPhilosophy,
  };
}
