import "server-only";

import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * Operator auth for the moderation endpoints.
 *
 * A shared secret in an Authorization header — the same shape the reconcile cron
 * already uses. Deliberately not a user role: roles need a schema change, an
 * admin UI to grant them, and an audit trail, and none of that should stand
 * between "content is reportable" and "content can be removed". Removal has to
 * work on day one.
 *
 * The upgrade path when there's a real moderation team: add `users.role`, keep
 * this function's signature, check the session first and fall back to the secret
 * for automation.
 */

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // timingSafeEqual throws on length mismatch — compare lengths first, and do it
  // without leaking via early return on the content itself.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function requireModerator(req: NextRequest): Promise<boolean> {
  const secret = process.env.MODERATION_SECRET;
  // Fail closed. An unset secret must not mean "everyone is a moderator".
  if (!secret || secret.length < 16) {
    console.error(
      "[moderation] MODERATION_SECRET is unset or too short — refusing all moderation access",
    );
    return false;
  }

  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return false;

  return safeEqual(token, secret);
}

export function moderationForbidden(): Response {
  // 404, not 403: don't confirm the endpoint exists to an unauthenticated prober.
  return Response.json({ error: "Not found" }, { status: 404 });
}
