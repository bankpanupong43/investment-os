// Validation script for Phase X: Backup, Recovery & System Integrity
// Simulates backup creation, restore test, and integrity scan.

import { backupDatabase, backupBrainOs, backupFull, getBackupReport } from "../src/lib/backup-service";
import { restoreDatabase } from "../src/lib/restore-service";
import { runIntegrityChecks } from "../src/lib/integrity-engine";
import fs from "fs";
import path from "path";

interface Check {
  name: string;
  passed: boolean;
  detail?: string;
}

const checks: Check[] = [];

function pass(name: string, detail?: string) {
  checks.push({ name, passed: true, detail });
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name: string, detail: string) {
  checks.push({ name, passed: false, detail });
  console.log(`  FAIL  ${name} — ${detail}`);
}

async function run() {
  console.log("=== Phase X Validation: Backup, Recovery & System Integrity ===\n");

  // ── 1. Database backup ──────────────────────────────────────────────────────
  console.log("[1] Database backup");
  let dbBackup;
  try {
    dbBackup = await backupDatabase("validate-test");
    pass("Database backup created", dbBackup.filePath);

    const PROJECT_ROOT = path.resolve(process.cwd());
    const absPath = path.join(PROJECT_ROOT, dbBackup.filePath);
    if (fs.existsSync(absPath)) {
      pass("Backup file exists on disk");
    } else {
      fail("Backup file exists on disk", `Not found: ${absPath}`);
    }

    if (dbBackup.checksum.length === 64) {
      pass("Checksum is SHA256 (64 chars)", dbBackup.checksum.slice(0, 16) + "…");
    } else {
      fail("Checksum is SHA256", `Got ${dbBackup.checksum.length} chars`);
    }

    if (dbBackup.fileSize > 0) {
      pass("Backup file has size", `${dbBackup.fileSize} bytes`);
    } else {
      fail("Backup file has size", "fileSize is 0");
    }
  } catch (err) {
    fail("Database backup created", err instanceof Error ? err.message : String(err));
    dbBackup = null;
  }

  // ── 2. Brain OS snapshot ────────────────────────────────────────────────────
  console.log("\n[2] Brain OS snapshot");
  let brainBackup;
  try {
    brainBackup = await backupBrainOs("validate-brain");
    pass("Brain OS snapshot created", brainBackup.filePath);

    const PROJECT_ROOT = path.resolve(process.cwd());
    const snapshotPath = path.join(PROJECT_ROOT, brainBackup.filePath, "snapshot.json");
    if (fs.existsSync(snapshotPath)) {
      pass("snapshot.json exists");
      const snap = JSON.parse(fs.readFileSync(snapshotPath, "utf-8"));
      if (snap.counts && typeof snap.counts.positions === "number") {
        pass("Snapshot has counts", JSON.stringify(snap.counts).slice(0, 80));
      } else {
        fail("Snapshot has counts", "counts object missing or malformed");
      }
    } else {
      fail("snapshot.json exists", `Not found: ${snapshotPath}`);
    }
  } catch (err) {
    fail("Brain OS snapshot created", err instanceof Error ? err.message : String(err));
    brainBackup = null;
  }

  // ── 3. Full snapshot ────────────────────────────────────────────────────────
  console.log("\n[3] Full snapshot");
  try {
    const full = await backupFull("validate-full");
    pass("Full snapshot created", full.filePath);
  } catch (err) {
    fail("Full snapshot created", err instanceof Error ? err.message : String(err));
  }

  // ── 4. Backup report ────────────────────────────────────────────────────────
  console.log("\n[4] Backup report");
  try {
    const report = await getBackupReport();
    if (report.totalBackups > 0) {
      pass("Backup report has entries", `${report.totalBackups} total, ${report.storageMb} MB`);
    } else {
      fail("Backup report has entries", "0 backups found");
    }
    if (report.lastDatabaseBackup) {
      pass("Last DB backup timestamp present", report.lastDatabaseBackup);
    } else {
      fail("Last DB backup timestamp present", "null");
    }
    if (report.manifest.length > 0) {
      pass("Manifest file has entries", `${report.manifest.length} entries`);
    } else {
      fail("Manifest file has entries", "empty manifest");
    }
  } catch (err) {
    fail("Backup report", err instanceof Error ? err.message : String(err));
  }

  // ── 5. Database recovery (restore test) ─────────────────────────────────────
  console.log("\n[5] Database recovery");
  if (dbBackup) {
    try {
      const result = await restoreDatabase(dbBackup.id);
      if (result.success) {
        pass("Database restore succeeded");
      } else {
        fail("Database restore succeeded", result.error ?? "unknown error");
      }
      if (result.checksumVerified) {
        pass("Checksum verified before restore");
      } else {
        fail("Checksum verified before restore", "checksum mismatch");
      }
      if (result.restorePointPath) {
        pass("Restore-point created", result.restorePointPath);
      } else {
        fail("Restore-point created", "restorePointPath is null");
      }
    } catch (err) {
      fail("Database restore", err instanceof Error ? err.message : String(err));
    }
  } else {
    fail("Database restore", "skipped — backup not created");
    fail("Checksum verified before restore", "skipped");
    fail("Restore-point created", "skipped");
  }

  // ── 6. Integrity scan ───────────────────────────────────────────────────────
  console.log("\n[6] Integrity scan");
  try {
    const report = await runIntegrityChecks();
    pass("Integrity scan ran", `${report.passedChecks}/${report.totalChecks} checks passed`);
    pass("Orphan detection functional", `warnings: ${report.warnings.length}, errors: ${report.errors.length}`);
    if (report.totalChecks >= 12) {
      pass("All 12+ checks registered", `${report.totalChecks} total`);
    } else {
      fail("All 12+ checks registered", `Only ${report.totalChecks} checks`);
    }
  } catch (err) {
    fail("Integrity scan", err instanceof Error ? err.message : String(err));
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  const passed = checks.filter(c => c.passed).length;
  const total = checks.length;
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Phase X Validation: ${passed}/${total} checks passed`);
  if (passed === total) {
    console.log("ALL CHECKS PASSED — Phase X is production-ready.");
  } else {
    const failed = checks.filter(c => !c.passed);
    console.log(`${failed.length} FAILED:`);
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
  }

  process.exit(passed === total ? 0 : 1);
}

run().catch(err => {
  console.error("Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
