// Backup Service — creates timestamped, checksummed backups of the database,
// Brain OS data exports, and full snapshots.
//
// Storage layout:
//   backups/database/YYYY-MM-DD-HHmmss.db     ← SQLite copies
//   backups/brain-os/YYYY-MM-DD-HHmmss/       ← JSON data snapshots
//   backups/full/YYYY-MM-DD-HHmmss/           ← db + brain-os + metadata.json
//   backups/manifest.json                      ← file-based redundant log

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { db } from "./db";

// ─── Config ───────────────────────────────────────────────────────────────────

const PROJECT_ROOT = path.resolve(process.cwd());
const DB_PATH = path.join(PROJECT_ROOT, "prisma", "dev.db");
const BACKUPS_ROOT = path.join(PROJECT_ROOT, "backups");
const DB_BACKUP_DIR = path.join(BACKUPS_ROOT, "database");
const BRAIN_BACKUP_DIR = path.join(BACKUPS_ROOT, "brain-os");
const FULL_BACKUP_DIR = path.join(BACKUPS_ROOT, "full");
const MANIFEST_PATH = path.join(BACKUPS_ROOT, "manifest.json");

const MAX_DB_BACKUPS = 30;
const MAX_FULL_BACKUPS = 10;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BackupResult {
  id: string;
  backupType: string;
  filePath: string;
  fileSize: number;
  checksum: string;
  createdAt: string;
}

export interface BackupReport {
  totalBackups: number;
  storageBytes: number;
  storageMb: number;
  lastDatabaseBackup: string | null;
  lastBrainOsBackup: string | null;
  lastFullBackup: string | null;
  databaseBackupCount: number;
  brainOsBackupCount: number;
  fullBackupCount: number;
  manifest: ManifestEntry[];
}

