import { NextRequest, NextResponse } from "next/server";
import { assembleThemeContext } from "@/lib/wiki-assemblers";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const name = req.nextUrl.searchParams.get("name");
  if (!name) {
    return NextResponse.json({ error: "name parameter is required" }, { status: 400 });
  }
  const context = assembleThemeContext(name);
  return NextResponse.json({ theme: name, context });
}
