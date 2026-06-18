// Research Queue Engine — Phase 27B
//
// Reads ThemeScout data and surfaces the "what should I investigate next?"
// answer by separating Theme Strength (score) from Theme Novelty.
//
// Outputs three ranked lists:
//   topResearchTargets  — ranked by researchPriority DESC  (what to study next)
//   highNoveltyThemes   — ranked by noveltyScore DESC      (most under-researched)
//   underOwnedThemes    — score ≥ 30 + portfolioExposure < 15%  (conviction gap)
//
// Also writes Research Queue wiki pages for priority ≥ 70 AND novelty ≥ 70 themes.

import * as fs   from "fs";
import * as path from "path";
import { db }    from "./db";
import { resolveBrainOsPath } from "./shared-paths";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ResearchTarget {
  theme:                string;
  researchPriority:     number;
  noveltyScore:         number;
  score:                number;
  momentum:             string;
  status:               string;
  portfolioExposurePct: number;
  candidates:           { ticker: string; reason: string; radarScore: number }[];
  drivers:              string[];
  sources:              string[];
  isExtended:           boolean;
  whyNow:               string;
}

export interface ResearchQueue {
  topResearchTargets:    ResearchTarget[];
  highNoveltyThemes:     ResearchTarget[];
  underOwnedThemes:      ResearchTarget[];
  generatedAt:           string;
  themesNeedingResearch: number;
}

// ─── Why-Now narrative ────────────────────────────────────────────────────────

