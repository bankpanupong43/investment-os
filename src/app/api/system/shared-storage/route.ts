import { NextResponse } from "next/server";
import { resolveSharedPath, resolveBrainOsPath, resolveInvestmentOsDataPath } from "@/lib/shared-paths";

// Filesystem checks depend on the container's runtime env vars — must not
// be statically cached at build time (build env lacks BRAIN_OS_ROOT).
export const dynamic = "force-dynamic";

export async function GET() {
  const root = resolveSharedPath();
  const brainOs = resolveBrainOsPath();
  const data = resolveInvestmentOsDataPath();
  return NextResponse.json({
    path: root ?? brainOs,
    status: root || brainOs ? "connected" : "missing",
    brainOsPath: brainOs,
    dataPath: data,
  });
}
