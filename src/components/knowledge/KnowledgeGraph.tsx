"use client";

import ReactFlow, {
  type Node,
  type Edge,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Handle,
  Position,
  type NodeTypes,
  MarkerType,
  BackgroundVariant,
  ReactFlowProvider,
} from "reactflow";
import "reactflow/dist/style.css";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { NodeType, RelationType } from "@/lib/knowledge-graph-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FullGraphNode {
  id: string;
  type: NodeType;
  name: string;
  score?: number;
  metadata?: Record<string, unknown>;
  centralityScore: number;
}

interface GraphEdge {
  source: string;
  target: string;
  relation: RelationType;
  strength: number;
}

interface VisualGraphData {
  nodes: FullGraphNode[];
  edges: GraphEdge[];
}

interface NodeData {
  label: string;
  nodeType: NodeType;
  centralityScore: number;
  metadata?: Record<string, unknown>;
  score?: number;
  highlighted: boolean;
  dimmed: boolean;
  originalNode: FullGraphNode;
}

// ─── Colors & config ──────────────────────────────────────────────────────────

const TYPE_COLORS: Record<NodeType, string> = {
  COMPANY:    "#3E6AE1",
  THEME:      "#15803D",
  REGIME:     "#C2410C",
  NEWSLETTER: "#7C3AED",
  DECISION:   "#6B7280",
  PORTFOLIO:  "#1D4ED8",
};

const VERDICT_BORDER: Record<string, string> = {
  Strengthen: "#15803D",
  Hold:       "#3E6AE1",
  Reduce:     "#D97706",
  Exit:       "#DC2626",
};

const FILTER_TYPES: NodeType[] = ["COMPANY", "THEME", "REGIME", "NEWSLETTER", "DECISION"];
const FILTER_LABELS: Record<NodeType, string> = {
  COMPANY: "Companies", THEME: "Themes", REGIME: "Regimes",
  NEWSLETTER: "Newsletters", DECISION: "Decisions", PORTFOLIO: "Portfolio",
};

// ─── Layout ───────────────────────────────────────────────────────────────────

function djitter(id: string, range: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0x7fffffff;
  return ((h % 1000) / 1000 - 0.5) * range;
}

function computeLayout(
  nodes: FullGraphNode[],
  edges: GraphEdge[],
): Record<string, { x: number; y: number }> {
  const TYPE_CENTERS: Partial<Record<NodeType, { x: number; y: number }>> = {
    COMPANY:    { x:    0, y:    0 },
    THEME:      { x: -700, y:  -50 },
    REGIME:     { x: -200, y: -620 },
    NEWSLETTER: { x:  650, y: -480 },
    DECISION:   { x:  680, y:  250 },
    PORTFOLIO:  { x:    0, y:    0 },
  };

  const typeGroups: Partial<Record<NodeType, FullGraphNode[]>> = {};
  for (const n of nodes) {
    if (!typeGroups[n.type]) typeGroups[n.type] = [];
    typeGroups[n.type]!.push(n);
  }

  const pos: Record<string, { x: number; y: number }> = {};
  for (const [type, group] of Object.entries(typeGroups) as [NodeType, FullGraphNode[]][]) {
    const center = TYPE_CENTERS[type] ?? { x: 0, y: 0 };
    if (group.length === 1) {
      pos[group[0].id] = { x: center.x, y: center.y };
      continue;
    }
    const r = Math.max(80, Math.sqrt(group.length) * 90);
    group.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / group.length - Math.PI / 2;
      pos[n.id] = {
        x: center.x + r * Math.cos(angle) + djitter(n.id, 40),
        y: center.y + r * Math.sin(angle) + djitter(n.id + "_y", 40),
      };
    });
  }

  // Force simulation
  const REPULSION  = 15000;
  const SPRING_K   = 0.06;
  const IDEAL_LEN  = 160;
  const ITERATIONS = 100;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const forces: Record<string, { x: number; y: number }> = {};
    const ids = Object.keys(pos);
    for (const id of ids) forces[id] = { x: 0, y: 0 };

    // Repulsion
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = pos[ids[i]], b = pos[ids[j]];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
        const f = REPULSION / (dist * dist);
        const fx = (dx / dist) * f, fy = (dy / dist) * f;
        forces[ids[i]].x -= fx; forces[ids[i]].y -= fy;
        forces[ids[j]].x += fx; forces[ids[j]].y += fy;
      }
    }

    // Spring attraction
    for (const e of edges) {
      if (!pos[e.source] || !pos[e.target]) continue;
      const a = pos[e.source], b = pos[e.target];
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
      const f = SPRING_K * (dist - IDEAL_LEN);
      const fx = (dx / dist) * f, fy = (dy / dist) * f;
      forces[e.source].x += fx; forces[e.source].y += fy;
      forces[e.target].x -= fx; forces[e.target].y -= fy;
    }

    const cooling = Math.max(0.05, 1 - iter / ITERATIONS) * 0.4;
    for (const id of ids) {
      pos[id].x = (pos[id].x + forces[id].x * cooling);
      pos[id].y = (pos[id].y + forces[id].y * cooling);
    }
  }

  return pos;
}

