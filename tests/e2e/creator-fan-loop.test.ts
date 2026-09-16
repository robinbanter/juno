import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { waitForServer, devCookie } from "../helpers/server";

/**
 * The full product loop, end to end against a running app:
 *   creator uploads a post -> it's published -> a fan unlocks it -> the private
 *   media is served through a signed URL.
 *
 * Uses a $0 post so the test is repeatable and spends no TestNet funds; the paid
 * settlement path is covered by the on-chain assertions in api.test.ts.
 *
 * Needs `npm run dev` (dev-auth is disabled in production, by design).
 */
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";

const serverUp = await waitForServer(BASE);
const cookie = serverUp ? await devCookie(BASE) : null;

describe.skipIf(!serverUp || !cookie)("e2e: creator -> fan loop", () => {
  it("creates a post, publishes it, and serves its media to a fan who unlocks it", async () => {
    const jpeg = await sharp({
      create: { width: 256, height: 256, channels: 3, background: { r: 16, g: 185, b: 129 } },
    })
      .jpeg()
      .toBuffer();

    // 1. Creator uploads. autoBlur=false publishes directly (auto-blur is an
    //    optional Replicate enhancement, not required to post).
    const form = new FormData();
    form.set("file", new File([new Uint8Array(jpeg)], "test.jpg", { type: "image/jpeg" }));
    form.set("title", "vitest e2e loop");
    form.set("price", "0");
    form.set("autoBlur", "false");

    const created = await fetch(`${BASE}/api/posts`, {
      method: "POST",
      headers: { cookie: cookie! },
      body: form,
    });
    expect(created.status).toBe(200);
    const { postId, status } = await created.json();
    expect(status).toBe("published");
    expect(postId).toMatch(/^[0-9a-f-]{36}$/);

    // 2. It shows up as one of the creator's posts.
    const mine = await fetch(`${BASE}/api/posts`, { headers: { cookie: cookie! } }).then((r) =>
      r.json(),
    );
    expect(mine.posts.some((p: { id: string }) => p.id === postId)).toBe(true);

    // 3. A fan unlocks it and gets a signed URL for the private media.
    const unlock = await fetch(`${BASE}/api/unlock`, {
      method: "POST",
      headers: { cookie: cookie!, "content-type": "application/json" },
      body: JSON.stringify({ postId }),
    });
    expect(unlock.status).toBe(200);
    const { signedUrl } = await unlock.json();
    expect(signedUrl).toContain("/storage/v1/object/sign/");

    // 4. The signed URL really serves the uploaded image.
    const media = await fetch(signedUrl);
    expect(media.status).toBe(200);
    expect(media.headers.get("content-type")).toContain("image");
    expect(Number(media.headers.get("content-length"))).toBeGreaterThan(0);
  }, 120_000);

  it("rejects an upload with no file / no caption", async () => {
    const noFile = new FormData();
    noFile.set("title", "x");
    noFile.set("price", "1");
    const a = await fetch(`${BASE}/api/posts`, {
      method: "POST",
      headers: { cookie: cookie! },
      body: noFile,
    });
    expect(a.status).toBe(400);

    const noTitle = new FormData();
    noTitle.set("file", new File([new Uint8Array([1, 2, 3])], "x.jpg", { type: "image/jpeg" }));
    noTitle.set("price", "1");
    const b = await fetch(`${BASE}/api/posts`, {
      method: "POST",
      headers: { cookie: cookie! },
      body: noTitle,
    });
    expect(b.status).toBe(400);
  }, 60_000);
});
