// Theme Scout Engine — Phase 27A
//
// Scans all Brain OS sources for emerging, accelerating, and weakening themes
// before they reach portfolio consensus.
//
// Signal sources:
//   1. NewsletterItem — institutional (BlackRock +3, MS +3, JPMorgan +3)
//                       newsletters  (Daily Upside +1, Axios +1, Sherwood +1, Money Stuff +1)
//   2. MorningBrief  — technologySummary text (+2 per brief day)
//   3. DiscoveryCandidate — radar themes (+radarScore×0.02 per ticker, capped at 20)
//   4. OpportunityScore  — top tickers per theme (+avgScore×0.20, capped at 20)
//   5. CommitteeSession  — Buy/Strong Buy verdicts for theme tickers (+10/+5)
//
// Score formula (0-100):
//   institutionalScore (0-30) + newsletterScore (0-10) + morningBriefScore (0-10)
//   + radarBonus (0-20) + opportunityBonus (0-20) + committeeBonus (0-10)
//
// Momentum: compares annualized 7d rate vs 30d rate
//   Rising  = 7d annualized > 30d × 1.25
//   Falling = 7d annualized < 30d × 0.75
//   Stable  = otherwise
//
// Status:
//   emerging:     firstSeen within 45d OR score >= 20 AND no previous record
//   accelerating: existing record AND momentum = Rising AND score >= 30
//   weakening:    existing record AND momentum = Falling AND score < 50
//   stable:       otherwise

import { db } from "./db";

// ─── Theme Definitions ────────────────────────────────────────────────────────

export interface ScoutThemeDef {
  keywords: string[];      // case-insensitive keywords to match in article text
  tickers: string[];       // relevant tickers for opportunity + committee scoring
  isExtended: boolean;     // true = not in existing allocation map (new/emergent)
  description: string;     // one-liner for wiki
  drivers: string[];       // base narrative drivers (used when no data available)
  risks: string[];         // key risks for wiki
}

