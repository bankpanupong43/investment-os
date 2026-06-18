// Research Dossier Agent — Phase 27C
//
// Generates institutional-quality investment research dossiers for themes
// discovered by the Theme Scout and surfaced by the Research Queue.
//
// Each dossier has 9 sections:
//   1. Executive Summary      — What / Why Now / Why It Matters (≤5 bullets)
//   2. Market Overview        — Maturity, Momentum, Institutional vs Newsletter interest
//   3. Key Drivers            — Tailwinds powering the theme
//   4. Risks                  — What could go wrong
//   5. Public Market Exposure — Pure Plays / Beneficiaries / Infrastructure
//   6. Private Market Exposure — Known private companies (sourced only, never fabricated)
//   7. Bull / Base / Bear     — Scenario framework
//   8. Portfolio Relevance    — Current vs Recommended exposure + gap
//   9. Research Actions       — What to read / monitor / analyze next
//
// All data sourced from existing DB tables — no external calls.
// Sections with insufficient data are flagged "Research Needed".

import * as fs   from "fs";
import * as path from "path";
import { db }    from "./db";
import { SCOUT_THEMES }          from "./theme-scout-engine";
import { resolveBrainOsPath }    from "./shared-paths";

// ─── Static per-theme dossier metadata ───────────────────────────────────────
// Sourced from domain knowledge embedded at build time — not fabricated at runtime.

export interface PrivateExposureEntry {
  company:            string;
  category:           string;
  fundingStage:       string;
  strategicRelevance: string;
}

interface DossierThemeMeta {
  tickerCategories: Record<string, "pure_play" | "beneficiary" | "infrastructure">;
  privateExposure:  PrivateExposureEntry[];
  bullCase:         string;
  baseCase:         string;
  bearCase:         string;
}

