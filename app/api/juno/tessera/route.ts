import { junoHandler, junoJson, junoOptions } from "@/lib/juno/api";
import { hydratePools } from "@/lib/juno/chain";
import { cluster } from "@/lib/juno/cluster";
import { listPools } from "@/lib/juno/registry";
import { tesseraOnChain, tesseraRef, tesseraTokens } from "@/lib/juno/tessera";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = junoOptions;

/**
 * Pre-IPO names: Tessera's mark, the mint behind it, and Juno's markets on it.
 *
 * Three things in one payload because they are one question — *what is this
 * company worth, what is the token, and what has anyone built on it* — and
 * splitting them would make the screen fetch three times to answer it.
 *
 * The on-chain block is not decoration. It reads the live mint to report the
 * transfer fee, the freeze authority and the un-renounced mint authority: two
 * of those three are absent from Tessera's own documentation, and all three
 * matter to anyone deciding to hold one. Juno says what the chain says.
 */
export async function GET() {
  return junoHandler(async () => {
    const tokens = await tesseraTokens();
    if (tokens.length === 0) {
      /*
       * A quiet third-party API is not "there are no pre-IPO names".
       *
       * 503 rather than an empty 200, so a client can retry instead of
       * rendering "nothing here" over a working market.
       */
      return junoJson(
        { error: "Tessera's mark API did not answer. Nothing here is a reading." },
        { status: 503 },
      );
    }

    // The markets Juno itself has launched against each name. Registry first
    // so a chain hiccup costs prices, not the list.
    const rows = await listPools(60);
    const referenced = rows.filter((row) => row.navFeedId?.startsWith("tessera:"));
    const { coins, missing } = referenced.length
      ? await hydratePools(referenced)
      : { coins: [], missing: 0 };

    const withFacts = await Promise.all(
      tokens.map(async (token) => {
        const chain = await tesseraOnChain(token.mint).catch(() => null);
        const markets = coins.filter(
          (coin) =>
            rows.find((row) => row.baseMint === coin.address)?.navFeedId ===
            tesseraRef(token.id),
        );

        return {
          ...token,
          /** `tessera:T-OpenAI` — what a launch stores in `nav_feed_id`. */
          ref: tesseraRef(token.id),
          /**
           * What one T-token represents of the company, as a ratio.
           *
           * `markPrice / markValuation` — the only figure here that is derived
           * rather than published, and it is null when supply is unknown
           * because a share of nothing is not a number.
           */
          shareOfCompany:
            token.markValuation > 0 ? token.markPrice / token.markValuation : null,
          /** Total value of every T-token in existence, at the mark. */
          floatUsd: token.supply === null ? null : token.supply * token.markPrice,
          onChain: chain,
          markets: markets.map((coin) => ({
            address: coin.address,
            name: coin.name,
            symbol: coin.symbol,
            priceUsd: coin.priceUsd,
            marketCap: coin.marketCap,
            currency: coin.marketCapCurrency,
            curvePreset: coin.curvePreset,
            progress: coin.curve.progress,
            graduated: coin.curve.graduated,
            /** Where the curve sits against Tessera's mark, if it could be read. */
            deviation: coin.nav?.deviation ?? null,
            withinBand: coin.nav?.withinBand ?? null,
          })),
        };
      }),
    );

    return junoJson({
      cluster: cluster(),
      source: "https://rest-api.tessera.pe/v1/public/token-details",
      tokens: withFacts,
      /** Referenced pools whose curve could not be read. */
      missing,
    });
  });
}