export const SCOUT_THEMES: Record<string, ScoutThemeDef> = {
  "AI Infrastructure": {
    keywords: ["artificial intelligence", " ai ", "gpu", "data center", "llm", "large language model", "openai", "nvidia", "nvda", "machine learning", "microsoft ai", "google ai", "aws", "cloud infrastructure"],
    tickers: ["NVDA", "MSFT", "GOOG", "GOOGL", "META", "AMZN", "SMCI", "TSM"],
    isExtended: false,
    description: "Data centers, GPUs, and compute stack powering the AI buildout.",
    drivers: ["Hyperscaler capex acceleration", "GPU supply constraints", "Enterprise AI adoption"],
    risks: ["Valuation premium", "Power constraints", "Regulatory scrutiny"],
  },
  "AI Agents": {
    keywords: ["ai agent", "agentic ai", "autonomous agent", "agent framework", "multi-agent", "ai workflow", "ai automation", "copilot", "ai assistant", "reasoning model"],
    tickers: ["NVDA", "MSFT", "GOOG", "AMZN", "ORCL"],
    isExtended: true,
    description: "Software agents that autonomously execute multi-step workflows — the next layer above LLMs.",
    drivers: ["Enterprise productivity gains", "Reasoning model capabilities", "Workflow automation demand"],
    risks: ["Reliability at scale", "Security and hallucination risk", "Commoditization pressure"],
  },
  "Semiconductors": {
    keywords: ["semiconductor", "chip", "chipmaker", "tsmc", "asml", "foundry", "wafer", "fab ", "advanced packaging", "hbm", "lithography"],
    tickers: ["TSM", "ASML", "AMD", "NVDA", "INTC", "QCOM", "MU", "AMAT", "LRCX"],
    isExtended: false,
    description: "Chip design and fabrication enabling the next compute era.",
    drivers: ["AI training demand", "Geopolitical chip sovereignty", "Advanced node ramp"],
    risks: ["Cyclical demand swings", "China restrictions", "CAPEX intensity"],
  },
  "Defense": {
    keywords: ["defense", "defence", "military", "weapon", "nato", "pentagon", "lockheed", "raytheon", "defense spending", "geopolit", "war ", "conflict"],
    tickers: ["ITA", "LMT", "RTX", "NOC", "GD", "BA"],
    isExtended: false,
    description: "Elevated global defense budgets across NATO and Indo-Pacific.",
    drivers: ["NATO 2% GDP target", "Indo-Pacific tensions", "Ukraine replenishment"],
    risks: ["Budget sequestration risk", "Program delays", "Concentration in legacy platforms"],
  },
  "Defense AI": {
    keywords: ["defense ai", "ai military", "autonomous weapon", "ai drone", "palantir", "pltr", "military ai", "ai warfare", "ktos", "avav", "shield ai"],
    tickers: ["PLTR", "KTOS", "AVAV", "LMT", "NOC"],
    isExtended: true,
    description: "AI-enabled defense systems — autonomous drones, targeting, logistics intelligence.",
    drivers: ["DOD AI modernization", "Ukraine drone warfare learnings", "Autonomy in contested environments"],
    risks: ["Ethics regulation", "Program cancellation risk", "Small float / liquidity risk"],
  },
  "Healthcare & GLP-1": {
    keywords: ["glp-1", "obesity drug", "ozempic", "wegovy", "novo nordisk", "eli lilly", "pharmaceutical", "biotech", "drug approval", "fda", "weight loss drug", "tirzepatide"],
    tickers: ["NVO", "LLY", "JNJ", "UNH", "ABBV"],
    isExtended: false,
    description: "GLP-1 revolution, medical devices, and biotech pipeline.",
    drivers: ["GLP-1 market expansion", "Pipeline readouts", "Biosimilar competition delay"],
    risks: ["Reimbursement pressure", "Side effect profile", "Manufacturing capacity"],
  },
  "Nuclear Energy": {
    keywords: ["nuclear", "uranium", "small modular reactor", "smr", "nuclear power", "constellation energy", "ceg", "cameco", "nuclear renaissance", "clean nuclear", "fission"],
    tickers: ["CEG", "CCJ", "NNE"],
    isExtended: true,
    description: "Clean baseload power via nuclear — driven by AI data center electricity demand.",
    drivers: ["Data center power demand", "Carbon-free baseload need", "Small modular reactor commercialization"],
    risks: ["Regulatory approval timelines", "Capital intensity", "Public acceptance"],
  },
  "Space Economy": {
    keywords: ["space economy", "satellite", "spacex", "rocket lab", "rklb", "launch vehicle", "low earth orbit", "starlink", "commercial space", "space infrastructure"],
    tickers: ["RKLB", "BA", "LMT", "NOC"],
    isExtended: true,
    description: "Commercial launch, satellite constellations, and the emerging space economy.",
    drivers: ["Starlink competitive dynamics", "Satellite internet economics", "Government contracts"],
    risks: ["Capex heavy", "Launch failure risk", "SpaceX dominance"],
  },
  "Cybersecurity": {
    keywords: ["cybersecurity", "cyber security", "cyber attack", "ransomware", "data breach", "crowdstrike", "palo alto", "cloudflare", "zero trust", "endpoint security", "soc"],
    tickers: ["CRWD", "PANW", "ZS", "NET", "FTNT", "S", "OKTA"],
    isExtended: false,
    description: "Zero-trust architecture adoption across enterprise and government.",
    drivers: ["Nation-state attack frequency", "Cloud migration security gaps", "Regulatory mandates"],
    risks: ["Consolidation pressure on smaller vendors", "AI-enabled attacks", "Price competition"],
  },
  "Power Grid": {
    keywords: ["power grid", "electricity demand", "grid upgrade", "energy infrastructure", "data center power", "transmission", "grid investment", "hyperscale power", "eaton", "vistra"],
    tickers: ["ETN", "VST", "CEG", "NEE"],
    isExtended: true,
    description: "Power infrastructure upgrades driven by AI data center and EV electricity demand.",
    drivers: ["Data center power constraints", "EV grid load", "Grid modernization policy"],
    risks: ["Permitting bottlenecks", "Utility regulation", "Supply chain for transformers"],
  },
  "Robotics": {
    keywords: ["robot", "robotics", "humanoid robot", "optimus", "tesla robot", "factory automation", "industrial robot", "boston dynamics", "physical ai", "automation"],
    tickers: ["HON", "EMR", "ISRG", "ROK"],
    isExtended: true,
    description: "Physical automation across factory floors, warehouses, and healthcare.",
    drivers: ["Labor cost inflation", "Physical AI breakthroughs", "Humanoid commercialization"],
    risks: ["Long commercialization timelines", "Energy requirements", "Reliability at scale"],
  },
  "Digital Payments": {
    keywords: ["digital payment", "fintech", "payment processing", "visa", "mastercard", "paypal", "stripe", "buy now pay later", "bnpl", "stablecoin", "payment rail"],
    tickers: ["V", "MA", "PYPL"],
    isExtended: true,
    description: "Digital payment rails, cross-border fintech, and stablecoin infrastructure.",
    drivers: ["E-commerce volume growth", "Stablecoin regulation clarity", "Cross-border payment demand"],
    risks: ["Central bank digital currencies", "Big Tech disintermediation", "Regulation"],
  },
  "Data Centers": {
    keywords: ["data center", "colocation", "hyperscale", "equinix", "digital realty", "cloud infrastructure", "server farm", "ai data center", "rack density"],
    tickers: ["EQIX", "DLR"],
    isExtended: true,
    description: "Physical compute infrastructure — land, power, cooling, and connectivity.",
    drivers: ["AI training and inference workloads", "Hyperscaler lease demand", "Power density increases"],
    risks: ["Power availability", "Construction timelines", "Geographic concentration"],
  },
  "Energy": {
    keywords: ["oil", "gas", "energy", "crude", "opec", "petroleum", "lng", "natural gas", "energy price", "brent"],
    tickers: ["XOM", "CVX", "COP", "VLO", "PSX"],
    isExtended: false,
    description: "Traditional energy amid geopolitical supply shifts and energy transition.",
    drivers: ["OPEC+ production discipline", "LNG export demand", "Energy transition timeline"],
    risks: ["Demand peak narrative", "Regulatory constraints", "Geopolitical disruption"],
  },
};

