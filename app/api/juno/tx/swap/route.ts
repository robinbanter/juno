import { buildSwap } from "@/lib/juno/tx";
import { getPool } from "@/lib/juno/registry";
import {
  CallerError,
  junoHandler,
  junoJson,
  junoOptions,
  readJson,
  requireNumber,
  requireString,
} from "@/lib/juno/api";
import type { TradeSide } from "@/lib/juno/types";

export const dynamic = "force-dynamic";
export const OPTIONS = junoOptions;

/**
 * Build an unsigned swap for a coin.
 *
 * The client sends what it wants to trade; it gets back transaction bytes, the
 * quote those bytes were built against, and the blockhash window they are valid
 * in. It signs on-device and posts to `/api/juno/tx/submit`.
 *
 * The pool address is looked up from the registry rather than accepted from the
 * caller. A caller-supplied pool would let anyone point a swap at an arbitrary
 * account and have this server build a transaction against it.
 */
export async function POST(request: Request) {
  return junoHandler(async () => {
    const body = await readJson<Record<string, unknown>>(request);

    const mint = requireString(body.mint, "mint");
    const owner = requireString(body.owner, "owner");
    const side = requireString(body.side, "side") as TradeSide;
    if (side !== "buy" && side !== "sell") {
      throw new CallerError('"side" must be "buy" or "sell"');
    }
    // Either what to spend (`amountIn`) or, on a buy, exactly what to receive
    // (`amountOut`, in tokens).
    const amountOut =
      body.amountOut === undefined ? undefined : requireNumber(body.amountOut, "amountOut");
    const amountIn = amountOut === undefined ? requireNumber(body.amountIn, "amountIn") : 0;

    const row = await getPool(mint);
    if (!row) throw new CallerError("Coin not found");

    const result = await buildSwap({
      mint,
      poolAddress: row.poolAddress,
      side,
      amountIn,
      amountOut,
      owner,
      slippageBps:
        body.slippageBps === undefined ? undefined : requireNumber(body.slippageBps, "slippageBps"),
    });

    return junoJson({ ...result, pool: row.poolAddress, symbol: row.symbol });
  });
}