export interface ManifestEntry {
  id: string;
  backupType: string;
  filePath: string;
  fileSize: number;
  checksum: string;
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timestamp(): string {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

function sha256File(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function sha256Buffer(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function relPath(absPath: string): string {
  return path.relative(PROJECT_ROOT, absPath).replace(/\\/g, "/");
}

function bytesToMb(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}

// ─── Manifest ─────────────────────────────────────────────────────────────────

function readManifest(): ManifestEntry[] {
  if (!fs.existsSync(MANIFEST_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8")) as ManifestEntry[];
  } catch {
    return [];
  }
}

function appendManifest(entry: ManifestEntry) {
  const entries = readManifest();
  entries.push(entry);
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(entries, null, 2), "utf-8");
}

// ─── Database backup ──────────────────────────────────────────────────────────

export async function backupDatabase(label?: string): Promise<BackupResult> {
  if (!fs.existsSync(DB_PATH)) throw new Error(`Database not found: ${DB_PATH}`);

  ensureDir(DB_BACKUP_DIR);
  const ts = timestamp();
  const destPath = path.join(DB_BACKUP_DIR, `${ts}.db`);

  fs.copyFileSync(DB_PATH, destPath);

  const stats = fs.statSync(destPath);
  const checksum = sha256File(destPath);

  const saved = await db.backup.create({
    data: {
      backupType: "database",
      filePath: relPath(destPath),
      fileSize: stats.size,
      checksum,
      metadata: JSON.stringify({ label: label ?? ts, ts }),
    },
  });

  const entry: ManifestEntry = {
    id: saved.id,
    backupType: "database",
    filePath: relPath(destPath),
    fileSize: stats.size,
    checksum,
    createdAt: saved.createdAt.toISOString(),
  };
  appendManifest(entry);

  // Cleanup: keep only MAX_DB_BACKUPS newest
  await cleanupDatabaseBackups();

  return { ...entry, createdAt: saved.createdAt.toISOString() };
}

async function cleanupDatabaseBackups() {
  const files = fs.existsSync(DB_BACKUP_DIR)
    ? fs.readdirSync(DB_BACKUP_DIR)
        .filter(f => f.endsWith(".db"))
        .map(f => ({ name: f, path: path.join(DB_BACKUP_DIR, f), mtime: fs.statSync(path.join(DB_BACKUP_DIR, f)).mtime }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
    : [];

  const toDelete = files.slice(MAX_DB_BACKUPS);
  for (const f of toDelete) {
    try {
      fs.unlinkSync(f.path);
      await db.backup.deleteMany({ where: { filePath: relPath(f.path) } });
    } catch {}
  }
}

// ─── Brain OS snapshot ────────────────────────────────────────────────────────

export async function backupBrainOs(label?: string): Promise<BackupResult> {
  ensureDir(BRAIN_BACKUP_DIR);
  const ts = timestamp();
  const snapshotDir = path.join(BRAIN_BACKUP_DIR, ts);
  ensureDir(snapshotDir);

  // Fetch all knowledge data
  const [
    positions, theses, investmentTheses, reviews, filings, earnings,
    dossiers, evidence, universe, fundamentals, watchlist, journalEntries,
  ] = await Promise.all([
    db.position.findMany(),
    db.investmentThesis.findMany({ include: { reviews: true } }),
    db.thesis.findMany(),
    db.portfolioReview.findMany({ orderBy: { generatedAt: "desc" }, take: 20 }),
    db.filing.findMany({ include: { thesisImpacts: true } }),
    db.earningsEvent.findMany(),
    db.researchDossier.findMany(),
    db.evidence.findMany(),
    db.universe.findMany(),
    db.fundamental.findMany(),
    db.watchlist.findMany(),
    db.journalEntry.findMany(),
  ]);

  const snapshot = {
    exportedAt: new Date().toISOString(),
    label: label ?? ts,
    counts: {
      positions: positions.length,
      theses: theses.length,
      investmentTheses: investmentTheses.length,
      reviews: reviews.length,
      filings: filings.length,
      earnings: earnings.length,
      dossiers: dossiers.length,
      evidence: evidence.length,
      universe: universe.length,
      fundamentals: fundamentals.length,
      watchlist: watchlist.length,
      journalEntries: journalEntries.length,
    },
    data: {
      positions,
      theses,
      investmentTheses,
      reviews,
      filings,
      earnings,
      dossiers,
      evidence,
      universe,
      fundamentals,
      watchlist,
      journalEntries,
    },
  };

  const snapshotPath = path.join(snapshotDir, "snapshot.json");
  const json = JSON.stringify(snapshot, null, 2);
  fs.writeFileSync(snapshotPath, json, "utf-8");

  const stats = fs.statSync(snapshotPath);
  const checksum = sha256Buffer(Buffer.from(json, "utf-8"));

  const saved = await db.backup.create({
    data: {
      backupType: "brain_os_export",
      filePath: relPath(snapshotDir),
      fileSize: stats.size,
      checksum,
      metadata: JSON.stringify({ label: label ?? ts, ts, counts: snapshot.counts }),
    },
  });

  const entry: ManifestEntry = {
    id: saved.id,
    backupType: "brain_os_export",
    filePath: relPath(snapshotDir),
    fileSize: stats.size,
    checksum,
    createdAt: saved.createdAt.toISOString(),
  };
  appendManifest(entry);

  return { ...entry, createdAt: saved.createdAt.toISOString() };
}

// ─── Full snapshot ────────────────────────────────────────────────────────────

export async function backupFull(label?: string): Promise<BackupResult> {
  if (!fs.existsSync(DB_PATH)) throw new Error(`Database not found: ${DB_PATH}`);

  ensureDir(FULL_BACKUP_DIR);
  const ts = timestamp();
  const snapshotDir = path.join(FULL_BACKUP_DIR, ts);
  ensureDir(snapshotDir);

  // 1. Copy database
  const dbDest = path.join(snapshotDir, "dev.db");
  fs.copyFileSync(DB_PATH, dbDest);
  const dbChecksum = sha256File(dbDest);

  // 2. Brain OS snapshot
  const brainResult = await backupBrainOs(label);

  // 3. Metadata report
  const meta = {
    label: label ?? ts,
    ts,
    createdAt: new Date().toISOString(),
    database: { path: relPath(dbDest), size: fs.statSync(dbDest).size, checksum: dbChecksum },
    brainOs: brainResult,
  };
  fs.writeFileSync(path.join(snapshotDir, "metadata.json"), JSON.stringify(meta, null, 2), "utf-8");

  const stats = fs.statSync(dbDest);
  const totalSize = stats.size + (fs.existsSync(path.join(snapshotDir, "metadata.json"))
    ? fs.statSync(path.join(snapshotDir, "metadata.json")).size : 0);

  const saved = await db.backup.create({
    data: {
      backupType: "full_snapshot",
      filePath: relPath(snapshotDir),
      fileSize: totalSize,
      checksum: dbChecksum,
      metadata: JSON.stringify(meta),
    },
  });

  const entry: ManifestEntry = {
    id: saved.id,
    backupType: "full_snapshot",
    filePath: relPath(snapshotDir),
    fileSize: totalSize,
    checksum: dbChecksum,
    createdAt: saved.createdAt.toISOString(),
  };
  appendManifest(entry);

  // Cleanup full backups
  await cleanupFullBackups();

  return { ...entry, createdAt: saved.createdAt.toISOString() };
}

async function cleanupFullBackups() {
  if (!fs.existsSync(FULL_BACKUP_DIR)) return;
  const dirs = fs.readdirSync(FULL_BACKUP_DIR)
    .map(d => ({ name: d, path: path.join(FULL_BACKUP_DIR, d), mtime: fs.statSync(path.join(FULL_BACKUP_DIR, d)).mtime }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  const toDelete = dirs.slice(MAX_FULL_BACKUPS);
  for (const d of toDelete) {
    try {
      fs.rmSync(d.path, { recursive: true, force: true });
      await db.backup.deleteMany({ where: { filePath: relPath(d.path) } });
    } catch {}
  }
}

// ─── Backup report ────────────────────────────────────────────────────────────

export async function getBackupReport(): Promise<BackupReport> {
  const backups = await db.backup.findMany({ orderBy: { createdAt: "desc" } });

  const dbBackups = backups.filter(b => b.backupType === "database");
  const brainBackups = backups.filter(b => b.backupType === "brain_os_export");
  const fullBackups = backups.filter(b => b.backupType === "full_snapshot");

  const totalStorageBytes = backups.reduce((s, b) => s + b.fileSize, 0);

  return {
    totalBackups: backups.length,
    storageBytes: totalStorageBytes,
    storageMb: bytesToMb(totalStorageBytes),
    lastDatabaseBackup: dbBackups[0]?.createdAt.toISOString() ?? null,
    lastBrainOsBackup: brainBackups[0]?.createdAt.toISOString() ?? null,
    lastFullBackup: fullBackups[0]?.createdAt.toISOString() ?? null,
    databaseBackupCount: dbBackups.length,
    brainOsBackupCount: brainBackups.length,
    fullBackupCount: fullBackups.length,
    manifest: readManifest().slice(-20).reverse(),
  };
}

// ─── List backups ─────────────────────────────────────────────────────────────

export async function listBackups(backupType?: string, limit = 30) {
  const where = backupType ? { backupType } : {};
  return db.backup.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export { PROJECT_ROOT, DB_PATH, BACKUPS_ROOT, DB_BACKUP_DIR };