// Source weight constants
const INSTITUTIONAL_WEIGHT = 3;  // per article from BlackRock, Morgan Stanley, JPMorgan
const NEWSLETTER_WEIGHT    = 1;  // per article from newsletters
const MORNING_BRIEF_WEIGHT = 2;  // per brief day that mentions theme keyword

const INSTITUTIONAL_SOURCES = new Set(["blackrock", "morgan_stanley", "jpmorgan"]);

// Max normalization constants for each sub-score component
const MAX_INSTITUTIONAL = 30;  // 10 articles × 3 pts
const MAX_NEWSLETTER    = 10;  // 10 articles × 1 pt
const MAX_BRIEF         = 10;  // 5 brief days × 2 pts
const MAX_RADAR         = 20;  // up to 10 radar candidates × 2 pts each
const MAX_OPPORTUNITY   = 20;  // avg opp score × 0.20
const MAX_COMMITTEE     = 10;  // committee bonus

// ─── Types ────────────────────────────────────────────────────────────────────

export type ThemeStatus   = "emerging" | "accelerating" | "weakening" | "stable";
export type ThemeMomentum = "Rising" | "Stable" | "Falling";
export type ThemeConfidence = "high" | "medium" | "low";

export interface ThemeScoutResult {
  theme:        string;
  score:        number;
  score7d:      number;
  score30d:     number;
  score90d:     number;
  status:       ThemeStatus;
  confidence:   ThemeConfidence;
  momentum:     ThemeMomentum;
  sources:      string[];
  mentionCount: number;
  candidates:   ThemeCandidate[];
  drivers:      string[];
  isExtended:   boolean;
}

export interface ThemeCandidate {
  ticker:     string;
  reason:     string;
  radarScore: number;
}

export interface ThemeScoutReport {
  emerging:     ThemeScoutResult[];
  accelerating: ThemeScoutResult[];
  weakening:    ThemeScoutResult[];
  stable:       ThemeScoutResult[];
  all:          ThemeScoutResult[];
  generatedAt:  string;
}

