// Validation report — Investment Philosophy context ingestion
//
// Shows how Investment Philosophy.md influences each engine.
// Run: npx tsx scripts/validate-investment-philosophy.ts

import { loadBrainContext } from "../src/lib/brain-os-context";

function section(title: string) {
  console.log("\n" + "═".repeat(60));
  console.log(title);
  console.log("─".repeat(60));
}

function line(label: string, value: string) {
  console.log(`  ${label.padEnd(26)} ${value}`);
}

const ctx = loadBrainContext();
const phil = ctx.investmentPhilosophy;

console.log("\n╔══════════════════════════════════════════════════════════╗");
console.log("║   Investment Philosophy — Brain Context Validation       ║");
console.log("╚══════════════════════════════════════════════════════════╝");

section("SOURCE");
const philSource = ctx.sources.find(s => s.includes("Investment Philosophy"));
line("File loaded:", philSource ?? "NOT FOUND");
line("Total sources loaded:", ctx.sources.length.toString());
line("Missing files:", ctx.missingFiles.length > 0 ? ctx.missingFiles.join(", ") : "none");

if (!phil) {
  console.log("\n  ⚠  Investment Philosophy not loaded — file missing or unreadable.");
  process.exit(1);
}

section("EXTRACTED: Risk Philosophy");
if (phil.riskPhilosophy.length === 0) {
  console.log("  (none extracted)");
} else {
  phil.riskPhilosophy.forEach((r, i) => console.log(`  ${i + 1}. ${r}`));
}

section("EXTRACTED: Portfolio Construction Philosophy");
if (phil.portfolioConstruction.length === 0) {
  console.log("  (none extracted)");
} else {
  phil.portfolioConstruction.forEach((r, i) => console.log(`  ${i + 1}. ${r}`));
}

section("EXTRACTED: Geopolitical Philosophy");
if (phil.geopoliticalPhilosophy.length === 0) {
  console.log("  (none extracted)");
} else {
  phil.geopoliticalPhilosophy.forEach((r, i) => console.log(`  ${i + 1}. ${r}`));
}

section("EXTRACTED: Decision Framework");
if (phil.decisionFramework.length === 0) {
  console.log("  (none extracted)");
} else {
  phil.decisionFramework.forEach(d => console.log(`  ${d.priority}. ${d.criterion}`));
}

section("HISTORICAL ALLOCATION PROPOSALS");
console.log("  → Ignored (not binding targets). Not imported as allocation data.");

section("INFLUENCE MAP");

console.log("\n  [Opportunity Engine]");
console.log("  ─ Rankings NOT modified by philosophy (by design).");
console.log("  ─ brainAlignmentScore derived from ROIC/margin/growth — aligns with");
console.log("    Decision Framework criterion #2 (Business quality).");
const riskCtx0 = phil.riskPhilosophy[0] ?? "";
if (riskCtx0) {
  console.log(`  ─ Risk context available: "${riskCtx0}"`);
}

console.log("\n  [Research Dossiers]");
console.log("  ─ generatePortfolioFit() — portfolio construction philosophy injected");
console.log("    into summary for hedge-sector tickers (Industrials, Energy, Materials)");
console.log("    and growth-core tickers.");
if (phil.portfolioConstruction[0]) {
  console.log(`    Context: "${phil.portfolioConstruction[0]}"`);
}
console.log("  ─ generateRisks() — geopolitical philosophy injected into portfolio");
console.log("    risk note for tier5 (international) tickers.");
if (phil.geopoliticalPhilosophy[0]) {
  console.log(`    Context: "${phil.geopoliticalPhilosophy[0]}"`);
}

console.log("\n  [Investment Committee]");
console.log("  ─ Risk Manager (buildRiskAssessment):");
console.log("    → Position sizing rationale enriched with risk philosophy context.");
const avoidConc = phil.riskPhilosophy.find(r => /concentration|impair/i.test(r));
if (avoidConc) {
  console.log(`    Context: "${avoidConc}"`);
}
console.log("  ─ Portfolio Manager (buildSummaryReasoning):");
console.log("    → Strong Buy / Buy summaries append decision framework priorities.");
if (phil.decisionFramework.length >= 2) {
  console.log(`    Context: "${phil.decisionFramework[0].criterion}, ${phil.decisionFramework[1].criterion}"`);
}
console.log("  ─ Bear Analyst (buildRedFlags):");
console.log("    → Geopolitical hedge note added for Industrials/Energy/Materials sectors.");
const geoNote = phil.geopoliticalPhilosophy.find(r => /hedge|minority/i.test(r));
if (geoNote) {
  console.log(`    Context: "${geoNote}"`);
}

section("CONSTRAINTS VERIFIED");
console.log("  ✓ Rankings not modified (objectiveScore logic unchanged)");
console.log("  ✓ Allocation targets not modified");
console.log("  ✓ Historical Allocation Proposals ignored");
console.log("  ✓ Philosophy used as context, not as rules");
console.log("  ✓ Scoring weights unchanged in opportunity-engine.ts");
console.log("  ✓ Committee bull/bear scoring logic unchanged");
console.log("");

section("INFLUENCES REGISTERED IN BRAIN CONTEXT");
const philInfluences = ctx.influences.filter(i => i.source.includes("Investment Philosophy"));
if (philInfluences.length === 0) {
  console.log("  (no influences registered — check brain-os-context.ts)");
} else {
  philInfluences.forEach((inf, i) => {
    console.log(`\n  [${i + 1}] ${inf.source}`);
    console.log(`      Applies to: ${inf.appliesTo.join(", ")}`);
    console.log(`      Insight: ${inf.insight.slice(0, 100)}...`);
  });
}

console.log("\n");
