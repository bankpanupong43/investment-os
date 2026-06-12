import { NextResponse } from "next/server";
import { buildKnowledgeGraph, computeCentrality } from "@/lib/knowledge-graph-engine";

export async function GET() {
  try {
    const graph      = await buildKnowledgeGraph();
    const centrality = computeCentrality(graph);

    const nodes = graph.nodes.map(n => ({
      ...n,
      centralityScore: centrality.get(n.id) ?? 0,
    }));

    return NextResponse.json({ nodes, edges: graph.edges });
  } catch (e) {
    console.error("Knowledge graph full error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