// ─── Keyword matcher ──────────────────────────────────────────────────────────

function matchesTheme(text: string, def: ScoutThemeDef): boolean {
  const lower = text.toLowerCase();
  return def.keywords.some(kw => lower.includes(kw.toLowerCase()));
}

function buildArticleText(item: {
  title: string;
  summary: string;
  keyPoints: string;
  marketImplications: string;
}): string {
  const summary   = safeParseArray(item.summary).join(" ");
  const keyPoints = safeParseArray(item.keyPoints).join(" ");
  return `${item.title} ${summary} ${keyPoints}`.toLowerCase();
}

function safeParseArray(s: string): string[] {
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; }
}

// ─── Signal Scanner ───────────────────────────────────────────────────────────

interface WindowSignals {
  institutional: number;
  newsletter:    number;
  sources:       Set<string>;
  mentions:      number;
}

function emptyWindow(): WindowSignals {
  return { institutional: 0, newsletter: 0, sources: new Set(), mentions: 0 };
}

// ─── scanThemes ──────────────────────────────────────────────────────────────

export async function scanThemes(): Promise<ThemeScoutResult[]> {
  const now    = Date.now();
  const since7d  = new Date(now - 7  * 86400 * 1000);
  const since30d = new Date(now - 30 * 86400 * 1000);
  const since90d = new Date(now - 90 * 86400 * 1000);

  // Load all data sources in parallel
  const [newsletters, morningBriefs, radarCandidates, opportunityScores, committeeSessions] = await Promise.all([
    db.newsletterItem.findMany({
      where: { publishedAt: { gte: since90d } },
      select: { source: true, title: true, summary: true, keyPoints: true, marketImplications: true, publishedAt: true },
    }),
    db.morningBrief.findMany({
      where: { briefingDate: { gte: since90d } },
      select: { technologySummary: true, macroSummary: true, briefingDate: true },
    }),
    db.discoveryCandidate.findMany({
      where: { status: "active" },
      select: { ticker: true, themes: true, radarScore: true, discoveryReason: true },
    }),
    db.opportunityScore.findMany({
      orderBy: { generatedAt: "desc" },
      distinct: ["ticker"],
      select: { ticker: true, opportunityScore: true },
    }),
    db.committeeSession.findMany({
      orderBy: { createdAt: "desc" },
      distinct: ["ticker"],
      select: { ticker: true, conviction: true },
    }),
  ]);

  // Build lookup maps
  const oppMap       = new Map(opportunityScores.map(o => [o.ticker, o.opportunityScore]));
  const committeeMap = new Map(committeeSessions.map(s => [s.ticker, s.conviction]));

  // Load existing ThemeScout records for firstSeen tracking
  const existingScouts = await db.themeScout.findMany({ select: { theme: true, firstSeen: true, score: true } });
  const existingMap = new Map(existingScouts.map(s => [s.theme, s]));

  const results: ThemeScoutResult[] = [];

  for (const [themeName, def] of Object.entries(SCOUT_THEMES)) {
    // ── Newsletter signals per window ─────────────────────────────────────────
    const win7d  = emptyWindow();
    const win30d = emptyWindow();
    const win90d = emptyWindow();

    for (const item of newsletters) {
      const text = buildArticleText(item);
      if (!matchesTheme(text, def)) continue;

      const isInstitutional = INSTITUTIONAL_SOURCES.has(item.source);
      const pts = isInstitutional ? INSTITUTIONAL_WEIGHT : NEWSLETTER_WEIGHT;

      for (const [win, since] of [[win90d, since90d], [win30d, since30d], [win7d, since7d]] as const) {
        if (item.publishedAt >= since) {
          if (isInstitutional) win.institutional += pts;
          else win.newsletter += pts;
          win.sources.add(item.source);
          win.mentions++;
        }
      }
    }

    // ── Morning brief signals per window ──────────────────────────────────────
    let briefScore7d  = 0;
    let briefScore30d = 0;
    let briefScore90d = 0;

    for (const brief of morningBriefs) {
      const techText = (() => {
        try { const t = JSON.parse(brief.technologySummary); return typeof t === "object" ? JSON.stringify(t) : ""; } catch { return ""; }
      })();
      const macroText = (() => {
        try { const m = JSON.parse(brief.macroSummary); return typeof m === "object" ? JSON.stringify(m) : ""; } catch { return ""; }
      })();
      const combined = `${techText} ${macroText}`.toLowerCase();
      if (!matchesTheme(combined, def)) continue;

      if (brief.briefingDate >= since90d) briefScore90d += MORNING_BRIEF_WEIGHT;
      if (brief.briefingDate >= since30d) briefScore30d += MORNING_BRIEF_WEIGHT;
      if (brief.briefingDate >= since7d)  briefScore7d  += MORNING_BRIEF_WEIGHT;
    }

    // ── Radar bonus ───────────────────────────────────────────────────────────
    const matchingCandidates = radarCandidates.filter(c => {
      try {
        const themes: string[] = JSON.parse(c.themes);
        return themes.some(t => t.toLowerCase() === themeName.toLowerCase() ||
          def.tickers.includes(c.ticker));
      } catch { return def.tickers.includes(c.ticker); }
    });

    const radarBonus = Math.min(
      MAX_RADAR,
      matchingCandidates.reduce((sum, c) => sum + (c.radarScore / 100) * 2, 0)
    );

    const candidates: ThemeCandidate[] = matchingCandidates
      .sort((a, b) => b.radarScore - a.radarScore)
      .slice(0, 5)
      .map(c => ({ ticker: c.ticker, reason: c.discoveryReason, radarScore: Math.round(c.radarScore) }));

    // ── Opportunity bonus ─────────────────────────────────────────────────────
    const themeOppScores = def.tickers
      .map(t => oppMap.get(t))
      .filter((s): s is number => s != null)
      .sort((a, b) => b - a)
      .slice(0, 5);

    const avgOppScore = themeOppScores.length > 0
      ? themeOppScores.reduce((a, b) => a + b, 0) / themeOppScores.length
      : 0;
    const opportunityBonus = Math.min(MAX_OPPORTUNITY, (avgOppScore / 100) * MAX_OPPORTUNITY);

    // ── Committee bonus ───────────────────────────────────────────────────────
    const committeeBonus = Math.min(
      MAX_COMMITTEE,
      def.tickers.reduce((sum, t) => {
        const conviction = committeeMap.get(t);
        if (conviction === "Strong Buy") return sum + 10;
        if (conviction === "Buy") return sum + 5;
        if (conviction === "Watch") return sum + 2;
        return sum;
      }, 0)
    );

    // ── Compute window scores (0-100) ─────────────────────────────────────────
    function rawToScore(win: WindowSignals, briefScore: number, divisor: number): number {
      const raw = Math.min(MAX_INSTITUTIONAL, win.institutional)
        + Math.min(MAX_NEWSLETTER, win.newsletter)
        + Math.min(MAX_BRIEF, briefScore);
      const maxRaw = MAX_INSTITUTIONAL + MAX_NEWSLETTER + MAX_BRIEF;
      return Math.min(100, (raw / maxRaw) * 100 * divisor);
    }

    // Annualize 7d to make comparable with 30d baseline
    const ANNUALIZE_7D  = 30 / 7;   // scale to 30d equivalent
    const score7dRaw  = rawToScore(win7d,  briefScore7d,  ANNUALIZE_7D);
    const score30dRaw = rawToScore(win30d, briefScore30d, 1);
    const score90dRaw = rawToScore(win90d, briefScore90d, 30 / 90);

    // Composite score = 30d + bonuses
    const compositeRaw = score30dRaw + radarBonus + opportunityBonus + committeeBonus;
    const score = Math.min(100, Math.max(0, Math.round(compositeRaw)));
    const score30d = Math.min(100, Math.max(0, Math.round(score30dRaw)));
    const score7d  = Math.min(100, Math.max(0, Math.round(score7dRaw)));
    const score90d = Math.min(100, Math.max(0, Math.round(score90dRaw)));

    // ── Momentum ──────────────────────────────────────────────────────────────
    let momentum: ThemeMomentum = "Stable";
    if (score7d > score30d * 1.25)  momentum = "Rising";
    else if (score7d < score30d * 0.75) momentum = "Falling";

    // ── Status ────────────────────────────────────────────────────────────────
    const existing = existingMap.get(themeName);
    const isNewTheme = !existing;
    const firstSeenDaysAgo = existing
      ? (Date.now() - existing.firstSeen.getTime()) / 86400000
      : 0;

    let status: ThemeStatus;
    if (score < 5) {
      status = "stable";
    } else if (isNewTheme && score >= 15) {
      status = "emerging";
    } else if (!isNewTheme && firstSeenDaysAgo < 45 && score >= 15) {
      status = "emerging";
    } else if (!isNewTheme && momentum === "Rising" && score >= 25) {
      status = "accelerating";
    } else if (!isNewTheme && momentum === "Falling" && score < 45) {
      status = "weakening";
    } else {
      status = "stable";
    }

    // ── Confidence ────────────────────────────────────────────────────────────
    const sourceCount = win90d.sources.size + (matchingCandidates.length > 0 ? 1 : 0) + (themeOppScores.length > 0 ? 1 : 0);
    const confidence: ThemeConfidence =
      score >= 60 && sourceCount >= 3 ? "high" :
      score >= 30 && sourceCount >= 2 ? "medium" :
      "low";

    // ── Driver narratives ─────────────────────────────────────────────────────
    const drivers: string[] = [];
    if (win30d.institutional > 0) {
      drivers.push(`${win30d.sources.size > 0 ? [...win30d.sources].filter(s => INSTITUTIONAL_SOURCES.has(s)).map(s => s.replace("_", " ")).join(", ") : "Institutional sources"} flagged this theme`);
    }
    if (matchingCandidates.length > 0) {
      drivers.push(`${matchingCandidates.length} radar candidate${matchingCandidates.length > 1 ? "s" : ""} (${matchingCandidates.slice(0, 3).map(c => c.ticker).join(", ")})`);
    }
    if (opportunityBonus > 5) {
      drivers.push(`High opportunity scores for theme tickers (avg ${avgOppScore.toFixed(0)})`);
    }
    if (committeeBonus > 0) {
      const buys = def.tickers.filter(t => committeeMap.get(t) === "Buy" || committeeMap.get(t) === "Strong Buy");
      if (buys.length > 0) drivers.push(`Committee: ${buys.join(", ")} rated Buy or better`);
    }
    if (drivers.length === 0) drivers.push(...def.drivers.slice(0, 2));

    // ── Watchlist candidates when score > 75 ──────────────────────────────────
    const watchlistCandidates: ThemeCandidate[] = score >= 75
      ? candidates.slice(0, 5)
      : [];

    const allSources = [...win90d.sources].map(s => s.replace(/_/g, " "));

    results.push({
      theme:        themeName,
      score,
      score7d,
      score30d,
      score90d,
      status,
      confidence,
      momentum,
      sources:      allSources,
      mentionCount: win90d.mentions,
      candidates:   watchlistCandidates,
      drivers,
      isExtended:   def.isExtended,
    });
  }

  return results;
}

