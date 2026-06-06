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
    return NextResponse.json(parseDossierRow(row));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
