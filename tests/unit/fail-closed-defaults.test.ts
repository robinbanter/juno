import { describe, it, expect, afterEach } from "vitest";
import { scanningRequired } from "@/lib/moderation/scan";
import { recordsRequired } from "@/lib/moderation/records";
import {
  recordsRequiredFor,
  scanProviderNameFor,
  scanningRequiredFor,
} from "@/lib/moderation/policy";

/**
 * The safety gates must be wrong ON PURPOSE, never by omission.
 *
 * Both of these default off so local dev and this suite can run without a
 * vendor account or real ID documents. That is reasonable — and it used to mean
 * the DEFAULT was fail-OPEN: a production deploy with the variables unset
 * published every upload unexamined and let creators publish with no age or
 * consent record on file. `mainnet:preflight` blocks on both, but preflight is
 * a script someone has to remember to run. Nothing forced it.
 *
 * Production now defaults to the safe side. These pin that, because a default
 * nobody tests is a default that quietly drifts back.
 */

const env = process.env.NODE_ENV;
const scan = process.env.CONTENT_SCAN_PROVIDER;
const records = process.env.REQUIRE_2257_RECORDS;

function setEnv(key: string, value: string | undefined) {
  if (value === undefined) delete (process.env as Record<string, string | undefined>)[key];
  else (process.env as Record<string, string | undefined>)[key] = value;
}

afterEach(() => {
  setEnv("NODE_ENV", env);
  setEnv("CONTENT_SCAN_PROVIDER", scan);
  setEnv("REQUIRE_2257_RECORDS", records);
});

describe("content scanning is mandatory in production", () => {
  it("is required when NODE_ENV is production", () => {
    setEnv("NODE_ENV", "production");
    expect(scanningRequired()).toBe(true);
  });

  it("is not required in development or test", () => {
    setEnv("NODE_ENV", "development");
    expect(scanningRequired()).toBe(false);
    setEnv("NODE_ENV", "test");
    expect(scanningRequired()).toBe(false);
  });
});

describe("§2257 records are required in production", () => {
  it("defaults ON in production when the variable is unset", () => {
    setEnv("NODE_ENV", "production");
    setEnv("REQUIRE_2257_RECORDS", undefined);
    expect(recordsRequired()).toBe(true);
  });

  it("defaults ON in production when the variable is BLANK", () => {
    // `REQUIRE_2257_RECORDS=` in a .env is an empty string, not nullish — the
    // exact shape that has already defeated `??` defaults elsewhere in this
    // codebase. A blank must not read as "false".
    setEnv("NODE_ENV", "production");
    setEnv("REQUIRE_2257_RECORDS", "   ");
    expect(recordsRequired()).toBe(true);
  });

  it("defaults OFF outside production, so dev and this suite can publish", () => {
    setEnv("NODE_ENV", "development");
    setEnv("REQUIRE_2257_RECORDS", undefined);
    expect(recordsRequired()).toBe(false);
  });

  it("still honours an explicit opt-out — wrong on purpose is allowed", () => {
    // A staging box may genuinely need this off. Preflight still blocks it for
    // MainNet; what must not happen is getting it off by forgetting.
    setEnv("NODE_ENV", "production");
    setEnv("REQUIRE_2257_RECORDS", "false");
    expect(recordsRequired()).toBe(false);
  });

  it("honours an explicit opt-in outside production", () => {
    setEnv("NODE_ENV", "development");
    setEnv("REQUIRE_2257_RECORDS", "true");
    expect(recordsRequired()).toBe(true);
  });
});

/**
 * The pure rules `mainnet:preflight` evaluates.
 *
 * Preflight used to re-implement this parsing, so the gate and the check that
 * guards the gate could disagree — and did, the instant the defaults changed. It
 * now calls these, and it has to pass the mode EXPLICITLY: it runs as a local
 * script, so reading its own NODE_ENV would answer the wrong question ("is this
 * on here?") instead of the only one that matters ("will production enforce
 * it?"). These pin the contract preflight depends on.
 */
describe("policy rules preflight evaluates", () => {
  it("reports records enforced for production when unset", () => {
    expect(recordsRequiredFor("production", undefined)).toBe(true);
    expect(recordsRequiredFor("production", "")).toBe(true);
  });

  it("reports records NOT enforced only when explicitly disabled", () => {
    expect(recordsRequiredFor("production", "false")).toBe(false);
    expect(recordsRequiredFor("production", "FALSE")).toBe(false);
  });

  it("answers for production regardless of the caller's own mode", () => {
    // Preflight runs under NODE_ENV=development/test. It must still get the
    // production answer — that is the entire point of taking the mode.
    expect(recordsRequiredFor("production", undefined)).toBe(true);
    expect(recordsRequiredFor("development", undefined)).toBe(false);
  });

  it("only requires scanning in production", () => {
    expect(scanningRequiredFor("production")).toBe(true);
    expect(scanningRequiredFor("development")).toBe(false);
    expect(scanningRequiredFor(undefined)).toBe(false);
  });

  it("normalises the scanner name and treats blank as none", () => {
    expect(scanProviderNameFor(undefined)).toBe("none");
    expect(scanProviderNameFor("   ")).toBe("none");
    expect(scanProviderNameFor(" HIVE ")).toBe("hive");
  });
});
