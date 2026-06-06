import { NextRequest, NextResponse } from "next/server";
import {
  getScheduleStatus, getJobHistory, runNightlySequence,
  JOB_NAMES, type JobName,
} from "@/lib/scheduler";

// GET /api/automation — schedule status + recent job history
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const jobName = searchParams.get("jobName") ?? undefined;
  const limit = parseInt(searchParams.get("limit") ?? "50");

  const [status, history] = await Promise.all([
    getScheduleStatus(),
    getJobHistory(jobName, limit),
  ]);

  return NextResponse.json({ status, history });
}

// POST /api/automation — trigger a run
// Body: { action: "run_nightly" | "run_job", jobName?: string }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { action, jobName } = body as { action: string; jobName?: string };

  if (action === "run_nightly") {
    const result = await runNightlySequence();
    return NextResponse.json(result, { status: 200 });
  }

  if (action === "run_job") {
    if (!jobName || !JOB_NAMES.includes(jobName as JobName)) {
      return NextResponse.json({ error: `Unknown job: ${jobName}` }, { status: 400 });
    }
    const { runJob } = await import("@/lib/scheduler");
    const record = await runJob(jobName);
    return NextResponse.json(record, { status: 200 });
  }

  return NextResponse.json({ error: "action must be run_nightly or run_job" }, { status: 400 });
}