// ─── rankThemes ───────────────────────────────────────────────────────────────

export function rankThemes(results: ThemeScoutResult[]): ThemeScoutResult[] {
  return [...results].sort((a, b) => {
    // Sort by status priority, then score
    const statusOrder: Record<ThemeStatus, number> = {
      emerging: 4, accelerating: 3, stable: 2, weakening: 1,
    };
    const statusDiff = (statusOrder[b.status] ?? 0) - (statusOrder[a.status] ?? 0);
    if (statusDiff !== 0) return statusDiff;
    return b.score - a.score;
  });
}

// ─── generateThemeScoutReport ─────────────────────────────────────────────────

export async function generateThemeScoutReport(): Promise<ThemeScoutReport> {
  const raw    = await scanThemes();
  const ranked = rankThemes(raw.filter(r => r.score > 0 || r.status === "emerging"));

  return {
    emerging:     ranked.filter(r => r.status === "emerging"),
    accelerating: ranked.filter(r => r.status === "accelerating"),
    weakening:    ranked.filter(r => r.status === "weakening"),
    stable:       ranked.filter(r => r.status === "stable"),
    all:          ranked,
    generatedAt:  new Date().toISOString(),
  };
}

// ─── saveThemeScoutData ───────────────────────────────────────────────────────

export async function saveThemeScoutData(results: ThemeScoutResult[]): Promise<void> {
  const now = new Date();

  for (const r of results) {
    const existing = await db.themeScout.findUnique({ where: { theme: r.theme }, select: { firstSeen: true } });

    await db.themeScout.upsert({
      where: { theme: r.theme },
      create: {
        theme:        r.theme,
        score:        r.score,
        score7d:      r.score7d,
        score30d:     r.score30d,
        score90d:     r.score90d,
        status:       r.status,
        confidence:   r.confidence,
        momentum:     r.momentum,
        sources:      JSON.stringify(r.sources),
        mentionCount: r.mentionCount,
        firstSeen:    now,
        lastSeen:     now,
        candidates:   JSON.stringify(r.candidates),
        drivers:      JSON.stringify(r.drivers),
        isExtended:   r.isExtended,
        refreshedAt:  now,
      },
      update: {
        score:        r.score,
        score7d:      r.score7d,
        score30d:     r.score30d,
        score90d:     r.score90d,
        status:       r.status,
        confidence:   r.confidence,
        momentum:     r.momentum,
        sources:      JSON.stringify(r.sources),
        mentionCount: r.mentionCount,
        firstSeen:    existing?.firstSeen ?? now,  // preserve original firstSeen
        lastSeen:     now,
        candidates:   JSON.stringify(r.candidates),
        drivers:      JSON.stringify(r.drivers),
        isExtended:   r.isExtended,
        refreshedAt:  now,
      },
    });
  }
}

