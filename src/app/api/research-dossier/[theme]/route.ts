import { NextRequest, NextResponse } from "next/server";
import { generateThemeDossier, saveThemeDossier, writeThemeDossierToWiki, getThemeDossier } from "@/lib/research-dossier-engine";
import { SCOUT_THEMES } from "@/lib/theme-scout-engine";

export async function GET(
  _req: NextRequest,
  { params }: { params: { theme: string } }
) {
  const theme = decodeURIComponent(params.theme);

  // Return cached dossier first
  try {
    const cached = await getThemeDossier(theme);
    if (cached) return NextResponse.json(cached);
  } catch { /* pass */ }

  // Generate on-demand if theme is known
  if (!SCOUT_THEMES[theme]) {
    return NextResponse.json({ error: `Unknown theme: ${theme}` }, { status: 404 });
  }

  try {
    const dossier = await generateThemeDossier(theme);
    await saveThemeDossier(dossier);
    writeThemeDossierToWiki(dossier);
    return NextResponse.json(dossier);
  } catch (err) {
    console.error("[research-dossier] GET error:", err);
    return NextResponse.json({ error: "Failed to generate dossier" }, { status: 500 });
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { theme: string } }
) {
  const theme = decodeURIComponent(params.theme);

  if (!SCOUT_THEMES[theme]) {
    return NextResponse.json({ error: `Unknown theme: ${theme}` }, { status: 404 });
  }

  try {
    const dossier = await generateThemeDossier(theme);
    await saveThemeDossier(dossier);
    writeThemeDossierToWiki(dossier);
    return NextResponse.json({ success: true, completenessScore: dossier.completenessScore, theme });
  } catch (err) {
    console.error("[research-dossier] POST error:", err);
    return NextResponse.json({ error: "Failed to generate dossier" }, { status: 500 });
  }
}
