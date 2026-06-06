// SEC EDGAR Client — fetches filings from SEC EDGAR (free, no API key required).
//
// Endpoints:
//   Submissions:  https://data.sec.gov/submissions/CIK{padded}.json
//   Filing index: https://www.sec.gov/Archives/edgar/full-index/...
//   Full text:    https://www.sec.gov/Archives/edgar/data/{cik}/{accession}/{primaryDoc}

export type SupportedFilingType = "10-K" | "10-Q" | "8-K" | "20-F";

export const SUPPORTED_TYPES: SupportedFilingType[] = ["10-K", "10-Q", "8-K", "20-F"];

export interface SecFilingMeta {
  accessionNumber: string;    // e.g. "0000950170-24-056247"
  filingType: string;
  filingDate: string;         // ISO date string
  periodEndDate: string | null;
  primaryDocument: string;    // filename of primary document
  title: string;
  cik: string;
  ticker: string;
}

export interface SecCompanyInfo {
  cik: string;
  name: string;
  ticker: string;
}

// ─── CIK lookup ───────────────────────────────────────────────────────────────

let tickerMapCache: Map<string, string> | null = null;

async function getTickerMap(): Promise<Map<string, string>> {
  if (tickerMapCache) return tickerMapCache;

  const res = await fetch("https://www.sec.gov/files/company_tickers.json", {
    headers: { "User-Agent": "InvestmentOS panu.pong.w.43@gmail.com" },
    next: { revalidate: 86400 },
  });

  if (!res.ok) throw new Error(`SEC ticker map fetch failed: ${res.status}`);

  const data = await res.json() as Record<string, { cik_str: number; ticker: string; title: string }>;
  const map = new Map<string, string>();
  for (const entry of Object.values(data)) {
    map.set(entry.ticker.toUpperCase(), String(entry.cik_str).padStart(10, "0"));
  }
  tickerMapCache = map;
  return map;
}

export async function getCik(ticker: string): Promise<string | null> {
  const map = await getTickerMap();
  return map.get(ticker.toUpperCase()) ?? null;
}

// ─── Recent filings ───────────────────────────────────────────────────────────

interface SubmissionsPayload {
  cik: string;
  name: string;
  filings: {
    recent: {
      accessionNumber: string[];
      form: string[];
      filingDate: string[];
      reportDate: string[];
      primaryDocument: string[];
      primaryDocDescription: string[];
    };
  };
}

export async function fetchRecentFilings(
  ticker: string,
  types: SupportedFilingType[] = SUPPORTED_TYPES,
  maxPerType = 5,
): Promise<SecFilingMeta[]> {
  const cik = await getCik(ticker);
  if (!cik) throw new Error(`No CIK found for ticker: ${ticker}`);

  const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
  const res = await fetch(url, {
    headers: { "User-Agent": "InvestmentOS panu.pong.w.43@gmail.com" },
    next: { revalidate: 3600 },
  });

  if (!res.ok) throw new Error(`SEC submissions fetch failed for ${ticker}: ${res.status}`);

  const payload = await res.json() as SubmissionsPayload;
  const recent = payload.filings.recent;

  const counts: Record<string, number> = {};
  const results: SecFilingMeta[] = [];

  for (let i = 0; i < recent.accessionNumber.length; i++) {
    const form = recent.form[i];
    if (!types.includes(form as SupportedFilingType)) continue;

    counts[form] = (counts[form] ?? 0) + 1;
    if (counts[form] > maxPerType) continue;

    const raw = recent.accessionNumber[i];
    const accession = raw.replace(/-/g, "");
    const accessionFormatted = raw.includes("-") ? raw : `${raw.slice(0, 10)}-${raw.slice(10, 12)}-${raw.slice(12)}`;

    results.push({
      accessionNumber: accessionFormatted,
      filingType: form,
      filingDate: recent.filingDate[i],
      periodEndDate: recent.reportDate[i] || null,
      primaryDocument: recent.primaryDocument[i],
      title: recent.primaryDocDescription[i] || form,
      cik: cik.replace(/^0+/, ""),
      ticker,
    });
  }

  return results;
}

// ─── Filing text download ─────────────────────────────────────────────────────

export async function downloadFilingText(
  cik: string,
  accessionNumber: string,
  primaryDocument: string,
): Promise<string> {
  const accClean = accessionNumber.replace(/-/g, "");
  const url = `https://www.sec.gov/Archives/edgar/data/${cik}/${accClean}/${primaryDocument}`;

  const res = await fetch(url, {
    headers: { "User-Agent": "InvestmentOS panu.pong.w.43@gmail.com" },
  });

  if (!res.ok) throw new Error(`Filing download failed (${res.status}): ${url}`);

  const contentType = res.headers.get("content-type") ?? "";
  const text = await res.text();

  if (contentType.includes("text/html") || text.trim().startsWith("<")) {
    return stripHtml(text);
  }
  return text;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{3,}/g, "\n\n")
    .trim();
}

// ─── Filing source URL ────────────────────────────────────────────────────────

export function buildFilingUrl(cik: string, accessionNumber: string): string {
  const accClean = accessionNumber.replace(/-/g, "");
  return `https://www.sec.gov/Archives/edgar/data/${cik}/${accClean}/`;
}
