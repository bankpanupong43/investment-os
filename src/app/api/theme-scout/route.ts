import { NextRequest, NextResponse } from "next/server";
import {
  generateThemeScoutReport,
  getThemeScoutReport,
  saveThemeScoutData,
  writeThemeScoutToWiki,
} from "@/lib/theme-scout-engine";

// GET /api/theme-scout — return latest cached report (or generate fresh if none)
export async function GET() {
  const cached = await getThemeScoutReport();
  if (cached) return NextResponse.json(cached);

  // No cached data — run on demand
  const report = await generateThemeScoutReport();
  await saveThemeScoutData(report.all);
  writeThemeScoutToWiki(report.all);

  return NextResponse.json(report);
}

// POST /api/theme-scout — trigger a full rescan
export async function POST(_req: NextRequest) {
  const t0     = Date.now();
  const report = await generateThemeScoutReport();
  await saveThemeScoutData(report.all);
  writeThemeScoutToWiki(report.all);
  const durationMs = Date.now() - t0;

  return NextResponse.json({
    ...report,
    durationMs,
    saved: report.all.length,
  }, { status: 201 });
}
