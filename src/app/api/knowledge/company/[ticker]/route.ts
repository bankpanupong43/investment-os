import { NextResponse } from "next/server";
import {
  buildKnowledgeGraph,
  computeCentrality,
  buildCompanyKnowledge,
} from "@/lib/knowledge-graph-engine";

export async function GET(
  _req: Request,
  { params }: { params: { ticker: string } },
) {
  const ticker = params.ticker.toUpperCase();
  try {
    const graph      = await buildKnowledgeGraph();
    const centrality = computeCentrality(graph);
    const knowledge  = buildCompanyKnowledge(ticker, graph, centrality);

    if (!knowledge) {
      return NextResponse.json({ error: `No graph node found for ${ticker}` }, { status: 404 });
    }
    return NextResponse.json(knowledge);
  } catch (e) {
    console.error("Company knowledge error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
