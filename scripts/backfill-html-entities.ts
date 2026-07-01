import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function hasEntities(text: string | null): text is string {
  return !!text && /&#x?[0-9a-fA-F]+;|&nbsp;|&amp;|&lt;|&gt;|&quot;/.test(text);
}

async function main() {
  let filingsUpdated = 0;
  const filings = await db.filing.findMany({ select: { id: true, rawContent: true, summary: true } });
  for (const f of filings) {
    const data: { rawContent?: string; summary?: string } = {};
    if (hasEntities(f.rawContent)) data.rawContent = decodeEntities(f.rawContent);
    if (hasEntities(f.summary)) data.summary = decodeEntities(f.summary);
    if (Object.keys(data).length > 0) {
      await db.filing.update({ where: { id: f.id }, data });
      filingsUpdated++;
    }
  }
  console.log(`Filings updated: ${filingsUpdated} / ${filings.length}`);

  let thesisImpactsUpdated = 0;
  const impacts = await db.thesisImpactRecord.findMany({ select: { id: true, reasoning: true } });
  for (const r of impacts) {
    if (hasEntities(r.reasoning)) {
      await db.thesisImpactRecord.update({ where: { id: r.id }, data: { reasoning: decodeEntities(r.reasoning) } });
      thesisImpactsUpdated++;
    }
  }
  console.log(`ThesisImpactRecords updated: ${thesisImpactsUpdated} / ${impacts.length}`);
}

main().catch(e => console.error(e)).finally(() => db.$disconnect());
