// BriefArchiveService — Phase 12A: Daily CIO Brief
//
// Saves and reads brief Markdown and HTML files from Brain OS/Morning Brief/.
// Falls back gracefully if Brain OS is not mounted on this machine.

import fs from "fs";
import path from "path";
import { resolveBrainOsPath } from "./shared-paths";

const BRIEF_SUBDIR = "Morning Brief";

function getBriefDir(): string | null {
  const brainOs = resolveBrainOsPath();
  if (!brainOs) return null;
  const dir = path.join(brainOs, BRIEF_SUBDIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** Save Markdown and HTML for a given date. Silently skips if Brain OS unavailable. */
export function archiveBrief(date: Date, markdown: string, html: string): void {
  const dir = getBriefDir();
  if (!dir) {
    console.warn("[brief-archive] Brain OS not found — brief not archived to filesystem.");
    return;
  }
  const dateStr = date.toISOString().split("T")[0];
  fs.writeFileSync(path.join(dir, `${dateStr}.md`),   markdown, "utf8");
  fs.writeFileSync(path.join(dir, `${dateStr}.html`), html,     "utf8");
}

/** Returns list of archived dates (YYYY-MM-DD), newest first. */
export function listArchive(): string[] {
  const dir = getBriefDir();
  if (!dir) return [];
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith(".md"))
      .map(f => f.replace(/\.md$/, ""))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

/** Read a single archive entry. Returns null if not found or Brain OS unavailable. */
export function readArchiveEntry(date: string, format: "md" | "html"): string | null {
  const dir = getBriefDir();
  if (!dir) return null;
  const filePath = path.join(dir, `${date}.${format}`);
  if (!fs.existsSync(filePath)) return null;
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

/** Whether a specific date has been archived. */
export function archiveExists(date: string): boolean {
  const dir = getBriefDir();
  if (!dir) return false;
  return fs.existsSync(path.join(dir, `${date}.md`));
}
