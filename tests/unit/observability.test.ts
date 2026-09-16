import { describe, it, expect, vi, afterEach } from "vitest";
import { reportError, alertingConfigured } from "@/lib/observability";

/**
 * Error reporting.
 *
 * The point of this module is that money failures stop being silent, so the
 * tests are about *reachability*: does a fatal actually leave the process, and
 * does a non-fatal avoid crying wolf.
 */
describe("observability", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("always emits ONE structured line a log aggregator can filter on", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    reportError(new Error("boom"), { category: "money", severity: "error", context: { postId: "p1" } });

    expect(spy).toHaveBeenCalledTimes(1);
    // One line, valid JSON — not a multi-line dump that gets split into
    // unrelated records by the collector.
    const payload = JSON.parse(spy.mock.calls[0][0] as string);
    expect(payload.level).toBe("error");
    expect(payload.category).toBe("money");
    expect(payload.message).toBe("boom");
    expect(payload.postId).toBe("p1");
    expect(payload.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("pages a human on fatal", async () => {
    vi.stubEnv("ALERT_WEBHOOK_URL", "https://hooks.example/x");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));

    reportError(new Error("settlement refused"), { category: "money", severity: "fatal" });
    await new Promise((r) => setTimeout(r, 20));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    // Regression: this read `payload.severity` while the field is `level`, so
    // every real alert said "🚨 undefined/money".
    expect(body.text).toContain("fatal/money");
    expect(body.text).not.toContain("undefined");
  });

  it("does NOT page on a non-fatal — an alert that fires constantly is ignored", async () => {
    vi.stubEnv("ALERT_WEBHOOK_URL", "https://hooks.example/x");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));

    reportError(new Error("indexer hiccup"), { category: "dependency", severity: "error" });
    await new Promise((r) => setTimeout(r, 20));

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("still logs when no webhook is configured", () => {
    vi.stubEnv("ALERT_WEBHOOK_URL", "");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    reportError(new Error("boom"), { category: "money", severity: "fatal" });
    // No pager, but the record must still exist.
    expect(spy).toHaveBeenCalledTimes(1);
    expect(alertingConfigured()).toBe(false);
  });

  it("never lets a broken webhook take down the caller", async () => {
    // This runs inside `after()` on a request that already failed. If a dead
    // pager threw here it would turn one failure into two.
    vi.stubEnv("ALERT_WEBHOOK_URL", "https://hooks.example/x");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("webhook down"));

    expect(() =>
      reportError(new Error("boom"), { category: "money", severity: "fatal" }),
    ).not.toThrow();
    await new Promise((r) => setTimeout(r, 20));
  });

  it("handles a non-Error throw", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    reportError("just a string", { category: "other" });
    expect(JSON.parse(spy.mock.calls[0][0] as string).message).toBe("just a string");
  });
});
