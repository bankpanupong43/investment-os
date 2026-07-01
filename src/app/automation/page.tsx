"use client";
import { useEffect, useState, useCallback } from "react";

const JOB_LABELS: Record<string, string> = {
  backup: "Backup",
  integrity_check: "Integrity Check",
  macro_ingestion: "Macro Intelligence Ingestion",
  sec_filing_refresh: "SEC Filing Refresh",
  earnings_ingestion: "Earnings Ingestion",
  thesis_impact_refresh: "Thesis Impact Refresh",
  fmp_refresh: "FMP Fundamentals Refresh",
  universe_rescore: "Universe Rescore",
  opportunity_refresh: "Opportunity Refresh",
  dossier_refresh: "Dossier Refresh",
  portfolio_review_refresh: "Portfolio Review Refresh",
  brain_os_export: "Brain OS Export",
  morning_brief: "Morning Brief",
  radar_refresh: "Discovery Radar",
  portfolio_architect: "Portfolio Architect",
  email_delivery: "Email Delivery",
};

const JOB_NAMES = Object.keys(JOB_LABELS);

interface JobRecord {
  id: string;
  jobName: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  resultSummary: string | null;
  errorMessage: string | null;
  runId: string | null;
  resultDetail: unknown;
  errorStack: string | null;
  errorCategory: string | null;
}

interface ScheduleStatus {
  lastRunAt: string | null;
  lastRunSuccessful: boolean | null;
  nextRunAt: string;
  runningJob: string | null;
  recentJobs: JobRecord[];
  overallHealth: "passed" | "partial" | "failed" | "unknown";
  failedJobs: number;
  successRate: number | null;
  lastFailureAt: string | null;
  runningJobs: string[];
  recentErrors: { jobName: string; errorMessage: string | null }[];
}

interface AutomationData {
  status: ScheduleStatus;
  history: JobRecord[];
}

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function fmtDuration(ms: number | null) {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "completed" ? "bg-green-100 text-green-700" :
    status === "failed" ? "bg-red-100 text-red-700" :
    status === "running" ? "bg-blue-100 text-blue-700" :
    status === "skipped" ? "bg-gray-100 text-gray-500" :
    "bg-amber-100 text-amber-700";
  return (
    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${cls}`}>
      {status}
    </span>
  );
}

interface IntegrityIssue {
  check: string;
  severity: "error" | "warning" | "info";
  message: string;
  affectedIds?: string[];
}

interface IntegrityJobDetail {
  errors: IntegrityIssue[];
  warnings: IntegrityIssue[];
  infos: IntegrityIssue[];
}

function isIntegrityDetail(detail: unknown): detail is IntegrityJobDetail {
  if (!detail || typeof detail !== "object") return false;
  const d = detail as Record<string, unknown>;
  return Array.isArray(d.errors) && Array.isArray(d.warnings) && Array.isArray(d.infos);
}

function SeverityBadge({ severity }: { severity: IntegrityIssue["severity"] }) {
  const cls = severity === "error"
    ? "bg-red-100 text-red-700"
    : severity === "warning"
    ? "bg-amber-100 text-amber-700"
    : "bg-blue-100 text-blue-600";
  return (
    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${cls}`}>
      {severity}
    </span>
  );
}

