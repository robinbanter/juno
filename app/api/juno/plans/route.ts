import { junoError, junoHandler, junoJson, junoOptions, readJson, requireNumber, requireString } from "@/lib/juno/api";
import { hydratePools } from "@/lib/juno/chain";
import { getPool, listPools } from "@/lib/juno/registry";
import { createPlan, deletePlan, plans, recordContribution, setPlanActive } from "@/lib/juno/social-graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = junoOptions;

/**
 * Recurring buys.
 *
 * Deliberately not a bot. Executing a swap on someone's behalf needs a delegate
 * or a session key with spending authority, which this project does not have —
 * so a plan stores the intent and says when it is due, and the buy is the same
 * server-built, device-signed transaction as any other. `contributed` only
 * moves when a swap confirms, so the progress bar records transactions rather
 * than intentions.
 */
export async function GET(request: Request) {
  return junoHandler(async () => {
    const wallet = new URL(request.url).searchParams.get("wallet") ?? "";
    if (!wallet) return junoError("A wallet is required");

    const rows = await plans(wallet);
    if (rows.length === 0) return junoJson({ wallet, plans: [], missing: 0 });

    const registry = await listPools(60);
    const wanted = new Set(rows.map((row) => row.baseMint));
    const { coins, missing } = await hydratePools(registry.filter((r) => wanted.has(r.baseMint)));
    const priced = new Map(coins.map((coin) => [coin.address, coin]));

    return junoJson({
      wallet,
      missing,
      plans: rows.map((row) => {
        const coin = priced.get(row.baseMint) ?? null;
        // No `positionValue` here on purpose. A plan records what was
        // *contributed* in quote terms, not how many tokens each fill bought,
        // so the current worth of what it accumulated is not derivable from
        // this table — the portfolio endpoint owns that question and reads it
        // from the wallet's actual balance.
        return {
          ...row,
          coin: coin
            ? {
                address: coin.address,
                name: coin.name,
                symbol: coin.symbol,
                priceUsd: coin.priceUsd,
                currency: coin.marketCapCurrency,
                // `amount`, `target` and `contributed` are quote-token units —
                // they are what gets signed for. The client needs this symbol
                // to say "5 SOL" rather than "$5.00", which is a different
                // number by three orders of magnitude.
                quoteSymbol: coin.quote.symbol,
                quoteUsdRate: coin.quoteUsdRate ?? null,
                media: coin.media,
              }
            : null,
        };
      }),
    });
  });
}

/** `POST {wallet, baseMint, amount, cadence, target?}`. */
export async function POST(request: Request) {
  return junoHandler(async () => {
    const body = await readJson<Record<string, unknown>>(request);
    const wallet = requireString(body.wallet, "wallet");
    const baseMint = requireString(body.baseMint, "baseMint");
    const amount = requireNumber(body.amount, "amount");
    const cadence = requireString(body.cadence, "cadence");

    if (cadence !== "daily" && cadence !== "weekly" && cadence !== "monthly") {
      return junoError(`Unknown cadence "${cadence}". One of: daily, weekly, monthly`);
    }
    const row = await getPool(baseMint);
    if (!row) return junoError("Coin not found", 404);

    const id = await createPlan({
      wallet,
      baseMint,
      amount,
      cadence,
      target: body.target === undefined || body.target === null
        ? null
        : requireNumber(body.target, "target"),
    });

    return junoJson({ id }, { status: 201 });
  });
}

/**
 * `PATCH {id, active}` to pause or resume, or `{id, contributed}` to record a
 * confirmed fill. `DELETE ?id=` removes it.
 */
export async function PATCH(request: Request) {
  return junoHandler(async () => {
    const body = await readJson<Record<string, unknown>>(request);
    const id = requireString(body.id, "id");

    if (body.contributed !== undefined) {
      const amount = requireNumber(body.contributed, "contributed");
      if (amount <= 0) return junoError("A contribution must be greater than zero");
      const row = await recordContribution(id, amount);
      if (!row) return junoError("Plan not found", 404);
      return junoJson({ plan: row });
    }

    if (typeof body.active === "boolean") {
      await setPlanActive(id, body.active);
      return junoJson({ id, active: body.active });
    }

    return junoError("Nothing to change: send `active` or `contributed`");
  });
}

export async function DELETE(request: Request) {
  return junoHandler(async () => {
    const id = new URL(request.url).searchParams.get("id") ?? "";
    if (!id) return junoError("An id is required");
    await deletePlan(id);
    return junoJson({ id, deleted: true });
  });
}
