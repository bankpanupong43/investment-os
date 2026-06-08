import { NextRequest, NextResponse } from "next/server";
import { getEmailStatus, sendBriefEmailWithTracking } from "@/lib/email-service";
import { db } from "@/lib/db";
import { deserializeBrief } from "@/lib/morning-brief-engine";
import { buildCIOBrief } from "@/lib/brief-generator";
import { renderNarrativeEmail } from "@/lib/html-email-exporter";
import { renderNarrativeBrief } from "@/lib/narrative-brief";

// GET /api/email — SMTP status + last send/failure
export async function GET(_req: NextRequest): Promise<NextResponse> {
  try {
    const status = await getEmailStatus();
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST /api/email — { action: "test" } sends the latest brief as a test email
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body   = await req.json().catch(() => ({}));
    const action = body.action ?? "test";

    if (action !== "test") {
      return NextResponse.json({ error: "action must be 'test'" }, { status: 400 });
    }

    const record = await db.morningBrief.findFirst({ orderBy: { briefingDate: "desc" } });
    if (!record) {
      return NextResponse.json({ error: "No morning brief found. Generate one first." }, { status: 404 });
    }

    const briefData = deserializeBrief(record);
    const doc       = await buildCIOBrief(briefData);
    const narrative = renderNarrativeBrief(doc);
    const html      = renderNarrativeEmail(narrative, doc);
    const summary   = doc.executiveSummary?.join(" ") ?? briefData.marketRegime;

    const ok = await sendBriefEmailWithTracking(html, briefData.briefingDate, summary);

    if (ok) {
      return NextResponse.json({ success: true, message: `Test email sent to ${process.env.EMAIL_TO}` });
    } else {
      return NextResponse.json({ success: false, error: "Email send failed. Check SMTP config and logs." }, { status: 500 });
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
