// Daily Digest — single consolidated pipeline for the CIO email digest.
//
// Replaces the orchestration that used to be inlined in scheduler.ts's
// morning_brief job, which dynamically imported 6 separate modules
// (morning-brief-engine, brief-generator, narrative-brief,
// html-email-exporter, brief-archive-service, email-service) to compute
// data, build the brief document, render narrative/HTML, archive to
// Brain OS, and send. Those modules still own their individual concerns
// (data computation, doc building, rendering, archiving, sending) and are
// still used independently by other API routes — this file is the one
// place that wires them together into a single daily run.

import { generateMorningBrief, saveMorningBrief } from "./morning-brief-engine";
import { buildCIOBrief, renderCIOBriefMarkdown } from "./brief-generator";
import { renderNarrativeBrief } from "./narrative-brief";
import { renderNarrativeEmail } from "./html-email-exporter";
import { archiveBrief, archiveNarrative } from "./brief-archive-service";
import { sendBriefEmailWithTracking } from "./email-service";
import { upsertDailyNote, appendMacroNote, appendGeopoliticsNote } from "./wiki-service";

export interface DailyDigestResult {
  success: boolean;
  summary: string;
  briefId: string;
}

export async function runDailyDigest(): Promise<DailyDigestResult> {
  const data = await generateMorningBrief();
  const record = await saveMorningBrief(data);

  // Build CIO brief document, generate narrative, archive to Brain OS, then email.
  try {
    const doc = await buildCIOBrief(data);
    const md = renderCIOBriefMarkdown(doc);
    const narrative = renderNarrativeBrief(doc);
    const narrativeHtml = renderNarrativeEmail(narrative, doc);

    archiveBrief(data.briefingDate, md, narrativeHtml);
    archiveNarrative(data.briefingDate, narrative);

    // Failure is recorded but does not fail the digest run.
    const summary = doc.executiveSummary?.join(" ") ?? data.marketRegime;
    await sendBriefEmailWithTracking(narrativeHtml, data.briefingDate, summary);
  } catch (err) {
    console.error("[daily_digest] brief archive/email failed:", err);
  }

  // Update Brain OS wiki daily note + macro/geo pages from the brief data.
  try {
    const dateStr = data.briefingDate.toISOString().slice(0, 10);

    const macroText = data.macroSummary.topics
      .map((t: { topic: string; signal: string; insight: string }) => `**${t.topic}** (${t.signal}): ${t.insight}`)
      .join("\n");
    const geoText = data.geopoliticalSummary.risks
      .map((r: { region: string; level: string; insight: string }) => `**${r.region}** (${r.level}): ${r.insight}`)
      .join("\n");

    appendMacroNote(macroText, dateStr);
    appendGeopoliticsNote(geoText, dateStr);

    // Append institutional research and newsletter consensus to the macro wiki page.
    const institutionalItems: { source: string; title: string; summary: string[] }[] = data.institutionalResearch ?? [];
    const newsletterItems: { source: string; title: string; summary: string[] }[] = data.newsletterConsensus ?? [];

    if (institutionalItems.length > 0) {
      const institutionalText = "### Institutional Research\n" +
        institutionalItems.map(i => `**${i.source}** — ${i.title}\n${(i.summary ?? []).slice(0, 2).join(" ")}`).join("\n\n");
      appendMacroNote(institutionalText, dateStr);
    }

    if (newsletterItems.length > 0) {
      const newsletterText = "### Newsletter Consensus\n" +
        newsletterItems.map(i => `**${i.source}** — ${i.title}\n${(i.summary ?? []).slice(0, 2).join(" ")}`).join("\n\n");
      appendMacroNote(newsletterText, dateStr);
    }

    upsertDailyNote({
      date: dateStr,
      regime: data.marketRegime,
      keyEvents: data.marketRegimeEvidence ?? [],
      macroUpdates: macroText,
      geopoliticsUpdates: geoText,
      actions: data.recommendedActions.map((a: { action: string }) => a.action),
    });
  } catch (err) {
    console.error("[daily_digest] wiki upsert failed:", err);
  }

  const actionCount = data.recommendedActions.length;
  const eventCount = data.portfolioImpact.items?.length ?? 0;
  return {
    success: true,
    summary: `Daily digest generated: ${data.marketRegime} regime. ${actionCount} actions. ${eventCount} daily events. Brief ID: ${record.id}`,
    briefId: record.id,
  };
}
