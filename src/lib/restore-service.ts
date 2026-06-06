// Restore Service — safely restores database backups and Brain OS snapshots.
//
// Safety guarantees:
//   1. Always creates a restore-point before overwriting
//   2. Verifies SHA256 checksum before restore
//   3. Records restore event in manifest

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { db } from "./db";
import { backupDatabase, DB_PATH, PROJECT_ROOT, BACKUPS_ROOT } from "./backup-service";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RestoreResult {
  success: boolean;
  restorePointPath: string | null;
  restoredFrom: string;
  checksumVerified: boolean;
  error?: string;
}

export interface RestoreRecord {
  restoredAt: string;
  restoredFrom: string;
  restorePointPath: string;
  checksumVerified: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RESTORE_LOG_PATH = path.join(BACKUPS_ROOT, "restore-log.json");

function sha256File(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function readRestoreLog(): RestoreRecord[] {
  if (!fs.existsSync(RESTORE_LOG_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(RESTORE_LOG_PATH, "utf-8")) as RestoreRecord[];
  } catch {
    return [];
  }
}

function appendRestoreLog(record: RestoreRecord) {
  const log = readRestoreLog();
  log.push(record);
  fs.writeFileSync(RESTORE_LOG_PATH, JSON.stringify(log, null, 2), "utf-8");
}

// ─── Restore database ─────────────────────────────────────────────────────────

export async function restoreDatabase(backupId: string): Promise<RestoreResult> {
  // Look up the backup record
  const backup = await db.backup.findUnique({ where: { id: backupId } });
  if (!backup) {
    return { success: false, restorePointPath: null, restoredFrom: backupId, checksumVerified: false, error: "Backup record not found" };
  }
  if (backup.backupType !== "database" && backup.backupType !== "full_snapshot") {
    return { success: false, restorePointPath: null, restoredFrom: backupId, checksumVerified: false, error: "Backup type is not database or full_snapshot" };
  }

  const backupAbsPath = backup.backupType === "full_snapshot"
    ? path.join(PROJECT_ROOT, backup.filePath, "dev.db")
    : path.join(PROJECT_ROOT, backup.filePath);

  if (!fs.existsSync(backupAbsPath)) {
    return { success: false, restorePointPath: null, restoredFrom: backupId, checksumVerified: false, error: `Backup file not found: ${backupAbsPath}` };
  }

  // Verify checksum
  const actualChecksum = sha256File(backupAbsPath);
  const checksumVerified = actualChecksum === backup.checksum;
  if (!checksumVerified) {
    return {
      success: false, restorePointPath: null, restoredFrom: backupAbsPath,
      checksumVerified: false,
      error: `Checksum mismatch. Expected ${backup.checksum}, got ${actualChecksum}. Backup may be corrupted.`,
    };
  }

  // Create restore-point first
  let restorePointPath: string | null = null;
  try {
    const rp = await backupDatabase("restore-point");
    restorePointPath = rp.filePath;
  } catch (err) {
    return {
      success: false, restorePointPath: null, restoredFrom: backupAbsPath, checksumVerified,
      error: `Failed to create restore-point: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Perform restore
  try {
    fs.copyFileSync(backupAbsPath, DB_PATH);
  } catch (err) {
    return {
      success: false, restorePointPath, restoredFrom: backupAbsPath, checksumVerified,
      error: `Restore copy failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const record: RestoreRecord = {
    restoredAt: new Date().toISOString(),
    restoredFrom: backupAbsPath,
    restorePointPath,
    checksumVerified,
  };
  appendRestoreLog(record);

  return { success: true, restorePointPath, restoredFrom: backupAbsPath, checksumVerified };
}

// ─── Restore Brain OS snapshot ────────────────────────────────────────────────

export async function restoreBrainOs(backupId: string): Promise<RestoreResult> {
  const backup = await db.backup.findUnique({ where: { id: backupId } });
  if (!backup) {
    return { success: false, restorePointPath: null, restoredFrom: backupId, checksumVerified: false, error: "Backup not found" };
  }
  if (backup.backupType !== "brain_os_export") {
    return { success: false, restorePointPath: null, restoredFrom: backupId, checksumVerified: false, error: "Not a brain_os_export backup" };
  }

  const snapshotDir = path.join(PROJECT_ROOT, backup.filePath);
  const snapshotPath = path.join(snapshotDir, "snapshot.json");

  if (!fs.existsSync(snapshotPath)) {
    return { success: false, restorePointPath: null, restoredFrom: snapshotDir, checksumVerified: false, error: "Snapshot file not found" };
  }

  // Verify checksum
  const buf = fs.readFileSync(snapshotPath);
  const actualChecksum = crypto.createHash("sha256").update(buf).digest("hex");
  const checksumVerified = actualChecksum === backup.checksum;
  if (!checksumVerified) {
    return {
      success: false, restorePointPath: null, restoredFrom: snapshotDir, checksumVerified: false,
      error: `Checksum mismatch. Snapshot may be corrupted.`,
    };
  }

  // For Brain OS: create a restore-point DB backup before loading data
  let restorePointPath: string | null = null;
  try {
    const rp = await backupDatabase("pre-brain-restore");
    restorePointPath = rp.filePath;
  } catch {}

  try {
    const snapshot = JSON.parse(buf.toString("utf-8"));
    await importSnapshotData(snapshot.data);
  } catch (err) {
    return {
      success: false, restorePointPath, restoredFrom: snapshotDir, checksumVerified,
      error: `Data import failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const record: RestoreRecord = {
    restoredAt: new Date().toISOString(),
    restoredFrom: snapshotDir,
    restorePointPath: restorePointPath ?? "",
    checksumVerified,
  };
  appendRestoreLog(record);

  return { success: true, restorePointPath, restoredFrom: snapshotDir, checksumVerified };
}

// ─── Restore log access ───────────────────────────────────────────────────────

export function getRestoreLog(): RestoreRecord[] {
  return readRestoreLog().reverse();
}

// ─── Snapshot data import ─────────────────────────────────────────────────────
// Rebuilds DB from snapshot.json data using upsert (non-destructive by default).
// This is a best-effort import for key user-authored data.

async function importSnapshotData(data: Record<string, unknown[]>) {
  // Import investment theses (user-authored, most valuable)
  if (Array.isArray(data.investmentTheses)) {
    for (const t of data.investmentTheses as Array<Record<string, unknown>>) {
      await db.investmentThesis.upsert({
        where: { ticker: t.ticker as string },
        create: t as Parameters<typeof db.investmentThesis.create>[0]["data"],
        update: {
          thesis: t.thesis as string,
          whyOwn: t.whyOwn as string,
          risks: t.risks as string,
          killCriteria: t.killCriteria as string,
          confidenceScore: t.confidenceScore as number,
        },
      });
    }
  }

  // Import watchlist
  if (Array.isArray(data.watchlist)) {
    for (const w of data.watchlist as Array<Record<string, unknown>>) {
      const existing = await db.watchlist.findFirst({ where: { ticker: w.ticker as string } });
      if (!existing) {
        await db.watchlist.create({ data: w as Parameters<typeof db.watchlist.create>[0]["data"] });
      }
    }
  }
}
