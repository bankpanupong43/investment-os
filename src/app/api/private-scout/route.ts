import { NextResponse } from "next/server";
import {
  getPrivateScoutReport,
  generatePrivateScoutReport,
  generateValidationReport,
} from "@/lib/private-scout-engine";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const validate = searchParams.get("validate") === "true";

    if (validate) {
      const report = await generateValidationReport();
      return NextResponse.json(report);
    }

    const report = await getPrivateScoutReport();
    if (!report) {
      return NextResponse.json({ error: "No private scout data. Run POST /api/private-scout to scan." }, { status: 404 });
    }
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST() {
  try {
    const report = await generatePrivateScoutReport();
    return NextResponse.json({
      success: true,
      totalScanned:    report.totalScanned,
      topCompany:      report.topCandidates[0]?.companyName ?? null,
      topScore:        report.topCandidates[0]?.discoveryScore ?? null,
      generatedAt:     report.generatedAt,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
