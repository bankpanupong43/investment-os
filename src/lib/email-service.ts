import nodemailer from "nodemailer";
import { db } from "./db";

// ─── Config ───────────────────────────────────────────────────────────────────

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  to: string;
}

function getSmtpConfig(): SmtpConfig {
  return {
    host: process.env.SMTP_HOST ?? "",
    port: parseInt(process.env.SMTP_PORT ?? "587"),
    user: process.env.SMTP_USER ?? "",
    pass: (process.env.SMTP_PASS ?? "").replace(/\s/g, ""), // strip spaces from Gmail app password
    to: process.env.EMAIL_TO ?? "",
  };
}

export function getSmtpMissingVars(): string[] {
  const missing: string[] = [];
  if (!process.env.SMTP_HOST) missing.push("SMTP_HOST");
  if (!process.env.SMTP_USER) missing.push("SMTP_USER");
  if (!process.env.SMTP_PASS) missing.push("SMTP_PASS");
  if (!process.env.EMAIL_TO)  missing.push("EMAIL_TO");
  return missing;
}

export function isSmtpConfigured(): boolean {
  return getSmtpMissingVars().length === 0;
}

export function logSmtpStatus(): void {
  const missing = getSmtpMissingVars();
  if (missing.length === 0) {
    console.log("[SMTP] Configured");
  } else {
    console.warn(`[SMTP] Missing: ${missing.join(", ")}`);
  }
}

// ─── Status ───────────────────────────────────────────────────────────────────

export interface EmailStatus {
  configured: boolean;
  missingVars: string[];
  host: string;
  user: string;
  to: string;
  lastSentAt: string | null;
  lastSentSubject: string | null;
  lastFailedAt: string | null;
  lastFailedError: string | null;
}

export async function getEmailStatus(): Promise<EmailStatus> {
  const cfg = getSmtpConfig();

  const [lastSuccess, lastFailed] = await Promise.all([
    db.job.findFirst({
      where: { jobName: "email_delivery", status: "completed" },
      orderBy: { startedAt: "desc" },
    }),
    db.job.findFirst({
      where: { jobName: "email_delivery", status: "failed" },
      orderBy: { startedAt: "desc" },
    }),
  ]);

  return {
    configured: isSmtpConfigured(),
    missingVars: getSmtpMissingVars(),
    host: cfg.host,
    user: cfg.user,
    to: cfg.to,
    lastSentAt: lastSuccess?.completedAt?.toISOString() ?? null,
    lastSentSubject: lastSuccess?.resultSummary ?? null,
    lastFailedAt: lastFailed?.completedAt?.toISOString() ?? null,
    lastFailedError: lastFailed?.errorMessage ?? null,
  };
}

// ─── Send ─────────────────────────────────────────────────────────────────────

export async function sendCIOBriefEmail(params: {
  html: string;
  date: Date;
  summary: string;
}): Promise<void> {
  const cfg = getSmtpConfig();

  if (!isSmtpConfigured()) {
    throw new Error("SMTP not configured — set SMTP_HOST, SMTP_USER, SMTP_PASS, EMAIL_TO");
  }

  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: false, // STARTTLS on port 587
    auth: { user: cfg.user, pass: cfg.pass },
  });

  const dateStr = params.date.toISOString().slice(0, 10);
  const subject = `Daily CIO Brief - ${dateStr}`;

  await transport.sendMail({
    from: `"Investment OS" <${cfg.user}>`,
    to: cfg.to,
    subject,
    html: params.html,
    text: params.summary,
  });
}

// ─── Tracked send ─────────────────────────────────────────────────────────────

// Records outcome in the job table so it appears in Automation history.
// Returns false on failure — does NOT throw.
export async function sendBriefEmailWithTracking(
  html: string,
  date: Date,
  summary: string
): Promise<boolean> {
  const startedAt = new Date();
  const dateStr = date.toISOString().slice(0, 10);
  const to = process.env.EMAIL_TO ?? "";

  try {
    await sendCIOBriefEmail({ html, date, summary });
    const now = new Date();
    await db.job.create({
      data: {
        jobName: "email_delivery",
        status: "completed",
        startedAt,
        completedAt: now,
        durationMs: now.getTime() - startedAt.getTime(),
        resultSummary: `Sent: Daily CIO Brief - ${dateStr} to ${to}`,
        errorMessage: null,
      },
    });
    return true;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[email_delivery] Failed:", errMsg);
    const now = new Date();
    await db.job.create({
      data: {
        jobName: "email_delivery",
        status: "failed",
        startedAt,
        completedAt: now,
        durationMs: now.getTime() - startedAt.getTime(),
        resultSummary: "Email delivery failed",
        errorMessage: errMsg,
      },
    });
    return false;
  }
}
