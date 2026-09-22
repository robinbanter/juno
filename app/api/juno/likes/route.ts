import { junoJson, junoOptions } from "@/lib/juno/api";
import { cluster } from "@/lib/juno/cluster";
import { getPool } from "@/lib/juno/registry";
import { setLike, socialCounts } from "@/lib/juno/social";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = junoOptions;

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Likes on coins.
 *
 * `GET ?coins=a,b,c&viewer=` — counts for up to 60 coins, plus whether the
 * viewer liked each. `POST {coin, wallet, like}` — idempotent both ways.
 *
 * A like is social signal and nothing else: it moves no money and is not a
 * position. That is why it lives beside comments in Mongo and never near the
 * swap record.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mints = (url.searchParams.get("coins") ?? "")
    .split(",")
    .filter((mint) => BASE58.test(mint))
    .slice(0, 60);
  const viewer = url.searchParams.get("viewer");
  if (viewer && !BASE58.test(viewer)) {
    return junoJson({ error: "viewer is not an address" }, { status: 400 });
  }
  try {
    const counts = await socialCounts(mints, cluster(), viewer);
    return junoJson({ counts: Object.fromEntries(counts) });
  } catch (error) {
    // Mongo absent or down. Market data never depends on this, so neither does
    // the status code a client uses to decide whether the screen works.
    return junoJson(
      { counts: {}, error: error instanceof Error ? error.message : "Likes are unavailable" },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return junoJson({ error: "Body must be JSON" }, { status: 400 });
  }
  const coinMint = typeof body.coin === "string" ? body.coin : "";
  const wallet = typeof body.wallet === "string" ? body.wallet : "";
  if (!BASE58.test(coinMint)) return junoJson({ error: "coin is not an address" }, { status: 400 });
  if (!BASE58.test(wallet)) return junoJson({ error: "wallet is not an address" }, { status: 400 });

  // Only coins Juno launched; otherwise this is an open write keyed on any string.
  if (!(await getPool(coinMint))) return junoJson({ error: "No such coin" }, { status: 404 });

  const result = await setLike({ coinMint, cluster: cluster(), wallet, like: body.like !== false });
  return junoJson({ coin: coinMint, ...result });
}
