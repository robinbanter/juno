import "server-only";

/**
 * Who is calling, for rate limiting only.
 *
 * The first `x-forwarded-for` hop is the client as the platform's proxy saw
 * it. It is spoofable when there is no proxy in front, which is why it keys a
 * rate limit and never an identity. Identity is the wallet session.
 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}
