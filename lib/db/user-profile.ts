import { randomBytes } from "node:crypto";
import type { users } from "./schema";

export type ClerkUserInput = {
  clerkId: string;
  email?: string | null;
  displayName?: string | null;
  imageUrl?: string | null;
};

export function internalAddress() {
  return `0x${randomBytes(20).toString("hex")}`;
}

export function clerkProfile(input: ClerkUserInput): Partial<typeof users.$inferInsert> {
  const displayName = input.displayName?.trim() || null;
  const imageUrl = input.imageUrl?.trim() || null;
  return {
    clerkId: input.clerkId,
    email: input.email?.trim().toLowerCase() || null,
    displayName,
    imageUrl,
  };
}

export function usernameBase(input: ClerkUserInput) {
  const source =
    input.displayName?.trim() || input.email?.split("@")[0]?.trim() || null;
  if (!source) return null;

  const base = source
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!base) return null;
  return base.length >= 3 ? base.slice(0, 20) : base.padEnd(3, "_");
}

export function usernameCandidate(base: string, attempt: number) {
  if (attempt === 0) return base.slice(0, 20);
  const suffix = String(attempt + 1);
  return `${base.slice(0, 20 - suffix.length)}${suffix}`;
}

export function isUniqueViolation(err: unknown) {
  const error = err as { code?: string; cause?: { code?: string } };
  return error.code === "23505" || error.cause?.code === "23505";
}
