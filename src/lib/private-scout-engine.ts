// Private Scout Engine — Phase 28D
//
// Discovers important private companies before IPO and maps them to
// public market beneficiaries.
//
// Data sources (Phase 1):
//   1. YC Companies  — curated list of notable YC companies + batch enrichment
//   2. Hacker News   — Algolia HN API: story count + points per company (30d)
//   3. VC Blogs      — RSS feeds: a16z, Sequoia, Bessemer (90d)
//
// Discovery Score formula (0-100):
//   Theme Momentum   30%  — match to existing ThemeScout scores
//   Source Diversity 25%  — distinct source types contributing signal
//   VC Validation    20%  — tier-1 VC backing weight
//   HN Momentum      15%  — HN points + story count (30d)
//   Novelty          10%  — how under-researched relative to signal level

import { db } from "./db";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PublicBeneficiary {
  ticker:     string;
  rationale:  string;
  confidence: number; // 0-100
}

export interface PrivateCompanyDef {
  companyName:   string;
  website?:      string;
  sector:        string;
  stage:         string;
  themeLinks:    string[];
  backers:       string[];
  estimatedRevenue?: string;
  ycBatch?:      string;
  publicBeneficiaries: PublicBeneficiary[];
}

export interface ScoutedPrivateCandidate extends PrivateCompanyDef {
  discoveryScore:  number;
  noveltyScore:    number;
  sourceCount:     number;
  hnMentions:      number;
  hnPoints:        number;
  vcBlogMentions:  number;
  themeScore:      number;
  vcScore:         number;
  sourceDiversity: number;
}

export interface PrivateScoutReport {
  topCandidates:        ScoutedPrivateCandidate[];
  byTheme:              Record<string, ScoutedPrivateCandidate[]>;
  topPublicBeneficiaries: { ticker: string; linkedCompanies: string[]; exposureCount: number }[];
  generatedAt:          string;
  totalScanned:         number;
}

// ─── Static private company registry ─────────────────────────────────────────
// Source-of-truth seed. Enriched at runtime by HN + VC blog signals.

