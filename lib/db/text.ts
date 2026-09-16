/**
 * Text guards for anything user-supplied that reaches Postgres.
 *
 * Postgres `text` cannot hold a NUL byte — the driver throws
 * `invalid byte sequence for encoding "UTF8": 0x00` — and nothing caught it, so
 * a single 0x00 anywhere in a body produced an unhandled 500. Measured: search,
 * profile bio, comment body and report detail all crashed on it, and search is
 * reachable without an account.
 *
 * Stripping is the right call rather than rejecting: a NUL in user text is never
 * meaningful intent, it's a probe or an encoding accident, and a 400 would just
 * be a worse way to say "we removed a character you couldn't see anyway".
 *
 * Applied at the query layer for the same reason as the uuid guard: routes are
 * added over time and the check would eventually be forgotten on one.
 */

// eslint-disable-next-line no-control-regex -- the whole point is matching 0x00
const NUL = /\u0000/g;

/** Remove characters Postgres cannot store. Returns "" for a non-string. */
export function sanitizeDbText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(NUL, "");
}

/**
 * Sanitize and cap. Unbounded user text is its own problem: a 10MB comment costs
 * storage and every read of that row forever.
 */
export function sanitizeDbTextMax(value: unknown, max: number): string {
  return sanitizeDbText(value).slice(0, max);
}