// ─── Edge builder ─────────────────────────────────────────────────────────────

function buildRfEdge(e: GraphEdge): Edge {
  const id   = `${e.source}--${e.relation}--${e.target}`;
  const base = { id, source: e.source, target: e.target, type: "bezier" };
  switch (e.relation) {
    case "BELONGS_TO":
      return { ...base, style: { stroke: "#BBBBBB", strokeWidth: 1, opacity: 0.55 } };
    case "MENTIONED_IN":
      return { ...base, style: { stroke: "#9F7AEA", strokeWidth: 1.5, strokeDasharray: "4 3", opacity: 0.65 } };
    case "SUPPORTS":
      return { ...base, style: { stroke: "#15803D", strokeWidth: 2.5, opacity: 0.8 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#15803D" } };
    case "CONTRADICTS":
      return { ...base, style: { stroke: "#DC2626", strokeWidth: 2.5, opacity: 0.8 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#DC2626" } };
    case "IMPACTS":
      return { ...base, style: { stroke: "#3E6AE1", strokeWidth: 2, opacity: 0.7 } };
    case "OWNS":
      return { ...base, style: { stroke: "#D97706", strokeWidth: 1.5, strokeDasharray: "6 3", opacity: 0.5 } };
    default:
      return { ...base, style: { stroke: "#CCCCCC", strokeWidth: 1, opacity: 0.5 } };
  }
}

// ─── Handles ─────────────────────────────────────────────────────────────────

const HS = { opacity: 0, width: 1, height: 1, minWidth: 1, minHeight: 1, border: "none", background: "transparent" } as const;

function Handles() {
  return (
    <>
      <Handle type="source" id="s-t" position={Position.Top}    style={HS} />
      <Handle type="source" id="s-r" position={Position.Right}  style={HS} />
      <Handle type="source" id="s-b" position={Position.Bottom} style={HS} />
      <Handle type="source" id="s-l" position={Position.Left}   style={HS} />
      <Handle type="target" id="t-t" position={Position.Top}    style={HS} />
      <Handle type="target" id="t-r" position={Position.Right}  style={HS} />
      <Handle type="target" id="t-b" position={Position.Bottom} style={HS} />
      <Handle type="target" id="t-l" position={Position.Left}   style={HS} />
    </>
  );
}

// ─── Custom nodes ─────────────────────────────────────────────────────────────

function CompanyNode({ data }: { data: NodeData }) {
  const owned = Boolean(data.metadata?.owned);
  const sz    = 58 + Math.round((data.centralityScore / 100) * 44);
  return (
    <div style={{
      background: owned ? "#EFF6FF" : "#FFFFFF",
      border: `${owned ? 2 : 1.5}px solid ${owned ? "#3E6AE1" : "#B0C4E8"}`,
      borderRadius: 6,
      padding: "5px 10px",
      fontSize: 10,
      fontWeight: 700,
      color: "#171A20",
      minWidth: sz,
      textAlign: "center",
      opacity: data.dimmed ? 0.2 : 1,
      boxShadow: data.highlighted ? "0 0 0 3px #3E6AE1" : "0 1px 3px rgba(0,0,0,0.08)",
      transition: "opacity 0.15s, box-shadow 0.15s",
      cursor: "pointer",
      userSelect: "none",
    }}>
      <Handles />
      {data.label}
      {owned && <span style={{ display: "block", fontSize: 7, color: "#3E6AE1", fontWeight: 600, marginTop: 1 }}>owned</span>}
    </div>
  );
}

function ThemeNode({ data }: { data: NodeData }) {
  const sz = 78 + Math.round((data.centralityScore / 100) * 36);
  return (
    <div style={{
      background: "#F0FDF4",
      border: "1.5px solid #15803D",
      borderRadius: 20,
      padding: "5px 12px",
      fontSize: 10,
      fontWeight: 600,
      color: "#14532D",
      minWidth: sz,
      textAlign: "center",
      opacity: data.dimmed ? 0.2 : 1,
      boxShadow: data.highlighted ? "0 0 0 3px #15803D" : "0 1px 2px rgba(0,0,0,0.06)",
      transition: "opacity 0.15s, box-shadow 0.15s",
      cursor: "pointer",
      userSelect: "none",
      whiteSpace: "nowrap",
    }}>
      <Handles />
      {data.label}
    </div>
  );
}

function RegimeNode({ data }: { data: NodeData }) {
  const sz = 72;
  return (
    <div style={{ position: "relative", width: sz, height: sz, opacity: data.dimmed ? 0.2 : 1, cursor: "pointer", userSelect: "none", transition: "opacity 0.15s" }}>
      <Handles />
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
        background: "#FFF7ED",
        border: "2px solid #C2410C",
        transform: "rotate(45deg)",
        boxShadow: data.highlighted ? "0 0 0 3px #C2410C" : "0 1px 3px rgba(0,0,0,0.1)",
        transition: "box-shadow 0.15s",
      }} />
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 9, fontWeight: 700, color: "#7C2D12",
        textAlign: "center", padding: "0 6px", lineHeight: 1.2,
      }}>
        {data.label}
      </div>
    </div>
  );
}

