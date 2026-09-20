import { buildLaunch } from "@/lib/juno/tx";
import { CURVE_PRESETS } from "@/lib/juno/curves";
import { QUOTE_TOKENS } from "@/lib/juno/dbc";
import {
  CallerError,
  junoHandler,
  junoJson,
  junoOptions,
  readJson,
  requireNumber,
  requireString,
} from "@/lib/juno/api";
import type { CurvePresetId } from "@/lib/juno/types";

export const dynamic = "force-dynamic";
export const OPTIONS = junoOptions;

/** Ticker conventions, enforced here so a launch cannot mint an unusable symbol. */
const SYMBOL = /^[A-Z0-9]{2,10}$/;

/**
 * Build the two unsigned transactions that open a coin.
 *
 * Both come back pre-signed by the accounts they create — the curve config and
 * the base mint — and missing only the creator's signature. They share one
 * blockhash and must be submitted in order: the pool cannot be opened against a
 * config that does not exist yet.
 */
export async function POST(request: Request) {
  return junoHandler(async () => {
    const body = await readJson<Record<string, unknown>>(request);

    const creator = requireString(body.creator, "creator");
    const name = requireString(body.name, "name");
    const symbol = requireString(body.symbol, "symbol").toUpperCase();
    const preset = requireString(body.preset, "preset") as CurvePresetId;

    if (!SYMBOL.test(symbol)) {
      throw new CallerError("Symbol must be 2-10 characters, letters and digits only");
    }
    if (name.length > 64) throw new CallerError("Name must be 64 characters or fewer");
    if (!CURVE_PRESETS[preset]) {
      throw new CallerError(
        `Unknown preset "${preset}". One of: ${Object.keys(CURVE_PRESETS).join(", ")}`,
      );
    }

    // Default to the pool convention for content: SOL-quoted.
    const quoteMint =
      body.quoteMint === undefined
        ? QUOTE_TOKENS.find((token) => token.symbol === "SOL")!.mint
        : requireString(body.quoteMint, "quoteMint");

    const initialMarketCap =
      body.initialMarketCap === undefined
        ? undefined
        : requireNumber(body.initialMarketCap, "initialMarketCap");
    const migrationMarketCap =
      body.migrationMarketCap === undefined
        ? undefined
        : requireNumber(body.migrationMarketCap, "migrationMarketCap");

    if (
      initialMarketCap !== undefined &&
      migrationMarketCap !== undefined &&
      migrationMarketCap <= initialMarketCap
    ) {
      throw new CallerError("Migration market cap must be above the initial market cap");
    }

    const result = await buildLaunch({
      creator,
      name,
      symbol,
      // The program accepts an empty URI; metadata is pinned separately.
      uri: typeof body.uri === "string" ? body.uri : "",
      preset,
      quoteMint,
      initialMarketCap,
      migrationMarketCap,
    });

    return junoJson(result);
  });
}