export const PRIVATE_COMPANIES: PrivateCompanyDef[] = [
  // ── AI Models / Foundation Layer ─────────────────────────────────────────
  {
    companyName: "Anthropic",
    website: "anthropic.com",
    sector: "AI Models",
    stage: "series_e_plus",
    themeLinks: ["AI Infrastructure", "AI Agents"],
    backers: ["Amazon", "Google", "Spark Capital"],
    estimatedRevenue: "$1B+ ARR",
    publicBeneficiaries: [
      { ticker: "AMZN", rationale: "AWS cloud provider + $4B investment", confidence: 90 },
      { ticker: "GOOG", rationale: "Google invested $300M+; GCP partnership", confidence: 80 },
      { ticker: "NVDA", rationale: "H100/H200 GPU clusters for Claude training", confidence: 85 },
    ],
  },
  {
    companyName: "OpenAI",
    website: "openai.com",
    sector: "AI Models",
    stage: "growth",
    themeLinks: ["AI Infrastructure", "AI Agents"],
    backers: ["Microsoft", "Tiger Global", "Sequoia"],
    estimatedRevenue: "$3.4B+ ARR",
    publicBeneficiaries: [
      { ticker: "MSFT", rationale: "$13B invested; Azure exclusive deployment; Copilot integration", confidence: 95 },
      { ticker: "NVDA", rationale: "Primary GPU supplier for GPT training and inference", confidence: 85 },
    ],
  },
  {
    companyName: "xAI",
    website: "x.ai",
    sector: "AI Models",
    stage: "series_b",
    themeLinks: ["AI Infrastructure", "AI Agents"],
    backers: ["Andreessen Horowitz", "Sequoia", "Fidelity"],
    estimatedRevenue: "$200M+ ARR",
    publicBeneficiaries: [
      { ticker: "NVDA", rationale: "Colossus cluster: 100k+ H100s; NVIDIA's largest AI customer", confidence: 92 },
      { ticker: "AMZN", rationale: "Grok API sold on AWS Marketplace", confidence: 55 },
    ],
  },
  {
    companyName: "Mistral AI",
    website: "mistral.ai",
    sector: "AI Models",
    stage: "series_b",
    themeLinks: ["AI Infrastructure", "AI Agents"],
    backers: ["Andreessen Horowitz", "Lightspeed", "Microsoft"],
    estimatedRevenue: "$50M+ ARR",
    publicBeneficiaries: [
      { ticker: "MSFT", rationale: "Azure partnership + $16M investment; Azure AI Studio distribution", confidence: 75 },
      { ticker: "NVDA", rationale: "GPU training and inference infrastructure", confidence: 80 },
    ],
  },

  // ── Developer AI Tools ────────────────────────────────────────────────────
  {
    companyName: "Cursor",
    website: "cursor.com",
    sector: "Developer Tools",
    stage: "series_b",
    themeLinks: ["AI Agents", "AI Infrastructure"],
    backers: ["Andreessen Horowitz", "Thrive Capital"],
    estimatedRevenue: "$500M+ ARR",
    publicBeneficiaries: [
      { ticker: "MSFT", rationale: "VS Code ecosystem; competes with GitHub Copilot validating market", confidence: 70 },
      { ticker: "NVDA", rationale: "AI inference infrastructure demand", confidence: 65 },
      { ticker: "AMZN", rationale: "AWS CodeWhisperer market validation; cloud deployment", confidence: 55 },
    ],
  },
  {
    companyName: "Perplexity",
    website: "perplexity.ai",
    sector: "AI Search",
    stage: "series_c",
    themeLinks: ["AI Agents", "AI Infrastructure"],
    backers: ["IVP", "NEA", "Jeff Bezos"],
    estimatedRevenue: "$100M+ ARR",
    publicBeneficiaries: [
      { ticker: "AMZN", rationale: "AWS deployment + Jeff Bezos personal investment", confidence: 70 },
      { ticker: "NVDA", rationale: "Inference compute on NVIDIA hardware", confidence: 75 },
    ],
  },

  // ── AI Infrastructure / Compute ───────────────────────────────────────────
  {
    companyName: "CoreWeave",
    website: "coreweave.com",
    sector: "AI Cloud",
    stage: "pre_ipo",
    themeLinks: ["AI Infrastructure", "Data Centers"],
    backers: ["Magnetar Capital", "Coatue", "Altimeter"],
    estimatedRevenue: "$3B+ ARR",
    publicBeneficiaries: [
      { ticker: "NVDA", rationale: "NVIDIA's preferred cloud partner; built on H100/H200 GPU fleet", confidence: 93 },
      { ticker: "MSFT", rationale: "$10.5B Azure contract; Microsoft largest CoreWeave customer", confidence: 88 },
      { ticker: "AMZN", rationale: "AWS alternative validates hyperscale GPU demand", confidence: 60 },
    ],
  },
  {
    companyName: "Groq",
    website: "groq.com",
    sector: "AI Chips",
    stage: "series_c",
    themeLinks: ["AI Infrastructure", "Semiconductors"],
    backers: ["Tiger Global", "D1 Capital", "Samsung"],
    estimatedRevenue: "$100M+ ARR",
    publicBeneficiaries: [
      { ticker: "NVDA", rationale: "LPU inference chip competitor — validates the inference chip market NVIDIA is expanding into", confidence: 80 },
      { ticker: "AMZN", rationale: "Graviton custom silicon signal; custom inference chip trend", confidence: 65 },
    ],
  },
  {
    companyName: "Databricks",
    website: "databricks.com",
    sector: "Data & AI Platform",
    stage: "pre_ipo",
    themeLinks: ["AI Infrastructure", "Data Centers"],
    backers: ["Andreessen Horowitz", "Franklin Templeton", "Nvidia"],
    estimatedRevenue: "$1.6B+ ARR",
    publicBeneficiaries: [
      { ticker: "NVDA", rationale: "GPU cluster customer; NVDA invested in Databricks", confidence: 85 },
      { ticker: "AMZN", rationale: "AWS Databricks managed service = major deployment platform", confidence: 75 },
      { ticker: "MSFT", rationale: "Azure Databricks = primary Microsoft partnership", confidence: 80 },
    ],
  },
  {
    companyName: "Scale AI",
    website: "scale.com",
    sector: "AI Data",
    stage: "growth",
    themeLinks: ["AI Infrastructure"],
    backers: ["Accel", "Tiger Global", "Index Ventures"],
    estimatedRevenue: "$670M+ ARR",
    publicBeneficiaries: [
      { ticker: "NVDA", rationale: "Data labeling for NVIDIA AI model training pipelines", confidence: 70 },
      { ticker: "MSFT", rationale: "Azure customer; OpenAI (MSFT partner) supply chain", confidence: 70 },
      { ticker: "AMZN", rationale: "AWS infrastructure + US DoD project delivery", confidence: 60 },
    ],
  },

  // ── Enterprise AI / Agents ────────────────────────────────────────────────
  {
    companyName: "Glean",
    website: "glean.com",
    sector: "Enterprise AI",
    stage: "series_e",
    themeLinks: ["AI Agents", "AI Infrastructure"],
    backers: ["Sequoia", "Coatue", "Lightspeed"],
    estimatedRevenue: "$150M+ ARR",
    publicBeneficiaries: [
      { ticker: "MSFT", rationale: "Microsoft 365 integration; Copilot competitor validating enterprise AI search", confidence: 65 },
      { ticker: "GOOG", rationale: "Google Workspace integration; GCP deployment", confidence: 60 },
    ],
  },
  {
    companyName: "Harvey",
    website: "harvey.ai",
    sector: "Legal AI",
    stage: "series_c",
    themeLinks: ["AI Agents"],
    backers: ["Kleiner Perkins", "Sequoia", "OpenAI Fund"],
    estimatedRevenue: "$50M+ ARR",
    publicBeneficiaries: [
      { ticker: "MSFT", rationale: "Copilot for Legal; Microsoft Azure deployment", confidence: 65 },
      { ticker: "NVDA", rationale: "LLM inference infrastructure", confidence: 60 },
    ],
  },

  // ── Defense AI ────────────────────────────────────────────────────────────
  {
    companyName: "Anduril",
    website: "anduril.com",
    sector: "Defense Technology",
    stage: "series_f",
    themeLinks: ["Defense AI", "Defense"],
    backers: ["Andreessen Horowitz", "Founders Fund", "Valor Equity"],
    estimatedRevenue: "$500M+ ARR",
    publicBeneficiaries: [
      { ticker: "PLTR", rationale: "Defense AI mission alignment; Palantir + Anduril compete/complement in DoD ecosystem", confidence: 80 },
      { ticker: "LHX", rationale: "L3Harris defense electronics supplier to Anduril programs", confidence: 65 },
      { ticker: "RTX", rationale: "Raytheon defense programs overlap; supply chain integration", confidence: 60 },
    ],
  },
  {
    companyName: "Shield AI",
    website: "shield.ai",
    sector: "Defense Technology",
    stage: "series_f",
    themeLinks: ["Defense AI", "Defense"],
    backers: ["Andreessen Horowitz", "Boeing HorizonX", "Riot Ventures"],
    estimatedRevenue: "$200M+ ARR",
    publicBeneficiaries: [
      { ticker: "PLTR", rationale: "Defense AI software peer; Palantir ecosystem overlap", confidence: 75 },
      { ticker: "LHX", rationale: "L3Harris platform integration partner", confidence: 65 },
      { ticker: "NOC", rationale: "Northrop Grumman autonomous systems collaboration", confidence: 60 },
    ],
  },

  // ── Robotics & Physical AI ────────────────────────────────────────────────
  {
    companyName: "Figure AI",
    website: "figure.ai",
    sector: "Humanoid Robotics",
    stage: "series_b",
    themeLinks: ["Robotics"],
    backers: ["Microsoft", "OpenAI Fund", "Nvidia", "Jeff Bezos"],
    estimatedRevenue: "Pre-revenue",
    publicBeneficiaries: [
      { ticker: "NVDA", rationale: "Physical AI platform; NVIDIA invested + provides Jetson/Thor chips", confidence: 80 },
      { ticker: "MSFT", rationale: "Microsoft invested $675M; Azure AI brain platform", confidence: 85 },
      { ticker: "AMZN", rationale: "Amazon warehouse automation pilot partner; Bezos invested", confidence: 70 },
    ],
  },

  // ── Space Economy ─────────────────────────────────────────────────────────
  {
    companyName: "SpaceX",
    website: "spacex.com",
    sector: "Space / Aerospace",
    stage: "growth",
    themeLinks: ["Space Economy"],
    backers: ["Founders Fund", "Google", "Fidelity"],
    estimatedRevenue: "$9B+ ARR",
    publicBeneficiaries: [
      { ticker: "RKLB", rationale: "Rocket Lab operates in same launch market; SpaceX success expands commercial space", confidence: 70 },
      { ticker: "NOC", rationale: "Northrop Grumman satellite supplier to SpaceX programs", confidence: 65 },
      { ticker: "AMZN", rationale: "Amazon Kuiper competes with Starlink — validates LEO broadband market", confidence: 55 },
    ],
  },

  // ── Cybersecurity ─────────────────────────────────────────────────────────
  {
    companyName: "Wiz",
    website: "wiz.io",
    sector: "Cloud Security",
    stage: "pre_ipo",
    themeLinks: ["Cybersecurity"],
    backers: ["Sequoia", "Index Ventures", "Insight Partners"],
    estimatedRevenue: "$500M+ ARR",
    publicBeneficiaries: [
      { ticker: "GOOG", rationale: "Google attempted $23B acquisition in 2024 — validates cloud security valuation", confidence: 75 },
      { ticker: "MSFT", rationale: "Azure cloud security integration; MSFT Defender peer validation", confidence: 70 },
      { ticker: "AMZN", rationale: "AWS marketplace deployment; cloud CNAPP market expansion", confidence: 65 },
    ],
  },
];

