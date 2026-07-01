import { NextRequest, NextResponse } from "next/server";
import { backupDatabase, backupBrainOs, backupFull, getBackupReport, listBackups } from "@/lib/backup-service";

// GET /api/backup — list backups or get report
// Query: ?report=1 for summary, ?type=database|brain_os_export|full_snapshot for filtered list
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  if (searchParams.get("report") === "1") {
    const report = await getBackupReport();
    return NextResponse.json(report);
  }

  const backupType = searchParams.get("type") ?? undefined;
  const limit = parseInt(searchParams.get("limit") ?? "30");
  const backups = await listBackups(backupType, limit);

  return NextResponse.json(backups.map(b => ({
    ...b,
    createdAt: b.createdAt.toISOString(),
    metadata: JSON.parse(b.metadata),
  })));
}

// POST /api/backup — trigger a backup
// Body: { type: "database" | "brain_os_export" | "full_snapshot", label?: string }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const type = body.type ?? "database";
  const label = body.label;

  try {
    let result;
    if (type === "brain_os_export") {
      result = await backupBrainOs(label);
    } else if (type === "full_snapshot") {
      result = await backupFull(label);
    } else {
      result = await backupFull(label);
    }
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
