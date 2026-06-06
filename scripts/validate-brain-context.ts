import { loadBrainContext } from "../src/lib/brain-os-context";

const ctx = loadBrainContext();
console.log("loaded:", ctx.loaded);
console.log("sources:", ctx.sources);
console.log("missing:", ctx.missingFiles);
console.log("investor:", ctx.investor.name, ctx.investor.age, ctx.investor.riskTolerance);
console.log("influences:", ctx.influences.length);
ctx.influences.forEach(i => console.log(" -", i.source, "→", i.appliesTo.join(", ")));
console.log("summary:", ctx.summary.slice(0, 120) + "...");
