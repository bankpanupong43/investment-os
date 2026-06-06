// npm run integrity
// Runs all 12 integrity checks and prints a report.

import { runIntegrityChecks } from "../src/lib/integrity-engine";

async function main() {
  console.log("[integrity] Running checks…\n");
  const report = await runIntegrityChecks();

  console.log(`Scanned at:    ${report.scannedAt}`);
  console.log(`Checks passed: ${report.passedChecks}/${report.totalChecks}`);
  console.log(`Status:        ${report.healthy ? "HEALTHY" : "ISSUES FOUND"}`);
  console.log(`Summary:       ${report.summary}`);

  if (report.errors.length > 0) {
    console.log("\n--- ERRORS ---");
    for (const e of report.errors) {
      console.log(`  [${e.check}] ${e.message}`);
      if (e.affectedIds?.length) console.log(`    Affected: ${e.affectedIds.slice(0, 5).join(", ")}`);
    }
  }

  if (report.warnings.length > 0) {
    console.log("\n--- WARNINGS ---");
    for (const w of report.warnings) {
      console.log(`  [${w.check}] ${w.message}`);
      if (w.affectedIds?.length) console.log(`    Affected: ${w.affectedIds.slice(0, 5).join(", ")}`);
    }
  }

  if (report.infos.length > 0) {
    console.log("\n--- INFO ---");
    for (const i of report.infos) {
      console.log(`  [${i.check}] ${i.message}`);
    }
  }

  if (report.errors.length > 0) {
    process.exit(1);
  }
}

main().then(() => process.exit(0)).catch(err => {
  console.error("[integrity] Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
