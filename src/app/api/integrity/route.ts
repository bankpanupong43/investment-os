import { NextResponse } from "next/server";
import { runIntegrityChecks } from "@/lib/integrity-engine";

// GET /api/integrity — run integrity checks and return report
export async function GET() {
  try {
    const report = await runIntegrityChecks();
    return NextResponse.json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
