import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import type { RouteConfig } from "@x402/next";
import type { HTTPRequestContext } from "@x402/core/http";
import { getPost } from "@/lib/db/queries";
import { presignPrivateGet } from "@/lib/blob";
import { provisionCustodialWalletForDeposits } from "@/lib/custodial-wallets";
import { getX402Server, x402Network, x402Price } from "@/lib/x402";

// algod + Postgres + Supabase signing all need Node.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A Norr post as a machine-payable x402 resource.
 *
 * Humans unlock this post by tapping (prepaid custodial balance, see
 * /api/unlock). This is the same content behind the same price for an *agent*:
 * no account, no session — pay per request with USDC from your own wallet.
 *
 *   GET  /api/x402/posts/{id}        -> 402 + payment requirements
 *   GET  ... with PAYMENT-SIGNATURE  -> 200 + a short-lived signed media URL
 *
 * Payment goes straight to the creator's wallet, so this doesn't route revenue
 * through a platform float.
 */

/**
 * The post id, taken from the URL path.
 *
 * `withX402` invokes the handler as `routeHandler(request)` — it does not forward
 * Next's route context — so `params` is unavailable here. The path is the single
 * source of the id for the price callback, the payTo callback, and the handler
 * alike, which keeps all three quoting and serving the same post.
 */
function postIdFromPath(path: string): string {
  const id = path.split("?")[0].split("/").filter(Boolean).pop();
  if (!id) throw new Error("x402: could not resolve a post id from the request path");
  return id;
}

function postIdFrom(context: HTTPRequestContext): string {
  return postIdFromPath(context.path);
}

/**
 * Price this specific post. x402 calls this while building the 402, so a wrong
 * or missing post must fail loudly rather than quote a default price.
 */
async function priceForPost(context: HTTPRequestContext) {
  const post = await getPost(postIdFrom(context));
  if (!post || !post.isPublished) {
    throw new ResourceUnavailable("Post not found");
  }
  return x402Price(post.unlockPrice);
}

/** Raised when the post is fine but we can't currently sell it. */
class ResourceUnavailable extends Error {}

/**
 * Where the money goes: the creator's own custodial wallet.
 *
 * NOT `creator.walletAddress` — that's a synthetic internal id, not an on-chain
 * address. Provisioning also opts the wallet in to USDC, without which the
 * facilitator's settlement would be rejected and the sale would simply fail.
 *
 * Note this makes building a 402 a chain *write* the first time a given creator
 * is quoted: the platform seeds ~0.3 ALGO and signs the opt-in. It's idempotent,
 * so the cost is once per creator, not per request — but it does mean an
 * anonymous GET can spend the platform's gas, bounded by the creator count.
 * The alternative (advertise a price the creator can't receive) is worse.
 */
async function payToForPost(context: HTTPRequestContext) {
  const post = await getPost(postIdFrom(context));
  if (!post) throw new ResourceUnavailable("Post not found");

  const wallet = await provisionCustodialWalletForDeposits(post.creatorId);
  if (!wallet.ready) {
    // The reason carries internal detail — the platform's address, raw algod
    // errors — so it goes to the log, not to an anonymous caller.
    console.error(
      `[x402] cannot sell post ${post.id}: creator wallet not receivable — ${wallet.reason}`,
    );
    throw new ResourceUnavailable("This post can't be sold right now — try again later");
  }
  return wallet.address;
}

const routeConfig: RouteConfig = {
  accepts: {
    scheme: "exact",
    network: x402Network(),
    payTo: payToForPost,
    price: priceForPost,
  },
  description: "Unlock a Norr post — returns a short-lived signed media URL",
  mimeType: "application/json",
  serviceName: "Norr",
  tags: ["content", "media", "creator", "pay-per-unlock"],
  // `resource` is deliberately omitted: the SDK then reports the actual request
  // URL, so each 402 identifies the specific post being sold rather than the
  // collection. That id is what a receipt or discovery index refers back to.
};

/**
 * Runs only after the payment verifies. Wrapped with `withX402` (not the proxy)
 * so settlement happens only when this returns < 400 — a payer is never charged
 * for a post whose media we then failed to serve.
 */
async function handler(request: NextRequest): Promise<NextResponse> {
  const post = await getPost(postIdFromPath(request.nextUrl.pathname));
  if (!post || !post.isPublished) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  // Video needs a longer window than a still to survive playback start.
  const ttlSeconds = post.mediaType === "video" ? 300 : 60;
  const signedUrl = await presignPrivateGet(post.privateMediaKey, ttlSeconds);

  return NextResponse.json({
    id: post.id,
    title: post.title,
    mediaType: post.mediaType,
    price: post.unlockPrice,
    creator: post.creator?.username ?? null,
    signedUrl,
    expiresInSeconds: ttlSeconds,
  });
}

const paidGET = withX402(handler, routeConfig, getX402Server());

/**
 * The price/payTo callbacks run inside the SDK while it builds the 402, so a
 * throw there escapes as an opaque 500 with an empty body — useless to a client
 * that just wants to know whether to retry. Translate instead: a resource that
 * exists but can't be sold right now is 503 (try later), a missing one is 404.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    return await paidGET(request);
  } catch (err) {
    if (err instanceof ResourceUnavailable) {
      const missing = err.message === "Post not found";
      return NextResponse.json(
        { error: err.message },
        { status: missing ? 404 : 503 },
      );
    }
    throw err;
  }
}