function NewsletterNode({ data }: { data: NodeData }) {
  const sz = 62 + Math.round((data.centralityScore / 100) * 20);
  return (
    <div style={{
      background: "#FAF5FF",
      border: "2px solid #7C3AED",
      borderRadius: "50%",
      width: sz, height: sz,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 9, fontWeight: 600, color: "#581C87",
      textAlign: "center", padding: 4,
      opacity: data.dimmed ? 0.2 : 1,
      boxShadow: data.highlighted ? "0 0 0 3px #7C3AED" : "0 1px 2px rgba(0,0,0,0.08)",
      transition: "opacity 0.15s, box-shadow 0.15s",
      cursor: "pointer", userSelect: "none", lineHeight: 1.2,
    }}>
      <Handles />
      {data.label}
    </div>
  );
}

function DecisionNode({ data }: { data: NodeData }) {
  const verdict     = String(data.metadata?.verdict ?? "");
  const borderColor = VERDICT_BORDER[verdict] ?? "#6B7280";
  return (
    <div style={{
      background: "#F9FAFB",
      border: `2px solid ${borderColor}`,
      borderRadius: 4,
      padding: "4px 14px",
      fontSize: 10,
      fontWeight: 600,
      color: "#111827",
      textAlign: "center",
      opacity: data.dimmed ? 0.2 : 1,
      boxShadow: data.highlighted ? `0 0 0 3px ${borderColor}` : "0 1px 2px rgba(0,0,0,0.08)",
      transition: "opacity 0.15s, box-shadow 0.15s",
      cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
      clipPath: "polygon(8% 0%, 92% 0%, 100% 50%, 92% 100%, 8% 100%, 0% 50%)",
    }}>
      <Handles />
      {data.label}
    </div>
  );
}

function PortfolioNode({ data }: { data: NodeData }) {
  return (
    <div style={{
      background: "#EFF6FF", border: "2px solid #1D4ED8", borderRadius: 8,
      padding: "8px 16px", fontSize: 11, fontWeight: 700, color: "#1E3A8A",
      textAlign: "center", opacity: data.dimmed ? 0.2 : 1,
      boxShadow: data.highlighted ? "0 0 0 3px #1D4ED8" : "0 2px 6px rgba(0,0,0,0.1)",
      transition: "opacity 0.15s, box-shadow 0.15s",
      cursor: "pointer", userSelect: "none",
    }}>
      <Handles />
      {data.label}
    </div>
  );
}

const NODE_TYPES: NodeTypes = {
  COMPANY: CompanyNode,
  THEME: ThemeNode,
  REGIME: RegimeNode,
  NEWSLETTER: NewsletterNode,
  DECISION: DecisionNode,
  PORTFOLIO: PortfolioNode,
};

// ─── Side panel ───────────────────────────────────────────────────────────────

