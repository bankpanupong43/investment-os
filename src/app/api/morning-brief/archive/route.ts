import { NextRequest, NextResponse } from "next/server";
import { listArchive, readArchiveEntry } from "@/lib/brief-archive-service";

// GET /api/morning-brief/archive — list all archived dates
// GET /api/morning-brief/archive?date=YYYY-MM-DD&format=md|html — read entry
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const format = (searchParams.get("format") ?? "md") as "md" | "html";

  if (date) {
    const content = readArchiveEntry(date, format);
    if (!content) {
      return NextResponse.json({ error: "Archive entry not found." }, { status: 404 });
    }
    const contentType = format === "html" ? "text/html" : "text/markdown";
    return new NextResponse(content, {
      headers: { "Content-Type": `${contentType}; charset=utf-8` },
    });
  }

  return NextResponse.json({ dates: listArchive() });
}
