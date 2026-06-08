import { NextRequest, NextResponse } from "next/server";
import { buildCapacity, buildOverexposure, buildBuyRanking, buildSellReview } from "@/lib/architect-v2";

// GET /api/architect/v2?section=capacity|overexposure|buy|sell
export async function GET(req: NextRequest): Promise<NextResponse> {
  const section = new URL(req.url).searchParams.get("section") ?? "all";
  try {
    switch (section) {
      case "capacity":     return NextResponse.json(await buildCapacity());
      case "overexposure": return NextResponse.json(await buildOverexposure());
      case "buy":          return NextResponse.json({ candidates: await buildBuyRanking() });
      case "sell":         return NextResponse.json({ flags: await buildSellReview() });
      default: {
        const [capacity, overexposure, buy, sell] = await Promise.all([
          buildCapacity(), buildOverexposure(), buildBuyRanking(), buildSellReview(),
        ]);
        return NextResponse.json({ capacity, overexposure, buyRanking: buy, sellReview: sell });
      }
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
