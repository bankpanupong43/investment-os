import { NextResponse } from "next/server";
import { resolveSharedPath, resolveBrainOsPath, resolveInvestmentOsDataPath } from "@/lib/shared-paths";

export async function GET() {
  const root = resolveSharedPath();
  const brainOs = resolveBrainOsPath();
  const data = resolveInvestmentOsDataPath();
  return NextResponse.json({
    path: root,
    status: root ? "connected" : "missing",
    brainOsPath: brainOs,
    dataPath: data,
  });
}
