/**
 * Automated safety scanning for uploaded media.
 *
 * This is the *seam*, not the scanner. Norr can't ship a CSAM classifier — that
 * requires a contract with Hive / Thorn / PhotoDNA and access nobody hands to an
 * open codebase. What it can do is make plugging one in a config change instead
 * of a project: implement `ScanProvider`, register it, set an env var.
 *
 * The safety property that matters is the DEFAULT. `pending` is not servable, so
 * a scanner that is slow, broken, or rate-limited quarantines content rather than
 * publishing it. The only way media goes live unscanned is the explicit,
 * loudly-warned `none` provider.
 *
 * Not "server-only": the ops/backfill scripts need the same logic, and a second
 * copy of the thing deciding what is publishable is its own failure mode. It
 * reads non-NEXT_PUBLIC env only.
 */

import { scanningRequiredFor, scanProviderNameFor } from "./policy";

export type ScanVerdict =
  | { status: "clean" }
  | { status: "flagged"; reason: ScanReason; detail: string }
  /** The scanner could not decide. Callers must quarantine, never assume clean. */
  | { status: "error"; detail: string };

/** Maps onto `reportReasonEnum` so a flag can open a real report. */
export type ScanReason = "csam" | "underage" | "non_consensual" | "violence" | "other";

export type ScanInput = {
  /** Raw bytes. Providers that take a URL should presign rather than hold this. */
  media: Buffer;
  mediaType: "image" | "video";
  contentType: string;
};

export interface ScanProvider {
  readonly name: string;
  scan(input: ScanInput): Promise<ScanVerdict>;
}

/**
 * No scanning. Exists so local development and tests need no vendor account.
 *
 * It reports `clean`, which is fail-OPEN — so production must never reach it,
 * and does not: `scanningRequired()` makes an unconfigured production quarantine
 * the upload before a provider is ever asked. `mainnet:preflight` still blocks,
 * because a platform where every upload quarantines cannot publish anything.
 *
 * Keep this unreachable in production rather than making it return `error`:
 * a "scanner" that lies about having looked is worth less than an explicit gate
 * above it, and the gate is what the tests pin.
 */
const noneProvider: ScanProvider = {
  name: "none",
  async scan() {
    return { status: "clean" };
  },
};

/**
 * Hive Moderation — https://docs.thehive.ai
 *
 * Written against their documented synchronous image endpoint but NEVER executed
 * against the live service (no account), so treat it as a starting point rather
 * than a tested integration: verify the response shape and the class names below
 * against your dashboard before trusting it with real uploads.
 */
