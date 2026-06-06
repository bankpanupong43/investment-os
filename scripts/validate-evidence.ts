// Validation script for Phase 5D.5: Evidence Layer.
// Generates dossiers for MSFT, META, TSM and validates the evidence structure:
//   - Fact inventory (count, IDs, categories, confidence)
//   - Interpretation traceability (every claim cites at least one fact)
//   - Recommendation traceability (every why-buy/why-not-buy cites evidence)
//   - No unsupported claims
//   - Evidence saved to DB
//   - Opportunity engine factors populated
// Usage: npx tsx scripts/validate-evidence.ts

import { PrismaClient } from "@prisma/client";
import { generateDossier, saveDossier, type ResearchDossierData } from "../src/lib/dossier-engine";
import { computeOpportunities } from "../src/lib/opportunity-engine";

const db = new PrismaClient();

type Check = { name: string; pass: boolean; note?: string };

function section(title: string) {
  console.log(`\n━━━ ${title} ━━━\n`);
}

function printCheck(c: Check) {
  const icon = c.pass ? "✓" : "✗";
  const note = c.note ? ` (${c.note})` : "";
  console.log(`  ${icon} ${c.name}${note}`);
}

function validateEvidence(d: ResearchDossierData): Check[] {
  const checks: Check[] = [];
  const facts = d.facts ?? [];
  const interps = d.interpretation ?? [];
  const rec = d.recommendation;
  const ev = d.evidenceSummary;

  // ── Fact inventory ──────────────────────────────────────────────────────
  checks.push({
    name: "Has at least 10 facts",
    pass: facts.length >= 10,
    note: `${facts.length} facts`,
  });

  checks.push({
    name: "All facts have non-empty IDs",
    pass: facts.every(f => f.id && f.id.length > 0),
  });

  checks.push({
    name: "All fact IDs are unique",
    pass: new Set(facts.map(f => f.id)).size === facts.length,
    note: `${new Set(facts.map(f => f.id)).size} unique / ${facts.length} total`,
  });

  checks.push({
    name: "Facts span at least 3 categories",
    pass: new Set(facts.map(f => f.category)).size >= 3,
    note: [...new Set(facts.map(f => f.category))].join(", "),
  });

  checks.push({
    name: "Majority of facts have high confidence",
    pass: (ev?.highConfidenceCount ?? 0) / Math.max(facts.length, 1) >= 0.5,
    note: `${ev?.highConfidenceCount ?? 0}/${facts.length} high`,
  });

  checks.push({
    name: "Evidence summary populated",
    pass: ev != null && ev.evidenceCount > 0,
    note: ev ? `count=${ev.evidenceCount}, missing=${ev.missingMetrics.join(",") || "none"}` : "missing",
  });

  // ── Interpretation traceability ─────────────────────────────────────────
  checks.push({
    name: "Has at least 3 interpretations",
    pass: interps.length >= 3,
    note: `${interps.length} interpretations`,
  });

  const factIds = new Set(facts.map(f => f.id));
  const interpsWithEvidence = interps.filter(i => i.evidenceIds.length > 0);
  checks.push({
    name: "All interpretations cite at least one fact",
    pass: interps.length > 0 && interpsWithEvidence.length === interps.length,
    note: `${interpsWithEvidence.length}/${interps.length} have evidence IDs`,
  });

  const orphanInterpIds = interps.flatMap(i => i.evidenceIds).filter(id => !factIds.has(id));
  checks.push({
    name: "All interpretation evidence IDs resolve to facts",
    pass: orphanInterpIds.length === 0,
    note: orphanInterpIds.length > 0 ? `Unresolved: ${orphanInterpIds.slice(0, 3).join(", ")}` : "all resolved",
  });

  checks.push({
    name: "Has both positive and negative interpretations",
    pass: interps.some(i => i.direction === "positive") && interps.some(i => i.direction === "negative"),
    note: `+${interps.filter(i => i.direction === "positive").length} / -${interps.filter(i => i.direction === "negative").length}`,
  });

  // ── Recommendation traceability ─────────────────────────────────────────
  checks.push({
    name: "Recommendation section exists with positionAction",
    pass: rec != null && !!rec.positionAction,
    note: rec?.positionAction,
  });

  checks.push({
    name: "Recommendation has whyBuy items",
    pass: (rec?.whyBuy?.length ?? 0) >= 1,
    note: `${rec?.whyBuy?.length ?? 0} items`,
  });

  checks.push({
    name: "Recommendation has whyNotBuy items",
    pass: (rec?.whyNotBuy?.length ?? 0) >= 1,
    note: `${rec?.whyNotBuy?.length ?? 0} items`,
  });

  const allRecItems = [...(rec?.whyBuy ?? []), ...(rec?.whyNotBuy ?? [])];
  const recWithEvidence = allRecItems.filter(r => r.evidenceIds.length > 0);
  checks.push({
    name: "All recommendation items cite at least one fact",
    pass: allRecItems.length > 0 && recWithEvidence.length === allRecItems.length,
    note: `${recWithEvidence.length}/${allRecItems.length} have evidence IDs`,
  });

  const orphanRecIds = allRecItems.flatMap(r => r.evidenceIds).filter(id => !factIds.has(id));
  checks.push({
    name: "All recommendation evidence IDs resolve to facts",
    pass: orphanRecIds.length === 0,
    note: orphanRecIds.length > 0 ? `Unresolved: ${orphanRecIds.slice(0, 3).join(", ")}` : "all resolved",
  });

  checks.push({
    name: "Recommendation confidence is 1–10",
    pass: (rec?.confidence ?? 0) >= 1 && (rec?.confidence ?? 0) <= 10,
    note: `${rec?.confidence}/10`,
  });

  checks.push({
    name: "Recommendation summary is non-empty",
    pass: (rec?.summary ?? "").length >= 20,
    note: `${rec?.summary?.length ?? 0} chars`,
  });

  return checks;
}

