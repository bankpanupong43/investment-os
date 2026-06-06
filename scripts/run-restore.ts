// npm run restore <backupId> [type]
// type: database (default) | brain_os_export
// Lists available backups if no backupId given.

import { restoreDatabase, restoreBrainOs, getRestoreLog } from "../src/lib/restore-service";
import { listBackups } from "../src/lib/backup-service";

async function main() {
  const backupId = process.argv[2];
  const type = process.argv[3] ?? "database";

  if (!backupId) {
    console.log("[restore] No backup ID provided. Available backups:\n");
    const backups = await listBackups(undefined, 20);
    for (const b of backups) {
      console.log(`  ${b.id}  [${b.backupType}]  ${b.filePath}  ${b.createdAt.toISOString()}`);
    }
    if (backups.length === 0) console.log("  (no backups found)");
    console.log("\nUsage: npm run restore <backupId> [database|brain_os_export]");
    return;
  }

  console.log(`[restore] Restoring backup ${backupId} (type: ${type})…`);
  console.log("[restore] A restore-point will be created before overwrite.\n");

  const result = type === "brain_os_export"
    ? await restoreBrainOs(backupId)
    : await restoreDatabase(backupId);

  if (result.success) {
    console.log("[restore] SUCCESS");
    console.log(`  Restored from:   ${result.restoredFrom}`);
    console.log(`  Restore-point:   ${result.restorePointPath}`);
    console.log(`  Checksum OK:     ${result.checksumVerified}`);
  } else {
    console.error("[restore] FAILED:", result.error);
    console.log(`  Checksum OK:     ${result.checksumVerified}`);
    console.log(`  Restore-point:   ${result.restorePointPath ?? "not created"}`);
  }

  const log = getRestoreLog().slice(0, 3);
  if (log.length > 0) {
    console.log("\n--- Recent restore log ---");
    for (const r of log) {
      console.log(`  ${r.restoredAt}  from: ${r.restoredFrom}  point: ${r.restorePointPath}`);
    }
  }

  if (!result.success) process.exit(1);
}

main().then(() => process.exit(0)).catch(err => {
  console.error("[restore] Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
