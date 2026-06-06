import { NextRequest, NextResponse } from "next/server";
import { restoreDatabase, restoreBrainOs, getRestoreLog } from "@/lib/restore-service";

// GET /api/restore — list restore history
export async function GET() {
  const log = getRestoreLog();
  return NextResponse.json({ log });
}

// POST /api/restore — restore from backup
// Body: { backupId: string, type: "database" | "brain_os_export" }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { backupId, type } = body as { backupId: string; type?: string };

  if (!backupId) {
    return NextResponse.json({ error: "backupId is required" }, { status: 400 });
  }

  try {
    const result = type === "brain_os_export"
      ? await restoreBrainOs(backupId)
      : await restoreDatabase(backupId);

    const status = result.success ? 200 : 500;
    return NextResponse.json(result, { status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
