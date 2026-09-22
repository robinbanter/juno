import { hydratePool, poolActivityRead } from "@/lib/juno/chain";
import { listPoolHolders } from "@/lib/juno/activity";
import { crowdFromSwaps } from "@/lib/juno/crowd";
import { fetchPoolSnapshot, vaultsOf } from "@/lib/juno/dbc";
import { listSwapHistory } from "@/lib/juno/swaps";
import { quoteTokenUsdPrice } from "@/lib/juno/pyth";
import { getPool } from "@/lib/juno/registry";
import { cluster } from "@/lib/juno/cluster";
import { junoError, junoHandler, junoJson, junoOptions } from "@/lib/juno/api";

export const dynamic = "force-dynamic";
export const OPTIONS = junoOptions;

/**
 * One coin, fully hydrated: price, curve, NAV band, chart series and activity.
 *
 * Unlike the web coin page, this cannot stream — a JSON response is one
 * payload — so the caller gets everything at once and the mobile client shows
 * its own skeletons while it waits.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ mint: string }> },
) {
  return junoHandler(async () => {
    const { mint } = await params;

    const row = await getPool(mint);
    if (!row) return junoError("Coin not found", 404);

    // Hydration first, then the rest. `hydratePool` and `poolActivityRead` both
    // want this pool's swap history, and firing them together made them race
    // for the same uncached read — one won, the other was throttled, and the
    // chart came back empty on a coin whose activity list had four trades in
    // it. Sequenced, the second call is a cache hit.
    const coin = await hydratePool(row, { detailed: true });
    if (!coin) return junoError("Pool is not on this cluster", 404);

    /*
     * Activity and holders are extras, and they are allowed to fail.
     *
     * Both walk calls the public endpoint refuses by method rather than by
     * rate — `getTokenLargestAccounts` outright, `getParsedTransactions` in
     * batches — so on a busy endpoint one of them throwing took the entire coin
     * page down with it. The price, the curve and the NAV band had all been
     * read successfully by that point and were discarded.
     *
     * Core data decides whether this route succeeds. Everything after it
     * degrades to empty — but an empty list is reported *with* the flag that
     * says whether it was read or merely attempted. Without that flag the
     * mobile client printed "No trades yet." for a pool whose history the
     * endpoint had simply refused to hand over, which is the one thing this
     * app is not allowed to do.
     */
    /*
     * Who else is in this market.
     *
     * Derived from the same decoded fills the chart is drawn from, which by
     * now are a cache hit — `hydratePool` read them a moment ago. Nothing
     * extra is fetched, so this is free in RPC terms and the page does not get
     * slower for having it.
     */
    /*
     * One history walk, two consumers.
     *
     * The crowd figures and the holder book are both rebuilt from this pool's
     * decoded fills. `listSwapHistory` is cached, so a second call would be
     * cheap rather than free — but reading it once here also means the two
     * cannot disagree about what the history contained, which they could if
     * one of them landed either side of a cache expiry.
     */
    const decoded = await (async () => {
      // The *same* rate `hydratePool` used, so this is the cached snapshot
      // rather than a second read under a different key — which is what made
      // this come back `partial` with every figure zeroed on a pool whose
      // history had just been walked successfully.
      const rate = (await quoteTokenUsdPrice(row.quoteMint).catch(() => null)) ?? 1;
      const snapshot = await fetchPoolSnapshot(row.poolAddress, rate);
      if (!snapshot) return null;
      const history = await listSwapHistory(row.poolAddress, vaultsOf(snapshot));
      return { history, snapshot, rate };
    })().catch(() => null);

    // `snapshot.price`, not `coin.priceUsd`. A decoded swap's price is quote
    // per base, so comparing it against a USD price multiplied the first
    // buyer's return by whatever SOL costs — it read 113x on an entry that
    // is up about 13%.
    const crowd = decoded
      ? crowdFromSwaps(
          decoded.history.swaps,
          decoded.history.partial,
          decoded.snapshot.price,
          decoded.rate,
        )
      : null;

    const [activity, holders] = await Promise.all([
      poolActivityRead(row, 20).catch(() => ({ items: [], partial: true })),
      // Fills are handed in so the holder book can be rebuilt from them when
      // the endpoint refuses `getTokenLargestAccounts`, which on devnet is the
      // usual outcome rather than the exception.
      listPoolHolders(row.baseMint, decoded?.history.swaps ?? null)
        .then((book) => ({
          items: book?.holders ?? [],
          unreadable: book === null,
          source: book?.source ?? null,
        }))
        .catch(() => ({ items: [], unreadable: true, source: null })),
    ]);

    return junoJson({
      /* Which network this is. The client renders it in the details, and
         guessing it there would be the one fact on that list that was not
         read from anywhere. */
      cluster: cluster(),
      coin,
      activity: activity.items,
      /** True when the swap walk was cut short: `activity` is not the whole story. */
      activityPartial: activity.partial,
      /** Null when the history could not be read at all — not "nobody traded". */
      crowd,
      /** How the holder list was derived: token accounts, or decoded fills. */
      holdersSource: holders.source,
      holders: holders.items,
      /** True when the holder read was refused outright — not "nobody holds it". */
      holdersUnreadable: holders.unreadable,
      launchSignature: row.createSignature,
    });
  });
}
