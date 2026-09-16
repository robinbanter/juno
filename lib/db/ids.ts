/**
 * Identifier guards for the query layer.
 *
 * Postgres throws `invalid input syntax for type uuid` when a malformed id
 * reaches a uuid column, and Drizzle passes that straight through — so
 * `getPost("x")` produced an unhandled 500 while `getPost(<valid missing uuid>)`
 * correctly produced 404. Four routes crashed this way, two of them money paths.
 *
 * The fix belongs here rather than in each route: a malformed id CANNOT name an
 * existing row, so "not found" is the truthful answer, and putting the guard at
 * the query layer means every caller — including ones not written yet — is
 * covered. Validating in nine routes would leave the tenth to be forgotten.
 */

// Any RFC-4122 shape. Deliberately not version-specific: the point is "could
// this possibly be one of our ids", not which generator made it.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when `value` could name a row. Non-strings included, since a body cast lies. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
