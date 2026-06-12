// Knowledge Graph Engine — Phase 24
//
// Builds a relationship graph connecting companies, themes, regimes, decisions,
// and newsletters. Answers: "Why does X matter? What is it connected to?"
//
// Pure DB queries + config — no AI calls.

import { db } from "./db";
import {
  THEME_IDS,
  THEME_LABELS,
  TICKER_THEME_MAP,
  THEME_KEYWORDS,
  THEME_REGIME_ADJUSTMENTS,
  type ThemeId,
} from "../config/theme-mapping";
import { SIM_REGIMES } from "./allocation-simulator";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type NodeType = "COMPANY" | "THEME" | "REGIME" | "DECISION" | "NEWSLETTER" | "PORTFOLIO";
export type RelationType = "BELONGS_TO" | "MENTIONED_IN" | "SUPPORTS" | "CONTRADICTS" | "OWNS" | "IMPACTS";

export interface GraphNode {
  id: string;
  type: NodeType;
  name: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  relation: RelationType;
  strength: number; // 0–100
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface EntitySummary {
  node: GraphNode;
  centralityScore: number;
  degree: number;
}

export interface CompanyKnowledge {
  ticker: string;
  centralityScore: number;
  degree: number;
  owned: boolean;
  allocationPct: number;
  opportunityScore?: number;
  themes: { id: string; name: string }[];
  relatedCompanies: { ticker: string; sharedThemes: string[] }[];
  newsletters: { id: string; name: string; strength: number }[];
  decisions: { verdict: string; thesisStatus: string; confidence: number; date: string }[];
}

// ─── Static config ─────────────────────────────────────────────────────────────

// Allocation regime → simulation regime names for edge building
const ALLOC_TO_SIM_REGIMES: Record<string, string[]> = {
  "Risk On":  ["AI Expansion"],
  "Risk Off": ["Recession", "Liquidity Crisis", "Geopolitical Conflict"],
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function parseJsonSafe<T>(s: string | null | undefined, fallback: T): T {
  try { return JSON.parse(s ?? "") as T; } catch { return fallback; }
}

function sourceDisplayName(source: string): string {
  return source.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Graph builder ─────────────────────────────────────────────────────────────

export async function buildKnowledgeGraph(): Promise<KnowledgeGraph> {
  const nodeMap = new Map<string, GraphNode>();
  const edgeMap = new Map<string, GraphEdge & { _count: number }>();

  function addNode(n: GraphNode) {
    if (!nodeMap.has(n.id)) {
      nodeMap.set(n.id, n);
    } else if (n.score !== undefined && nodeMap.get(n.id)!.score === undefined) {
      nodeMap.set(n.id, { ...nodeMap.get(n.id)!, score: n.score });
    }
  }

  function addEdge(e: GraphEdge) {
    const key = `${e.source}||${e.target}||${e.relation}`;
    const ex  = edgeMap.get(key);
    if (ex) {
      ex.strength = Math.min(100, Math.round(ex.strength + e.strength * 0.2));
      ex._count++;
    } else {
      edgeMap.set(key, { ...e, _count: 1 });
    }
  }

  // ── Static nodes ──────────────────────────────────────────────────────────

  for (const id of THEME_IDS) {
    addNode({ id: `theme:${id}`, type: "THEME", name: THEME_LABELS[id] });
  }
  for (const r of SIM_REGIMES) {
    addNode({ id: `regime:${r}`, type: "REGIME", name: r });
  }
  addNode({ id: "portfolio", type: "PORTFOLIO", name: "My Portfolio" });

  // ── DB queries ────────────────────────────────────────────────────────────

  const [positions, universeItems, newsletters, decisions] = await Promise.all([
    db.position.findMany({ where: { status: "active" } }),
    db.universe.findMany({
      where: { status: "active" },
      select: { ticker: true },
    }).catch(() => [] as { ticker: string }[]),
    db.newsletterItem.findMany({
      orderBy: { publishedAt: "desc" },
      take: 600,
      select: { source: true, title: true, keyPoints: true, summary: true, publishedAt: true },
    }).catch(() => []),
    db.decisionReview.findMany({
      orderBy: { reviewDate: "desc" },
      take: 300,
    }).catch(() => []),
  ]);

  // Opportunity scores (best-effort)
  const latestScores = new Map<string, number>();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opps = await (db as any).opportunityScore.findMany({
      orderBy: { generatedAt: "desc" },
      take: 500,
      select: { ticker: true, opportunityScore: true },
    }) as { ticker: string; opportunityScore: number }[];
    for (const o of opps) {
      if (!latestScores.has(o.ticker)) latestScores.set(o.ticker, o.opportunityScore);
    }
  } catch { /* table may not exist in all environments */ }

  // ── Company nodes ─────────────────────────────────────────────────────────

  const ownedTickers = new Set(positions.map(p => p.ticker));

  for (const pos of positions) {
    addNode({
      id:       `company:${pos.ticker}`,
      type:     "COMPANY",
      name:     pos.ticker,
      score:    latestScores.get(pos.ticker),
      metadata: { owned: true, allocationPct: pos.allocationPct ?? 0 },
    });
    addEdge({ source: "portfolio", target: `company:${pos.ticker}`, relation: "OWNS", strength: 90 });
  }

  for (const u of universeItems) {
    if (!ownedTickers.has(u.ticker)) {
      addNode({
        id:    `company:${u.ticker}`,
        type:  "COMPANY",
        name:  u.ticker,
        score: latestScores.get(u.ticker),
        metadata: { owned: false, allocationPct: 0 },
      });
    }
  }

  // ── COMPANY → THEME edges ─────────────────────────────────────────────────

  for (const [ticker, themeId] of Object.entries(TICKER_THEME_MAP)) {
    const cId = `company:${ticker}`;
    if (nodeMap.has(cId)) {
      addEdge({ source: cId, target: `theme:${themeId}`, relation: "BELONGS_TO", strength: 80 });
    }
  }

  // ── REGIME → THEME edges ──────────────────────────────────────────────────

  for (const [allocRegime, simRegimes] of Object.entries(ALLOC_TO_SIM_REGIMES)) {
    const adjustments = THEME_REGIME_ADJUSTMENTS[allocRegime] ?? {};
    for (const simRegime of simRegimes) {
      for (const [themeId, adj] of Object.entries(adjustments) as [ThemeId, number][]) {
        if (Math.abs(adj) < 3) continue;
        const relation: RelationType = adj > 0 ? "IMPACTS" : "CONTRADICTS";
        addEdge({
          source:   `regime:${simRegime}`,
          target:   `theme:${themeId}`,
          relation,
          strength: Math.min(100, Math.abs(adj) * 6),
        });
      }
    }
  }

  // ── DECISION nodes + edges ────────────────────────────────────────────────

  const latestDecByTicker = new Map<string, typeof decisions[0]>();
  for (const d of decisions) {
    if (!latestDecByTicker.has(d.ticker)) latestDecByTicker.set(d.ticker, d);
  }

  for (const [ticker, d] of latestDecByTicker) {
    const dId = `decision:${ticker}`;
    addNode({
      id:       dId,
      type:     "DECISION",
      name:     `${d.verdict} ${ticker}`,
      metadata: {
        verdict:      d.verdict,
        thesisStatus: d.thesisStatus,
        confidence:   d.confidence,
        reviewDate:   d.reviewDate?.toISOString(),
      },
    });
    const isSupport             = ["Strengthen", "Hold"].includes(d.verdict);
    const relation: RelationType = isSupport ? "SUPPORTS" : "CONTRADICTS";
    addEdge({
      source:   dId,
      target:   `company:${ticker}`,
      relation,
      strength: Math.max(20, d.confidence),
    });
  }

  // ── NEWSLETTER source nodes + edges ───────────────────────────────────────

  const knownTickers    = new Set(Object.keys(TICKER_THEME_MAP));
  const allThemeKeywords = Object.entries(THEME_KEYWORDS) as [ThemeId, string[]][];

  // Per-source aggregators
  const sourceTickers = new Map<string, Map<string, number>>();
  const sourceThemes  = new Map<string, Map<ThemeId, number>>();
  const sourceDates   = new Map<string, Date>();

  for (const nl of newsletters) {
    if (!sourceTickers.has(nl.source)) {
      sourceTickers.set(nl.source, new Map());
      sourceThemes.set(nl.source,  new Map());
    }
    if (!sourceDates.has(nl.source) || nl.publishedAt > sourceDates.get(nl.source)!) {
      sourceDates.set(nl.source, nl.publishedAt);
    }

    const text = ` ${(
      nl.title + " " +
      parseJsonSafe<string[]>(nl.keyPoints, []).join(" ") + " " +
      parseJsonSafe<string[]>(nl.summary, []).join(" ")
    ).toLowerCase()} `;

    for (const ticker of knownTickers) {
      // Word-bounded: surround with space/punctuation
      const t = ticker.toLowerCase();
      if (text.includes(` ${t} `) || text.includes(` ${t},`) || text.includes(` ${t}.`)) {
        const m = sourceTickers.get(nl.source)!;
        m.set(ticker, (m.get(ticker) ?? 0) + 1);
      }
    }

    for (const [themeId, keywords] of allThemeKeywords) {
      const matched = keywords.some(kw => text.includes(kw.toLowerCase()));
      if (matched) {
        const m = sourceThemes.get(nl.source)!;
        m.set(themeId, (m.get(themeId) ?? 0) + 1);
      }
    }
  }

  for (const [source, tickers] of sourceTickers) {
    const nlId = `newsletter:${source}`;
    addNode({
      id:       nlId,
      type:     "NEWSLETTER",
      name:     sourceDisplayName(source),
      metadata: { source, lastDate: sourceDates.get(source)?.toISOString() },
    });

    for (const [ticker, count] of tickers) {
      const cId = `company:${ticker}`;
      if (nodeMap.has(cId)) {
        addEdge({
          source:   nlId,
          target:   cId,
          relation: "MENTIONED_IN",
          strength: Math.min(95, 30 + count * 12),
        });
      }
    }

    for (const [themeId, count] of (sourceThemes.get(source) ?? new Map())) {
      addEdge({
        source:   nlId,
        target:   `theme:${themeId}`,
        relation: "MENTIONED_IN",
        strength: Math.min(88, 25 + count * 7),
      });
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges: Array.from(edgeMap.values()).map(({ _count: _, ...e }) => e),
  };
}

// ─── Centrality ────────────────────────────────────────────────────────────────

export function computeCentrality(graph: KnowledgeGraph): Map<string, number> {
  const degree   = new Map<string, number>();
  const strength = new Map<string, number>();

  for (const e of graph.edges) {
    degree.set(e.source,   (degree.get(e.source)   ?? 0) + 1);
    degree.set(e.target,   (degree.get(e.target)   ?? 0) + 1);
    strength.set(e.source, (strength.get(e.source) ?? 0) + e.strength);
    strength.set(e.target, (strength.get(e.target) ?? 0) + e.strength);
  }

  const result = new Map<string, number>();
  for (const n of graph.nodes) {
    const deg = degree.get(n.id)   ?? 0;
    const str = strength.get(n.id) ?? 0;
    const avg = deg > 0 ? str / deg : 0;
    result.set(n.id, Math.round(Math.min(100, deg * 5 + avg * 0.35)));
  }
  return result;
}

// ─── Subgraph extractors ───────────────────────────────────────────────────────

export function getCompanyGraph(ticker: string, graph: KnowledgeGraph): KnowledgeGraph {
  const cId = `company:${ticker}`;
  if (!graph.nodes.find(n => n.id === cId)) return { nodes: [], edges: [] };

  const directEdges = graph.edges.filter(e => e.source === cId || e.target === cId);
  const connected   = new Set<string>([cId]);
  for (const e of directEdges) { connected.add(e.source); connected.add(e.target); }

  // Include sibling companies via shared theme
  const myThemes = new Set<string>(
    directEdges
      .filter(e => e.relation === "BELONGS_TO" && e.source === cId)
      .map(e => e.target),
  );
  for (const e of graph.edges) {
    if (e.relation === "BELONGS_TO" && myThemes.has(e.target)) connected.add(e.source);
  }

  return {
    nodes: graph.nodes.filter(n => connected.has(n.id)),
    edges: graph.edges.filter(e => connected.has(e.source) && connected.has(e.target)),
  };
}

export function getThemeGraph(themeId: string, graph: KnowledgeGraph): KnowledgeGraph {
  const tId = `theme:${themeId}`;
  if (!graph.nodes.find(n => n.id === tId)) return { nodes: [], edges: [] };

  const connected = new Set<string>([tId]);
  for (const e of graph.edges) {
    if (e.source === tId || e.target === tId) {
      connected.add(e.source);
      connected.add(e.target);
    }
  }

  return {
    nodes: graph.nodes.filter(n => connected.has(n.id)),
    edges: graph.edges.filter(e => connected.has(e.source) && connected.has(e.target)),
  };
}

export function getRegimeGraph(regime: string, graph: KnowledgeGraph): KnowledgeGraph {
  const rId = `regime:${regime}`;
  if (!graph.nodes.find(n => n.id === rId)) return { nodes: [], edges: [] };

  const connected = new Set<string>([rId]);
  for (const e of graph.edges) {
    if (e.source === rId) connected.add(e.target); // regime → themes
  }
  for (const e of graph.edges) {
    if (e.relation === "BELONGS_TO" && connected.has(e.target)) connected.add(e.source); // companies in those themes
  }

  return {
    nodes: graph.nodes.filter(n => connected.has(n.id)),
    edges: graph.edges.filter(e => connected.has(e.source) && connected.has(e.target)),
  };
}

// ─── Most-connected rankings ───────────────────────────────────────────────────

export function getMostConnected(
  graph: KnowledgeGraph,
  centrality: Map<string, number>,
  type?: NodeType,
  limit = 10,
): EntitySummary[] {
  const degreeMap = new Map<string, number>();
  for (const e of graph.edges) {
    degreeMap.set(e.source, (degreeMap.get(e.source) ?? 0) + 1);
    degreeMap.set(e.target, (degreeMap.get(e.target) ?? 0) + 1);
  }

  return graph.nodes
    .filter(n => type === undefined || n.type === type)
    .map(n => ({
      node:            n,
      centralityScore: centrality.get(n.id) ?? 0,
      degree:          degreeMap.get(n.id)   ?? 0,
    }))
    .sort((a, b) => b.centralityScore - a.centralityScore)
    .slice(0, limit);
}

// ─── Company knowledge summary ────────────────────────────────────────────────

export function buildCompanyKnowledge(
  ticker: string,
  graph: KnowledgeGraph,
  centrality: Map<string, number>,
): CompanyKnowledge | null {
  const cId  = `company:${ticker}`;
  const node = graph.nodes.find(n => n.id === cId);
  if (!node) return null;

  const degree = graph.edges.filter(e => e.source === cId || e.target === cId).length;

  // Themes
  const themes: CompanyKnowledge["themes"] = graph.edges
    .filter(e => e.source === cId && e.relation === "BELONGS_TO")
    .map(e => {
      const tNode = graph.nodes.find(n => n.id === e.target);
      return tNode ? { id: e.target.replace("theme:", ""), name: tNode.name } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const myThemeIds = new Set(themes.map(t => `theme:${t.id}`));

  // Related companies via shared themes
  const relatedMap = new Map<string, Set<string>>(); // ticker → Set<themeName>
  for (const e of graph.edges) {
    if (e.relation === "BELONGS_TO" && myThemeIds.has(e.target) && e.source !== cId) {
      const sibling = e.source.replace("company:", "");
      if (!relatedMap.has(sibling)) relatedMap.set(sibling, new Set());
      const tNode = graph.nodes.find(n => n.id === e.target);
      if (tNode) relatedMap.get(sibling)!.add(tNode.name);
    }
  }
  const relatedCompanies: CompanyKnowledge["relatedCompanies"] = Array.from(relatedMap.entries())
    .map(([t, themes]) => ({ ticker: t, sharedThemes: Array.from(themes) }))
    .sort((a, b) => b.sharedThemes.length - a.sharedThemes.length)
    .slice(0, 12);

  // Newsletter sources mentioning this company
  const newsletters: CompanyKnowledge["newsletters"] = graph.edges
    .filter(e => e.target === cId && e.relation === "MENTIONED_IN")
    .map(e => {
      const nlNode = graph.nodes.find(n => n.id === e.source);
      return nlNode ? { id: e.source, name: nlNode.name, strength: e.strength } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.strength - a.strength);

  // Decisions
  const decisions: CompanyKnowledge["decisions"] = graph.edges
    .filter(e => e.target === cId && (e.relation === "SUPPORTS" || e.relation === "CONTRADICTS"))
    .map(e => {
      const dNode = graph.nodes.find(n => n.id === e.source);
      if (!dNode?.metadata) return null;
      const m = dNode.metadata as Record<string, unknown>;
      return {
        verdict:      String(m.verdict      ?? ""),
        thesisStatus: String(m.thesisStatus ?? ""),
        confidence:   Number(m.confidence   ?? 0),
        date:         String(m.reviewDate   ?? ""),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return {
    ticker,
    centralityScore: centrality.get(cId) ?? 0,
    degree,
    owned:           Boolean(node.metadata?.owned),
    allocationPct:   Number(node.metadata?.allocationPct ?? 0),
    opportunityScore: node.score,
    themes,
    relatedCompanies,
    newsletters,
    decisions,
  };
}