// ─── VC validation tiers ──────────────────────────────────────────────────────
// Higher tier = more validation weight for VC score

const VC_TIER1 = new Set([
  "Sequoia", "Andreessen Horowitz", "Kleiner Perkins", "Accel",
  "Benchmark", "Founders Fund", "Tiger Global", "Index Ventures",
  "IVP", "NEA", "Coatue", "Insight Partners", "General Catalyst",
]);
const VC_TIER2 = new Set([
  "Lightspeed", "GV", "Spark Capital", "Thrive Capital", "D1 Capital",
  "Altimeter", "Franklin Templeton", "Fidelity", "Magnetar Capital",
  "Valor Equity", "CRV", "Greylock", "Bessemer Venture Partners",
]);

function vcScore(backers: string[]): number {
  let score = 0;
  for (const b of backers) {
    if (VC_TIER1.has(b)) score += 12;
    else if (VC_TIER2.has(b)) score += 6;
    else score += 2;
  }
  return Math.min(20, score);
}

// ─── RSS feed fetcher ─────────────────────────────────────────────────────────

const VC_RSS_FEEDS = [
  { name: "a16z",     url: "https://a16z.com/feed/" },
  { name: "Sequoia",  url: "https://www.sequoiacap.com/feed/" },
  { name: "Bessemer", url: "https://www.bvp.com/feed.xml" },
];

