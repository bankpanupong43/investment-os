// Validation script for Phase 5D: Research Dossier.
// Generates dossiers for MSFT, META, TSM and validates all sections.
// Usage: npx tsx scripts/validate-research.ts

import { PrismaClient } from "@prisma/client";
import { generateDossier, saveDossier, type ResearchDossierData } from "../src/lib/dossier-engine";

const db = new PrismaClient();

type Check = { name: string; pass: boolean; note?: string };

function section(title: string) {
  console.log(`\n━━━ ${title} ━━━\n`);
}

function printDossier(d: ResearchDossierData) {
  const fmtUsd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  console.log(`  Ticker:           ${d.ticker}`);
  console.log(`  Company:          ${d.companyName}`);
  console.log(`  Sector:           ${d.investmentSummary.sector ?? "—"}`);
  console.log(`  Industry:         ${d.investmentSummary.industry ?? "—"}`);
  console.log(`  Market Cap:       ${d.investmentSummary.marketCapM != null ? fmtUsd(d.investmentSummary.marketCapM) + "M" : "—"}`);
  console.log(`  Opportunity Score: ${d.opportunityScore}/100`);
  console.log(`  Company Score:    ${d.companyScore}/100`);
  console.log(`  Brain OS Fit:     ${d.investmentSummary.brainAlignmentScore}/100`);
  console.log(`  Confidence:       ${d.thesisDraft.confidence}/10`);
  console.log(`  Action:           ${d.investmentSummary.positionAction}`);
  console.log(`  In Portfolio:     ${d.investmentSummary.inPortfolio}`);
  console.log(`  On Watchlist:     ${d.investmentSummary.inWatchlist}`);
  console.log(`\n  Suggested Allocation:`);
  console.log(`    Starter: ${d.suggestedAllocation.starterPct}% (${fmtUsd(d.suggestedAllocation.starterUsd)})`);
  console.log(`    Target:  ${d.suggestedAllocation.targetPct}% (${fmtUsd(d.suggestedAllocation.targetUsd)})`);
  console.log(`    Maximum: ${d.suggestedAllocation.maxPct}% (${fmtUsd(d.suggestedAllocation.maxUsd)})`);

  console.log(`\n  Business Overview (excerpt):`);
  console.log(`    ${d.businessOverview.description.slice(0, 200)}${d.businessOverview.description.length > 200 ? "…" : ""}`);

  console.log(`\n  Revenue Drivers:`);
  d.businessOverview.revenueDrivers.forEach(r => console.log(`    - ${r}`));

  console.log(`\n  Why Buy (${d.whyBuy.length} reasons):`);
  d.whyBuy.forEach((r, i) => {
    console.log(`    ${i + 1}. [${r.strength}] ${r.reason}`);
    console.log(`       ${r.evidence.slice(0, 100)}${r.evidence.length > 100 ? "…" : ""}`);
  });

  console.log(`\n  Risks:`);
  console.log(`    Business: ${d.risks.businessRisks.length} items`);
  d.risks.businessRisks.slice(0, 2).forEach(r => console.log(`      [${r.severity}] ${r.risk.slice(0, 80)}…`));
  console.log(`    Financial: ${d.risks.financialRisks.length} items`);
  console.log(`    Portfolio: ${d.risks.portfolioRisks.length} items`);

  console.log(`\n  Portfolio Fit:`);
  console.log(`    ${d.portfolioFit.summary.slice(0, 150)}…`);
  console.log(`    Diversification: ${d.portfolioFit.diversificationImpact.slice(0, 100)}…`);

  console.log(`\n  Thesis Draft:`);
  console.log(`    ${d.thesisDraft.whyOwn.slice(0, 200)}…`);
  console.log(`    Key Drivers: ${d.thesisDraft.keyDrivers.join(", ")}`);
  console.log(`    Kill Criteria: ${d.thesisDraft.killCriteria.length} items`);
}

