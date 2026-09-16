import { readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { JUNO_ROUTE_PREFIXES, isJunoRoute } from "@/lib/juno/routes";

const JUNO_APP_DIR = path.resolve(__dirname, "../../app/(juno)");

/**
 * A Juno route missing from `JUNO_ROUTE_PREFIXES` fails silently: the page
 * renders fine and then Norr's 18+ gate paints over it. That is exactly the
 * kind of bug that survives review, so it is caught here instead.
 */
function routeSegments(): string[] {
  return readdirSync(JUNO_APP_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    // Route groups and private folders are not URL segments.
    .filter((entry) => !entry.name.startsWith("(") && !entry.name.startsWith("_"))
    .map((entry) => entry.name);
}

describe("juno route ownership", () => {
  it("declares every route directory under app/(juno)", () => {
    const declared = new Set(JUNO_ROUTE_PREFIXES.map((p) => p.slice(1)));
    const missing = routeSegments().filter((seg) => !declared.has(seg));

    expect(
      missing,
      `add ${missing.map((m) => `"/${m}"`).join(", ")} to JUNO_ROUTE_PREFIXES`,
    ).toEqual([]);
  });

  it("matches a prefix and its children, not merely similar names", () => {
    expect(isJunoRoute("/reels")).toBe(true);
    expect(isJunoRoute("/reels/abc")).toBe(true);
    expect(isJunoRoute("/coin/Juno01")).toBe(true);
    // `/creators` is not `/creator`.
    expect(isJunoRoute("/creators")).toBe(false);
    expect(isJunoRoute("/explorer")).toBe(false);
  });

  it("leaves Norr's own routes alone", () => {
    for (const norr of ["/", "/messages", "/profile", "/search", "/notifications"]) {
      expect(isJunoRoute(norr)).toBe(false);
    }
  });

  it("handles a missing pathname", () => {
    expect(isJunoRoute(null)).toBe(false);
    expect(isJunoRoute(undefined)).toBe(false);
    expect(isJunoRoute("")).toBe(false);
  });
});
