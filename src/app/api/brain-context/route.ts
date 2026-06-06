import { NextResponse } from "next/server";
import { loadBrainContext } from "@/lib/brain-os-context";

export async function GET(): Promise<NextResponse> {
  const ctx = loadBrainContext();
  return NextResponse.json(ctx);
}
