import { NextRequest, NextResponse } from "next/server";
import { runJob, retryFailedJobs, getJobHistory, JOB_NAMES, type JobName } from "@/lib/scheduler";

// GET /api/automation/[jobName] — job-specific history
export async function GET(
  _req: NextRequest,
  { params }: { params: { jobName: string } }
) {
  const { jobName } = params;
  if (!JOB_NAMES.includes(jobName as JobName)) {
    return NextResponse.json({ error: `Unknown job: ${jobName}` }, { status: 400 });
  }
  const history = await getJobHistory(jobName, 20);
  return NextResponse.json(history);
}

// POST /api/automation/[jobName] — trigger or retry a specific job
// Body: { action: "run" | "retry" }
export async function POST(
  req: NextRequest,
  { params }: { params: { jobName: string } }
) {
  const { jobName } = params;
  if (!JOB_NAMES.includes(jobName as JobName)) {
    return NextResponse.json({ error: `Unknown job: ${jobName}` }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const action = body.action ?? "run";

  if (action === "retry") {
    const results = await retryFailedJobs(jobName);
    const matched = results[0];
    if (!matched) {
      return NextResponse.json(
        { error: "No failure in the last 24h for this job", jobName },
        { status: 404 }
      );
    }
    return NextResponse.json(matched);
  }

  const record = await runJob(jobName);
  return NextResponse.json(record, { status: 200 });
}
