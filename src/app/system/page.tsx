"use client";
import { useEffect, useState } from "react";

interface BackupReport {
  totalBackups: number;
  storageBytes: number;
  storageMb: number;
  lastDatabaseBackup: string | null;
  lastBrainOsBackup: string | null;
  lastFullBackup: string | null;
  databaseBackupCount: number;
  brainOsBackupCount: number;
  fullBackupCount: number;
  manifest: Array<{
    id: string;
    backupType: string;
    filePath: string;
    fileSize: number;
    checksum: string;
    createdAt: string;
  }>;
}

interface IntegrityIssue {
  check: string;
  severity: "error" | "warning" | "info";
  message: string;
  affectedIds?: string[];
}

interface EmailStatus {
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

interface SharedStorageInfo {
  path: string | null;
  status: "connected" | "missing";
  brainOsPath: string | null;
  dataPath: string | null;
}

interface IntegrityReport {
  scannedAt: string;
  passedChecks: number;
  totalChecks: number;
  errors: IntegrityIssue[];
  warnings: IntegrityIssue[];
  infos: IntegrityIssue[];
  summary: string;
  healthy: boolean;
}

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function fmtBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function Badge({ severity }: { severity: IntegrityIssue["severity"] }) {
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

export default function SystemPage() {
  const [report, setReport] = useState<BackupReport | null>(null);
  const [integrity, setIntegrity] = useState<IntegrityReport | null>(null);
  const [storage, setStorage] = useState<SharedStorageInfo | null>(null);
  const [emailStatus, setEmailStatus] = useState<EmailStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningBackup, setRunningBackup] = useState(false);
  const [runningIntegrity, setRunningIntegrity] = useState(false);
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    setLoading(true);
    const [r, i, s, e] = await Promise.all([
      fetch("/api/backup?report=1").then(r => r.json()).catch(() => null),
      fetch("/api/integrity").then(r => r.json()).catch(() => null),
      fetch("/api/system/shared-storage").then(r => r.json()).catch(() => null),
      fetch("/api/email").then(r => r.json()).catch(() => null),
    ]);
    setReport(r);
    setIntegrity(i);
    setStorage(s);
    setEmailStatus(e);
    setLoading(false);
  }

