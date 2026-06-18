import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export interface PeerRow {
  ticker: string;
  companyName: string;
  isSubject: boolean;
  revenueGrowth:   number | null;
  grossMargin:     number | null;
  operatingMargin: number | null;
  roic:            number | null;
  debtToEquity:    number | null;
  freeCashFlow:    number | null; // USD millions
  companyScore:    number | null;
}

export async function GET(
  _req: Request,
  { params }: { params: { ticker: string } },
) {
  const ticker = params.ticker.toUpperCase();

  try {
    // Find subject sector
    const subject = await db.universe.findUnique({
      where: { ticker },
      include: {
        fundamentals: true,
        scores: { orderBy: { scoredAt: "desc" }, take: 1 },
      },
    });

    if (!subject) {
      return NextResponse.json({ error: "Ticker not found in universe" }, { status: 404 });
    }

    const sector = subject.sector;

    // Fetch peers from same sector (up to 6, sorted by latest score)
    const peerRows = sector
      ? await db.universe.findMany({
          where: {
            sector,
            ticker: { not: ticker },
            status: "active",
            assetType: "equity",
          },
          include: {
            fundamentals: true,
            scores: { orderBy: { scoredAt: "desc" }, take: 1 },
          },
          take: 10,
        })
      : [];

    // Sort by score descending, take top 5
    const sortedPeers = peerRows
      .sort((a, b) => (b.scores[0]?.totalScore ?? 0) - (a.scores[0]?.totalScore ?? 0))
      .slice(0, 5);

    function toRow(u: typeof subject, isSubject: boolean): PeerRow {
      return {
        ticker: u.ticker,
        companyName: u.companyName,
        isSubject,
        revenueGrowth:   u.fundamentals?.revenueGrowth   ?? null,
        grossMargin:     u.fundamentals?.grossMargin      ?? null,
        operatingMargin: u.fundamentals?.operatingMargin  ?? null,
        roic:            u.fundamentals?.roic             ?? null,
        debtToEquity:    u.fundamentals?.debtToEquity     ?? null,
        freeCashFlow:    u.fundamentals?.freeCashFlow      ?? null,
        companyScore:    u.scores[0]?.totalScore           ?? null,
      };
    }

    const rows: PeerRow[] = [
      toRow(subject, true),
      ...sortedPeers.map(p => toRow(p, false)),
    ];

    return NextResponse.json({ sector: sector ?? "Unknown", rows });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