// ─── getThemeScoutReport ──────────────────────────────────────────────────────

export async function getThemeScoutReport(): Promise<ThemeScoutReport | null> {
  const rows = await db.themeScout.findMany({
    orderBy: { score: "desc" },
  });

  if (rows.length === 0) return null;

  const results: ThemeScoutResult[] = rows.map(r => ({
    theme:        r.theme,
    score:        r.score,
    score7d:      r.score7d,
    score30d:     r.score30d,
    score90d:     r.score90d,
    status:       r.status as ThemeStatus,
    confidence:   r.confidence as ThemeConfidence,
    momentum:     r.momentum as ThemeMomentum,
    sources:      safeParseArray(r.sources),
    mentionCount: r.mentionCount,
    candidates:   (() => { try { return JSON.parse(r.candidates) as ThemeCandidate[]; } catch { return []; } })(),
    drivers:      safeParseArray(r.drivers),
    isExtended:   r.isExtended,
  }));

  const latest = rows.reduce((a, b) => a.refreshedAt > b.refreshedAt ? a : b);

  return {
    emerging:     results.filter(r => r.status === "emerging"),
    accelerating: results.filter(r => r.status === "accelerating"),
    weakening:    results.filter(r => r.status === "weakening"),
    stable:       results.filter(r => r.status === "stable"),
    all:          results,
    generatedAt:  latest.refreshedAt.toISOString(),
  };
}

// ─── Wiki integration ─────────────────────────────────────────────────────────

export function writeThemeScoutToWiki(results: ThemeScoutResult[]): void {
  try {
    const { upsertThemePage } = require("./wiki-service") as typeof import("./wiki-service");
    const def = SCOUT_THEMES;

    for (const r of results) {
      if (r.score < 20) continue;  // only write meaningful themes

      upsertThemePage({
        name:         r.theme,
        summary:      `**Score: ${r.score}/100** · ${r.status.charAt(0).toUpperCase() + r.status.slice(1)} · ${r.momentum}\n\n${def[r.theme]?.description ?? ""}`,
        keyCompanies: r.candidates.map(c => ({ ticker: c.ticker, reason: c.reason })),
        opportunities: r.drivers,
        risks:         def[r.theme]?.risks ?? [],
        source:        "radar",
      });
    }
  } catch {
    // Wiki write failure never blocks scoring
  }
}
