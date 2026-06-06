import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseDossierRow, exportDossierToBrainOS } from "@/lib/dossier-engine";

export async function POST(
  _req: NextRequest,
  { params }: { params: { ticker: string } }
): Promise<NextResponse> {
  try {
    const ticker = params.ticker.toUpperCase();
    const row = await db.researchDossier.findUnique({ where: { ticker } });
    if (!row) return NextResponse.json({ error: "Dossier not found — generate it first" }, { status: 404 });

    const data = parseDossierRow(row);
    const result = exportDossierToBrainOS(data);

    if (!result.success) {
      return NextResponse.json({ exported: false, path: result.path, error: result.error }, { status: 200 });
    }

    return NextResponse.json({ exported: true, path: result.path });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