function SidePanel({
  node, allNodes, allEdges, onClose,
}: {
  node: FullGraphNode;
  allNodes: FullGraphNode[];
  allEdges: GraphEdge[];
  onClose: () => void;
}) {
  const nodeMap   = new Map(allNodes.map(n => [n.id, n]));
  const outEdges  = allEdges.filter(e => e.source === node.id);
  const inEdges   = allEdges.filter(e => e.target === node.id);

  const themes = outEdges
    .filter(e => e.relation === "BELONGS_TO")
    .map(e => nodeMap.get(e.target)).filter((x): x is FullGraphNode => !!x);

  const newsletters = inEdges
    .filter(e => e.relation === "MENTIONED_IN")
    .map(e => ({ nl: nodeMap.get(e.source), strength: e.strength }))
    .filter((x): x is { nl: FullGraphNode; strength: number } => !!x.nl);

  const decisions = inEdges
    .filter(e => e.relation === "SUPPORTS" || e.relation === "CONTRADICTS")
    .map(e => nodeMap.get(e.source)).filter((x): x is FullGraphNode => !!x);

  const relatedCompanies = (() => {
    if (node.type !== "COMPANY") return [];
    const myThemes = new Set(outEdges.filter(e => e.relation === "BELONGS_TO").map(e => e.target));
    const seen = new Set<string>();
    const result: FullGraphNode[] = [];
    for (const e of allEdges) {
      if (e.relation === "BELONGS_TO" && myThemes.has(e.target) && e.source !== node.id && !seen.has(e.source)) {
        const n = nodeMap.get(e.source);
        if (n) { result.push(n); seen.add(e.source); }
      }
    }
    return result.slice(0, 12);
  })();

  const impactedThemes = (() => {
    if (node.type !== "REGIME") return [] as { t: FullGraphNode; relation: RelationType; strength: number }[];
    return outEdges
      .filter(e => e.relation === "IMPACTS" || e.relation === "CONTRADICTS")
      .map(e => ({ t: nodeMap.get(e.target), relation: e.relation, strength: e.strength }))
      .filter(x => x.t !== undefined)
      .map(x => ({ t: x.t as FullGraphNode, relation: x.relation, strength: x.strength }));
  })();

  const accentColor = TYPE_COLORS[node.type] ?? "#6B7280";
  const isCompany   = node.type === "COMPANY";
  const owned       = Boolean(node.metadata?.owned);

  return (
    <div style={{
      position: "absolute", top: 0, right: 0, bottom: 0, width: 288,
      background: "white", borderLeft: "1px solid #EEEEEE",
      display: "flex", flexDirection: "column", zIndex: 10,
      boxShadow: "-4px 0 16px rgba(0,0,0,0.06)",
    }}>
      {/* Header */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #EEEEEE", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#171A20" }}>{node.name}</div>
          <span style={{
            display: "inline-block", marginTop: 4, fontSize: 10, fontWeight: 600,
            padding: "2px 8px", borderRadius: 4,
            background: accentColor + "18", color: accentColor, border: `1px solid ${accentColor}44`,
          }}>
            {node.type}
          </span>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#8E8E8E", fontSize: 20, lineHeight: 1, padding: "0 4px" }}>
          ×
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Centrality bar */}
        <div>
          <div style={{ fontSize: 10, color: "#8E8E8E", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Centrality</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, height: 6, background: "#EEEEEE", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${node.centralityScore}%`, background: accentColor, borderRadius: 3 }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: accentColor, minWidth: 24, textAlign: "right" }}>{node.centralityScore}</span>
          </div>
        </div>

        {/* Opportunity score */}
        {isCompany && node.score !== undefined && (
          <div>
            <div style={{ fontSize: 10, color: "#8E8E8E", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Opportunity Score</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#171A20" }}>{node.score.toFixed(0)}</div>
          </div>
        )}

        {/* Themes */}
        {themes.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: "#8E8E8E", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Themes</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {themes.map(t => (
                <span key={t.id} style={{ fontSize: 10, padding: "3px 8px", background: "#F0FDF4", color: "#15803D", border: "1px solid #BBF7D0", borderRadius: 12 }}>
                  {t.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Related companies */}
        {relatedCompanies.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: "#8E8E8E", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Related Companies</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {relatedCompanies.map(c => (
                <Link key={c.id} href={`/portfolio/${c.name}`} style={{
                  fontSize: 10, padding: "3px 8px", background: "#EFF6FF", color: "#3E6AE1",
                  border: "1px solid #BFDBFE", borderRadius: 4, textDecoration: "none", fontWeight: 600,
                }}>
                  {c.name}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Newsletter mentions */}
        {newsletters.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: "#8E8E8E", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Newsletter Mentions</div>
            {newsletters.map(({ nl, strength }) => (
              <div key={nl.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ fontSize: 11, color: "#171A20" }}>{nl.name}</span>
                <span style={{ fontSize: 11, color: "#7C3AED", fontWeight: 600 }}>{strength}</span>
              </div>
            ))}
          </div>
        )}

        {/* Decision reviews */}
        {decisions.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: "#8E8E8E", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Decision Reviews</div>
            {decisions.map(d => {
              const m       = d.metadata as Record<string, unknown> | undefined;
              const verdict = String(m?.verdict ?? "");
              const bc      = VERDICT_BORDER[verdict] ?? "#6B7280";
              return (
                <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                  <span style={{ fontSize: 10, padding: "2px 8px", background: "#F9FAFB", border: `1px solid ${bc}`, color: bc, borderRadius: 4, fontWeight: 600 }}>{verdict}</span>
                  <span style={{ fontSize: 11, color: "#5C5E62" }}>{String(m?.thesisStatus ?? "")}</span>
                  <span style={{ fontSize: 11, color: "#8E8E8E", tabularNums: true } as React.CSSProperties}>{String(m?.confidence ?? "")}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Regime → theme impacts */}
        {impactedThemes.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: "#8E8E8E", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Theme Impacts</div>
            {impactedThemes.map(({ t, relation, strength }) => (
              <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                <span style={{ fontSize: 11, color: "#171A20" }}>{t.name}</span>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 4,
                  background: relation === "IMPACTS" ? "#F0FDF4" : "#FEF2F2",
                  color: relation === "IMPACTS" ? "#15803D" : "#DC2626",
                }}>
                  {relation === "IMPACTS" ? "↑" : "↓"} {strength}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Connections pointing TO this node (newsletter sources mentioning themes, etc.) */}
        {node.type === "THEME" && (() => {
          const mentioners = inEdges
            .filter(e => e.relation === "MENTIONED_IN")
            .map(e => ({ nl: nodeMap.get(e.source), strength: e.strength }))
            .filter((x): x is { nl: FullGraphNode; strength: number } => !!x.nl);
          if (!mentioners.length) return null;
          return (
            <div>
              <div style={{ fontSize: 10, color: "#8E8E8E", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Mentioned By</div>
              {mentioners.map(({ nl, strength }) => (
                <div key={nl.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: 11, color: "#171A20" }}>{nl.name}</span>
                  <span style={{ fontSize: 11, color: "#7C3AED", fontWeight: 600 }}>{strength}</span>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Companies in this theme */}
        {node.type === "THEME" && (() => {
          const cos = allEdges
            .filter(e => e.target === node.id && e.relation === "BELONGS_TO")
            .map(e => nodeMap.get(e.source)).filter((x): x is FullGraphNode => !!x);
          if (!cos.length) return null;
          return (
            <div>
              <div style={{ fontSize: 10, color: "#8E8E8E", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Companies</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {cos.map(c => (
                  <Link key={c.id} href={`/portfolio/${c.name}`} style={{
                    fontSize: 10, padding: "3px 8px", background: "#EFF6FF", color: "#3E6AE1",
                    border: "1px solid #BFDBFE", borderRadius: 4, textDecoration: "none", fontWeight: 600,
                  }}>
                    {c.name}
                  </Link>
                ))}
              </div>
            </div>
          );
        })()}

        {/* CTA buttons for company nodes */}
        {isCompany && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
            {owned && (
              <Link href={`/portfolio/${node.name}`} style={{
                display: "block", textAlign: "center", padding: "7px 16px",
                background: "#3E6AE1", color: "white", borderRadius: 6,
                fontSize: 12, fontWeight: 600, textDecoration: "none",
              }}>
                View Position
              </Link>
            )}
            <Link href={`/research?q=${node.name}`} style={{
              display: "block", textAlign: "center", padding: "7px 16px",
              background: "#F4F4F4", color: "#171A20", borderRadius: 6,
              fontSize: 12, fontWeight: 600, textDecoration: "none",
              border: "1px solid #EEEEEE",
            }}>
              Research
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend() {
  const items = [
    { label: "Company",    color: "#3E6AE1", dash: false  },
    { label: "Theme",      color: "#15803D", dash: false  },
    { label: "Regime",     color: "#C2410C", dash: false  },
    { label: "Newsletter", color: "#7C3AED", dash: false  },
    { label: "Decision",   color: "#6B7280", dash: false  },
    { label: "BELONGS_TO", color: "#BBBBBB", dash: false  },
    { label: "MENTIONED",  color: "#9F7AEA", dash: true   },
    { label: "SUPPORTS",   color: "#15803D", dash: false  },
    { label: "CONTRADICTS",color: "#DC2626", dash: false  },
    { label: "IMPACTS",    color: "#3E6AE1", dash: false  },
  ];
  return (
    <div style={{
      position: "absolute", bottom: 12, left: 56, zIndex: 10,
      background: "white", border: "1px solid #EEEEEE", borderRadius: 8,
      padding: "8px 10px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
      display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 12px",
    }}>
      {items.map(item => (
        <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{
            width: 20, height: 2,
            background: item.dash ? "none" : item.color,
            borderTop: item.dash ? `2px dashed ${item.color}` : "none",
            borderRadius: 1,
          }} />
          <span style={{ fontSize: 9, color: "#5C5E62", fontWeight: 500 }}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Inner graph (needs ReactFlowProvider) ────────────────────────────────────

interface KnowledgeGraphInnerProps {
  focusNode?: string | null;
}

function KnowledgeGraphInner({ focusNode }: KnowledgeGraphInnerProps) {
  const [graphData, setGraphData] = useState<VisualGraphData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<NodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [filters, setFilters]     = useState<Record<NodeType, boolean>>({
    COMPANY: true, THEME: true, REGIME: true, NEWSLETTER: true, DECISION: true, PORTFOLIO: false,
  });
  const [search, setSearch]           = useState("");
  const [selectedNode, setSelectedNode] = useState<FullGraphNode | null>(null);
  const { fitView, setCenter }          = useReactFlow();
  const [posMap, setPosMap]             = useState<Record<string, { x: number; y: number }>>({});

  // Load graph data
  useEffect(() => {
    fetch("/api/knowledge-graph/full")
      .then(r => r.json())
      .then((data: VisualGraphData & { error?: string }) => {
        if (data.error) throw new Error(data.error);
        const gd: VisualGraphData = { nodes: data.nodes, edges: data.edges };
        setGraphData(gd);

        const positions = computeLayout(gd.nodes, gd.edges);
        setPosMap(positions);

        const rfNodes: Node<NodeData>[] = gd.nodes
          .filter(n => n.type !== "PORTFOLIO")
          .map(n => ({
            id:       n.id,
            type:     n.type as string,
            position: positions[n.id] ?? { x: 0, y: 0 },
            data: {
              label:           n.name,
              nodeType:        n.type,
              centralityScore: n.centralityScore,
              metadata:        n.metadata,
              score:           n.score,
              highlighted:     false,
              dimmed:          false,
              originalNode:    n,
            },
          }));

        // Skip OWNS edges for cleaner visualization
        const rfEdges: Edge[] = gd.edges
          .filter(e => e.relation !== "OWNS")
          .map(buildRfEdge);

        setNodes(rfNodes);
        setEdges(rfEdges);
        setLoading(false);

        setTimeout(() => {
          if (focusNode) {
            const tid = `company:${focusNode.toUpperCase()}`;
            const p   = positions[tid];
            if (p) setCenter(p.x, p.y, { zoom: 1.5, duration: 800 });
            else fitView({ padding: 0.15, duration: 600 });
          } else {
            fitView({ padding: 0.15, duration: 600 });
          }
        }, 100);
      })
      .catch(e => { setError(String(e)); setLoading(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Focus when focusNode prop changes after initial load
  useEffect(() => {
    if (!focusNode || !posMap) return;
    const tid = `company:${focusNode.toUpperCase()}`;
    const p   = posMap[tid];
    if (p) setCenter(p.x, p.y, { zoom: 1.5, duration: 600 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNode]);

  // Apply filters + search highlight
  useEffect(() => {
    if (!graphData) return;
    const sl      = search.toLowerCase().trim();
    const matchId = sl ? graphData.nodes.find(n => n.name.toLowerCase().includes(sl))?.id : undefined;

    const neighbors = new Set<string>();
    if (matchId) {
      neighbors.add(matchId);
      for (const e of graphData.edges) {
        if (e.source === matchId) neighbors.add(e.target);
        if (e.target === matchId) neighbors.add(e.source);
      }
    }

    const typeMap = new Map(graphData.nodes.map(n => [n.id, n.type]));

    setNodes(prev => prev.map(n => ({
      ...n,
      hidden: !filters[n.data.nodeType],
      data: {
        ...n.data,
        highlighted: matchId ? neighbors.has(n.id) : false,
        dimmed:      matchId ? !neighbors.has(n.id) : false,
      },
    })));

    setEdges(prev => prev.map(e => {
      const srcType = typeMap.get(e.source) as NodeType | undefined;
      const tgtType = typeMap.get(e.target) as NodeType | undefined;
      const hidden  = !filters[srcType ?? "COMPANY"] || !filters[tgtType ?? "COMPANY"];
      const dimmed  = matchId ? (!neighbors.has(e.source) || !neighbors.has(e.target)) : false;
      const opacity = dimmed ? 0.07 : ((e.style?.opacity as number | undefined) ?? 0.6);
      return { ...e, hidden, style: { ...e.style, opacity } };
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, search, graphData]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node<NodeData>) => {
    setSelectedNode(node.data.originalNode);
  }, []);

  const toggleFilter = (type: NodeType) => setFilters(f => ({ ...f, [type]: !f[type] }));

  return (
    <div style={{ position: "relative", height: "100%", overflow: "hidden" }}>
      {loading && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#F4F4F4", zIndex: 20 }}>
          <span style={{ fontSize: 13, color: "#8E8E8E" }}>Building knowledge network…</span>
        </div>
      )}
      {error && (
        <div style={{ padding: 24, color: "#DC2626", fontSize: 13 }}>{error}</div>
      )}

      {/* Top toolbar */}
      <div style={{
        position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
        zIndex: 10, display: "flex", alignItems: "center", gap: 6,
        background: "white", border: "1px solid #EEEEEE", borderRadius: 8,
        padding: "6px 10px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search node…"
          style={{
            border: "1px solid #EEEEEE", borderRadius: 6,
            padding: "4px 10px", fontSize: 12, outline: "none",
            width: 130, color: "#171A20", background: "#F8F8F8",
          }}
        />
        <div style={{ width: 1, height: 20, background: "#EEEEEE", margin: "0 2px" }} />
        {FILTER_TYPES.map(type => (
          <button
            key={type}
            onClick={() => toggleFilter(type)}
            style={{
              padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600,
              cursor: "pointer",
              border: `1.5px solid ${filters[type] ? TYPE_COLORS[type] : "#DDDDDD"}`,
              background: filters[type] ? TYPE_COLORS[type] + "18" : "#F8F8F8",
              color: filters[type] ? TYPE_COLORS[type] : "#AAAAAA",
              transition: "all 0.15s",
            }}
          >
            {FILTER_LABELS[type]}
          </button>
        ))}
      </div>

      {/* Graph */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={NODE_TYPES}
        fitView
        minZoom={0.1}
        maxZoom={3}
        style={{ background: "#F7F7F9" }}
        onPaneClick={() => setSelectedNode(null)}
      >
        <Controls showInteractive={false} style={{ left: 12, bottom: 80 }} />
        <Background color="#E0E0E0" gap={24} variant={BackgroundVariant.Dots} size={1} />
        <MiniMap
          nodeColor={n => TYPE_COLORS[(n.data as NodeData)?.nodeType ?? "COMPANY"] ?? "#999"}
          style={{ bottom: 12, right: selectedNode ? 300 : 12 }}
          zoomable
          pannable
          maskColor="rgba(244,244,244,0.7)"
        />
      </ReactFlow>

      {/* Legend */}
      <Legend />

      {/* Side panel */}
      {selectedNode && graphData && (
        <SidePanel
          node={selectedNode}
          allNodes={graphData.nodes}
          allEdges={graphData.edges}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
}

// ─── Export (with provider) ───────────────────────────────────────────────────

export interface KnowledgeGraphProps {
  focusNode?: string | null;
}

export default function KnowledgeGraph({ focusNode }: KnowledgeGraphProps) {
  return (
    <ReactFlowProvider>
      <KnowledgeGraphInner focusNode={focusNode} />
    </ReactFlowProvider>
  );
}
