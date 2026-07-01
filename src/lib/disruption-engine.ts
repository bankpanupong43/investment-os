import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { DEFAULT_MODEL } from "./constants";

export type DisruptionThreatCategory = "competitor" | "market_share" | "regulatory" | "pricing_pressure";
export type DisruptorCategory = "ai" | "new_technology" | "open_source" | "startup" | "big_tech" | "business_model";
export type ThreatLevel = "low" | "medium" | "high";

export interface DisruptionThreat {
  category: DisruptionThreatCategory;
  title: string;
  description: string;
  severity: ThreatLevel;
}

export interface Disruptor {
  name: string;
  category: DisruptorCategory;
  description: string;
  threatLevel: ThreatLevel;
  timeHorizon: "near_term" | "medium_term" | "long_term";
}

export interface ThesisBreakCondition {
  metric: string;
  operator: "above" | "below" | "equals";
  threshold: string;
  description: string;
}

export interface DisruptionAnalysis {
  ticker: string;
  generatedAt: string;
  threats: DisruptionThreat[];
  disruptors: Disruptor[];
  disruptionScore: ThreatLevel;
  confidence: number; // 0-10
  trend: "increasing" | "stable" | "decreasing";
  thesisBreakConditions: ThesisBreakCondition[];
  aiSummary: {
    biggestThreats: string;
    whatToMonitor: string;
    probability: string;
    timeHorizon: string;
  };
}

// ─── Tool definition ───────────────────────────────────────────────────────────

function buildToolDefinition(): Anthropic.Tool {
  return {
    name: "record_disruption_analysis",
    description:
      "Records the completed disruption analysis for this company. Call exactly once with the full structured result.",
    input_schema: {
      type: "object" as const,
      properties: {
        threats: {
          type: "array",
          items: {
            type: "object",
            properties: {
              category: { type: "string", enum: ["competitor", "market_share", "regulatory", "pricing_pressure"] },
              title: { type: "string" },
              description: { type: "string" },
              severity: { type: "string", enum: ["low", "medium", "high"] },
            },
            required: ["category", "title", "description", "severity"],
          },
        },
        disruptors: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              category: {
                type: "string",
                enum: ["ai", "new_technology", "open_source", "startup", "big_tech", "business_model"],
              },
              description: { type: "string" },
              threatLevel: { type: "string", enum: ["low", "medium", "high"] },
              timeHorizon: { type: "string", enum: ["near_term", "medium_term", "long_term"] },
            },
            required: ["name", "category", "description", "threatLevel", "timeHorizon"],
          },
        },
        disruptionScore: { type: "string", enum: ["low", "medium", "high"] },
        confidence: { type: "number", description: "0-10, confidence in this analysis given available evidence" },
        trend: {
          type: "string",
          enum: ["increasing", "stable", "decreasing"],
          description: "Direction of disruption risk over the last 6-12 months",
        },
        thesisBreakConditions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              metric: { type: "string" },
              operator: { type: "string", enum: ["above", "below", "equals"] },
              threshold: { type: "string" },
              description: { type: "string" },
            },
            required: ["metric", "operator", "threshold", "description"],
          },
        },
        aiSummary: {
          type: "object",
          properties: {
            biggestThreats: { type: "string" },
            whatToMonitor: { type: "string" },
            probability: { type: "string", description: "Qualitative probability that disruption materially impacts the thesis" },
            timeHorizon: { type: "string", description: "Expected time horizon for the biggest threats to matter" },
          },
          required: ["biggestThreats", "whatToMonitor", "probability", "timeHorizon"],
        },
      },
      required: ["threats", "disruptors", "disruptionScore", "confidence", "trend", "thesisBreakConditions", "aiSummary"],
    },
  };
}

// ─── Prompt ─────────────────────────────────────────────────────────────────────

