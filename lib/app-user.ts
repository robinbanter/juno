import "server-only";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { CUSTODIAL_ACCOUNT_COOKIE } from "./custodial";
import { DEV_AUTH_COOKIE, DEV_USER_PROFILE, isValidDevAuthCookie } from "./dev-session";
import { SESSION_COOKIE, verifySession } from "./privy-session";
import {
  attachAnonymousCustodialAccountToClerk,
  type ClerkUserInput,
} from "./db/queries";
import type { users } from "./db/schema";
import { ensureUserTempoWallet } from "./custodial-wallets";

export type AppUser = typeof users.$inferSelect;

export class UnauthorizedError extends Error {
  constructor(message = "Sign in required") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export async function getCurrentAppUser() {
  const cookieStore = await cookies();
  const cookieUserId = cookieStore.get(CUSTODIAL_ACCOUNT_COOKIE)?.value;

  if (isValidDevAuthCookie(cookieStore.get(DEV_AUTH_COOKIE)?.value)) {
    const user = await attachAnonymousCustodialAccountToClerk({
      cookieUserId,
      clerkUser: DEV_USER_PROFILE,
    });
    await ensureUserTempoWallet(user.id);
    return user;
  }

  // Privy-backed session: the DID stands in for the stable external id
  // (`clerkId`), so the DB user model is unchanged.
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) return null;

  const privyInput: ClerkUserInput = {
    clerkId: session.sub,
    email: session.email,
    displayName: session.name,
    imageUrl: session.img,
  };
  const appUser = await attachAnonymousCustodialAccountToClerk({
    cookieUserId,
    clerkUser: privyInput,
  });
  await ensureUserTempoWallet(appUser.id);
  return appUser;
}

export async function isCurrentAppUserAuthenticated() {
  const cookieStore = await cookies();
  if (isValidDevAuthCookie(cookieStore.get(DEV_AUTH_COOKIE)?.value)) return true;

  return !!(await verifySession(cookieStore.get(SESSION_COOKIE)?.value));
}

export async function requireCurrentAppUser() {
  const user = await getCurrentAppUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export function accountCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  };
}

export function setAccountCookie<T extends NextResponse>(
  res: T,
  userId: string,
) {
  res.cookies.set(CUSTODIAL_ACCOUNT_COOKIE, userId, accountCookieOptions());
  return res;
}

export function unauthorizedJson(message = "Sign in required") {
  return Response.json({ error: message }, { status: 401 });
}
