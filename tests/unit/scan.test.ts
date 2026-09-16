import { describe, it, expect, vi, afterEach } from "vitest";
import { getScanProvider, scanningEnabled } from "@/lib/moderation/scan";

/**
 * The scanning seam.
 *
 * The property under test is the DEFAULT and the failure mode — not a vendor's
 * accuracy. A scanner that is misconfigured or down must never resolve to
 * "publish it anyway", because that turns one bad config into an unscanned
 * public adult feed.
 */
describe("content scanning", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is off by default, and says so", () => {
    vi.stubEnv("CONTENT_SCAN_PROVIDER", "");
    expect(scanningEnabled()).toBe(false);
    expect(getScanProvider().name).toBe("none");
  });

  it("refuses to run 'hive' without a key rather than silently not scanning", () => {
    // The dangerous version of this is falling back to `none`: you'd believe you
    // were scanning while publishing everything unexamined.
    vi.stubEnv("CONTENT_SCAN_PROVIDER", "hive");
    vi.stubEnv("HIVE_API_KEY", "");
    expect(() => getScanProvider()).toThrow(/refusing to run unscanned/i);
  });

  it("rejects an unknown provider instead of guessing", () => {
    vi.stubEnv("CONTENT_SCAN_PROVIDER", "some-vendor-we-never-wired");
    expect(() => getScanProvider()).toThrow(/unknown/i);
  });

  it("reports scanning as enabled once a provider is configured", () => {
    vi.stubEnv("CONTENT_SCAN_PROVIDER", "hive");
    vi.stubEnv("HIVE_API_KEY", "test-key");
    expect(scanningEnabled()).toBe(true);
    expect(getScanProvider().name).toBe("hive");
  });

  it("treats a scanner failure as 'do not publish'", async () => {
    // Hive unreachable → the verdict must be `error`, which callers quarantine.
    // If this ever returned `clean`, an outage would publish everything.
    vi.stubEnv("CONTENT_SCAN_PROVIDER", "hive");
    vi.stubEnv("HIVE_API_KEY", "test-key");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    try {
      const verdict = await getScanProvider().scan({
        media: Buffer.from("x"),
        mediaType: "image",
        contentType: "image/jpeg",
      });
      expect(verdict.status).toBe("error");
      expect(verdict.status === "error" && verdict.detail).toContain("network down");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("treats a non-2xx from the scanner as 'do not publish'", async () => {
    vi.stubEnv("CONTENT_SCAN_PROVIDER", "hive");
    vi.stubEnv("HIVE_API_KEY", "test-key");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("rate limited", { status: 429 }));
    try {
      const verdict = await getScanProvider().scan({
        media: Buffer.from("x"),
        mediaType: "image",
        contentType: "image/jpeg",
      });
      // A 429 must not read as approval.
      expect(verdict.status).toBe("error");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("flags blocking classes above the threshold", async () => {
    vi.stubEnv("CONTENT_SCAN_PROVIDER", "hive");
    vi.stubEnv("HIVE_API_KEY", "test-key");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        status: [{ response: { output: [{ classes: [{ class: "csam", score: 0.91 }] }] } }],
      }),
    );
    try {
      const verdict = await getScanProvider().scan({
        media: Buffer.from("x"),
        mediaType: "image",
        contentType: "image/jpeg",
      });
      expect(verdict.status).toBe("flagged");
      expect(verdict.status === "flagged" && verdict.reason).toBe("csam");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("passes media with no blocking class", async () => {
    vi.stubEnv("CONTENT_SCAN_PROVIDER", "hive");
    vi.stubEnv("HIVE_API_KEY", "test-key");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        status: [{ response: { output: [{ classes: [{ class: "general_nsfw", score: 0.98 }] }] } }],
      }),
    );
    try {
      // Adult content is the product — only the blocking classes stop a post.
      const verdict = await getScanProvider().scan({
        media: Buffer.from("x"),
        mediaType: "image",
        contentType: "image/jpeg",
      });
      expect(verdict.status).toBe("clean");
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