function IntegrityDetail({ detail }: { detail: IntegrityJobDetail }) {
  const all = [...detail.errors, ...detail.warnings, ...detail.infos];
  if (all.length === 0) {
    return <div className="text-xs text-[#8E8E8E]">All checks passed — no issues.</div>;
  }
  return (
    <div className="space-y-1.5">
      {all.map((issue, i) => (
        <div key={i} className="flex items-start gap-2 text-xs">
          <SeverityBadge severity={issue.severity} />
          <div>
            <span className="text-[#171A20] font-medium">{issue.check}</span>
            <span className="text-[#8E8E8E]"> — {issue.message}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AutomationPage() {
  const [data, setData] = useState<AutomationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningNightly, setRunningNightly] = useState(false);
  const [runningJob, setRunningJob] = useState<string | null>(null);
  const [retryingJob, setRetryingJob] = useState<string | null>(null);
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [msg, setMsg] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "history" | "jobs">("overview");
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await fetch("/api/automation").then(r => r.json()).catch(() => null);
    setData(d);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Poll while nightly run or individual job is in progress
  useEffect(() => {
    if (!runningNightly && !runningJob && !retryingJob) return;
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [runningNightly, runningJob, retryingJob, load]);

  async function triggerNightly() {
    setRunningNightly(true);
    setMsg("Running nightly sequence… this may take several minutes.");
    try {
      const res = await fetch("/api/automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_nightly" }),
      });
      const result = await res.json();
      if (res.ok) {
        setMsg(`Nightly run complete: ${result.jobsPassed}/${result.jobsRun} jobs passed. ${result.dailySummary}`);
      } else {
        setMsg(`Error: ${result.error}`);
      }
      await load();
    } finally {
      setRunningNightly(false);
    }
  }

  async function triggerJob(jobName: string) {
    setRunningJob(jobName);
    setMsg(`Running ${JOB_LABELS[jobName] ?? jobName}…`);
    try {
      const res = await fetch(`/api/automation/${jobName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run" }),
      });
      const result = await res.json();
      if (res.ok) {
        const status = result.status === "completed" ? "PASS" : "FAIL";
        setMsg(`[${status}] ${JOB_LABELS[jobName]}: ${result.resultSummary ?? ""}`);
      } else {
        setMsg(`Error: ${result.error}`);
      }
      await load();
    } finally {
      setRunningJob(null);
    }
  }

  async function sendTestEmail() {
    setSendingTestEmail(true);
    setMsg("Sending test CIO Brief email…");
    try {
      const res = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setMsg(result.message ?? "Test email sent successfully.");
      } else {
        setMsg(`Error: ${result.error ?? "Email send failed"}`);
      }
      await load();
    } finally {
      setSendingTestEmail(false);
    }
  }

  async function retryJob(jobName: string) {
    setRetryingJob(jobName);
    setMsg(`Retrying ${JOB_LABELS[jobName] ?? jobName}…`);
    try {
      const res = await fetch(`/api/automation/${jobName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry" }),
      });
      const result = await res.json();
      if (res.ok) {
        setMsg(`Retry complete: ${result.resultSummary ?? ""}`);
      } else {
        setMsg(`Error: ${result.error ?? "Retry failed"}`);
      }
      await load();
    } finally {
      setRetryingJob(null);
    }
  }

  const status = data?.status;
  const history = data?.history ?? [];

  // Group history by jobName for per-job last-run display
  const lastByJob: Record<string, JobRecord> = {};
  for (const j of history) {
    if (!lastByJob[j.jobName]) lastByJob[j.jobName] = j;
  }

  const isAnyRunning = runningNightly || !!runningJob || !!retryingJob || sendingTestEmail;

  const healthColor: Record<ScheduleStatus["overallHealth"], string> = {
    passed: "text-green-600",
    partial: "text-amber-600",
    failed: "text-red-600",
    unknown: "text-[#8E8E8E]",
  };
  const healthLabel: Record<ScheduleStatus["overallHealth"], string> = {
    passed: "Passed",
    partial: "Partial failure",
    failed: "Failed",
    unknown: "—",
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#171A20]">Automation</h1>
          <p className="text-sm text-[#8E8E8E] mt-0.5">
            Self-maintaining investment OS — nightly sequence keeps all data fresh
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={sendTestEmail}
            disabled={isAnyRunning}
            className="px-4 py-2 text-sm border border-[#EEEEEE] text-[#5C5E62] rounded hover:bg-[#F4F4F4] disabled:opacity-50"
          >
            {sendingTestEmail ? "Sending…" : "Send Test CIO Brief"}
          </button>
          <button
            onClick={triggerNightly}
            disabled={isAnyRunning}
            className="px-4 py-2 text-sm bg-[#171A20] text-white rounded hover:bg-[#2a2d35] disabled:opacity-50"
          >
            {runningNightly ? "Running…" : "Run Nightly Sequence"}
          </button>
        </div>
      </div>

      {/* Message bar */}
      {msg && (
        <div className={`text-sm rounded px-4 py-2 border ${
          msg.toLowerCase().includes("error") || msg.toLowerCase().includes("fail")
            ? "bg-red-50 border-red-200 text-red-700"
            : "bg-[#EEF3FD] border-[#C7D7FA] text-[#3E6AE1]"
        }`}>
          {msg}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-[#8E8E8E]">Loading…</div>
      ) : (
        <>
          {/* Schedule status bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white border border-[#EEEEEE] rounded-lg p-4">
              <div className="text-xs text-[#8E8E8E] mb-1">Overall Health</div>
              <div className={`text-sm font-semibold ${healthColor[status?.overallHealth ?? "unknown"]}`}>
                {healthLabel[status?.overallHealth ?? "unknown"]}
              </div>
            </div>
            <div className="bg-white border border-[#EEEEEE] rounded-lg p-4">
              <div className="text-xs text-[#8E8E8E] mb-1">Failed Jobs (last 50)</div>
              <div className={`text-sm font-semibold ${(status?.failedJobs ?? 0) > 0 ? "text-red-600" : "text-[#171A20]"}`}>
                {status?.failedJobs ?? 0}
              </div>
            </div>
            <div className="bg-white border border-[#EEEEEE] rounded-lg p-4">
              <div className="text-xs text-[#8E8E8E] mb-1">Success Rate</div>
              <div className="text-sm font-semibold text-[#171A20]">
                {status?.successRate == null ? "—" : `${status.successRate}%`}
              </div>
            </div>
            <div className="bg-white border border-[#EEEEEE] rounded-lg p-4">
              <div className="text-xs text-[#8E8E8E] mb-1">Last Failure</div>
              <div className="text-sm font-semibold text-[#171A20]">{fmt(status?.lastFailureAt ?? null)}</div>
            </div>
            <div className="bg-white border border-[#EEEEEE] rounded-lg p-4">
              <div className="text-xs text-[#8E8E8E] mb-1">Next Run</div>
              <div className="text-sm font-semibold text-[#171A20]">{fmt(status?.nextRunAt ?? null)}</div>
            </div>
            <div className="bg-white border border-[#EEEEEE] rounded-lg p-4">
              <div className="text-xs text-[#8E8E8E] mb-1">Last Run</div>
              <div className="text-sm font-semibold text-[#171A20]">{fmt(status?.lastRunAt ?? null)}</div>
            </div>
            <div className="bg-white border border-[#EEEEEE] rounded-lg p-4 col-span-2">
              <div className="text-xs text-[#8E8E8E] mb-1">Running Jobs</div>
              <div className="text-sm font-semibold text-[#171A20]">
                {status?.runningJobs && status.runningJobs.length > 0
                  ? status.runningJobs.map(j => JOB_LABELS[j] ?? j).join(", ")
                  : "—"}
              </div>
            </div>
          </div>

          {/* Recent errors */}
          {(status?.recentErrors?.length ?? 0) > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="text-sm font-medium text-red-700 mb-2">
                {status!.recentErrors.length} recent job failure{status!.recentErrors.length > 1 ? "s" : ""}
              </div>
              <div className="space-y-1">
                {status!.recentErrors.map((f, i) => (
                  <div key={`${f.jobName}-${i}`} className="flex items-center justify-between text-xs text-red-600">
                    <span>{JOB_LABELS[f.jobName] ?? f.jobName} — {f.errorMessage ?? "unknown error"}</span>
                    <button
                      onClick={() => retryJob(f.jobName)}
                      disabled={isAnyRunning}
                      className="ml-2 px-2 py-0.5 border border-red-300 rounded hover:bg-red-100 disabled:opacity-50"
                    >
                      {retryingJob === f.jobName ? "Retrying…" : "Retry"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 border-b border-[#EEEEEE]">
            {(["overview", "jobs", "history"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activeTab === tab
                    ? "border-[#3E6AE1] text-[#3E6AE1]"
                    : "border-transparent text-[#8E8E8E] hover:text-[#171A20]"
                }`}
              >
                {tab === "overview" ? "Overview" : tab === "jobs" ? "Run Jobs" : "History"}
              </button>
            ))}
          </div>

          {/* Overview tab */}
          {activeTab === "overview" && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-[#5C5E62] uppercase tracking-wider">Nightly Sequence (10 Jobs)</h2>
              <div className="bg-white border border-[#EEEEEE] rounded-lg divide-y divide-[#EEEEEE]">
                {JOB_NAMES.map((jobName, i) => {
                  const last = lastByJob[jobName];
                  return (
                    <div key={jobName} className="px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-[#8E8E8E] w-4">{i + 1}</span>
                        <div>
                          <div className="text-sm font-medium text-[#171A20]">{JOB_LABELS[jobName]}</div>
                          {last?.resultSummary && (
                            <div className="text-xs text-[#8E8E8E] mt-0.5 max-w-md truncate">{last.resultSummary}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-[#8E8E8E]">
                        {last && <StatusBadge status={last.status} />}
                        {last?.completedAt && <span>{fmt(last.completedAt)}</span>}
                        {last?.durationMs && <span>{fmtDuration(last.durationMs)}</span>}
                        {!last && <span className="text-[#CCCCCC]">never run</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Run jobs tab */}
          {activeTab === "jobs" && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-[#5C5E62] uppercase tracking-wider">Manual Job Triggers</h2>
              <div className="bg-white border border-[#EEEEEE] rounded-lg divide-y divide-[#EEEEEE]">
                {JOB_NAMES.map((jobName) => {
                  const last = lastByJob[jobName];
                  const isRunning = runningJob === jobName;
                  const isRetrying = retryingJob === jobName;
                  const rowBusy = runningNightly || isRunning || isRetrying;
                  return (
                    <div key={jobName} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-[#171A20]">{JOB_LABELS[jobName]}</div>
                        {last?.errorMessage && (
                          <div className="text-xs text-red-500 mt-0.5">
                            {last.errorMessage}
                            {last.errorCategory && (
                              <span className="ml-1.5 px-1 py-0.5 bg-red-100 text-red-700 rounded text-[10px] uppercase">
                                {last.errorCategory}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {last && <StatusBadge status={last.status} />}
                        {last?.status === "failed" && (
                          <button
                            onClick={() => retryJob(jobName)}
                            disabled={rowBusy}
                            className="px-2.5 py-1 text-xs border border-[#EEEEEE] rounded hover:bg-[#F4F4F4] disabled:opacity-50"
                          >
                            {isRetrying ? "Retrying…" : "Retry"}
                          </button>
                        )}
                        <button
                          onClick={() => triggerJob(jobName)}
                          disabled={rowBusy}
                          className="px-2.5 py-1 text-xs bg-[#171A20] text-white rounded hover:bg-[#2a2d35] disabled:opacity-50"
                        >
                          {isRunning ? "Running…" : "Run"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* History tab */}
          {activeTab === "history" && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-[#5C5E62] uppercase tracking-wider">Job History</h2>
              {history.length === 0 ? (
                <div className="text-sm text-[#8E8E8E]">No jobs have run yet.</div>
              ) : (
                <div className="bg-white border border-[#EEEEEE] rounded-lg divide-y divide-[#EEEEEE]">
                  {history.map(job => {
                    const expanded = expandedJobId === job.id;
                    const hasDetail = !!job.resultDetail || !!job.errorStack;
                    return (
                    <div key={job.id} className="px-4 py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <StatusBadge status={job.status} />
                          <span className="text-sm font-medium text-[#171A20]">
                            {JOB_LABELS[job.jobName] ?? job.jobName}
                          </span>
                          {job.errorCategory && (
                            <span className="px-1 py-0.5 bg-red-100 text-red-700 rounded text-[10px] uppercase">
                              {job.errorCategory}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-[#8E8E8E]">
                          <span>{fmtDuration(job.durationMs)}</span>
                          <span>{fmt(job.startedAt)}</span>
                          {hasDetail && (
                            <button
                              onClick={() => setExpandedJobId(expanded ? null : job.id)}
                              className="text-[#3E6AE1] hover:underline"
                            >
                              {expanded ? "Hide details" : "Details"}
                            </button>
                          )}
                        </div>
                      </div>
                      {job.resultSummary && (
                        <div className="text-xs text-[#8E8E8E] mt-1 ml-0">{job.resultSummary}</div>
                      )}
                      {job.errorMessage && (
                        <div className="text-xs text-red-500 mt-1">{job.errorMessage}</div>
                      )}
                      {expanded && (
                        <div className="mt-2 space-y-2">
                          {job.jobName === "integrity_check" && isIntegrityDetail(job.resultDetail) ? (
                            <IntegrityDetail detail={job.resultDetail} />
                          ) : job.resultDetail != null ? (
                            <pre className="text-[11px] bg-[#F4F4F4] rounded p-2 overflow-x-auto whitespace-pre-wrap">
                              {JSON.stringify(job.resultDetail, null, 2)}
                            </pre>
                          ) : null}
                          {job.errorStack && (
                            <pre className="text-[11px] bg-red-50 text-red-700 rounded p-2 overflow-x-auto whitespace-pre-wrap">
                              {job.errorStack}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
