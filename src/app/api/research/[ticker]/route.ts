import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseDossierRow } from "@/lib/dossier-engine";

export async function GET(
  _req: NextRequest,
  { params }: { params: { ticker: string } }
): Promise<NextResponse> {
  try {
    const ticker = params.ticker.toUpperCase();
    const row = await db.researchDossier.findUnique({ where: { ticker } });
    if (!row) return NextResponse.json({ error: "Dossier not found" }, { status: 404 });

    const dossier = parseDossierRow(row);

    // Enrich with primary source evidence
    const [recentFilings, recentEarnings, thesisImpacts] = await Promise.all([
      db.filing.findMany({
        where: { ticker },
        orderBy: { filingDate: "desc" },
        take: 5,
        select: {
          id: true, filingType: true, filingDate: true, periodEndDate: true,
          title: true, summary: true, sourceUrl: true, accessionNumber: true,
          thesisImpacts: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      }),
      db.earningsEvent.findMany({
        where: { ticker },
        orderBy: { reportDate: "desc" },
        take: 4,
        select: {
          id: true, fiscalPeriod: true, fiscalQuarter: true, fiscalYear: true,
          reportDate: true, epsActual: true, epsEstimate: true,
          revenueActual: true, revenueEstimate: true, guidanceSummary: true,
          managementCommentary: true,
        },
      }),
      db.thesisImpactRecord.findMany({
        where: { ticker },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { filing: { select: { filingType: true, filingDate: true, accessionNumber: true } } },
      }),
    ]);

    return NextResponse.json({
      ...dossier,
      primarySource: {
        recentFilings: recentFilings.map(f => ({
          ...f,
          filingDate: f.filingDate.toISOString(),
          periodEndDate: f.periodEndDate?.toISOString() ?? null,
          thesisImpact: f.thesisImpacts[0]
            ? { impactLevel: f.thesisImpacts[0].impactLevel, reasoning: f.thesisImpacts[0].reasoning }
            : null,
        })),
        recentEarnings: recentEarnings.map(e => ({
          ...e,
          reportDate: e.reportDate?.toISOString() ?? null,
        })),
        thesisImpacts: thesisImpacts.map(t => ({
          ...t,
          evidenceIds: JSON.parse(t.evidenceIds),
          createdAt: t.createdAt.toISOString(),
          filing: t.filing
            ? { ...t.filing, filingDate: t.filing.filingDate.toISOString() }
            : null,
        })),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
