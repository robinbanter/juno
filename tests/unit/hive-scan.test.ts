import { describe, it, expect, afterEach, vi } from "vitest";
import { getScanProvider } from "@/lib/moderation/scan";

/**
 * The Hive provider's response parsing, pinned against mocked responses.
 *
 * This integration has NEVER run against the live service — there is no account
 * — so the parsing is written from Hive's docs and should be treated as a guess.
 * That is exactly why these exist. They cannot prove the guess matches Hive's
 * real JSON (only a live key can), but they can prove the thing that actually
 * matters: what happens when the guess is WRONG.
 *
 * The answer has to be "quarantine", never "clean". `clean` must mean we looked
 * and saw nothing — never that we found nothing to look at. Under strict CSAM
 * liability, a parser that answers "clean" to a response it did not understand
 * publishes unexamined media while the dashboard reports scanning is on.
 */

const KEY = process.env.HIVE_API_KEY;
const PROVIDER = process.env.CONTENT_SCAN_PROVIDER;

function hive() {
  process.env.CONTENT_SCAN_PROVIDER = "hive";
  process.env.HIVE_API_KEY = "test-key";
  return getScanProvider();
}

function respond(body: unknown, status = 200) {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })));
}

const input = {
  media: Buffer.from("not-really-an-image"),
  mediaType: "image" as const,
  contentType: "image/jpeg",
};

/** A well-formed Hive reply carrying the given classes. */
const wellFormed = (classes: { class: string; score: number }[]) => ({
  status: [{ response: { output: [{ classes }] } }],
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (KEY === undefined) delete process.env.HIVE_API_KEY;
  else process.env.HIVE_API_KEY = KEY;
  if (PROVIDER === undefined) delete process.env.CONTENT_SCAN_PROVIDER;
  else process.env.CONTENT_SCAN_PROVIDER = PROVIDER;
});

describe("hive provider — verdicts it can actually justify", () => {
  it("passes media whose classes are all benign and below threshold", () => {
    respond(wellFormed([{ class: "general_nsfw", score: 0.9 }, { class: "csam", score: 0.01 }]));
    return expect(hive().scan(input)).resolves.toEqual({ status: "clean" });
  });

  it("flags CSAM and names the class and score", async () => {
    respond(wellFormed([{ class: "csam", score: 0.87 }]));
    const v = await hive().scan(input);
    expect(v).toMatchObject({ status: "flagged", reason: "csam" });
    expect((v as { detail: string }).detail).toContain("0.87");
  });

  it("maps a minor-present class to `underage`, not `other`", async () => {
    respond(wellFormed([{ class: "yes_child_present", score: 0.6 }]));
    expect(await hive().scan(input)).toMatchObject({ status: "flagged", reason: "underage" });
  });

  it("uses a deliberately low threshold — a false positive costs one review", async () => {
    // 0.5 exactly must flag. A false negative here is a criminal liability;
    // erring toward a human look is the cheap direction.
    respond(wellFormed([{ class: "csam", score: 0.5 }]));
    expect(await hive().scan(input)).toMatchObject({ status: "flagged" });
    respond(wellFormed([{ class: "csam", score: 0.49 }]));
    expect(await hive().scan(input)).toEqual({ status: "clean" });
  });
});

describe("hive provider — never calls an unread response clean", () => {
  /**
   * The regression. `classes` is built by digging through
   * `body.status[].response.output[].classes`. If ANY of that shape is wrong,
   * the flatMap yields [], the verdict loop never runs, and the old code fell
   * straight through to `return { status: "clean" }`.
   *
   * Each case below is a plausible way the guess is wrong. Every one used to
   * publish the upload unexamined.
   */
  it("quarantines an empty class list rather than calling it clean", async () => {
    respond(wellFormed([]));
    expect(await hive().scan(input)).toMatchObject({ status: "error" });
  });

  it("quarantines a renamed or restructured body", async () => {
    // e.g. Hive wraps it, or returns an async task id instead of sync output.
    for (const body of [{}, { task_id: "abc" }, { status: [] }, { status: [{}] }, { data: { classes: [] } }]) {
      respond(body);
      expect(await hive().scan(input), JSON.stringify(body)).toMatchObject({ status: "error" });
    }
  });

  it("quarantines a 200 that is not the JSON we expect", async () => {
    // An auth or quota failure that answers 200 with a message body.
    respond({ message: "invalid api key" });
    expect(await hive().scan(input)).toMatchObject({ status: "error" });
  });

  it("quarantines an HTTP error", async () => {
    respond({}, 401);
    const v = await hive().scan(input);
    expect(v).toMatchObject({ status: "error" });
    expect((v as { detail: string }).detail).toContain("401");
  });

  it("quarantines a network failure instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNRESET"); }));
    expect(await hive().scan(input)).toMatchObject({ status: "error", detail: "ECONNRESET" });
  });
});

describe("hive provider — refuses to run unconfigured", () => {
  it("throws rather than silently falling back to publishing everything", () => {
    process.env.CONTENT_SCAN_PROVIDER = "hive";
    delete process.env.HIVE_API_KEY;
    expect(() => getScanProvider()).toThrow(/HIVE_API_KEY/);
  });
});