  async function sendTestEmail() {
    setSendingTestEmail(true);
    setMsg("");
    try {
      const res = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg(data.message ?? "Test email sent.");
        await load();
      } else {
        setMsg(`Error: ${data.error ?? "Email send failed"}`);
      }
    } finally {
      setSendingTestEmail(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function triggerBackup(type: string) {
    setRunningBackup(true);
    setMsg("");
    try {
      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (res.ok) {
        setMsg(`Backup created: ${data.filePath}`);
        await load();
      } else {
        setMsg(`Error: ${data.error}`);
      }
    } finally {
      setRunningBackup(false);
    }
  }

  async function triggerIntegrity() {
    setRunningIntegrity(true);
    setMsg("");
    try {
      const res = await fetch("/api/integrity");
      const data = await res.json();
      setIntegrity(data);
      setMsg(`Integrity scan complete: ${data.summary}`);
    } finally {
      setRunningIntegrity(false);
    }
  }

  const statCard = (label: string, value: string | number, sub?: string) => (
    <div className="bg-white border border-[#EEEEEE] rounded-lg p-4">
      <div className="text-xs text-[#8E8E8E] mb-1">{label}</div>
      <div className="text-lg font-semibold text-[#171A20]">{value}</div>
      {sub && <div className="text-xs text-[#8E8E8E] mt-0.5">{sub}</div>}
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-[#171A20]">System Health</h1>
        <p className="text-sm text-[#8E8E8E] mt-0.5">Backup status, data integrity, and recovery tools</p>
      </div>

      {msg && (
        <div className="text-sm text-[#3E6AE1] bg-[#EEF3FD] border border-[#C7D7FA] rounded px-4 py-2">
          {msg}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => triggerBackup("database")}
          disabled={runningBackup}
          className="px-3 py-2 text-sm bg-[#171A20] text-white rounded hover:bg-[#2a2d35] disabled:opacity-50"
        >
          {runningBackup ? "Backing up…" : "Backup DB"}
        </button>
        <button
          onClick={() => triggerBackup("brain_os_export")}
          disabled={runningBackup}
          className="px-3 py-2 text-sm bg-[#3E6AE1] text-white rounded hover:bg-[#3258c4] disabled:opacity-50"
        >
          Backup Brain OS
        </button>
        <button
          onClick={() => triggerBackup("full_snapshot")}
          disabled={runningBackup}
          className="px-3 py-2 text-sm border border-[#EEEEEE] text-[#5C5E62] rounded hover:bg-[#F4F4F4] disabled:opacity-50"
        >
          Full Snapshot
        </button>
        <button
          onClick={triggerIntegrity}
          disabled={runningIntegrity}
          className="px-3 py-2 text-sm border border-[#EEEEEE] text-[#5C5E62] rounded hover:bg-[#F4F4F4] disabled:opacity-50"
        >
          {runningIntegrity ? "Scanning…" : "Run Integrity Check"}
        </button>
        <button
          onClick={sendTestEmail}
          disabled={sendingTestEmail}
          className="px-3 py-2 text-sm border border-[#EEEEEE] text-[#5C5E62] rounded hover:bg-[#F4F4F4] disabled:opacity-50"
        >
          {sendingTestEmail ? "Sending…" : "Send Test Email"}
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-[#8E8E8E]">Loading…</div>
      ) : (
        <>
          {/* Email Delivery */}
          <section>
            <h2 className="text-sm font-medium text-[#5C5E62] uppercase tracking-wider mb-3">Email Delivery</h2>
            {emailStatus ? (
              <div className="space-y-3">
                <div className={`border rounded-lg p-4 ${emailStatus.configured ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div className="flex-1 min-w-0">
                      <div className={`font-medium text-sm ${emailStatus.configured ? "text-green-700" : "text-amber-700"}`}>
                        SMTP {emailStatus.configured ? "Configured" : "Not Configured"}
                      </div>
                      {emailStatus.configured ? (
                        <div className="text-xs text-[#5C5E62] mt-1 space-y-0.5">
                          <div><span className="text-[#8E8E8E]">Host: </span><span className="font-mono">{emailStatus.host}</span></div>
                          <div><span className="text-[#8E8E8E]">From: </span><span className="font-mono">{emailStatus.user}</span></div>
                          <div><span className="text-[#8E8E8E]">To: </span><span className="font-mono">{emailStatus.to}</span></div>
                        </div>
                      ) : (
                        <div className="mt-1 space-y-0.5">
                          {emailStatus.missingVars?.length > 0 && (
                            <div className="text-xs text-amber-700">
                              {emailStatus.missingVars.map(v => (
                                <span key={v} className="inline-block mr-2 font-mono bg-amber-100 px-1 rounded">Missing {v}</span>
                              ))}
                            </div>
                          )}
                          {emailStatus.host && (
                            <div className="text-xs text-[#5C5E62] mt-1 space-y-0.5">
                              <div><span className="text-[#8E8E8E]">Host: </span><span className="font-mono">{emailStatus.host}</span></div>
                              {emailStatus.user && <div><span className="text-[#8E8E8E]">From: </span><span className="font-mono">{emailStatus.user}</span></div>}
                              {emailStatus.to && <div><span className="text-[#8E8E8E]">To: </span><span className="font-mono">{emailStatus.to}</span></div>}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={sendTestEmail}
                      disabled={sendingTestEmail || !emailStatus.configured}
                      className="px-3 py-1.5 text-xs bg-[#171A20] text-white rounded hover:bg-[#2a2d35] disabled:opacity-50"
                    >
                      {sendingTestEmail ? "Sending…" : "Send Test Email"}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white border border-[#EEEEEE] rounded-lg p-4">
                    <div className="text-xs text-[#8E8E8E] mb-1">Last Email Sent</div>
                    <div className="text-sm font-semibold text-[#171A20]">{fmt(emailStatus.lastSentAt)}</div>
                    {emailStatus.lastSentSubject && (
                      <div className="text-xs text-[#8E8E8E] mt-0.5 truncate">{emailStatus.lastSentSubject}</div>
                    )}
                  </div>
                  <div className={`border rounded-lg p-4 ${emailStatus.lastFailedAt ? "bg-red-50 border-red-200" : "bg-white border-[#EEEEEE]"}`}>
                    <div className={`text-xs mb-1 ${emailStatus.lastFailedAt ? "text-red-500" : "text-[#8E8E8E]"}`}>Last Failure</div>
                    <div className={`text-sm font-semibold ${emailStatus.lastFailedAt ? "text-red-700" : "text-[#171A20]"}`}>{fmt(emailStatus.lastFailedAt)}</div>
                    {emailStatus.lastFailedError && (
                      <div className="text-xs text-red-500 mt-0.5 truncate">{emailStatus.lastFailedError}</div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-[#8E8E8E]">Loading email status…</div>
            )}
          </section>

          {/* Shared Storage */}
          <section>
            <h2 className="text-sm font-medium text-[#5C5E62] uppercase tracking-wider mb-3">Shared Storage</h2>
            <div className={`border rounded-lg p-4 ${storage?.status === "connected" ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className={`font-medium text-sm ${storage?.status === "connected" ? "text-green-700" : "text-red-700"}`}>
                    {storage?.status === "connected" ? "Connected" : "Missing"}
                  </div>
                  <div className="text-xs font-mono text-[#5C5E62] mt-0.5">{storage?.path ?? "Not found"}</div>
                </div>
              </div>
              {storage?.status === "connected" && (
                <div className="mt-3 space-y-1 text-xs text-[#5C5E62]">
                  <div><span className="text-[#8E8E8E]">Brain OS:&nbsp;</span><span className="font-mono">{storage.brainOsPath ?? "—"}</span></div>
                  <div><span className="text-[#8E8E8E]">Data:&nbsp;</span><span className="font-mono">{storage.dataPath ?? "—"}</span></div>
                </div>
              )}
            </div>
          </section>

          {/* Backup stats */}
          <section>
            <h2 className="text-sm font-medium text-[#5C5E62] uppercase tracking-wider mb-3">Backup Status</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {statCard("Total Backups", report?.totalBackups ?? 0)}
              {statCard("Storage Used", fmtBytes(report?.storageBytes ?? 0))}
              {statCard("DB Backups", report?.databaseBackupCount ?? 0, `Last: ${fmt(report?.lastDatabaseBackup ?? null)}`)}
              {statCard("Brain OS Backups", report?.brainOsBackupCount ?? 0, `Last: ${fmt(report?.lastBrainOsBackup ?? null)}`)}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
              {statCard("Full Snapshots", report?.fullBackupCount ?? 0, `Last: ${fmt(report?.lastFullBackup ?? null)}`)}
              {statCard("Last DB Backup", fmt(report?.lastDatabaseBackup ?? null))}
              {statCard("Last Brain OS", fmt(report?.lastBrainOsBackup ?? null))}
            </div>
          </section>

          {/* Integrity */}
          <section>
            <h2 className="text-sm font-medium text-[#5C5E62] uppercase tracking-wider mb-3">Data Integrity</h2>
            {integrity ? (
              <div className="space-y-3">
                <div className={`border rounded-lg p-4 flex items-center justify-between ${integrity.healthy ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
                  <div>
                    <div className={`font-medium text-sm ${integrity.healthy ? "text-green-700" : "text-amber-700"}`}>
                      {integrity.healthy ? "All checks passed" : "Issues found"}
                    </div>
                    <div className="text-xs text-[#8E8E8E] mt-0.5">{integrity.summary}</div>
                  </div>
                  <div className="text-xs text-[#8E8E8E]">
                    {integrity.passedChecks}/{integrity.totalChecks} checks passed
                  </div>
                </div>

                {integrity.errors.length + integrity.warnings.length + integrity.infos.length > 0 && (
                  <div className="bg-white border border-[#EEEEEE] rounded-lg divide-y divide-[#EEEEEE]">
                    {[...integrity.errors, ...integrity.warnings, ...integrity.infos].map((issue, i) => (
                      <div key={i} className="px-4 py-3 flex items-start gap-3">
                        <Badge severity={issue.severity} />
                        <div>
                          <div className="text-sm text-[#171A20]">{issue.message}</div>
                          <div className="text-xs text-[#8E8E8E] font-mono mt-0.5">{issue.check}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="text-xs text-[#8E8E8E]">Last scanned: {fmt(integrity.scannedAt)}</div>
              </div>
            ) : (
              <div className="text-sm text-[#8E8E8E]">No integrity data. Run a check above.</div>
            )}
          </section>

          {/* Recent backups */}
          {report && report.manifest.length > 0 && (
            <section>
              <h2 className="text-sm font-medium text-[#5C5E62] uppercase tracking-wider mb-3">Recent Backups</h2>
              <div className="bg-white border border-[#EEEEEE] rounded-lg divide-y divide-[#EEEEEE]">
                {report.manifest.slice(0, 10).map((b, i) => (
                  <div key={i} className="px-4 py-3 flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium text-[#171A20] capitalize">{b.backupType.replace(/_/g, " ")}</span>
                      <span className="text-[#8E8E8E] ml-2 font-mono text-xs">{b.filePath}</span>
                    </div>
                    <div className="text-xs text-[#8E8E8E] text-right">
                      <div>{fmtBytes(b.fileSize)}</div>
                      <div>{fmt(b.createdAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
