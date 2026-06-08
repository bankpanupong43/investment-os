// Geopolitical Intelligence Client — Phase 11: Real World Intelligence
//
// Fetches recent news from FMP's general news endpoint, then classifies
// articles into geopolitical regions using keyword matching.
//
// Regions: China/Taiwan, Middle East, Russia/Ukraine
// Severity: critical > high > medium > low (first keyword match wins)

export interface GeoEventData {
  region: string;
  eventTitle: string;
  severity: "low" | "medium" | "high" | "critical";
  affectedSectors: string[];
  source: string;
  sourceUrl: string;
  eventDate: Date;
}

// ─── Region definitions ───────────────────────────────────────────────────────

const GEO_REGIONS: {
  name: string;
  keywords: string[];
  relatedSectors: string[];
}[] = [
  {
    name: "China/Taiwan",
    keywords: [
      "taiwan", "taiwan strait", "pla ", "china tension", "beijing military",
      "semiconductor ban", "chip export", "south china sea", "xi jinping military",
      "chinese military", "tsmc geopolit", "china blockade",
    ],
    relatedSectors: ["Technology", "Semiconductors", "Defense"],
  },
  {
    name: "Middle East",
    keywords: [
      "israel", "iran", "hamas", "hezbollah", "gaza strip", "middle east conflict",
      "strait of hormuz", "opec cut", "saudi arabi", "houthi", "yemen attack",
      "oil supply disruption", "persian gulf",
    ],
    relatedSectors: ["Energy", "Defense", "Industrials"],
  },
  {
    name: "Russia/Ukraine",
    keywords: [
      "ukraine war", "russia ukraine", "putin military", "zelensky", "nato expansion",
      "crimea", "russian invasion", "ukraine front", "russia sanction",
      "russian forces", "ukraine attack",
    ],
    relatedSectors: ["Energy", "Defense", "Agriculture"],
  },
];

// ─── Severity scoring ─────────────────────────────────────────────────────────
// Ordered from most to least severe — first match wins.

const SEVERITY_KEYWORDS: { level: "critical" | "high" | "medium" | "low"; words: string[] }[] = [
  { level: "critical", words: ["invasion", "nuclear", "war declared", "attack launched", "missile strike", "blockade", "war breaks", "bombs", "detonation"] },
  { level: "high",     words: ["military attack", "escalation", "troops mobilized", "sanctions imposed", "conflict erupts", "combat", "offensive", "provocation", "warship", "military drill near"] },
  { level: "medium",   words: ["tension", "military drill", "warning issued", "standoff", "dispute", "skirmish", "embargo", "threat", "military buildup"] },
  { level: "low",      words: ["talks", "negotiations", "ceasefire", "meeting", "diplomacy", "monitoring", "agreement", "summit"] },
];

function classifySeverity(text: string): "low" | "medium" | "high" | "critical" {
  const lower = text.toLowerCase();
  for (const { level, words } of SEVERITY_KEYWORDS) {
    if (words.some(w => lower.includes(w))) return level;
  }
  return "low";
}

function matchRegion(text: string): { region: string; sectors: string[] } | null {
  const lower = text.toLowerCase();
  for (const region of GEO_REGIONS) {
    if (region.keywords.some(k => lower.includes(k))) {
      return { region: region.name, sectors: region.relatedSectors };
    }
  }
  return null;
}

// ─── FMP news fetch ───────────────────────────────────────────────────────────

interface FMPNewsArticle {
  publishedDate?: string;
  title?: string;
  site?: string;
  url?: string;
  text?: string;
}

export async function fetchGeoEvents(apiKey: string): Promise<GeoEventData[]> {
  try {
    const url = `https://financialmodelingprep.com/stable/news?limit=40&apikey=${apiKey}`;
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];

    const articles = (await res.json()) as FMPNewsArticle[];
    if (!Array.isArray(articles)) return [];

    const events: GeoEventData[] = [];
    const seenKeys = new Set<string>();

    for (const article of articles) {
      if (!article.title || !article.publishedDate) continue;

      const fullText = `${article.title} ${article.text ?? ""}`;
      const match = matchRegion(fullText);
      if (!match) continue;

      // Dedup by normalized title prefix + region
      const dedupeKey = `${match.region}:${article.title.substring(0, 50).toLowerCase().replace(/\s+/g, " ")}`;
      if (seenKeys.has(dedupeKey)) continue;
      seenKeys.add(dedupeKey);

      const eventDate = new Date(article.publishedDate);
      if (isNaN(eventDate.getTime())) continue;

      events.push({
        region: match.region,
        eventTitle: article.title.substring(0, 200),
        severity: classifySeverity(fullText),
        affectedSectors: match.sectors,
        source: article.site ?? "Unknown",
        sourceUrl: article.url ?? "",
        eventDate,
      });
    }

    // Limit to 3 events per region (most recent first)
    const byRegion = new Map<string, GeoEventData[]>();
    for (const ev of events) {
      const list = byRegion.get(ev.region) ?? [];
      list.push(ev);
      byRegion.set(ev.region, list);
    }

    const limited: GeoEventData[] = [];
    for (const list of byRegion.values()) {
      list.sort((a, b) => b.eventDate.getTime() - a.eventDate.getTime());
      limited.push(...list.slice(0, 3));
    }

    return limited;
  } catch {
    return [];
  }
}