function buildWhyNow(r: ResearchTarget): string {
  if (r.portfolioExposurePct === 0 && r.score >= 30) {
    return `Strong theme signal (${r.score}/100) but zero portfolio exposure`;
  }
  if (r.isExtended && r.momentum === "Rising") {
    return `Extended theme gaining momentum — not yet in your allocation framework`;
  }
  if (r.noveltyScore >= 80) {
    return `High novelty (${r.noveltyScore}/100) — minimal existing research coverage`;
  }
  if (r.portfolioExposurePct < 15 && r.noveltyScore >= 60) {
    return `Under-represented (${r.portfolioExposurePct}% exposure) with rising institutional interest`;
  }
  if (r.momentum === "Rising" && r.noveltyScore >= 50) {
    return `Rapid signal growth in sources you don't currently track`;
  }
  return `Score ${r.score}/100 · Novelty ${r.noveltyScore}/100 · ${r.momentum} momentum`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function generateResearchQueue(): Promise<ResearchQueue> {
  const rows = await db.themeScout.findMany({
    orderBy: { researchPriority: "desc" },
  });

  if (rows.length === 0) {
    return {
      topResearchTargets:    [],
      highNoveltyThemes:     [],
      underOwnedThemes:      [],
      generatedAt:           new Date().toISOString(),
      themesNeedingResearch: 0,
    };
  }

  const all: ResearchTarget[] = rows.map(r => {
    const candidates = (() => { try { return JSON.parse(r.candidates); } catch { return []; } })();
    const drivers    = (() => { try { return JSON.parse(r.drivers); }    catch { return []; } })();
    const sources    = (() => { try { return JSON.parse(r.sources); }    catch { return []; } })();
    const base: ResearchTarget = {
      theme:                r.theme,
      researchPriority:     r.researchPriority,
      noveltyScore:         r.noveltyScore,
      score:                r.score,
      momentum:             r.momentum,
      status:               r.status,
      portfolioExposurePct: r.portfolioExposurePct,
      candidates,
      drivers,
      sources,
      isExtended:           r.isExtended,
      whyNow:               "",
    };
    return { ...base, whyNow: buildWhyNow(base) };
  });

  const topResearchTargets = all
    .filter(t => t.researchPriority >= 20 || t.noveltyScore >= 50)
    .sort((a, b) => b.researchPriority - a.researchPriority)
    .slice(0, 5);

  const highNoveltyThemes = all
    .filter(t => t.noveltyScore >= 65)
    .sort((a, b) => b.noveltyScore - a.noveltyScore)
    .slice(0, 5);

  const underOwnedThemes = all
    .filter(t => t.portfolioExposurePct < 15 && t.score >= 25)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const themesNeedingResearch = all.filter(t => t.researchPriority >= 50 || t.noveltyScore >= 70).length;

  const latest = rows.reduce((a, b) => a.refreshedAt > b.refreshedAt ? a : b);

  return {
    topResearchTargets,
    highNoveltyThemes,
    underOwnedThemes,
    generatedAt:           latest.refreshedAt.toISOString(),
    themesNeedingResearch,
  };
}

// ─── Wiki: Research Queue pages ───────────────────────────────────────────────
// Creates 07 Investment/Wiki/Research Queue/{theme}.md for high-priority themes.

export function writeResearchQueueToWiki(queue: ResearchQueue): void {
  try {
    const brainOsRoot = process.env.BRAIN_OS_ROOT ?? resolveBrainOsPath() ?? path.join(process.cwd(), "brain-os");
    const dir         = path.join(brainOsRoot, "07 Investment", "Wiki", "Research Queue");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const candidates = [
      ...queue.topResearchTargets,
      ...queue.highNoveltyThemes,
    ].filter((t, i, a) => a.findIndex(x => x.theme === t.theme) === i);   // unique

    for (const t of candidates) {
      if (t.researchPriority < 60 && t.noveltyScore < 60) continue;

      const slug     = t.theme.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "-");
      const filePath = path.join(dir, `${slug}.md`);
      const today    = new Date().toISOString().slice(0, 10);
      const tickers  = t.candidates.map(c => c.ticker).join(", ") || "TBD";

      const content = `# ${t.theme} — Research Queue

**Priority:** ${t.researchPriority}/100
**Novelty:** ${t.noveltyScore}/100
**Theme Score:** ${t.score}/100
**Momentum:** ${t.momentum}
**Portfolio Exposure:** ${t.portfolioExposurePct}%
**Last Updated:** ${today}

---

## Summary

${t.whyNow}

## Why Now

${t.drivers.slice(0, 3).map(d => `- ${d}`).join("\n") || "- Signals emerging in institutional and newsletter sources"}

## Key Drivers

- Signal momentum: ${t.momentum}
- Portfolio gap: ${100 - t.portfolioExposurePct}% unexposed
- Extended theme: ${t.isExtended ? "Yes — not in current allocation framework" : "No — overlaps existing allocation"}

## Risks

- Signal may be noise — requires fundamental validation
- Early theme: few pure-play public companies
- May overlap existing portfolio holdings (indirect exposure)

## Related Companies

${t.candidates.length > 0 ? t.candidates.map(c => `- [[${c.ticker}]] — Radar score ${c.radarScore}`).join("\n") : `- ${tickers}`}

## Institutional Mentions

${t.sources.length > 0 ? t.sources.map(s => `- ${s}`).join("\n") : "- No institutional mentions yet — signals from newsletters/radar"}

## Newsletter Mentions

- See Intelligence → Newsletters for recent coverage

## Research Status

- [ ] Initial scan complete
- [ ] Identify pure-play companies
- [ ] Assess portfolio fit
- [ ] Decision: Add to Watchlist / Pass
`;

      // Only create — don't overwrite human edits
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, content, "utf8");
      } else {
        // Append updated metrics section only
        const existing = fs.readFileSync(filePath, "utf8");
        const updateLine = `\n---\n\n**Updated ${today}:** Priority ${t.researchPriority} · Novelty ${t.noveltyScore} · ${t.momentum}\n`;
        if (!existing.includes(`Updated ${today}`)) {
          fs.appendFileSync(filePath, updateLine, "utf8");
        }
      }
    }
  } catch {
    // Wiki write failure never blocks main flow
  }
}
