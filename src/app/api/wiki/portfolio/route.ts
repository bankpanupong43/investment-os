import { NextResponse } from "next/server";
import { assemblePortfolioContext } from "@/lib/wiki-assemblers";

export async function GET(): Promise<NextResponse> {
  const context = assemblePortfolioContext();
  return NextResponse.json({ context });
}
