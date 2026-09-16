/**
 * Shared e2e preflight.
 *
 * Every e2e suite gates itself on the dev server being up, because `npm test`
 * has to stay green without one. The trap is that a *skipped* test reads exactly
 * like a passing one: with a short fixed timeout, a cold `next dev` — which
 * compiles routes on first request — makes whole files vanish from the run and
 * the summary still says green. That silently hides real coverage.
 *
 * So: retry until a deadline instead of probing once, and treat "not up yet" as
 * a reason to wait rather than to skip.
 */
const DEFAULT_DEADLINE_MS = 90_000;

export const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

/**
 * Resolves true once the server answers, false only if it never does before the
 * deadline. `/sign-in` is the probe because it's public and forces a real render.
 */
export async function waitForServer(
  base: string = BASE_URL,
  deadlineMs: number = DEFAULT_DEADLINE_MS,
): Promise<boolean> {
  const deadline = Date.now() + deadlineMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    try {
      // Generous per-attempt timeout: the first hit pays for compilation.
      const res = await fetch(`${base}/sign-in`, { signal: AbortSignal.timeout(30_000) });
      if (res.ok) return true;
    } catch {
      // Not listening yet, or still compiling — fall through and retry.
    }
    attempt += 1;
    await new Promise((r) => setTimeout(r, Math.min(500 * attempt, 3_000)));
  }
  return false;
}

/**
 * A dev-auth session cookie, or null when dev auth is off (i.e. production),
 * which is a legitimate reason for a suite to skip.
 */
export async function devCookie(base: string = BASE_URL): Promise<string | null> {
  const res = await fetch(`${base}/api/dev/login`, { method: "POST" });
  if (res.status !== 200) return null;
  return (res.headers.get("set-cookie") ?? "").split(";")[0] || null;
}
