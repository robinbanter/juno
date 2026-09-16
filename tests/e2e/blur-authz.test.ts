import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { waitForServer, devCookie } from "../helpers/server";
import { getDb } from "@/lib/db";
import { blurJobs, users } from "@/lib/db/schema";

/**
 * Authentication is not authorization.
 *
 * The blur routes were made to require a session, which stopped anonymous abuse
 * and left every signed-in user able to act on every OTHER user's jobs by id:
 * approve (publishing someone's unreviewed private media at a price you pick),
 * reject, retry (spending the platform's Replicate credit), or read their state.
 *
 * These tests need two real users and a job owned by the one who is NOT calling.
 */
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";

const serverUp = await waitForServer(BASE);
const cookie = serverUp ? await devCookie(BASE) : null;

/** A job owned by someone other than the dev user, or null if we can't build one. */
async function victimJobId(): Promise<string | null> {
  if (!serverUp) return null;
  try {
    const db = getDb();
    const dev = await db.query.users.findFirst({ where: eq(users.username, "dev_user") });
    const other = await db.query.users.findFirst({
      where: eq(users.username, "demo_creator"),
    });
    if (!dev || !other || dev.id === other.id) return null;

    const [job] = await db
      .insert(blurJobs)
      .values({
        creatorId: other.id,
        rawBlobKey: "uploads/victim/e2e.jpg",
        mediaType: "image",
        status: "ready_for_review",
        draftTitle: "victim's unreviewed post",
        draftPrice: "5.00000000",
      })
      .returning({ id: blurJobs.id });
    return job.id;
  } catch {
    return null;
  }
}

const victim = await victimJobId();

describe.skipIf(!serverUp || !cookie || !victim)(
  "e2e: a signed-in user cannot touch another creator's blur job",
  () => {
    const call = (path: string, method = "POST", body?: unknown) =>
      fetch(`${BASE}/api/blur/jobs/${victim}${path}`, {
        method,
        headers: { cookie: cookie!, "content-type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

    it("cannot PUBLISH someone else's unreviewed media", async () => {
      // The worst of the four: this would make another creator's private media
      // public, titled and priced by the attacker.
      const res = await call("/approve", "POST", { title: "stolen", unlockPrice: "0.01" });
      expect(res.status).toBe(404);
    }, 30_000);

    it("cannot read their job state", async () => {
      expect((await call("", "GET")).status).toBe(404);
    }, 30_000);

    it("cannot retry their job — that spends our Replicate credit", async () => {
      expect((await call("/retry")).status).toBe(404);
    }, 30_000);

    it("cannot reject their job", async () => {
      expect((await call("/reject", "POST", {})).status).toBe(404);
    }, 30_000);

    it("answers 404, not 403 — never confirm the id exists", async () => {
      // 403 would tell an attacker which job ids are real.
      const res = await call("/approve", "POST", {});
      expect(res.status).not.toBe(403);
      expect((await res.json()).error).toBe("Job not found");
    }, 30_000);

    it("still refuses an unauthenticated caller", async () => {
      const res = await fetch(`${BASE}/api/blur/jobs/${victim}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(res.status).toBe(401);
    }, 30_000);
  },
);

describe.skipIf(!serverUp || !cookie)("e2e: the owner is not blocked", () => {
  it("lets a creator read their own job", async () => {
    const db = getDb();
    const dev = await db.query.users.findFirst({ where: eq(users.username, "dev_user") });
    if (!dev) return;
    const [job] = await db
      .insert(blurJobs)
      .values({
        creatorId: dev.id,
        rawBlobKey: "uploads/own/e2e.jpg",
        mediaType: "image",
        status: "ready_for_review",
      })
      .returning({ id: blurJobs.id });

    // A guard that blocks everyone is not a fix.
    const res = await fetch(`${BASE}/api/blur/jobs/${job.id}`, {
      headers: { cookie: cookie! },
    });
    expect(res.status).toBe(200);
  }, 30_000);
});