function hiveProvider(apiKey: string): ScanProvider {
  // Anything here means "do not publish, escalate to a human".
  const BLOCKING: Record<string, ScanReason> = {
    csam: "csam",
    child_sexual_abuse_material: "csam",
    yes_child_present: "underage",
    minor: "underage",
    gore: "violence",
    animal_cruelty: "violence",
  };

  return {
    name: "hive",
    async scan({ media, contentType }) {
      try {
        const form = new FormData();
        form.append("media", new Blob([new Uint8Array(media)], { type: contentType }));

        const res = await fetch("https://api.thehive.ai/api/v2/task/sync", {
          method: "POST",
          headers: { authorization: `Token ${apiKey}` },
          body: form,
          signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) {
          return { status: "error", detail: `hive HTTP ${res.status}` };
        }

        type HiveClass = { class: string; score: number };
        type HiveTask = {
          response?: { output?: { classes?: HiveClass[] }[] };
        };
        const body = (await res.json()) as { status?: HiveTask[] };

        const classes: HiveClass[] = (body.status ?? []).flatMap(
          (task) => task.response?.output?.flatMap((o) => o.classes ?? []) ?? [],
        );

        // "Clean" must mean WE LOOKED AND SAW NOTHING — never "we found nothing
        // to look at".
        //
        // This parsing is written from Hive's docs and has never run against the
        // live service, so treat it as a guess. If the guess is wrong — a renamed
        // field, an async task id instead of sync output, an auth failure that
        // answers 200 with a different body — `classes` comes back empty, the
        // loop below never runs, and the function used to fall through to
        // `clean`. Every upload would publish unexamined, silently, while the
        // dashboard said scanning was on. That is the worst failure this file
        // can have: strict CSAM liability does not care that the JSON moved.
        //
        // No classes = no verdict = quarantine for a human.
        if (!Array.isArray(body.status) || classes.length === 0) {
          return {
            status: "error",
            detail:
              "hive returned no classes — unrecognised response shape; refusing to call it clean",
          };
        }

        for (const c of classes) {
          const reason = BLOCKING[c.class];
          // Deliberately low: a false positive costs one human review; a false
          // negative costs a criminal liability.
          if (reason && c.score >= 0.5) {
            return {
              status: "flagged",
              reason,
              detail: `hive: ${c.class} (${c.score.toFixed(2)})`,
            };
          }
        }
        return { status: "clean" };
      } catch (err) {
        return {
          status: "error",
          detail: err instanceof Error ? err.message : "hive request failed",
        };
      }
    },
  };
}

/**
 * Flags everything. Exists so the quarantine path — the one that must work when
 * a real scanner says no — is testable without a vendor account.
 * `CONTENT_SCAN_PROVIDER=reject-all`. Never use outside tests.
 */
const rejectAllProvider: ScanProvider = {
  name: "reject-all",
  async scan() {
    return { status: "flagged", reason: "other", detail: "reject-all test provider" };
  },
};

/**
 * The provider name, normalised.
 *
 * `?? "none"` is not enough: `CONTENT_SCAN_PROVIDER=` in a .env file yields an
 * EMPTY STRING, which is not nullish, so the default never applies. That made
 * `scanningEnabled()` claim scanning was on while `getScanProvider()` threw on
 * the empty name — the two disagreeing about whether uploads are examined.
 */
function providerName(): string {
  return scanProviderNameFor(process.env.CONTENT_SCAN_PROVIDER);
}

/** The configured scanner. `CONTENT_SCAN_PROVIDER=hive` + `HIVE_API_KEY` to enable. */
export function getScanProvider(): ScanProvider {
  const configured = providerName();

  if (configured === "hive") {
    const key = process.env.HIVE_API_KEY;
    if (!key) {
      // Refuse to silently fall back to "publish everything" — that turns a
      // misconfiguration into an unscanned public feed.
      throw new Error(
        "CONTENT_SCAN_PROVIDER=hive but HIVE_API_KEY is not set — refusing to run unscanned",
      );
    }
    return hiveProvider(key);
  }

  if (configured === "reject-all") return rejectAllProvider;

  if (configured !== "none") {
    throw new Error(`Unknown CONTENT_SCAN_PROVIDER: ${configured}`);
  }
  return noneProvider;
}

/** True when uploads are actually examined. Used by preflight + the health check. */
export function scanningEnabled(): boolean {
  return providerName() !== "none";
}

/**
 * Production must never publish unexamined media.
 *
 * Scanning defaults to `none` so local dev and the suite can run without a
 * vendor account — reasonable, but it made the DEFAULT fail-OPEN: a production
 * deploy with `CONTENT_SCAN_PROVIDER` unset published every upload unexamined,
 * silently. `mainnet:preflight` blocks on it, but preflight is a script someone
 * has to run; nothing forced it.
 *
 * CSAM liability is strict — there is no "we didn't know" defence — so the
 * unconfigured case must fail CLOSED. In production an upload with no scanner
 * is quarantined for human review, exactly as a scanner ERROR already is. The
 * media is not lost and the queue makes the outage obvious; what cannot happen
 * is it going out unexamined.
 */
export function scanningRequired(): boolean {
  return scanningRequiredFor(process.env.NODE_ENV);
}