async function fetchVCBlogText(timeoutMs = 6000): Promise<string> {
  const texts: string[] = [];

  await Promise.allSettled(
    VC_RSS_FEEDS.map(async feed => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(feed.url, {
          signal: controller.signal,
          headers: { "User-Agent": "InvestmentOS/1.0 RSS reader" },
        });
        clearTimeout(timer);
        if (res.ok) {
          const xml = await res.text();
          texts.push(xml.toLowerCase());
        }
      } catch { /* non-fatal */ }
    })
  );

  return texts.join(" ");
}

function countVCBlogMentions(companyName: string, blogText: string): number {
  const name = companyName.toLowerCase();
  let count  = 0;
  let idx    = blogText.indexOf(name);
  while (idx !== -1) {
    count++;
    idx = blogText.indexOf(name, idx + 1);
  }
  return Math.min(count, 50); // cap at 50 to avoid false inflation
}

// ─── Hacker News Algolia API ──────────────────────────────────────────────────

interface HNSearchResult {
  hits: { title?: string; points?: number | null; num_comments?: number | null }[];
  nbHits: number;
}

async function fetchHNMentions(companyName: string, timeoutMs = 5000): Promise<{ stories: number; points: number }> {
  try {
    const since = Math.floor((Date.now() - 30 * 86400 * 1000) / 1000);
    const q = encodeURIComponent(`"${companyName}"`);
    const url = `https://hn.algolia.com/api/v1/search?query=${q}&tags=story&numericFilters=created_at_i>${since}&hitsPerPage=20`;

    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) return { stories: 0, points: 0 };

    const data = await res.json() as HNSearchResult;
    const stories = Math.min(data.nbHits ?? 0, 50);
    const points  = data.hits.reduce((sum, h) => sum + (h.points ?? 0), 0);
    return { stories, points };
  } catch {
    return { stories: 0, points: 0 };
  }
}

