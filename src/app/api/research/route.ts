import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseDossierRow } from "@/lib/dossier-engine";

export type { ResearchDossierData, FactItem, InterpretationItem, RecommendationSection, EvidenceSummary } from "@/lib/dossier-engine";

export async function GET(): Promise<NextResponse> {
  try {
    const rows = await db.researchDossier.findMany({
      orderBy: { opportunityScore: "desc" },
    });
    return NextResponse.json({ dossiers: rows.map(parseDossierRow) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/research]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
