import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  buildKnowledgeGraph,
  computeCentrality,
  getMostConnected,
} from "@/lib/knowledge-graph-engine";

export async function GET() {
  try {
    const graph      = await buildKnowledgeGraph();
    const centrality = computeCentrality(graph);

    const topCompanies = getMostConnected(graph, centrality, "COMPANY", 12);
    const topThemes    = getMostConnected(graph, centrality, "THEME",   8);

    // Active regime from morning brief
    const brief = await db.morningBrief.findFirst({ orderBy: { briefingDate: "desc" } });
    const activeRegime = brief?.marketRegime ?? "Neutral";

    // Regime → theme impacts for the current display regime
    const aiExpansionId = "regime:AI Expansion";
    const impactedThemes = graph.edges
      .filter(e => e.source === aiExpansionId)
      .map(e => {
        const tNode = graph.nodes.find(n => n.id === e.target);
        return tNode ? { name: tNode.name, relation: e.relation, strength: e.strength } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.strength - a.strength);

    // Recent decisions (from DECISION nodes)
    const recentDecisions = graph.nodes
      .filter(n => n.type === "DECISION" && n.metadata)
      .map(n => {
        const m = n.metadata as Record<string, unknown>;
        return {
          ticker:      n.id.replace("decision:", ""),
          verdict:     String(m.verdict      ?? ""),
          thesisStatus: String(m.thesisStatus ?? ""),
          confidence:  Number(m.confidence   ?? 0),
          date:        String(m.reviewDate   ?? ""),
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8);

    // Node type counts
    const counts = graph.nodes.reduce<Record<string, number>>((acc, n) => {
      acc[n.type] = (acc[n.type] ?? 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      stats: {
        totalNodes:  graph.nodes.length,
        totalEdges:  graph.edges.length,
        companies:   counts["COMPANY"]    ?? 0,
        themes:      counts["THEME"]      ?? 0,
        regimes:     counts["REGIME"]     ?? 0,
        newsletters: counts["NEWSLETTER"] ?? 0,
        decisions:   counts["DECISION"]   ?? 0,
      },
      topCompanies,
      topThemes,
      activeRegime,
      impactedThemes,
      recentDecisions,
    });
  } catch (e) {
    console.error("Knowledge graph error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
