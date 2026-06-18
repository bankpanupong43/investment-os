import "dotenv/config";
import { expandUniverse, ingestCandidateBatch, getUniverseStats } from "@/lib/universe-expander";

const API_KEY = process.env.FMP_API_KEY ?? "";

async function main() {
  if (!API_KEY) {
    console.error("FMP_API_KEY not set in .env");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const command = args[0] ?? "expand";

  if (command === "stats") {
    console.log("\n=== Universe Stats ===");
    const stats = await getUniverseStats();
    console.log(`Total:      ${stats.total}`);
    console.log(`Curated:    ${stats.curated} (tier1–tier5)`);
    console.log(`Candidates: ${stats.candidates}`);
    console.log(`With fundamentals:    ${stats.withFundamentals}`);
    console.log(`Without fundamentals: ${stats.withoutFundamentals}`);
    console.log("\nBy tier:");
    for (const [tier, count] of Object.entries(stats.byTier).sort()) {
      console.log(`  ${tier}: ${count}`);
    }
    console.log("\nTop sectors:");
    const sectors = Object.entries(stats.bySector).sort((a, b) => b[1] - a[1]).slice(0, 10);
    for (const [sector, count] of sectors) {
      console.log(`  ${sector}: ${count}`);
    }
    return;
  }

  if (command === "ingest") {
    const batchSize = parseInt(args[1] ?? "40", 10);
    console.log(`\n=== Ingesting Candidate Batch (size: ${batchSize}) ===`);
    const result = await ingestCandidateBatch(API_KEY, batchSize);
    console.log(`Processed: ${result.processed}`);
    console.log(`API calls: ${result.apiCallCount}`);
    console.log(`Remaining: ${result.remaining} candidates without fundamentals`);
    const success = result.results.filter(r => r.status === "success").length;
    const partial = result.results.filter(r => r.status === "partial").length;
    const failed  = result.results.filter(r => r.status === "failed").length;
    console.log(`  Success: ${success} | Partial: ${partial} | Failed: ${failed}`);
    if (result.remaining > 0) {
      const daysLeft = Math.ceil(result.remaining / batchSize);
      console.log(`\nRun again ${daysLeft} more time(s) to fully populate all candidates.`);
    } else {
      console.log("\nAll candidates have fundamentals.");
    }
    return;
  }

  // Default: expand
  console.log("\n=== Before Expansion ===");
  const before = await getUniverseStats();
  console.log(`Universe size: ${before.total} (${before.curated} curated, ${before.candidates} candidates)`);

  console.log("\n=== Running FMP Screener ===");
  console.log("Filters: US equities, NYSE+NASDAQ, market cap ≥ $1B, excluding Real Estate & Utilities");
  const result = await expandUniverse(API_KEY);

  console.log(`\nScreened:  ${result.screened} tickers from FMP`);
  console.log(`Skipped:   ${result.skipped} (already in universe)`);
  console.log(`Added:     ${result.added} new candidates`);
  console.log(`API calls: ${result.apiCallCount}`);

  if (result.added > 0) {
    console.log(`\nNew tickers (first 20): ${result.tickers.slice(0, 20).join(", ")}${result.tickers.length > 20 ? ` ... +${result.tickers.length - 20} more` : ""}`);
  }

  console.log("\n=== After Expansion ===");
  const after = await getUniverseStats();
  console.log(`Universe size: ${after.total} (${after.curated} curated, ${after.candidates} candidates)`);
  console.log(`Without fundamentals: ${after.withoutFundamentals}`);

  if (after.withoutFundamentals > 0) {
    console.log(`\nNext step: Run 'npm run expand:ingest' daily until fundamentals are populated.`);
    console.log(`Estimated days: ${Math.ceil(after.withoutFundamentals / 40)}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
