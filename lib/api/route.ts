import "server-only";

import {
  requireCurrentAppUser,
  unauthorizedJson,
  UnauthorizedError,
  type AppUser,
} from "@/lib/app-user";

export type RequireUserResult =
  | { user: AppUser; response?: never }
  | { user?: never; response: Response };

export async function requireAppUserForRoute(): Promise<RequireUserResult> {
  try {
    return { user: await requireCurrentAppUser() };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { response: unauthorizedJson() };
    throw err;
  }
}

export function jsonError(error: string, status: number) {
  return Response.json({ error }, { status });
}