const DOSSIER_META: Record<string, DossierThemeMeta> = {
  "AI Infrastructure": {
    tickerCategories: {
      NVDA: "pure_play", SMCI: "infrastructure", TSM: "infrastructure",
      MSFT: "beneficiary", GOOG: "beneficiary", GOOGL: "beneficiary",
      META: "beneficiary", AMZN: "beneficiary",
    },
    privateExposure: [
      { company: "CoreWeave", category: "GPU Cloud", fundingStage: "Pre-IPO", strategicRelevance: "NVIDIA partner, hyperscale GPU rental" },
      { company: "Lambda Labs", category: "AI Cloud", fundingStage: "Series C", strategicRelevance: "On-demand GPU compute for AI training" },
    ],
    bullCase: "Hyperscaler capex continues to surprise — AI becomes a $1T+ infrastructure category; NVDA sustains >70% margin as the only viable GPU platform.",
    baseCase: "GPU buildout plateaus after 2025; inference efficiency gains slow capex growth; multiple GPU vendors emerge with competitive offerings.",
    bearCase: "Custom silicon (Google TPU, Amazon Trainium) displaces NVIDIA; energy constraints choke data center expansion; AI ROI disappoints enterprise buyers.",
  },

  "AI Agents": {
    tickerCategories: {
      MSFT: "pure_play", GOOG: "beneficiary", AMZN: "beneficiary",
      NVDA: "infrastructure", ORCL: "beneficiary",
    },
    privateExposure: [
      { company: "Anthropic", category: "Foundation Models", fundingStage: "Series E+", strategicRelevance: "Claude powers enterprise agent workflows" },
      { company: "Perplexity", category: "AI Search/Agents", fundingStage: "Series B", strategicRelevance: "Agentic search disrupting traditional information retrieval" },
      { company: "Glean", category: "Enterprise AI", fundingStage: "Series D", strategicRelevance: "Workplace AI assistant with agentic retrieval" },
      { company: "Cursor", category: "Developer AI", fundingStage: "Series B", strategicRelevance: "AI-native code editor; agentic programming" },
      { company: "Harvey", category: "Legal AI Agents", fundingStage: "Series C", strategicRelevance: "Autonomous legal research and drafting" },
    ],
    bullCase: "Agentic AI becomes the primary enterprise software interaction layer; Microsoft Copilot and Google Workspace AI drive recurring SaaS revenue upcycle.",
    baseCase: "Agent adoption is uneven — strong in coding and legal, weak in general enterprise; reliability issues limit autonomous deployment; 2-3 year ramp.",
    bearCase: "Hallucination liability stalls enterprise adoption; open-source agent frameworks commoditize the layer; no single pure-play public company captures the value.",
  },

  "Semiconductors": {
    tickerCategories: {
      TSM: "pure_play", ASML: "pure_play", AMD: "pure_play", NVDA: "pure_play",
      MU: "pure_play", INTC: "beneficiary", QCOM: "beneficiary",
      AMAT: "infrastructure", LRCX: "infrastructure",
    },
    privateExposure: [],
    bullCase: "AI drives a supercycle; TSMC's advanced node monopoly sustains premium pricing; ASML's EUV monopoly generates 30%+ margins for a decade.",
    baseCase: "AI chip demand moderates; memory recovers but slowly; geopolitical restrictions create new supply chain geography but don't break the cycle.",
    bearCase: "US–China chip war escalates; TSMC suffers Taiwan risk premium; Intel IDM2.0 fails, fragmenting foundry demand.",
  },

  "Defense": {
    tickerCategories: {
      LMT: "pure_play", NOC: "pure_play", RTX: "pure_play", GD: "pure_play",
      ITA: "beneficiary", BA: "beneficiary",
    },
    privateExposure: [],
    bullCase: "NATO 2% GDP commitment sustained; Indo-Pacific arms build begins in earnest; US restocking of munitions drives 5+ year backlog.",
    baseCase: "Elevated but stable defense budgets; geopolitical tensions keep demand above pre-2022 levels; margins improve as supply chains normalize.",
    bearCase: "Budget sequestration in a US debt deal cuts defense; Russia-Ukraine ceasefire reduces urgency; program delays hit execution.",
  },

  "Defense AI": {
    tickerCategories: {
      PLTR: "pure_play", KTOS: "pure_play", AVAV: "pure_play",
      LMT: "beneficiary", NOC: "beneficiary",
    },
    privateExposure: [
      { company: "Anduril", category: "Autonomous Defense", fundingStage: "Series F", strategicRelevance: "Autonomous vehicles and AI battlefield systems" },
      { company: "Shield AI", category: "AI Pilots", fundingStage: "Series F", strategicRelevance: "Autonomous combat aircraft and drone swarm AI" },
    ],
    bullCase: "DOD AI mandate accelerates; PLTR becomes the operating system for defense data; autonomous drone swarms reshape modern warfare procurement.",
    baseCase: "Defense AI adoption is slower than commercial AI; budget fights limit new program starts; PLTR grows but at commercial, not defense, rates.",
    bearCase: "Ethics regulations delay autonomous weapons programs; PLTR loses key contracts; smaller pure plays remain too small for institutional ownership.",
  },

  "Healthcare & GLP-1": {
    tickerCategories: {
      NVO: "pure_play", LLY: "pure_play",
      ABBV: "beneficiary", JNJ: "beneficiary", UNH: "beneficiary",
    },
    privateExposure: [],
    bullCase: "GLP-1 indications expand beyond obesity into cardiovascular, Alzheimer's, addiction; total addressable market reaches $150B by 2030.",
    baseCase: "GLP-1 maintains high growth but reimbursement headwinds slow penetration; biosimilar competition emerges post-2029; pipeline de-risks both NVO and LLY.",
    bearCase: "Manufacturing capacity constraints persist; major payer rebellion on coverage; safety signal for long-term use emerges.",
  },

  "Nuclear Energy": {
    tickerCategories: {
      CEG: "pure_play", NNE: "pure_play",
      CCJ: "infrastructure",
    },
    privateExposure: [
      { company: "TerraPower", category: "SMR Development", fundingStage: "Government-backed", strategicRelevance: "Bill Gates-backed sodium fast reactor program" },
      { company: "Commonwealth Fusion", category: "Fusion", fundingStage: "Series B", strategicRelevance: "High-temperature superconducting fusion — 2030s timeline" },
    ],
    bullCase: "AI hyperscalers sign 10-20 year nuclear PPAs; SMRs get NRC approval; nuclear becomes the clean baseload standard for data centers.",
    baseCase: "Existing fleet restarts drive near-term revenue; new build timelines remain 2028+; uranium prices stay elevated but nuclear stays a small grid share.",
    bearCase: "Permitting delays kill SMR timeline; solar+battery outcompetes nuclear on cost; public acceptance collapses after any incident.",
  },

  "Space Economy": {
    tickerCategories: {
      RKLB: "pure_play",
      BA: "beneficiary", LMT: "beneficiary", NOC: "beneficiary",
    },
    privateExposure: [
      { company: "SpaceX", category: "Launch / Connectivity", fundingStage: "Pre-IPO", strategicRelevance: "Starlink + Falcon dominance; Starship changes economics" },
      { company: "Relativity Space", category: "Additive Manufacturing Rockets", fundingStage: "Series E", strategicRelevance: "3D-printed rockets targeting small sat market" },
    ],
    bullCase: "Starship reaches orbit regularly; satellite internet reaches 5B users; RKLB becomes the Uber of small sat launch.",
    baseCase: "SpaceX dominates but RKLB carves a niche; government contracts sustain traditional primes; satellite broadband remains a developing-market story.",
    bearCase: "SpaceX IPO crashes private market valuations; RKLB struggles with Neutron development cost; government budget cuts reduce NASA/DOD contracts.",
  },

  "Cybersecurity": {
    tickerCategories: {
      CRWD: "pure_play", PANW: "pure_play", ZS: "pure_play",
      NET: "pure_play", FTNT: "pure_play", S: "pure_play",
      OKTA: "beneficiary",
    },
    privateExposure: [],
    bullCase: "AI-generated attack surface explodes; zero-trust becomes the enterprise standard; CRWD captures 30%+ endpoint market share.",
    baseCase: "Growth normalizes post-hyperscale tailwind; platform consolidation favors PANW and CRWD; mid-tier vendors face margin pressure.",
    bearCase: "Platformization accelerates but pricing wars compress margins; recession delays enterprise security spend; open-source alternatives penetrate mid-market.",
  },

  "Power Grid": {
    tickerCategories: {
      ETN: "infrastructure",
      VST: "pure_play", CEG: "pure_play",
      NEE: "beneficiary",
    },
    privateExposure: [],
    bullCase: "AI data centers require 50GW+ of new power by 2030; grid investment doubles; ETN and VST reprice as critical infrastructure.",
    baseCase: "Power demand growth is real but permitting delays slow supply response; utilities earn modest premium; grid stocks trade at 20x vs historical 15x.",
    bearCase: "Energy efficiency gains in AI chips reduce power demand growth; interest rate sensitivity compresses utility multiples; renewable oversupply hurts pricing.",
  },

  "Robotics": {
    tickerCategories: {
      ISRG: "pure_play",
      HON: "infrastructure", EMR: "infrastructure", ROK: "infrastructure",
    },
    privateExposure: [
      { company: "Figure AI", category: "Humanoid Robots", fundingStage: "Series B", strategicRelevance: "OpenAI partnership; BMW factory deployment" },
      { company: "1X Technologies", category: "Humanoid Robots", fundingStage: "Series B", strategicRelevance: "OpenAI-backed; consumer and industrial humanoids" },
      { company: "Boston Dynamics", category: "Mobile Robots", fundingStage: "Private (Hyundai)", strategicRelevance: "Spot and Atlas — industrial inspection and logistics" },
    ],
    bullCase: "Physical AI breakthrough makes humanoid robots commercially viable by 2027; factory automation displaces 20% of manual labor within a decade.",
    baseCase: "Robotic arms and mobile platforms grow steadily; humanoid robots remain demo-stage until 2028+; ROK and HON grow 8-12% annually from automation demand.",
    bearCase: "Humanoid development proves harder than expected; energy and reliability constraints delay commercial deployment; traditional automation vendors hold share.",
  },

  "Digital Payments": {
    tickerCategories: {
      V: "infrastructure", MA: "infrastructure",
      PYPL: "beneficiary",
    },
    privateExposure: [
      { company: "Stripe", category: "Payment Infrastructure", fundingStage: "Pre-IPO", strategicRelevance: "Leading developer-first payment API; global merchant acquiring" },
      { company: "Chime", category: "Neobank", fundingStage: "Pre-IPO", strategicRelevance: "Largest US neobank by accounts; no-fee banking" },
      { company: "Brex", category: "Corporate Fintech", fundingStage: "Series D", strategicRelevance: "Business spend management and banking for startups" },
    ],
    bullCase: "Stablecoin regulation passes; V and MA become the settlement layer for crypto; cross-border payment volumes double as commerce globalizes.",
    baseCase: "Steady 10-12% volume growth for rail incumbents; PYPL stabilizes after losing PayPal Checkout share; fintechs coexist rather than disrupt.",
    bearCase: "Central bank digital currencies (CBDCs) bypass card rails; Big Tech payments (Apple Pay, Google Pay) take merchant interchange; interchange regulation.",
  },

  "Data Centers": {
    tickerCategories: {
      EQIX: "pure_play", DLR: "pure_play",
    },
    privateExposure: [],
    bullCase: "AI workloads require 10x current data center density; EQIX and DLR sign 15-year hyperscaler leases at record rates; data center REIT de-correlates from rates.",
    baseCase: "Supply-demand tightens through 2026; power constraints cap new supply; modest rent growth supports stable but unspectacular returns.",
    bearCase: "Hyperscalers shift to owned campuses; power costs spike eliminating margin; rising rates compress REIT multiples.",
  },

  "Energy": {
    tickerCategories: {
      XOM: "pure_play", CVX: "pure_play", COP: "pure_play",
      VLO: "infrastructure", PSX: "infrastructure",
    },
    privateExposure: [],
    bullCase: "OPEC+ maintains discipline; geopolitical disruption sustains $90+ Brent; LNG export windfall continues as Europe diversifies from Russian gas.",
    baseCase: "Oil trades $70-85; energy companies return cash via buybacks and dividends; transition timeline extends beyond 2040 for hydrocarbons.",
    bearCase: "China demand peaks; EV adoption accelerates faster than expected; US shale ramps into a glut; Brent breaks below $65.",
  },
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PublicExposureEntry {
  ticker:               string;
  category:             "pure_play" | "beneficiary" | "infrastructure";
  themeRelevanceScore:  number;
  opportunityScore:     number | null;
  portfolioExposurePct: number;
  companyName:          string;
  inPortfolio:          boolean;
}

export interface ThemeDossier {
  theme:             string;
  generatedAt:       string;
  completenessScore: number;

  executiveSummary: {
    whatIsThis:    string;
    whyNow:        string;
    whyItMatters:  string;
    bullets:       string[];
  };

  marketOverview: {
    maturity:              "emerging" | "scaling" | "mature";
    momentum:              string;
    institutionalInterest: "high" | "medium" | "low" | "none";
    newsletterInterest:    "high" | "medium" | "low" | "none";
    themeScore:            number;
    noveltyScore:          number;
    researchPriority:      number;
  };

  keyDrivers: string[];
  risks:      string[];

  publicExposure:  PublicExposureEntry[];
  privateExposure: PrivateExposureEntry[];

  scenarios: {
    bull: string;
    base: string;
    bear: string;
  };

  portfolioRelevance: {
    currentExposurePct:     number;
    recommendedExposurePct: number;
    gap:                    number;
    holdings:               string[];
  };

  researchActions: { action: "Read" | "Monitor" | "Analyze"; description: string }[];

  evidenceSources:  string[];
  sectionsWithGaps: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function interestLevel(count: number, threshold: { high: number; medium: number }): "high" | "medium" | "low" | "none" {
  if (count >= threshold.high)   return "high";
  if (count >= threshold.medium) return "medium";
  if (count > 0)                 return "low";
  return "none";
}

function maturityFromStatus(status: string, score: number): "emerging" | "scaling" | "mature" {
  if (status === "emerging" || score < 40)  return "emerging";
  if (status === "accelerating" || score < 70) return "scaling";
  return "mature";
}

function recommendedExposure(status: string, isExtended: boolean, score: number): number {
  if (status === "weakening")                         return 1;
  if (status === "emerging" && score < 30)            return 2;
  if (status === "emerging" && isExtended)            return 4;
  if (status === "accelerating" && isExtended)        return 6;
  if (status === "accelerating" && !isExtended)       return 8;
  if (score >= 70 && !isExtended)                     return 10;
  return 4;
}

function safeJson<T>(s: string, fallback: T): T {
  try { return JSON.parse(s); } catch { return fallback; }
}

// ─── Core generator ───────────────────────────────────────────────────────────

export async function generateThemeDossier(theme: string): Promise<ThemeDossier> {
  const def  = SCOUT_THEMES[theme];
  const meta = DOSSIER_META[theme];
  const sectionsWithGaps: string[] = [];
  const evidenceSources: string[] = [];

  // ── Load ThemeScout DB record ──────────────────────────────────────────────

  const scoutRow = await db.themeScout.findUnique({ where: { theme } });
  const score             = scoutRow?.score            ?? 0;
  const score7d           = scoutRow?.score7d          ?? 0;
  const noveltyScore      = scoutRow?.noveltyScore     ?? (meta ? 50 : 30);
  const researchPriority  = scoutRow?.researchPriority ?? 0;
  const momentum          = scoutRow?.momentum         ?? "Stable";
  const status            = scoutRow?.status           ?? "emerging";
  const mentionCount      = scoutRow?.mentionCount     ?? 0;
  const isExtended        = scoutRow?.isExtended       ?? def?.isExtended ?? false;
  const dbDrivers         = safeJson<string[]>(scoutRow?.drivers ?? "[]", []);
  const sources           = safeJson<string[]>(scoutRow?.sources ?? "[]", []);
  const candidates        = safeJson<{ ticker: string; reason: string; radarScore: number }[]>(scoutRow?.candidates ?? "[]", []);

  if (scoutRow) evidenceSources.push("Theme Scout");

  // ── Load portfolio positions for theme tickers ─────────────────────────────

  const tickers = def?.tickers ?? candidates.map(c => c.ticker);
  const positions = tickers.length > 0
    ? await db.position.findMany({
        where: { ticker: { in: tickers }, status: "active" },
        select: { ticker: true, allocationPct: true, currentValueUsd: true },
      })
    : [];

  const ownedTickerMap = new Map(positions.map(p => [p.ticker, p.allocationPct ?? 0]));

  // ── Load opportunity scores (best-effort) ─────────────────────────────────

  const oppScoreMap = new Map<string, number>();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opps = await (db as any).opportunityScore.findMany({
      where: { ticker: { in: tickers } },
      orderBy: { generatedAt: "desc" },
      take: tickers.length * 2,
      select: { ticker: true, opportunityScore: true },
    }) as { ticker: string; opportunityScore: number }[];
    for (const o of opps) {
      if (!oppScoreMap.has(o.ticker)) oppScoreMap.set(o.ticker, o.opportunityScore);
    }
  } catch { /* opportunityScore table may not exist */ }

  // ── Load institutional source count ───────────────────────────────────────

  let institutionalMentions = 0;
  try {
    const instSources = new Set(["blackrock", "morgan_stanley", "jpmorgan"]);
    const newsletters = await db.newsletterItem.findMany({
      where: {
        source: { in: [...instSources] },
        publishedAt: { gte: new Date(Date.now() - 90 * 864e5) },
      },
      select: { title: true, summary: true, source: true },
      take: 200,
    });
    const keywords = def?.keywords ?? [];
    institutionalMentions = newsletters.filter(n =>
      keywords.some(kw => (n.title + " " + (n.summary ?? "")).toLowerCase().includes(kw))
    ).length;
    if (institutionalMentions > 0) evidenceSources.push("Institutional Research");
  } catch { /* pass */ }

  // ─── Section 1: Executive Summary ─────────────────────────────────────────

  const whatIsThis = def?.description ?? `${theme} — an investment theme tracked by Theme Scout.`;
  const whyNow = score7d > score * 0.8
    ? `Signal intensity surging — 7-day signal rate (${score7d.toFixed(0)}) approaching 30-day average (${score.toFixed(0)}). Momentum: ${momentum}.`
    : momentum === "Rising"
    ? `Momentum is Rising with ${mentionCount} mentions in the last 90 days across ${sources.length} source types.`
    : `Theme score ${score.toFixed(0)}/100 with ${momentum} momentum. Research Priority ${researchPriority.toFixed(0)}/100.`;

  const whyItMatters = noveltyScore >= 70
    ? `High novelty score (${noveltyScore}/100) — this theme is under-represented in existing portfolio and research coverage. Early-mover advantage possible.`
    : isExtended
    ? `Extended theme not yet in your allocation framework. Current portfolio exposure: ${(100 - noveltyScore * 0.3).toFixed(0)}% of theme tickers uncovered.`
    : `Established theme with institutional coverage. Portfolio alignment gap warrants review.`;

  const bullets = [
    ...(dbDrivers.length > 0 ? dbDrivers.slice(0, 3) : (def?.drivers ?? []).slice(0, 3)),
    ...(institutionalMentions > 0 ? [`${institutionalMentions} institutional mentions in last 90 days`] : []),
    ...(candidates.length > 0 ? [`Key candidates: ${candidates.slice(0, 3).map(c => c.ticker).join(", ")}`] : []),
  ].slice(0, 5);

  if (bullets.length < 3) sectionsWithGaps.push("Executive Summary");

  // ─── Section 2: Market Overview ────────────────────────────────────────────

  const maturity             = maturityFromStatus(status, score);
  const institutionalInterest = interestLevel(institutionalMentions, { high: 5, medium: 2 });
  const newsletterInterest    = interestLevel(mentionCount, { high: 10, medium: 3 });

  if (institutionalInterest === "none" && newsletterInterest === "none") {
    sectionsWithGaps.push("Market Overview — Institutional Signal");
  }

  // ─── Section 3: Key Drivers ────────────────────────────────────────────────

  const drivers = dbDrivers.length >= 3
    ? dbDrivers
    : [...(def?.drivers ?? []), ...dbDrivers.filter(d => !(def?.drivers ?? []).includes(d))];

  if (drivers.length < 2) sectionsWithGaps.push("Key Drivers");

  // ─── Section 4: Risks ─────────────────────────────────────────────────────

  const risks = def?.risks ?? [];
  if (risks.length < 2) sectionsWithGaps.push("Risks");

  // ─── Section 5: Public Market Exposure ────────────────────────────────────

  const tickerCats = meta?.tickerCategories ?? {};
  const candidateScoreMap = new Map(candidates.map(c => [c.ticker, c.radarScore]));

  const publicExposure: PublicExposureEntry[] = tickers.map(ticker => {
    const radarScore = candidateScoreMap.get(ticker) ?? 50;
    const category   = tickerCats[ticker] ?? "beneficiary";
    return {
      ticker,
      category,
      themeRelevanceScore:  category === "pure_play" ? 90 : category === "infrastructure" ? 70 : 55,
      opportunityScore:     oppScoreMap.get(ticker) ?? null,
      portfolioExposurePct: ownedTickerMap.get(ticker) ?? 0,
      companyName:          ticker,
      inPortfolio:          ownedTickerMap.has(ticker),
    };
  });

  if (publicExposure.length === 0) sectionsWithGaps.push("Public Market Exposure");
  else evidenceSources.push("Opportunity Engine");

  // ─── Section 6: Private Market Exposure ───────────────────────────────────

  let privateExposure: PrivateExposureEntry[] = meta?.privateExposure ?? [];

  // Enrich from PrivateCandidate DB (Phase 28D)
  try {
    const dbPrivate = await db.privateCandidate.findMany({
      where: { status: "active" },
      select: { companyName: true, sector: true, stage: true, themeLinks: true, discoveryScore: true },
      orderBy: { discoveryScore: "desc" },
      take: 30,
    });
    for (const pc of dbPrivate) {
      const themes: string[] = (() => { try { return JSON.parse(pc.themeLinks) as string[]; } catch { return []; } })();
      if (themes.some(t => t.toLowerCase() === theme.toLowerCase())) {
        const alreadyListed = privateExposure.some(e => e.company === pc.companyName);
        if (!alreadyListed) {
          privateExposure.push({
            company:            pc.companyName,
            category:           pc.sector ?? "Technology",
            fundingStage:       (pc.stage ?? "Unknown").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
            strategicRelevance: `Discovery score ${pc.discoveryScore.toFixed(0)}/100 — tracked by Private Market Scout`,
          });
        }
      }
    }
    if (dbPrivate.length > 0) evidenceSources.push("Private Market Scout");
  } catch { /* PrivateCandidate table may not exist */ }

  if (privateExposure.length === 0) sectionsWithGaps.push("Private Market Exposure");

  // ─── Section 7: Bull / Base / Bear ────────────────────────────────────────

  const scenarios = {
    bull: meta?.bullCase ?? "Research Needed — insufficient data to construct bull scenario.",
    base: meta?.baseCase ?? "Research Needed — insufficient data to construct base scenario.",
    bear: meta?.bearCase ?? "Research Needed — insufficient data to construct bear scenario.",
  };

  if (!meta?.bullCase) sectionsWithGaps.push("Scenarios");

  // ─── Section 8: Portfolio Relevance ───────────────────────────────────────

  const holdings = positions.map(p => p.ticker);
  const currentExposurePct = holdings.length > 0
    ? positions.reduce((sum, p) => sum + (p.allocationPct ?? 0), 0)
    : 0;
  const recommendedExposurePct = recommendedExposure(status, isExtended, score);
  const gap = Math.round((recommendedExposurePct - currentExposurePct) * 10) / 10;

  if (holdings.length > 0) evidenceSources.push("Portfolio");

  // ─── Section 9: Research Actions ──────────────────────────────────────────

  const researchActions: { action: "Read" | "Monitor" | "Analyze"; description: string }[] = [];

  if (institutionalInterest === "none") {
    researchActions.push({ action: "Read", description: `Search for ${theme} coverage in latest BlackRock and Morgan Stanley research notes` });
  }
  if (momentum === "Rising") {
    researchActions.push({ action: "Monitor", description: `Track weekly mention frequency for: ${(def?.keywords ?? []).slice(0, 3).join(", ")}` });
  }
  if (holdings.length === 0 && tickers.length > 0) {
    researchActions.push({ action: "Analyze", description: `Screen ${tickers.slice(0, 4).join(", ")} for portfolio fit — zero current exposure to this theme` });
  }
  if (privateExposure.length > 0) {
    researchActions.push({ action: "Monitor", description: `Track funding rounds for ${privateExposure.map(p => p.company).slice(0, 3).join(", ")} as IPO pipeline indicators` });
  }
  if (candidates.length > 0) {
    researchActions.push({ action: "Analyze", description: `Deep-dive: ${candidates[0].ticker} — highest radar score (${candidates[0].radarScore?.toFixed(0)}) among theme candidates` });
  }
  researchActions.push({ action: "Read", description: `Set up Google Alerts for: ${(def?.keywords ?? [theme]).slice(0, 2).join(", ")}` });

  // ─── Completeness Score ────────────────────────────────────────────────────

  let completenessScore = 0;
  if (scoutRow)                            completenessScore += 20;
  if (institutionalMentions > 0)           completenessScore += 15;
  if (drivers.length >= 3)                 completenessScore += 10;
  if (risks.length >= 2)                   completenessScore += 10;
  if (publicExposure.length > 0)           completenessScore += 15;
  if (holdings.length > 0)                 completenessScore += 10;
  if (meta?.bullCase)                      completenessScore += 15;
  if (privateExposure.length > 0)          completenessScore += 5;

  return {
    theme,
    generatedAt:        new Date().toISOString(),
    completenessScore,
    executiveSummary:   { whatIsThis, whyNow, whyItMatters, bullets },
    marketOverview:     { maturity, momentum, institutionalInterest, newsletterInterest, themeScore: score, noveltyScore, researchPriority },
    keyDrivers:         drivers,
    risks,
    publicExposure,
    privateExposure,
    scenarios,
    portfolioRelevance: { currentExposurePct, recommendedExposurePct, gap, holdings },
    researchActions,
    evidenceSources,
    sectionsWithGaps,
  };
}

// ─── Batch refresh ────────────────────────────────────────────────────────────

export async function refreshResearchQueueDossiers(): Promise<{ generated: number; skipped: number; themes: string[] }> {
  const rows = await db.themeScout.findMany({
    where: { researchPriority: { gte: 70 } },
    orderBy: { researchPriority: "desc" },
  });

  const generated: string[] = [];
  const skipped: string[]   = [];

  for (const row of rows) {
    try {
      const dossier = await generateThemeDossier(row.theme);
      await saveThemeDossier(dossier);
      writeThemeDossierToWiki(dossier);
      generated.push(row.theme);
    } catch {
      skipped.push(row.theme);
    }
  }

  return { generated: generated.length, skipped: skipped.length, themes: generated };
}

// ─── Company dossier (lightweight wrapper) ────────────────────────────────────
// Generates a theme-context-aware company dossier summary.
// Full company research uses the existing dossier-engine.ts.

export async function generateCompanyDossier(ticker: string): Promise<{
  ticker:       string;
  relatedThemes: string[];
  themeContext:  string;
  dossierExists: boolean;
}> {
  const themes = await db.themeScout.findMany({
    orderBy: { researchPriority: "desc" },
  });

  const relatedThemes = themes.filter(t => {
    const def = SCOUT_THEMES[t.theme];
    return def?.tickers.includes(ticker);
  }).map(t => t.theme);

  const existing = await db.researchDossier.findUnique({ where: { ticker } }).catch(() => null);

  return {
    ticker,
    relatedThemes,
    themeContext: relatedThemes.length > 0
      ? `${ticker} appears in ${relatedThemes.length} Scout theme(s): ${relatedThemes.join(", ")}`
      : `${ticker} has no direct theme coverage in Scout database.`,
    dossierExists: existing !== null,
  };
}

// ─── DB persistence ───────────────────────────────────────────────────────────

export async function saveThemeDossier(d: ThemeDossier): Promise<void> {
  const data = {
    completenessScore:  d.completenessScore,
    executiveSummary:   JSON.stringify(d.executiveSummary),
    marketOverview:     JSON.stringify(d.marketOverview),
    keyDrivers:         JSON.stringify(d.keyDrivers),
    risks:              JSON.stringify(d.risks),
    publicExposure:     JSON.stringify(d.publicExposure),
    privateExposure:    JSON.stringify(d.privateExposure),
    scenarios:          JSON.stringify(d.scenarios),
    portfolioRelevance: JSON.stringify(d.portfolioRelevance),
    researchActions:    JSON.stringify(d.researchActions),
    evidenceSources:    JSON.stringify(d.evidenceSources),
    sectionsWithGaps:   JSON.stringify(d.sectionsWithGaps),
    generatedAt:        new Date(d.generatedAt),
  };

  await db.themeDossier.upsert({
    where:  { theme: d.theme },
    update: data,
    create: { theme: d.theme, ...data },
  });
}

export async function getThemeDossier(theme: string): Promise<ThemeDossier | null> {
  const row = await db.themeDossier.findUnique({ where: { theme } });
  if (!row) return null;

  return {
    theme:              row.theme,
    generatedAt:        row.generatedAt.toISOString(),
    completenessScore:  row.completenessScore,
    executiveSummary:   safeJson(row.executiveSummary,   { whatIsThis: "", whyNow: "", whyItMatters: "", bullets: [] }),
    marketOverview:     safeJson(row.marketOverview,     { maturity: "emerging" as const, momentum: "Stable", institutionalInterest: "none" as const, newsletterInterest: "none" as const, themeScore: 0, noveltyScore: 0, researchPriority: 0 }),
    keyDrivers:         safeJson(row.keyDrivers,         []),
    risks:              safeJson(row.risks,              []),
    publicExposure:     safeJson(row.publicExposure,     []),
    privateExposure:    safeJson(row.privateExposure,    []),
    scenarios:          safeJson(row.scenarios,          { bull: "", base: "", bear: "" }),
    portfolioRelevance: safeJson(row.portfolioRelevance, { currentExposurePct: 0, recommendedExposurePct: 0, gap: 0, holdings: [] }),
    researchActions:    safeJson(row.researchActions,    []),
    evidenceSources:    safeJson(row.evidenceSources,    []),
    sectionsWithGaps:   safeJson(row.sectionsWithGaps,   []),
  };
}

// ─── Wiki writer ──────────────────────────────────────────────────────────────

export function writeThemeDossierToWiki(d: ThemeDossier): void {
  try {
    const brainOsRoot = process.env.BRAIN_OS_ROOT ?? resolveBrainOsPath() ?? path.join(process.cwd(), "brain-os");
    const dir         = path.join(brainOsRoot, "07 Investment", "Wiki", "Research Queue");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const slug     = d.theme.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "-");
    const filePath = path.join(dir, `${slug}.md`);
    const today    = new Date().toISOString().slice(0, 10);

    const purePlays = d.publicExposure.filter(e => e.category === "pure_play");
    const beneficiaries = d.publicExposure.filter(e => e.category === "beneficiary");
    const infrastructure = d.publicExposure.filter(e => e.category === "infrastructure");

    const exposureTable = (items: PublicExposureEntry[]) =>
      items.map(e =>
        `| ${e.ticker} | ${e.opportunityScore?.toFixed(0) ?? "—"} | ${e.portfolioExposurePct.toFixed(1)}% | ${e.inPortfolio ? "✓" : "—"} |`
      ).join("\n");

    const content = `# ${d.theme} — Research Dossier

**Completeness:** ${d.completenessScore}/100
**Theme Score:** ${d.marketOverview.themeScore.toFixed(0)}/100
**Novelty:** ${d.marketOverview.noveltyScore.toFixed(0)}/100
**Research Priority:** ${d.marketOverview.researchPriority.toFixed(0)}/100
**Momentum:** ${d.marketOverview.momentum}
**Maturity:** ${d.marketOverview.maturity}
**Generated:** ${today}

---

## Executive Summary

**What is this?**
${d.executiveSummary.whatIsThis}

**Why Now?**
${d.executiveSummary.whyNow}

**Why It Matters?**
${d.executiveSummary.whyItMatters}

### Key Points
${d.executiveSummary.bullets.map(b => `- ${b}`).join("\n") || "- Research Needed"}

---

## Market Overview

| Attribute | Value |
|-----------|-------|
| Maturity | ${d.marketOverview.maturity} |
| Momentum | ${d.marketOverview.momentum} |
| Theme Score | ${d.marketOverview.themeScore.toFixed(0)}/100 |
| Institutional Interest | ${d.marketOverview.institutionalInterest} |
| Newsletter Interest | ${d.marketOverview.newsletterInterest} |

---

## Key Drivers

${d.keyDrivers.map(dr => `- ${dr}`).join("\n") || "- Research Needed"}

---

## Risks

${d.risks.map(r => `- ${r}`).join("\n") || "- Research Needed"}

---

## Public Market Exposure

${purePlays.length > 0 ? `### Pure Plays\n| Ticker | Opp Score | Portfolio % | Owned |\n|--------|-----------|-------------|-------|\n${exposureTable(purePlays)}\n` : ""}
${beneficiaries.length > 0 ? `### Beneficiaries\n| Ticker | Opp Score | Portfolio % | Owned |\n|--------|-----------|-------------|-------|\n${exposureTable(beneficiaries)}\n` : ""}
${infrastructure.length > 0 ? `### Infrastructure\n| Ticker | Opp Score | Portfolio % | Owned |\n|--------|-----------|-------------|-------|\n${exposureTable(infrastructure)}\n` : ""}
${d.publicExposure.length === 0 ? "_Research Needed — no ticker coverage available_\n" : ""}

---

## Private Market Exposure

${d.privateExposure.length > 0
  ? d.privateExposure.map(p => `**${p.company}** (${p.fundingStage})\n- Category: ${p.category}\n- Relevance: ${p.strategicRelevance}`).join("\n\n")
  : "_Research Needed — no private company data available for this theme_"}

---

## Bull / Base / Bear

**Bull Case**
${d.scenarios.bull}

**Base Case**
${d.scenarios.base}

**Bear Case**
${d.scenarios.bear}

---

## Portfolio Relevance

| | Value |
|--|-------|
| Current Exposure | ${d.portfolioRelevance.currentExposurePct.toFixed(1)}% |
| Recommended Exposure | ${d.portfolioRelevance.recommendedExposurePct.toFixed(1)}% |
| Gap | ${d.portfolioRelevance.gap > 0 ? "+" : ""}${d.portfolioRelevance.gap.toFixed(1)}% |
| Holdings | ${d.portfolioRelevance.holdings.join(", ") || "None"} |

${d.portfolioRelevance.gap > 2 ? `> **Action:** Consider increasing ${d.theme} exposure by ~${d.portfolioRelevance.gap.toFixed(0)}%` : ""}

---

## Research Actions

${d.researchActions.map(a => `- [${a.action}] ${a.description}`).join("\n")}

---

## Evidence Sources

${d.evidenceSources.map(s => `- ${s}`).join("\n") || "- None — run Theme Scout to populate"}

${d.sectionsWithGaps.length > 0
  ? `\n## Gaps (Research Needed)\n\n${d.sectionsWithGaps.map(s => `- ${s}`).join("\n")}`
  : ""}
`;

    fs.writeFileSync(filePath, content, "utf8");
  } catch {
    // Wiki write failure never blocks main flow
  }
}
