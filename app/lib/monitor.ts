// Error monitoring hook, STUBBED: no monitoring account is used. When
// ERROR_WEBHOOK_URL is set (server only), a short JSON report is POSTed there; a real
// service (Sentry, a log drain) can be wired in here later. Never send personal data:
// only the error name, message, where it happened and the time.
export async function reportError(err: unknown, where: string): Promise<void> {
  const e = err as { name?: string; message?: string; stack?: string };
  const report = {
    where,
    name: e?.name || "Error",
    message: String(e?.message || err).slice(0, 300),
    stack: (e?.stack || "").split("\n").slice(0, 6).join("\n"),
    at: new Date().toISOString(),
  };
  console.error("[varanasi]", where, report.message);
  const url = typeof process !== "undefined" ? process.env.ERROR_WEBHOOK_URL : undefined;
  if (!url) return;
  try {
    await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(report), cache: "no-store" });
  } catch {
    /* monitoring must never break the request */
  }
}
