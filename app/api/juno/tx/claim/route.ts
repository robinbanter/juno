import { buildClaim } from "@/lib/juno/tx";
import { getPool } from "@/lib/juno/registry";
import {
  CallerError,
  junoHandler,
  junoJson,
  junoOptions,
  readJson,
  requireString,
} from "@/lib/juno/api";

export const dynamic = "force-dynamic";
export const OPTIONS = junoOptions;

/**
 * Build the unsigned transaction that pays a coin's creator their fees.
 *
 * `POST {mint, owner}`. Only the creator can claim: the registry says who
 * that is, and the program checks the signature regardless, so a mismatch is
 * refused here in words rather than as a failed simulation.
 */
export async function POST(request: Request) {
  return junoHandler(async () => {
    const body = await readJson<Record<string, unknown>>(request);
    const mint = requireString(body.mint, "mint");
    const owner = requireString(body.owner, "owner");

    const row = await getPool(mint);
    if (!row) throw new CallerError("Coin not found", 404);
    if (row.creatorWallet !== owner) {
      throw new CallerError("Only this coin's creator can claim its fees.", 403);
    }

    const result = await buildClaim({ poolAddress: row.poolAddress, owner });
    return junoJson({ ...result, pool: row.poolAddress, symbol: row.symbol });
  });
}