function hnScore(stories: number, points: number): number {
  const storyComponent = Math.min(7, stories * 0.5);
  const pointComponent = Math.min(8, points / 100);
  return Math.min(15, Math.round(storyComponent + pointComponent));
}

// ─── Theme match score ────────────────────────────────────────────────────────

async function getThemeScores(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const rows = await db.themeScout.findMany({ select: { theme: true, score: true } });
    for (const r of rows) map.set(r.theme, r.score);
  } catch { /* table may not exist yet */ }
  return map;
}

function themeScore(themeLinks: string[], themeScores: Map<string, number>): number {
  if (themeLinks.length === 0) return 0;
  const scores = themeLinks.map(t => themeScores.get(t) ?? 0);
  const avg    = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.min(30, Math.round((avg / 100) * 30));
}

// ─── Novelty score ────────────────────────────────────────────────────────────

function computeNoveltyScore(company: PrivateCompanyDef): number {
  // Private companies are always "novel" by definition — we can't own them directly.
  // Novelty = how early / under-discussed this pick is in public discourse.
  // Base: high novelty for pre-series-C companies
  const stageNovelty: Record<string, number> = {
    seed: 40, series_a: 35, series_b: 25, series_c: 20,
    series_d: 15, series_e: 12, series_e_plus: 10,
    pre_ipo: 8, growth: 5,
  };
  const base = stageNovelty[company.stage] ?? 15;
  // Reduce novelty if company is very well-known (many backers, revenue signals)
  const backerPenalty = Math.min(10, company.backers.length * 2);
  return Math.max(5, Math.min(40, base - backerPenalty + 10));
}

// ─── Source diversity score ───────────────────────────────────────────────────

function sourceDiversityScore(
  ycBatch:       string | undefined,
  hnStories:     number,
  vcBlogMentions: number,
): { score: number; count: number } {
  const sources: boolean[] = [
    Boolean(ycBatch),       // YC source
    hnStories > 0,          // HN source
    vcBlogMentions > 0,     // VC blog source
    true,                   // static curated list is always a source
  ];
  const count = sources.filter(Boolean).length;
  const score = Math.min(25, count * 6);
  return { score, count };
}

// ─── Discovery score ──────────────────────────────────────────────────────────

function computeDiscoveryScore(
  themePts:   number,
  srcPts:     number,
  vcPts:      number,
  hnPts:      number,
  noveltyPts: number,
): number {
  return Math.min(100, Math.max(0, Math.round(
    themePts + srcPts + vcPts + hnPts + noveltyPts
  )));
}

// ─── Main scanner ─────────────────────────────────────────────────────────────

export async function scanPrivateCompanies(): Promise<ScoutedPrivateCandidate[]> {
  // Load theme scores and VC blog text in parallel
  const [themeMap, vcBlogText] = await Promise.all([
    getThemeScores(),
    fetchVCBlogText(),
  ]);

  const results: ScoutedPrivateCandidate[] = [];

  for (const company of PRIVATE_COMPANIES) {
    // HN — stagger requests to avoid rate limits
    await new Promise(r => setTimeout(r, 150));
    const hn = await fetchHNMentions(company.companyName);

    const vcMentions = countVCBlogMentions(company.companyName, vcBlogText);
    const themePts   = themeScore(company.themeLinks, themeMap);
    const vcPts      = vcScore(company.backers);
    const hnPts      = hnScore(hn.stories, hn.points);
    const noveltyPts = computeNoveltyScore(company);
    const { score: srcPts, count: srcCount } = sourceDiversityScore(
      company.ycBatch, hn.stories, vcMentions
    );

    results.push({
      ...company,
      discoveryScore:  computeDiscoveryScore(themePts, srcPts, vcPts, hnPts, noveltyPts),
      noveltyScore:    noveltyPts * 2.5,  // scale to 0-100
      sourceCount:     srcCount,
      hnMentions:      hn.stories,
      hnPoints:        hn.points,
      vcBlogMentions:  vcMentions,
      themeScore:      themePts,
      vcScore:         vcPts,
      sourceDiversity: srcCount,
    });
  }

  return results.sort((a, b) => b.discoveryScore - a.discoveryScore);
}

