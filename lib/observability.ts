/**
 * Error reporting for the failures that are otherwise silent.
 *
 * The gap this closes: a settlement that never lands, a withdrawal that 500s, a
 * scanner that quarantines everything — all of them previously went to
 * `console.error` and nowhere else. Revenue quietly stops and nobody is paged.
 *
 * Deliberately dependency-free rather than a Sentry SDK install. Sentry's Next
 * integration wraps `next.config` (`withSentryConfig`), and this project's config
 * carries a hand-written webpack rule that the PWA service worker depends on —
 * trading a working `sw.js` for an error tracker is a bad deal. Instead:
 *
 *  1. Always emit ONE structured JSON line. Vercel, Datadog, CloudWatch and
 *     friends all parse that, so an alert can be built on
 *     `level=fatal AND category=money` wherever the logs already go.
 *  2. Optionally POST to `ALERT_WEBHOOK_URL` (Slack-shaped) so the failures that
 *     mean "money stopped moving" page a human immediately.
 *
 * If you later want Sentry, call `Sentry.captureException` from `reportError` and
 * every call site is already correct.
 */

export type ErrorCategory =
  /** Funds did not move when they should have, or moved wrongly. */
  | "money"
  /** Content safety: scanning, moderation, records. */
  | "safety"
  /** An external dependency (RPC, Postgres, MongoDB, IPFS pinning). */
  | "dependency"
  | "other";

export type Severity = "warn" | "error" | "fatal";

type ReportOptions = {
  category: ErrorCategory;
  severity?: Severity;
  /** Anything that helps diagnose. Never put secrets or PII here. */
  context?: Record<string, unknown>;
};

/**
 * Fire-and-forget: alerting must never fail the request that was already
 * failing. A webhook that is down cannot be allowed to turn a 502 into a hang.
 */
async function page(payload: Record<string, unknown>) {
  const url = process.env.ALERT_WEBHOOK_URL?.trim();
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        // `level`, not `severity` — the payload field is named `level`, and
        // reading the wrong one silently renders "undefined" in the alert a
        // human is woken up by.
        text: `🚨 ${payload.level}/${payload.category}: ${payload.message}`,
        ...payload,
      }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    // Nothing useful to do — the structured log line above is the fallback.
  }
}

/**
 * Report a failure. Always logs; pages when it's severe enough to warrant it.
 *
 * `fatal` means "a human needs to look now": money is stuck or being lost.
 */
export function reportError(error: unknown, { category, severity = "error", context }: ReportOptions) {
  const message = error instanceof Error ? error.message : String(error);
  const payload = {
    level: severity,
    category,
    message,
    stack: error instanceof Error ? error.stack : undefined,
    ...context,
    at: new Date().toISOString(),
  };

  // One line, parseable. Not a pretty multi-line dump that a log aggregator
  // splits into unrelated records.
  console.error(JSON.stringify(payload));

  if (severity === "fatal") void page(payload);
}

/** True when severe failures actually reach a human rather than just a log. */
export function alertingConfigured(): boolean {
  return !!process.env.ALERT_WEBHOOK_URL?.trim();
}
