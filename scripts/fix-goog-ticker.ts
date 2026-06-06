import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const goog = await db.universe.findUnique({ where: { ticker: "GOOG" } });
  if (!goog) { console.log("GOOG not found — may already be GOOGL or missing"); return; }
  const updated = await db.universe.update({ where: { ticker: "GOOG" }, data: { ticker: "GOOGL", companyName: "Alphabet Inc." } });
  console.log(`Renamed: ${goog.ticker} -> ${updated.ticker}`);
}
main().catch(e => console.error(e.message)).finally(() => db.$disconnect());