function printEvidenceInventory(d: ResearchDossierData) {
  const facts = d.facts ?? [];
  const ev = d.evidenceSummary;
  const rec = d.recommendation;

  console.log(`  Evidence: ${facts.length} facts (${ev?.highConfidenceCount ?? 0} high, ${ev?.mediumConfidenceCount ?? 0} med, ${ev?.lowConfidenceCount ?? 0} low)`);
  console.log(`  Categories: ${JSON.stringify(ev?.factsByCategory ?? {})}`);
  console.log(`  Missing metrics: ${ev?.missingMetrics?.join(", ") || "none"}`);
  console.log(`  Interpretations: ${d.interpretation?.length ?? 0} (${ev?.supportingCount ?? 0} supporting, ${ev?.contradictingCount ?? 0} contradicting)`);
  console.log(`  Recommendation: ${rec?.positionAction ?? "—"} | Confidence ${rec?.confidence ?? "—"}/10`);
  console.log(`  Why Buy (${rec?.whyBuy?.length ?? 0}):`);
  (rec?.whyBuy ?? []).forEach(r => console.log(`    + [${r.weight}] ${r.reason.slice(0, 80)}${r.reason.length > 80 ? "…" : ""}`));
  console.log(`  Risk Factors (${rec?.whyNotBuy?.length ?? 0}):`);
  (rec?.whyNotBuy ?? []).forEach(r => console.log(`    − [${r.weight}] ${r.reason.slice(0, 80)}${r.reason.length > 80 ? "…" : ""}`));
}

