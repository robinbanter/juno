import { describe, it, expect } from "vitest";
import { waitForServer, devCookie } from "../helpers/server";

/**
 * Reporting and takedown.
 *
 * The property that matters is that a takedown is *effective*: not a flag in a
 * table, but content that has actually stopped being served — from the feed, the
 * in-app unlock, and the x402 resource server alike. A "removed" post that some
 * forgotten query still sells is not removed.
 *
 * Needs `npm run dev`. The moderation assertions need MODERATION_SECRET set on
 * the server and exported here; they skip otherwise rather than pretend to pass.
 */
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.MODERATION_SECRET ?? "";

const serverUp = await waitForServer(BASE);
const cookie = serverUp ? await devCookie(BASE) : null;

async function anyPostId(): Promise<string | null> {
  const res = await fetch(`${BASE}/api/x402/posts`);
  const body = await res.json();
  return body.resources?.[0]?.id ?? null;
}

const postId = serverUp ? await anyPostId() : null;

describe.skipIf(!serverUp)("e2e: reporting content", () => {
  it("accepts a report from someone with no account", async () => {
    // Requiring a login to report abuse suppresses the reports that matter most.
    expect(postId).toBeTruthy();
    const res = await fetch(`${BASE}/api/reports`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ postId, reason: "non_consensual", detail: "test" }),
    });
    expect(res.status).toBe(201);
    expect((await res.json()).reportId).toMatch(/^[0-9a-f-]{36}$/);
  }, 30_000);

  it("rejects an unknown reason rather than silently filing it as 'other'", async () => {
    const res = await fetch(`${BASE}/api/reports`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ postId, reason: "i-dont-like-it" }),
    });
    expect(res.status).toBe(400);
  }, 30_000);

  it("requires a real post", async () => {
    const res = await fetch(`${BASE}/api/reports`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        postId: "00000000-0000-0000-0000-000000000000",
        reason: "spam",
      }),
    });
    expect(res.status).toBe(404);
  }, 30_000);
});

describe.skipIf(!serverUp)("e2e: the moderation queue is not reachable without the operator secret", () => {
  it("404s an unauthenticated caller — without confirming the endpoint exists", async () => {
    const res = await fetch(`${BASE}/api/moderation/reports`);
    expect(res.status).toBe(404);
  }, 30_000);

  it("404s a wrong secret", async () => {
    const res = await fetch(`${BASE}/api/moderation/reports`, {
      headers: { authorization: "Bearer definitely-not-the-secret-value" },
    });
    expect(res.status).toBe(404);
  }, 30_000);

  it("refuses a takedown from an unauthenticated caller", async () => {
    const res = await fetch(
      `${BASE}/api/moderation/reports/00000000-0000-0000-0000-000000000000`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "takedown" }),
      },
    );
    expect(res.status).toBe(404);
  }, 30_000);
});

describe.skipIf(!serverUp || !SECRET || !cookie)("e2e: a takedown actually removes content", () => {
  it("stops serving the post everywhere at once", async () => {
    // Report it, find the report, take it down, then check every surface.
    const target = await anyPostId();
    expect(target).toBeTruthy();

    const filed = await fetch(`${BASE}/api/reports`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ postId: target, reason: "csam", detail: "e2e takedown" }),
    });
    const { reportId } = await filed.json();

    // Buyable before.
    const before = await fetch(`${BASE}/api/x402/posts/${target}`);
    expect([402, 503]).toContain(before.status);

    const acted = await fetch(`${BASE}/api/moderation/reports/${reportId}`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${SECRET}`, "content-type": "application/json" },
      body: JSON.stringify({ action: "takedown", note: "e2e" }),
    });
    expect(acted.status).toBe(200);

    // Gone from the paid API...
    expect((await fetch(`${BASE}/api/x402/posts/${target}`)).status).toBe(404);

    // ...from discovery...
    const catalog = await fetch(`${BASE}/api/x402/posts`).then((r) => r.json());
    expect(catalog.resources.some((r: { id: string }) => r.id === target)).toBe(false);

    // ...and from the in-app unlock, so nobody can buy removed content.
    const unlock = await fetch(`${BASE}/api/unlock`, {
      method: "POST",
      headers: { cookie: cookie!, "content-type": "application/json" },
      body: JSON.stringify({ postId: target }),
    });
    expect(unlock.status).toBe(404);
  }, 120_000);
});

describe.skipIf(!serverUp || !cookie || process.env.CONTENT_SCAN_PROVIDER !== "reject-all")(
  "e2e: automated scanning quarantines content",
  () => {
    it("never publishes media the scanner rejected", async () => {
      // Run the server with CONTENT_SCAN_PROVIDER=reject-all to exercise this.
      const sharp = (await import("sharp")).default;
      const jpeg = await sharp({
        create: { width: 256, height: 320, channels: 3, background: { r: 5, g: 5, b: 5 } },
      })
        .jpeg()
        .toBuffer();

      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }), "s.jpg");
      form.append("title", "scan quarantine e2e");
      form.append("price", "1.00");
      form.append("autoBlur", "false");

      const res = await fetch(`${BASE}/api/posts`, {
        method: "POST",
        headers: { cookie: cookie! },
        body: form,
      });
      // Accepted for review, NOT published.
      expect(res.status).toBe(202);
      const body = await res.json();
      expect(body.status).toBe("under_review");

      // And genuinely unreachable on every surface — a quarantine that still
      // serves the media is not a quarantine.
      expect((await fetch(`${BASE}/api/x402/posts/${body.postId}`)).status).toBe(404);

      const unlock = await fetch(`${BASE}/api/unlock`, {
        method: "POST",
        headers: { cookie: cookie!, "content-type": "application/json" },
        body: JSON.stringify({ postId: body.postId }),
      });
      expect(unlock.status).toBe(404);

      const catalog = await fetch(`${BASE}/api/x402/posts`).then((r) => r.json());
      expect(catalog.resources.some((r: { id: string }) => r.id === body.postId)).toBe(false);
    }, 120_000);
  },
);

describe.skipIf(!serverUp || !cookie)("e2e: §2257 submission is reachable", () => {
  it("lets a creator see their record status", async () => {
    // The gate is only fair if creators can act on it. Before this endpoint,
    // enabling REQUIRE_2257_RECORDS locked every creator out permanently.
    const res = await fetch(`${BASE}/api/account/records`, { headers: { cookie: cookie! } });
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveProperty("record");
  }, 30_000);

  it("never returns the ID document key or DOB to the client", async () => {
    // Most sensitive PII in the system: a government ID + legal name + DOB tied
    // to an adult-content account. The creator gains nothing from a copy.
    const raw = await fetch(`${BASE}/api/account/records`, {
      headers: { cookie: cookie! },
    }).then((r) => r.text());
    expect(raw).not.toContain("idDocumentKey");
    expect(raw).not.toContain("dateOfBirth");
    expect(raw).not.toContain("legalName");
  }, 30_000);

  it("requires auth to submit", async () => {
    const res = await fetch(`${BASE}/api/account/records`, { method: "POST" });
    expect(res.status).toBe(401);
  }, 30_000);

  it("keeps the record review queue operator-only", async () => {
    expect((await fetch(`${BASE}/api/moderation/records`)).status).toBe(404);
  }, 30_000);
});
