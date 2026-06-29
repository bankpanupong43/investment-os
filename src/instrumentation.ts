export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logSmtpStatus } = await import("@/lib/email-service");
    logSmtpStatus();

    // Nightly scheduler — 22:00 UTC (05:00 Bangkok)
    const cron = await import("node-cron");
    const { runNightlySequence } = await import("@/lib/scheduler");
    cron.default.schedule(
      "0 22 * * *",
      async () => {
        console.log("[Scheduler] Starting nightly sequence...");
        await runNightlySequence().catch((err: Error) => {
          console.error("[Scheduler] Nightly sequence failed:", err);
        });
      },
      { timezone: "UTC" }
    );
    console.log("[Scheduler] Nightly job registered at 22:00 UTC");
  }
}
