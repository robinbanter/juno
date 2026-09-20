import { submitSigned } from "@/lib/juno/tx";
import {
  junoHandler,
  junoJson,
  junoOptions,
  readJson,
  requireNumber,
  requireString,
} from "@/lib/juno/api";

export const dynamic = "force-dynamic";
export const OPTIONS = junoOptions;

/**
 * Submit a transaction the device signed, and wait for it to confirm.
 *
 * This server never holds the key that signed these bytes. It broadcasts them,
 * waits for the cluster to agree, and drops the caches for the pool that just
 * moved so the next read is live rather than up to a minute stale.
 */
export async function POST(request: Request) {
  return junoHandler(async () => {
    const body = await readJson<Record<string, unknown>>(request);
    const transaction = requireString(body.transaction, "transaction");

    const rawWindow = body.window as Record<string, unknown> | undefined;
    const window = rawWindow
      ? {
          blockhash: requireString(rawWindow.blockhash, "window.blockhash"),
          lastValidBlockHeight: requireNumber(
            rawWindow.lastValidBlockHeight,
            "window.lastValidBlockHeight",
          ),
        }
      : undefined;

    const result = await submitSigned({
      transaction,
      window,
      poolAddress:
        typeof body.poolAddress === "string" ? body.poolAddress : undefined,
    });

    return junoJson(result);
  });
}
