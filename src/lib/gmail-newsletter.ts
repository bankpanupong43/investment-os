// Gmail Newsletter Ingestion — Phase 14
//
// Fetches newsletter emails from Gmail using the Gmail REST API (OAuth2).
// Required env vars: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
//
// To obtain a refresh token:
//   1. Create OAuth2 credentials in Google Cloud Console (Desktop app type)
//   2. Enable the Gmail API
//   3. Run the one-time auth flow and capture the refresh token
//   4. Set the three env vars above

import * as crypto from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NewsletterEmail {
  messageId: string;
  source: string;
  title: string;
  publishedAt: Date;
  rawText: string;
  rawHash: string;
}

// ─── Source whitelist ─────────────────────────────────────────────────────────

// Maps lowercase keywords (found in from/subject) to source identifiers
const SENDER_KEYWORDS: [string, string][] = [
  ["money stuff",       "bloomberg_money_stuff"],
  ["moneystuff",        "bloomberg_money_stuff"],
  ["daily upside",      "daily_upside"],
  ["axios markets",     "axios_markets"],
  ["axios",             "axios_markets"],
  ["sherwood",          "sherwood_news"],
  ["blackrock",         "blackrock"],
  ["ishares",           "blackrock"],
  ["morgan stanley",    "morgan_stanley"],
  ["five ideas",        "morgan_stanley"],
  ["jpmorgan",          "jpmorgan"],
  ["j.p. morgan",       "jpmorgan"],
  ["in context",        "jpmorgan"],
  ["in focus",          "jpmorgan"],
];

// ─── OAuth2 token refresh ─────────────────────────────────────────────────────

export function isGmailConfigured(): boolean {
  return !!(
    process.env.GMAIL_CLIENT_ID &&
    process.env.GMAIL_CLIENT_SECRET &&
    process.env.GMAIL_REFRESH_TOKEN
  );
}

async function getAccessToken(): Promise<string> {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env;

  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
    throw new Error("Gmail credentials not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN.");
  }

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GMAIL_CLIENT_ID,
      client_secret: GMAIL_CLIENT_SECRET,
      refresh_token: GMAIL_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Gmail token refresh failed (${resp.status}): ${body.slice(0, 200)}`);
  }

  const data = await resp.json();
  if (!data.access_token) throw new Error("Gmail token response missing access_token");
  return data.access_token as string;
}

// ─── Gmail API helpers ────────────────────────────────────────────────────────

async function gmailGet(path: string, token: string): Promise<unknown> {
  const resp = await fetch(`https://gmail.googleapis.com/gmail/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) return null;
  return resp.json();
}

// ─── Main fetch function ──────────────────────────────────────────────────────

export interface FetchNewsletterOptions {
  sinceDate?: Date;  // incremental anchor — fetch emails newer than this
  force?: boolean;   // ignore anchor, fetch last 30 days with higher limit
}

export async function fetchRecentNewsletterEmails(
  options: FetchNewsletterOptions = {}
): Promise<NewsletterEmail[]> {
  if (!isGmailConfigured()) return [];

  const token = await getAccessToken();

  let query: string;
  let maxResults: number;

  if (options.force) {
    // Force mode: broad scan of last 30 days, high limit
    query = "newer_than:30d";
    maxResults = 500;
  } else if (options.sinceDate) {
    // Incremental mode: fetch from sinceDate minus 2-day overlap (timezone safety)
    const overlapDate = new Date(options.sinceDate.getTime() - 2 * 86400 * 1000);
    const afterStr = overlapDate.toISOString().slice(0, 10).replace(/-/g, "/");
    query = `after:${afterStr}`;
    maxResults = 200;
  } else {
    // First-run fallback: last 7 days
    query = "newer_than:7d";
    maxResults = 200;
  }

  const searchData = await gmailGet(
    `/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`,
    token
  ) as { messages?: { id: string }[] } | null;

  const messages = searchData?.messages ?? [];
  const emails: NewsletterEmail[] = [];

  // Fetch each message (limit parallelism to avoid rate limits)
  for (const msg of messages) {
    try {
      const email = await fetchAndParseEmail(msg.id, token);
      if (email) emails.push(email);
    } catch {
      // Skip individual failures silently
    }
  }

  return emails;
}

async function fetchAndParseEmail(messageId: string, token: string): Promise<NewsletterEmail | null> {
  const msg = await gmailGet(
    `/users/me/messages/${messageId}?format=full`,
    token
  ) as GmailMessage | null;

  if (!msg) return null;

  const headers = msg.payload?.headers ?? [];
  const from    = getHeader(headers, "From");
  const subject = getHeader(headers, "Subject");
  const dateStr = getHeader(headers, "Date");

  const combined = (from + " " + subject).toLowerCase();
  const source = matchSource(combined);
  if (!source) return null;

  const rawText = extractText(msg.payload);
  if (rawText.length < 50) return null;

  const publishedAt = dateStr ? new Date(dateStr) : new Date();
  if (isNaN(publishedAt.getTime())) return null;

  const rawHash = sha256(subject + source + publishedAt.toISOString().slice(0, 10));

  return { messageId, source, title: subject, publishedAt, rawText, rawHash };
}

// ─── Deduplication ────────────────────────────────────────────────────────────

export function deduplicateByHash(
  emails: NewsletterEmail[],
  existingHashes: Set<string>
): NewsletterEmail[] {
  const seen = new Set<string>(existingHashes);
  return emails.filter(e => {
    if (seen.has(e.rawHash)) return false;
    seen.add(e.rawHash);
    return true;
  });
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function matchSource(text: string): string | null {
  for (const [keyword, source] of SENDER_KEYWORDS) {
    if (text.includes(keyword)) return source;
  }
  return null;
}

function getHeader(headers: GmailHeader[], name: string): string {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function extractText(payload: GmailPayload | undefined): string {
  if (!payload) return "";

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return b64decode(payload.body.data);
  }

  if (payload.mimeType === "text/html" && payload.body?.data) {
    return stripHtml(b64decode(payload.body.data));
  }

  if (payload.parts) {
    // Prefer plain text part
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return b64decode(part.body.data);
      }
    }
    // Fall back to HTML
    for (const part of payload.parts) {
      const text = extractText(part);
      if (text.length > 100) return text;
    }
  }

  return "";
}

function b64decode(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, " ")
    .replace(/\s{3,}/g, "\n\n")
    .trim();
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

// ─── Gmail API types ──────────────────────────────────────────────────────────

interface GmailHeader  { name: string; value: string }
interface GmailPayload {
  mimeType: string;
  headers?: GmailHeader[];
  body?: { data?: string };
  parts?: GmailPayload[];
}
interface GmailMessage {
  id: string;
  payload?: GmailPayload;
}