// ─── Persist to DB ────────────────────────────────────────────────────────────

export async function savePrivateCandidates(candidates: ScoutedPrivateCandidate[]): Promise<void> {
  const now = new Date();
  for (const c of candidates) {
    await db.privateCandidate.upsert({
      where:  { companyName: c.companyName },
      create: {
        companyName:         c.companyName,
        website:             c.website,
        sector:              c.sector,
        stage:               c.stage,
        discoveryScore:      c.discoveryScore,
        noveltyScore:        Math.round(c.noveltyScore),
        sourceCount:         c.sourceCount,
        themeLinks:          JSON.stringify(c.themeLinks),
        backers:             JSON.stringify(c.backers),
        estimatedRevenue:    c.estimatedRevenue,
        hnMentions:          c.hnMentions,
        hnPoints:            c.hnPoints,
        vcBlogMentions:      c.vcBlogMentions,
        ycBatch:             c.ycBatch,
        publicBeneficiaries: JSON.stringify(c.publicBeneficiaries),
        status:              "active",
        discoveredAt:        now,
        updatedAt:           now,
      },
      update: {
        discoveryScore:      c.discoveryScore,
        noveltyScore:        Math.round(c.noveltyScore),
        sourceCount:         c.sourceCount,
        themeLinks:          JSON.stringify(c.themeLinks),
        hnMentions:          c.hnMentions,
        hnPoints:            c.hnPoints,
        vcBlogMentions:      c.vcBlogMentions,
        publicBeneficiaries: JSON.stringify(c.publicBeneficiaries),
        updatedAt:           now,
      },
    });
  }
}

// ─── Load from DB ─────────────────────────────────────────────────────────────

export async function getPrivateCandidates(
  status: string = "active",
  limit = 50,
): Promise<ScoutedPrivateCandidate[]> {
  const rows = await db.privateCandidate.findMany({
    where:   { status },
    orderBy: { discoveryScore: "desc" },
    take:    limit,
  });

  return rows.map(r => {
    const base = PRIVATE_COMPANIES.find(p => p.companyName === r.companyName);
    return {
      companyName:         r.companyName,
      website:             r.website ?? undefined,
      sector:              r.sector ?? "",
      stage:               r.stage ?? "",
      themeLinks:          safeJson(r.themeLinks, []),
      backers:             safeJson(r.backers, []),
      estimatedRevenue:    r.estimatedRevenue ?? undefined,
      ycBatch:             r.ycBatch ?? undefined,
      publicBeneficiaries: safeJson(r.publicBeneficiaries, []),
      discoveryScore:      r.discoveryScore,
      noveltyScore:        r.noveltyScore,
      sourceCount:         r.sourceCount,
      hnMentions:          r.hnMentions,
      hnPoints:            r.hnPoints,
      vcBlogMentions:      r.vcBlogMentions,
      themeScore:          0,
      vcScore:             0,
      sourceDiversity:     r.sourceCount,
      ...(base ?? {}),
    };
  });
}

// ─── Report generator ─────────────────────────────────────────────────────────

export async function generatePrivateScoutReport(): Promise<PrivateScoutReport> {
  const candidates = await scanPrivateCompanies();
  await savePrivateCandidates(candidates);

  // Group by theme
  const byTheme: Record<string, ScoutedPrivateCandidate[]> = {};
  for (const c of candidates) {
    for (const theme of c.themeLinks) {
      if (!byTheme[theme]) byTheme[theme] = [];
      byTheme[theme].push(c);
    }
  }

  // Build public beneficiary rollup
  const beneficiaryMap = new Map<string, Set<string>>();
  for (const c of candidates) {
    for (const b of c.publicBeneficiaries) {
      if (!beneficiaryMap.has(b.ticker)) beneficiaryMap.set(b.ticker, new Set());
      beneficiaryMap.get(b.ticker)!.add(c.companyName);
    }
  }

  const topPublicBeneficiaries = Array.from(beneficiaryMap.entries())
    .map(([ticker, companies]) => ({
      ticker,
      linkedCompanies: Array.from(companies),
      exposureCount:   companies.size,
    }))
    .sort((a, b) => b.exposureCount - a.exposureCount)
    .slice(0, 10);

  return {
    topCandidates:          candidates.slice(0, 20),
    byTheme,
    topPublicBeneficiaries,
    generatedAt:            new Date().toISOString(),
    totalScanned:           candidates.length,
  };
}