function buildPrompt(
  ticker: string,
  companyName: string,
  businessOverview: unknown,
  whyBuy: unknown,
  risks: unknown,
  facts: unknown,
  sentiment: { positive: number; neutral: number; negative: number; recentDirection: string }
): string {
  return [
    `You are analyzing disruption risk for ${companyName} (${ticker}) as part of an investment research dossier.`,
    ``,
    `Business overview:`,
    JSON.stringify(businessOverview, null, 2),
    ``,
    `Why we own it / bull case:`,
    JSON.stringify(whyBuy, null, 2),
    ``,
    `Known risks already on file:`,
    JSON.stringify(risks, null, 2),
    ``,
    `Recent evidence facts:`,
    JSON.stringify(facts, null, 2),
    ``,
    `Recent public sentiment mentions (last 90 days, ${sentiment.positive + sentiment.neutral + sentiment.negative} total): ` +
      `${sentiment.positive} positive, ${sentiment.neutral} neutral, ${sentiment.negative} negative. Recent direction: ${sentiment.recentDirection}.`,
    ``,
    `Identify:`,
    `1. Current threats: competitors, market share risk, regulatory risk, pricing pressure.`,
    `2. Potential disruptors: AI, new technology, open-source alternatives, startups, Big Tech encroachment, new business models.`,
    `3. An overall disruption score (low/medium/high) with a confidence level (0-10) and trend (increasing/stable/decreasing).`,
    `4. Thesis break conditions: concrete, measurable conditions that would invalidate the bull case if triggered.`,
    `5. A concise AI summary: biggest threats, what to monitor, probability of disruption materializing, and time horizon.`,
    ``,
    `Be specific and grounded in the evidence provided. Call record_disruption_analysis exactly once with your complete analysis.`,
  ].join("\n");
}

// ─── Engine ─────────────────────────────────────────────────────────────────────

export async function generateDisruptionAnalysis(ticker: string): Promise<DisruptionAnalysis> {
  const dossier = await db.researchDossier.findUnique({ where: { ticker } });
  if (!dossier) {
    throw new Error(`No research dossier exists for ${ticker}. Generate the dossier first.`);
  }

  const since90d = new Date(Date.now() - 90 * 86400 * 1000);
  const mentions = await db.companyMention.findMany({
    where: { ticker, mentionDate: { gte: since90d } },
    orderBy: { mentionDate: "desc" },
  });
  const positive = mentions.filter((m) => m.sentiment === "positive").length;
  const negative = mentions.filter((m) => m.sentiment === "negative").length;
  const neutral = mentions.length - positive - negative;

  const midpoint = Math.ceil(mentions.length / 2);
  const recentHalf = mentions.slice(0, midpoint);
  const olderHalf = mentions.slice(midpoint);
  const recentNegRate = recentHalf.length ? recentHalf.filter((m) => m.sentiment === "negative").length / recentHalf.length : 0;
  const olderNegRate = olderHalf.length ? olderHalf.filter((m) => m.sentiment === "negative").length / olderHalf.length : 0;
  const recentDirection =
    recentNegRate > olderNegRate + 0.1 ? "worsening" : recentNegRate < olderNegRate - 0.1 ? "improving" : "stable";

  const businessOverview = JSON.parse(dossier.businessOverview || "{}");
  const whyBuy = JSON.parse(dossier.whyBuy || "[]");
  const risks = JSON.parse(dossier.risks || "{}");
  const facts = JSON.parse(dossier.facts || "[]");

  const client = new Anthropic();
  const tool = buildToolDefinition();
  const prompt = buildPrompt(ticker, dossier.companyName, businessOverview, whyBuy, risks, facts, {
    positive,
    neutral,
    negative,
    recentDirection,
  });

  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 4096,
    tools: [tool],
    tool_choice: { type: "tool", name: "record_disruption_analysis" },
    messages: [{ role: "user", content: prompt }],
  });

  const block = response.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new Error("Model did not return a structured disruption analysis.");
  }
  const input = block.input as Record<string, unknown>;

  return {
    ticker,
    generatedAt: new Date().toISOString(),
    threats: (input.threats as DisruptionThreat[]) ?? [],
    disruptors: (input.disruptors as Disruptor[]) ?? [],
    disruptionScore: (input.disruptionScore as ThreatLevel) ?? "medium",
    confidence: Math.max(0, Math.min(10, (input.confidence as number) ?? 5)),
    trend: (input.trend as DisruptionAnalysis["trend"]) ?? "stable",
    thesisBreakConditions: (input.thesisBreakConditions as ThesisBreakCondition[]) ?? [],
    aiSummary:
      (input.aiSummary as DisruptionAnalysis["aiSummary"]) ?? {
        biggestThreats: "",
        whatToMonitor: "",
        probability: "",
        timeHorizon: "",
      },
  };
}

export async function saveDisruptionAnalysis(ticker: string, analysis: DisruptionAnalysis): Promise<void> {
  await db.researchDossier.update({
    where: { ticker },
    data: { disruptionAnalysis: JSON.stringify(analysis) },
  });
}

export function parseDisruptionAnalysis(raw: string | null | undefined): DisruptionAnalysis | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.generatedAt) return null;
    return parsed as DisruptionAnalysis;
  } catch {
    return null;
  }
}
