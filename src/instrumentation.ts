export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logSmtpStatus } = await import("@/lib/email-service");
    logSmtpStatus();
  }
}