// ─── Get report from DB (no re-scan) ─────────────────────────────────────────

export async function getPrivateScoutReport(): Promise<PrivateScoutReport | null> {
  const rows = await db.privateCandidate.findMany({
    where:   { status: "active" },
    orderBy: { discoveryScore: "desc" },
  });

  if (rows.length === 0) return null;

  const candidates: ScoutedPrivateCandidate[] = rows.map(r => ({
    companyName:         r.companyName,
    website:             r.website ?? undefined,
    sector:              r.sector ?? "",
    stage:               r.stage ?? "",
    themeLinks:          safeJson(r.themeLinks, []),
    backers:             safeJson(r.backers, []),
    estimatedRevenue:    r.estimatedRevenue ?? undefined,
    ycBatch:             r.ycBatch ?? undefined,
    publicBeneficiaries: safeJson(r.publicBeneficiaries, []),
    discoveryScore:      r.discoveryScore,
    noveltyScore:        r.noveltyScore,
    sourceCount:         r.sourceCount,
    hnMentions:          r.hnMentions,
    hnPoints:            r.hnPoints,
    vcBlogMentions:      r.vcBlogMentions,
    themeScore:          0,
    vcScore:             0,
    sourceDiversity:     r.sourceCount,
  }));

  const byTheme: Record<string, ScoutedPrivateCandidate[]> = {};
  for (const c of candidates) {
    for (const theme of c.themeLinks) {
      if (!byTheme[theme]) byTheme[theme] = [];
      byTheme[theme].push(c);
    }
  }

  const beneficiaryMap = new Map<string, Set<string>>();
  for (const c of candidates) {
    for (const b of c.publicBeneficiaries) {
      if (!beneficiaryMap.has(b.ticker)) beneficiaryMap.set(b.ticker, new Set());
      beneficiaryMap.get(b.ticker)!.add(c.companyName);
    }
  }

  const topPublicBeneficiaries = Array.from(beneficiaryMap.entries())
    .map(([ticker, companies]) => ({
      ticker,
      linkedCompanies: Array.from(companies),
      exposureCount:   companies.size,
    }))
    .sort((a, b) => b.exposureCount - a.exposureCount)
    .slice(0, 10);

  const latest = rows.reduce((a, b) => a.updatedAt > b.updatedAt ? a : b);

  return {
    topCandidates:          candidates.slice(0, 20),
    byTheme,
    topPublicBeneficiaries,
    generatedAt:            latest.updatedAt.toISOString(),
    totalScanned:           candidates.length,
  };
}

// ─── Validation report ────────────────────────────────────────────────────────

export interface PrivateScoutValidationReport {
  top20Candidates: {
    company:     string;
    score:       number;
    theme:       string;
    stage:       string;
    sourceCount: number;
    publicBeneficiaries: string[];
  }[];
  top10PublicBeneficiaries: {
    ticker:          string;
    linkedCompanies: string[];
    exposureCount:   number;
  }[];
  themeBreakdown: Record<string, number>;
}

export async function generateValidationReport(): Promise<PrivateScoutValidationReport> {
  const report = await getPrivateScoutReport();
  if (!report) return { top20Candidates: [], top10PublicBeneficiaries: [], themeBreakdown: {} };

  const themeBreakdown: Record<string, number> = {};
  for (const [theme, comps] of Object.entries(report.byTheme)) {
    themeBreakdown[theme] = comps.length;
  }

  return {
    top20Candidates: report.topCandidates.slice(0, 20).map(c => ({
      company:     c.companyName,
      score:       c.discoveryScore,
      theme:       c.themeLinks[0] ?? "Unknown",
      stage:       c.stage,
      sourceCount: c.sourceCount,
      publicBeneficiaries: c.publicBeneficiaries.map(b => b.ticker),
    })),
    top10PublicBeneficiaries: report.topPublicBeneficiaries,
    themeBreakdown,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeJson<T>(s: string, fallback: T): T {
  try { return JSON.parse(s) as T; } catch { return fallback; }
}