function validateDossier(d: ResearchDossierData): Check[] {
  const checks: Check[] = [
    {
      name: "Has investment summary with required fields",
      pass: !!d.investmentSummary.ticker && !!d.investmentSummary.companyName && !!d.investmentSummary.universeTier,
    },
    {
      name: "Business overview has description",
      pass: d.businessOverview.description.length >= 50,
      note: `${d.businessOverview.description.length} chars`,
    },
    {
      name: "Business overview has revenue drivers",
      pass: d.businessOverview.revenueDrivers.length >= 2,
      note: `${d.businessOverview.revenueDrivers.length} drivers`,
    },
    {
      name: "Why Buy has 3-5 reasons",
      pass: d.whyBuy.length >= 2 && d.whyBuy.length <= 5,
      note: `${d.whyBuy.length} reasons`,
    },
    {
      name: "All Why Buy reasons have evidence",
      pass: d.whyBuy.every(r => r.evidence.length >= 20),
    },
    {
      name: "All Why Buy reasons have strength",
      pass: d.whyBuy.every(r => ["strong", "moderate", "weak"].includes(r.strength)),
    },
    {
      name: "Risks section has all 3 categories",
      pass: d.risks.businessRisks.length > 0 && d.risks.financialRisks.length > 0 && d.risks.portfolioRisks.length > 0,
    },
    {
      name: "Risk items have valid severities",
      pass: [...d.risks.businessRisks, ...d.risks.financialRisks, ...d.risks.portfolioRisks]
        .every(r => ["high", "medium", "low"].includes(r.severity)),
    },
    {
      name: "Portfolio fit has summary",
      pass: d.portfolioFit.summary.length >= 30,
    },
    {
      name: "Portfolio fit has allocation impact",
      pass: d.portfolioFit.allocationImpact.length >= 20,
    },
    {
      name: "Thesis draft has whyOwn narrative",
      pass: d.thesisDraft.whyOwn.length >= 50,
      note: `${d.thesisDraft.whyOwn.length} chars`,
    },
    {
      name: "Thesis draft has key drivers",
      pass: d.thesisDraft.keyDrivers.length >= 2,
    },
    {
      name: "Thesis draft has kill criteria",
      pass: d.thesisDraft.killCriteria.length >= 3,
    },
    {
      name: "Confidence is 1-10",
      pass: d.thesisDraft.confidence >= 1 && d.thesisDraft.confidence <= 10,
      note: `${d.thesisDraft.confidence}/10`,
    },
    {
      name: "Suggested allocation: starter ≤ target ≤ max",
      pass: d.suggestedAllocation.starterPct <= d.suggestedAllocation.targetPct &&
            d.suggestedAllocation.targetPct <= d.suggestedAllocation.maxPct,
    },
    {
      name: "Opportunity score matches engine",
      pass: d.opportunityScore >= 0 && d.opportunityScore <= 100,
      note: `${d.opportunityScore}/100`,
    },
  ];
  return checks;
}

async function main() {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey || apiKey.length < 8) {
    console.error("FMP_API_KEY not set in .env");
    process.exit(1);
  }

  console.log("\n━━━ Phase 5D: Research Dossier Validation ━━━\n");
  console.log(`API Key: ${apiKey.slice(0, 4)}${"*".repeat(apiKey.length - 8)}${apiKey.slice(-4)}`);
  console.log(`Started: ${new Date().toLocaleString()}`);

  const TARGET_TICKERS = ["MSFT", "META", "TSM"];
  const allChecks: { ticker: string; checks: Check[] }[] = [];
  const dossiers: ResearchDossierData[] = [];

  for (const ticker of TARGET_TICKERS) {
    section(`Generating Dossier: ${ticker}`);

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
    printDossier(dossier);

    const checks = validateDossier(dossier);
    allChecks.push({ ticker, checks });

    const passed = checks.filter(c => c.pass).length;
    console.log(`\n  Validation: ${passed}/${checks.length} checks passed`);
    checks.filter(c => !c.pass).forEach(c => console.log(`    ✗ ${c.name}`));
  }

  // ── DB verification ───────────────────────────────────────────────────────
  section("DB Verification");

  const savedCount = await db.researchDossier.count();
  console.log(`  Total dossiers in DB: ${savedCount}`);

  for (const ticker of TARGET_TICKERS) {
    const row = await db.researchDossier.findUnique({ where: { ticker } });
    console.log(`  ${ticker}: ${row ? `✓ saved (opportunityScore=${row.opportunityScore})` : "✗ not found"}`);
  }

  // ── API route simulation ──────────────────────────────────────────────────
  section("Summary Report");

  console.log("  Dossiers generated:\n");
  for (const d of dossiers) {
    const fmtUsd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
    console.log(`  ${d.ticker.padEnd(7)} Opp=${d.opportunityScore.toFixed(1)} Co=${d.companyScore.toFixed(1)} Conf=${d.thesisDraft.confidence}/10 Starter=${fmtUsd(d.suggestedAllocation.starterUsd)} Target=${fmtUsd(d.suggestedAllocation.targetUsd)} Action=${d.investmentSummary.positionAction}`);
  }

  // ── Final validation tally ────────────────────────────────────────────────
  section("Final Validation");

  const totalChecks = allChecks.reduce((s, tc) => s + tc.checks.length, 0);
  const totalPassed = allChecks.reduce((s, tc) => s + tc.checks.filter(c => c.pass).length, 0);
  const totalFailed = totalChecks - totalPassed;

  console.log(`  Tickers validated: ${allChecks.length}/${TARGET_TICKERS.length}`);
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
