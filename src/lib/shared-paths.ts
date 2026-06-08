import fs from "fs";
import path from "path";

// Discovery order — first existing path wins:
//   1. D:\Projects\shared           Work PC — local mirrored shared folder
//   2. G:\...\Shared                Home PC — known exact Google Drive path
//   3. <project>/../shared           Sibling relative to project root (portable fallback)
//   4. G: drive wildcard scan        Home PC — handles non-standard Google Drive layouts

const G_DRIVE_EXACT = "G:\\คอมพิวเตอร์เครื่องอื่นๆ\\คอมพิวเตอร์ของฉัน\\Shared";

function scanGDrive(): string | null {
  const gRoot = "G:\\";
  if (!fs.existsSync(gRoot)) return null;
  try {
    for (const l1 of fs.readdirSync(gRoot, { withFileTypes: true })) {
      if (!l1.isDirectory()) continue;
      const l1p = path.join(gRoot, l1.name);
      try {
        for (const l2 of fs.readdirSync(l1p, { withFileTypes: true })) {
          if (!l2.isDirectory()) continue;
          // depth-3: G:\l1\l2\Shared
          const at2 = path.join(l1p, l2.name, "Shared");
          if (fs.existsSync(at2)) return at2;
          const l2p = path.join(l1p, l2.name);
          try {
            for (const l3 of fs.readdirSync(l2p, { withFileTypes: true })) {
              if (!l3.isDirectory()) continue;
              // depth-4: G:\l1\l2\l3\Shared
              const at3 = path.join(l2p, l3.name, "Shared");
              if (fs.existsSync(at3)) return at3;
            }
          } catch { /* ignore inaccessible dirs */ }
        }
      } catch { /* ignore inaccessible dirs */ }
    }
  } catch { /* G: drive not accessible */ }
  return null;
}

let _cached: string | null | undefined;

/** Returns the Shared root folder, or null if not found on this machine. */
export function resolveSharedPath(): string | null {
  if (_cached !== undefined) return _cached;

  const envRoot = process.env.SHARED_ROOT;
  const fast = [
    ...(envRoot ? [envRoot] : []),
    "D:\\Projects\\shared",
    G_DRIVE_EXACT,
    path.resolve(process.cwd(), "..", "shared"),
  ];

  const found = fast.find((c) => fs.existsSync(c));
  _cached = found ?? scanGDrive() ?? null;
  return _cached;
}

/** Returns the investment-os-data subfolder, or null if not found. */
export function resolveInvestmentOsDataPath(): string | null {
  const root = resolveSharedPath();
  if (!root) return null;
  const p = path.join(root, "investment-os-data");
  return fs.existsSync(p) ? p : null;
}

/** Returns the Brain OS subfolder, or null if not found. */
export function resolveBrainOsPath(): string | null {
  const root = resolveSharedPath();
  if (!root) return null;
  const p = path.join(root, "Brain OS");
  return fs.existsSync(p) ? p : null;
}

/** Prints a diagnostic report — useful for validation scripts. */
export function validateSharedPaths(): void {
  const root = resolveSharedPath();
  const data = resolveInvestmentOsDataPath();
  const brainOs = resolveBrainOsPath();

  console.log("[shared-paths] Discovery results:");
  console.log(`  Shared root:       ${root ?? "NOT FOUND"}`);
  console.log(`  investment-os-data: ${data ?? "NOT FOUND"}`);
  console.log(`  Brain OS:          ${brainOs ?? "NOT FOUND"}`);

  if (!root) {
    console.error("[shared-paths] ERROR: No shared folder found. Tried:");
    if (process.env.SHARED_ROOT) console.error(`  SHARED_ROOT=${process.env.SHARED_ROOT}`);
    console.error("  D:\\Projects\\shared");
    console.error(`  ${G_DRIVE_EXACT}`);
    console.error(`  ${path.resolve(process.cwd(), "..", "shared")}`);
    console.error("  G: drive wildcard scan");
  }
}
