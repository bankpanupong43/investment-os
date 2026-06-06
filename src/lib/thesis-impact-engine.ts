// Thesis Impact Engine — evaluates filing analysis against investment thesis.
//
// For every filing, scores:
//   intact               — no material change to thesis drivers
//   strengthened         — filing confirms or improves thesis assumptions
//   weakened             — filing contradicts or degrades thesis assumptions
//   kill_criteria_triggered — filing matches a kill criteria condition

import { db } from "./db";
import type { FilingAnalysis } from "./filing-analyzer";

export type ImpactLevel = "intact" | "strengthened" | "weakened" | "kill_criteria_triggered";

export interface ThesisImpactResult {
  impactLevel: ImpactLevel;
  impactedThesis: string;
  reasoning: string;
  evidenceIds: string[];
}

// ─── Keyword signal banks ─────────────────────────────────────────────────────

const STRENGTHEN_SIGNALS = [
  /revenue.*grew|revenue.*increas/i,
  /record (revenue|earnings|profit)/i,
  /expan(d|sion)|market share.*gain/i,
  /raised? guidance|rais(es|ing) outlook/i,
  /margin.*improv/i,
  /cash flow.*increas|strong free cash/i,
  /repurchas|buyback|dividend increas/i,
  /new product|new market|new capability/i,
];

const WEAKEN_SIGNALS = [
  /revenue.*declin|revenue.*decreas/i,
  /miss(ed)? expectation|below expectation/i,
  /lower(ed|s|ing) guidance|withdraw.*guidance/i,
  /margin.*compres|margin.*declin/i,
  /material(ly)? adversely?/i,
  /impairment|goodwill write/i,
  /loss from operations|net loss/i,
  /intensif.*compet|los(t|ing) market share/i,
];

const KILL_SIGNALS = [
  /chapter 11|bankrupt/i,
  /going concern/i,
  /federal.*investigation|SEC.*investigation/i,
  /fraud|accounting irregularit/i,
  /significant.*impairment|total.*write-?off/i,
];

// ─── Impact scoring ───────────────────────────────────────────────────────────

function scoreContent(text: string): { strengthen: number; weaken: number; kill: number } {
  let strengthen = 0, weaken = 0, kill = 0;

  for (const pattern of STRENGTHEN_SIGNALS) if (pattern.test(text)) strengthen++;
  for (const pattern of WEAKEN_SIGNALS) if (pattern.test(text)) weaken++;
  for (const pattern of KILL_SIGNALS) if (pattern.test(text)) kill++;

  return { strengthen, weaken, kill };
}

function deriveImpactLevel(scores: { strengthen: number; weaken: number; kill: number }): ImpactLevel {
  if (scores.kill > 0) return "kill_criteria_triggered";
  if (scores.weaken > scores.strengthen + 1) return "weakened";
  if (scores.strengthen > scores.weaken + 1) return "strengthened";
  return "intact";
}

// ─── Main evaluation ──────────────────────────────────────────────────────────

export async function evaluateThesisImpact(
  filingId: string,
  ticker: string,
  analysis: FilingAnalysis,
  thesis: { thesis: string; killCriteria: string; ticker: string },
): Promise<ThesisImpactResult> {
  const allText = [
    ...analysis.businessChanges,
    ...analysis.riskChanges,
    ...analysis.capitalAllocationChanges,
    ...analysis.guidanceChanges,
  ].join(" ");

  const scores = scoreContent(allText);
  const impactLevel = deriveImpactLevel(scores);

  // Check thesis kill criteria explicitly
  let impactedThesis = thesis.thesis.slice(0, 200);
  let killMatched = false;

  if (thesis.killCriteria) {
    const killLines = thesis.killCriteria.split(/\n|;/).map(l => l.trim()).filter(Boolean);
    for (const line of killLines) {
      const words = line.toLowerCase().split(/\s+/).filter(w => w.length > 4);
      const matchCount = words.filter(w => allText.toLowerCase().includes(w)).length;
      if (matchCount >= 2) {
        killMatched = true;
        impactedThesis = `Kill criteria matched: "${line}"`;
        break;
      }
    }
  }

  const finalImpact: ImpactLevel = killMatched ? "kill_criteria_triggered" : impactLevel;

  const reasoning = buildReasoning(finalImpact, scores, analysis);
  const evidenceIds: string[] = analysis.observations.slice(0, 5).map((_, i) => `${ticker}_F${i + 1}`);

  await db.thesisImpactRecord.create({
    data: {
      filingId,
      ticker: ticker.toUpperCase(),
      impactLevel: finalImpact,
      impactedThesis,
      reasoning,
      evidenceIds: JSON.stringify(evidenceIds),
    },
  });

  return { impactLevel: finalImpact, impactedThesis, reasoning, evidenceIds };
}

// ─── Batch evaluation ─────────────────────────────────────────────────────────

export async function evaluatePortfolioThesisImpacts(
  options: { since?: Date } = {},
): Promise<{ ticker: string; impactLevel: ImpactLevel; filingId: string }[]> {
  const where = options.since
    ? { createdAt: { gte: options.since }, thesisImpacts: { none: {} } }
    : { thesisImpacts: { none: {} } };

  const unanalyzed = await db.filing.findMany({
    where,
    orderBy: { filingDate: "desc" },
    take: 50,
  });

  const results: { ticker: string; impactLevel: ImpactLevel; filingId: string }[] = [];

  for (const filing of unanalyzed) {
    if (!filing.rawContent) continue;

    const thesis = await db.investmentThesis.findUnique({ where: { ticker: filing.ticker } });
    if (!thesis) continue;

    const { analyzeFilingContent } = await import("./filing-analyzer");
    const analysis = analyzeFilingContent(filing.rawContent, filing.filingType, filing.ticker);

    const result = await evaluateThesisImpact(filing.id, filing.ticker, analysis, thesis);
    results.push({ ticker: filing.ticker, impactLevel: result.impactLevel, filingId: filing.id });
  }

  return results;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function buildReasoning(
  impact: ImpactLevel,
  scores: { strengthen: number; weaken: number; kill: number },
  analysis: FilingAnalysis,
): string {
  const parts: string[] = [];

  if (impact === "kill_criteria_triggered") {
    parts.push("Kill criteria signal detected in filing.");
    if (analysis.riskChanges.length > 0) parts.push(`Risk factor: ${analysis.riskChanges[0]}`);
  } else if (impact === "strengthened") {
    parts.push(`Filing contains ${scores.strengthen} strengthening signal(s).`);
    if (analysis.businessChanges.length > 0) parts.push(analysis.businessChanges[0]);
    if (analysis.guidanceChanges.length > 0) parts.push(analysis.guidanceChanges[0]);
  } else if (impact === "weakened") {
    parts.push(`Filing contains ${scores.weaken} weakening signal(s).`);
    if (analysis.riskChanges.length > 0) parts.push(analysis.riskChanges[0]);
    if (analysis.guidanceChanges.length > 0) parts.push(analysis.guidanceChanges[0]);
  } else {
    parts.push("No material changes to thesis drivers detected.");
    if (analysis.businessChanges.length > 0) parts.push(analysis.businessChanges[0]);
  }

  return parts.join(" ");
}