async function main() {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey || apiKey.length < 8) {
    console.error("FMP_API_KEY not set in .env");
    process.exit(1);
  }

  console.log("\n━━━ Phase 5D.5: Evidence Layer Validation ━━━\n");
  console.log(`API Key: ${apiKey.slice(0, 4)}${"*".repeat(apiKey.length - 8)}${apiKey.slice(-4)}`);
  console.log(`Started: ${new Date().toLocaleString()}`);

  const TARGET_TICKERS = ["MSFT", "META", "TSM"];
  const allChecks: { ticker: string; checks: Check[] }[] = [];
  const dossiers: ResearchDossierData[] = [];

  // ── Generate and validate dossiers ───────────────────────────────────────
  for (const ticker of TARGET_TICKERS) {
    section(`Generating Evidence Dossier: ${ticker}`);
    const t0 = Date.now();
    let dossier: ResearchDossierData;

    try {
      dossier = await generateDossier(ticker, apiKey);
      await saveDossier(dossier);
      console.log(`  Generated in ${Date.now() - t0}ms and saved to DB`);
    } catch (e) {
      console.error(`  FAILED: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }

    dossiers.push(dossier);
    printEvidenceInventory(dossier);

    const checks = validateEvidence(dossier);
    allChecks.push({ ticker, checks });

    const passed = checks.filter(c => c.pass).length;
    console.log(`\n  Validation: ${passed}/${checks.length} checks`);
    checks.forEach(c => printCheck(c));
  }

  // ── DB verification ───────────────────────────────────────────────────────
  section("DB Verification");

  for (const ticker of TARGET_TICKERS) {
    const row = await db.researchDossier.findUnique({ where: { ticker } });
    if (row) {
      const facts = JSON.parse(row.facts ?? "[]");
      const interps = JSON.parse(row.interpretation ?? "[]");
      console.log(`  ${ticker}: ✓ dossier saved | facts=${facts.length} | interps=${interps.length}`);
    } else {
      console.log(`  ${ticker}: ✗ not found in DB`);
    }

    const evidenceCount = await db.evidence.count({ where: { ticker } });
    console.log(`  ${ticker}: Evidence records in DB = ${evidenceCount}`);
  }

  // ── Opportunity engine factors check ──────────────────────────────────────
  section("Opportunity Engine — Supporting / Contradicting Factors");

  const oppResult = await computeOpportunities();
  for (const ticker of TARGET_TICKERS) {
    const entry = oppResult.entries.find(e => e.ticker === ticker);
    if (!entry) {
      console.log(`  ${ticker}: ✗ not in opportunity engine`);
      continue;
    }
    console.log(`  ${ticker}: ${entry.supportingFactors?.length ?? 0} supporting, ${entry.contradictingFactors?.length ?? 0} contradicting`);
    (entry.supportingFactors ?? []).forEach(f => console.log(`    + ${f}`));
    (entry.contradictingFactors ?? []).forEach(f => console.log(`    − ${f}`));
  }

  const factorChecks = TARGET_TICKERS.map(ticker => {
    const entry = oppResult.entries.find(e => e.ticker === ticker);
    return {
      name: `${ticker} has supporting factors`,
      pass: (entry?.supportingFactors?.length ?? 0) > 0,
      note: `${entry?.supportingFactors?.length ?? 0} factors`,
    };
  });
  factorChecks.forEach(c => printCheck(c));
  allChecks.push({ ticker: "OpportunityEngine", checks: factorChecks });

  // ── Final tally ───────────────────────────────────────────────────────────
  section("Final Validation");

  const totalChecks = allChecks.reduce((s, tc) => s + tc.checks.length, 0);
  const totalPassed = allChecks.reduce((s, tc) => s + tc.checks.filter(c => c.pass).length, 0);
  const totalFailed = totalChecks - totalPassed;

  console.log(`  Tickers validated: ${dossiers.length}/${TARGET_TICKERS.length}`);
  console.log(`  Total checks: ${totalPassed}/${totalChecks} passed`);

  if (totalFailed > 0) {
    console.log("\n  Failed checks:");
    for (const { ticker, checks } of allChecks) {
      for (const c of checks.filter(c => !c.pass)) {
        console.log(`    [${ticker}] ✗ ${c.name}${c.note ? ` (${c.note})` : ""}`);
      }
    }
    console.log("\n━━━ Validation: FAILED ━━━\n");
    process.exit(1);
  }

  console.log(`\n━━━ Validation: PASSED (${totalPassed}/${totalChecks} checks) ━━━\n`);
}

main()
  .catch(e => { console.error("\nFatal:", e.message); process.exit(1); })
  .finally(() => db.$disconnect());
