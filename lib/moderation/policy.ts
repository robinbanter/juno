/**
 * When the safety gates are enforced — the single source of truth.
 *
 * These are pure functions of their inputs rather than readers of
 * `process.env`, for two reasons.
 *
 * The first is drift. `mainnet:preflight` used to re-implement this parsing
 * itself, so the gate and the check that guards the gate could disagree —
 * and did, the moment the defaults changed. A blocker that is wrong is worse
 * than no blocker: it either waves through what it should stop, or cries wolf
 * until someone stops reading it.
 *
 * The second is that preflight has to ask a question it cannot ask by reading
 * its own environment: not "is this enforced *here*", running as a local
 * script, but "will this be enforced in PRODUCTION". Taking the mode as an
 * argument is what makes that answerable.
 *
 * Deliberately no `server-only` and no DB import: preflight runs as a plain
 * script, and a policy nobody outside the server can evaluate is a policy
 * nobody can check before shipping.
 */

/** `X=` in a .env is an EMPTY STRING — not nullish, so `??` would not default. */
function configured(value: string | undefined): string {
  return value?.trim() || "";
}

/**
 * Must uploads be examined before they publish?
 *
 * Scanning is off by default so dev and the suite run without a vendor account.
 * That made the default fail-OPEN in production: unset meant every upload
 * published unexamined, silently. CSAM liability is strict — there is no
 * "we didn't know" — so production has to fail CLOSED, and an upload with no
 * scanner is quarantined for review instead of published.
 */
export function scanningRequiredFor(nodeEnv: string | undefined): boolean {
  return nodeEnv === "production";
}

/**
 * Must a creator have a verified age/consent record on file to publish?
 *
 * ON by default in production. An explicit `false` still wins — a staging box
 * may genuinely need it off, and preflight blocks that for MainNet. What must
 * not happen is getting it off by FORGETTING: defaulting off everywhere made
 * the unsafe state the one you got by omission, and 18 U.S.C. §2257 is not a
 * thing to be wrong about by accident.
 */
export function recordsRequiredFor(
  nodeEnv: string | undefined,
  value: string | undefined,
): boolean {
  const explicit = configured(value);
  if (explicit) return explicit.toLowerCase() === "true";
  return nodeEnv === "production";
}

/** The configured scanner name, normalised. `none` means no scanner. */
export function scanProviderNameFor(value: string | undefined): string {
  return (configured(value) || "none").toLowerCase();
}
