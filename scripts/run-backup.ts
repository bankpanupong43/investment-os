// npm run backup [type] [label]
// type: database | brain_os_export | full_snapshot (default: full_snapshot)

import { backupDatabase, backupBrainOs, backupFull } from "../src/lib/backup-service";

async function main() {
  const type = process.argv[2] ?? "full_snapshot";
  const label = process.argv[3];

  console.log(`[backup] Starting ${type}${label ? ` (${label})` : ""}…`);

  let result;
  if (type === "database") {
    result = await backupDatabase(label);
  } else if (type === "brain_os_export") {
    result = await backupBrainOs(label);
  } else if (type === "full_snapshot") {
    result = await backupFull(label);
  } else {
    console.error(`Unknown backup type: ${type}. Use: database | brain_os_export | full_snapshot`);
    process.exit(1);
  }

  console.log(`[backup] Done.`);
  console.log(`  Type:     ${result.backupType}`);
  console.log(`  Path:     ${result.filePath}`);
  console.log(`  Size:     ${(result.fileSize / 1024).toFixed(1)} KB`);
  console.log(`  Checksum: ${result.checksum}`);
  console.log(`  Created:  ${result.createdAt}`);
}

main().then(() => process.exit(0)).catch(err => {
  console.error("[backup] Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
