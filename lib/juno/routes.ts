/**
 * The route prefixes owned by Juno.
 *
 * Juno and Norr share one Next app and one root layout. Norr's global chrome
 * (the 18+ gate) must not render over Juno, which is a separate product with
 * no adult content — this list is how that chrome knows to stand down.
 *
 * Every directory under `app/(juno)/` must appear here.
 * `tests/unit/juno-routes.test.ts` enforces that, because a route missing
 * from this list does not fail loudly: it renders correctly and then gets an
 * unrelated age gate painted over the top of it.
 *
 * If Juno is promoted to the app root, this collapses to a no-op.
 */
export const JUNO_ROUTE_PREFIXES = [
  "/explore",
  "/reels",
  "/coin",
  "/creator",
  "/create",
  "/activity",
] as const;

export function isJunoRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return JUNO_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
