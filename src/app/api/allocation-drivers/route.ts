import { NextResponse } from "next/server";
import { generateAllocationDrivers } from "@/lib/allocation-drivers-engine";

export async function GET(): Promise<NextResponse> {
  try {
    const result = await generateAllocationDrivers();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/allocation-drivers]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
