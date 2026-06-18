import { NextResponse } from "next/server";
import { generateCompanyScoutReport, scanCompanies, rankCompanies } from "@/lib/company-scout-engine";

export async function GET() {
  try {
    const candidates = await scanCompanies();
    const ranked     = rankCompanies(candidates);

    // Lightweight response — no DB writes, no wiki, just the ranked list
    return NextResponse.json({
      allRanked:      ranked.slice(0, 20),
      topNew:         ranked.filter(c => !c.isOwned && !c.inWatchlist).slice(0, 10),
      emerging:       ranked.filter(c => c.scoutCategory === "Emerging"),
      accelerating:   ranked.filter(c => c.scoutCategory === "Accelerating").slice(0, 10),
      consensus:      ranked.filter(c => c.scoutCategory === "Consensus"),
      hiddenGems:     ranked.filter(c => c.scoutCategory === "Hidden Gem"),
      coverageAudit: {
        totalTracked:  candidates.length,
        owned:         candidates.filter(c => c.isOwned).length,
        watchlist:     candidates.filter(c => c.inWatchlist).length,
        newCompanies:  candidates.filter(c => !c.isOwned && !c.inWatchlist).length,
        ownedPctTop10: candidates.slice(0, 10).filter(c => c.isOwned).length / Math.min(10, candidates.length) * 100,
        biasDetected:  candidates.slice(0, 10).filter(c => c.isOwned).length / Math.min(10, candidates.length) > 0.8,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const report = await generateCompanyScoutReport();
    return NextResponse.json({ ok: true, ...report });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
