import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";

import { money, shortAddress } from "@/lib/juno/format";
import { identicon } from "@/lib/juno/identicon";

import { hydratePool, poolActivityRead, poolSwapsRead } from "@/lib/juno/chain";
import { cluster, explorer, marketUrl } from "@/lib/juno/cluster";
import { GraduatedNotice } from "@/components/juno/coin/GraduatedNotice";
import { QUOTE_TOKENS } from "@/lib/juno/dbc";
import { listPoolHolders } from "@/lib/juno/activity";
import { getPool } from "@/lib/juno/registry";
import { withRetry } from "@/lib/juno/rpc";
import { listComments } from "@/lib/juno/social";
import { ActivityList } from "@/components/juno/coin/ActivityList";
import { CoinMedia } from "@/components/juno/coin/CoinMedia";
import { PriceChart } from "@/components/juno/coin/PriceChart";
import { CoinSummary } from "@/components/juno/coin/CoinSummary";
import { CoinTabs } from "@/components/juno/coin/CoinTabs";
import { CreatorPanel } from "@/components/juno/coin/CreatorPanel";
import { Skeleton } from "@/components/juno/ui/Skeleton";
import { TradePanelClient } from "./TradePanelClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  const row = await getPool(address);
  return { title: row?.name ?? "Coin" };
}

export default async function CoinPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;

  const row = await getPool(address);
  if (!row) notFound();

  /*
   * Trade history is the one slow read. The page renders a fully priced
   * market without it and streams the chart and activity in behind their own
   * Suspense boundaries, rather than holding the whole page for a dozen paced
   * transaction fetches.
   *
   * Retried, because this one read is the page. The chart and the activity
   * list each own their failure and degrade to a sentence, but there is no
   * degraded version of the pool account itself — without it there is no
   * price, no curve and no NAV band. So a single 429 from the public endpoint,
   * which rate-limits hard and recovers in under a second, threw straight past
   * everything and replaced the entire coin page with the error boundary. It
   * is a good error boundary; it should still be the rarest thing on this
   * route, not the one a judge refreshing twice is most likely to see.
   *
   * Three attempts with jittered backoff, the same policy every other read
   * here uses. A genuine outage still lands on the boundary, which says the
   * network is not answering and offers to retry — which by then is true.
   */
  const coin = await withRetry(() => hydratePool(row, { detailed: true, history: false }));
  if (!coin) notFound();

  const marketLink = marketUrl(coin.address);

  const [holders, comments] = await Promise.all([
    /*
     * Holders, with the fills as a fallback.
     *
     * `poolActivityRead` has walked this pool's history by now and it is
     * cached, so handing the swaps in costs nothing and gives the holder book
     * something to rebuild itself from when the endpoint refuses
     * `getTokenLargestAccounts` — which on devnet it nearly always does.
     */
    poolSwapsRead(row)
      .then((swaps) => listPoolHolders(row.baseMint, swaps))
      .catch(() => null),
    listComments(row.baseMint, cluster()).catch(
      (): Awaited<ReturnType<typeof listComments>> => [],
    ),
  ]);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pt-2 lg:px-8">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
        <div className="min-w-0 flex-1 lg:sticky lg:top-20">
          <CoinMedia
            coin={coin}
            chart={
              <Suspense fallback={<ChartPending />}>
                <StreamedChart address={address} />
              </Suspense>
            }
          />
        </div>

        <aside className="w-full shrink-0 lg:max-w-[420px]">
          <CoinSummary
            coin={coin}
            volume={
              <Suspense fallback={<span className="text-j-faint">·</span>}>
                <StreamedVolume address={address} />
              </Suspense>
            }
          />
          {/* A migrated curve cannot be swapped — the program rejects it.
              Trading continues in the DAMM v2 pool it graduated into. */}
          {coin.curve.graduated ? (
            <GraduatedNotice coin={coin} className="mt-4" />
          ) : (
            <TradePanelClient coin={coin} quoteTokens={QUOTE_TOKENS} className="mt-4" />
          )}
          <CreatorPanel coin={coin} />

          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px]">
            <Proof href={explorer.account(coin.pool)}>Pool</Proof>
            <Proof href={explorer.token(coin.address)}>Mint</Proof>
            <Proof href={explorer.account(coin.config)}>Config</Proof>
            <Proof href={explorer.tx(row.createSignature)}>Launch tx</Proof>
            {/* Mainnet only: nothing indexes devnet tokens. */}
            {marketLink && <Proof href={marketLink}>Jupiter</Proof>}
          </div>

          <CoinTabs
            coin={coin}
            activity={
              <Suspense fallback={<ActivityPending />}>
                <StreamedActivity address={address} />
              </Suspense>
            }
            holders={holders}
            comments={comments.map((c) => ({
              id: c.id,
              actor: { handle: shortAddress(c.wallet, 4, 4), avatarUrl: identicon(c.wallet) },
              body: c.body,
              timestamp: c.createdAt,
              side: c.side,
            }))}
          />
        </aside>
      </div>
    </div>
  );
}

function Proof({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="flex items-center gap-1 text-j-muted transition-colors hover:text-j-ink"
    >
      {children}
      <ExternalLink size={11} />
    </a>
  );
}

/**
 * The chart and the activity list, each behind its own Suspense boundary.
 *
 * Both re-read the pool row rather than taking it as a prop: a Server Component
 * passed as a prop is rendered by the *parent*, so taking the row here is what
 * actually defers the work past the parent's render. The read is a single
 * indexed lookup and the swap history underneath is cached, so the two
 * boundaries share one fetch rather than doubling it.
 */
/*
 * Each streamed section owns its own failure.
 *
 * A Suspense boundary catches *pending*, not *throwing*. When the activity read
 * hit a 429 it threw, the route's error boundary caught it, and the entire coin
 * page — price, curve, NAV band, all of it already rendered — was replaced by
 * "The network is not answering" because one secondary list could not load.
 * Streaming these was supposed to stop exactly that.
 */
async function StreamedChart({ address }: { address: string }) {
  try {
    const row = await getPool(address);
    if (!row) return <ChartUnavailable />;
    const coin = await hydratePool(row, { detailed: true });
    if (!coin) return <ChartUnavailable />;
    return <PriceChart coin={coin} />;
  } catch {
    return <ChartUnavailable />;
  }
}

/**
 * The 24h volume, read from the same cached swap history the chart uses.
 *
 * Deferred for the same reason as the chart, and rendered through a slot on
 * `CoinSummary` so the stat card can show a real number once the walk lands
 * instead of freezing on the em dash the fast path leaves behind.
 */
async function StreamedVolume({ address }: { address: string }) {
  try {
    const row = await getPool(address);
    if (!row) return <>&mdash;</>;
    const coin = await hydratePool(row, { detailed: true });
    if (!coin) return <>&mdash;</>;
    return <>{money(coin.volume24h, coin.marketCapCurrency)}</>;
  } catch {
    // A short read is not a zero. The dash keeps saying "not known" rather
    // than claiming this pool did no trade today.
    return <>&mdash;</>;
  }
}

async function StreamedActivity({ address }: { address: string }) {
  try {
    const row = await getPool(address);
    if (!row) return <ActivityList items={[]} />;

    const { items, partial } = await poolActivityRead(row, 20);
    return (
      <ActivityList
        items={items}
        // "No trades yet" is a claim about the pool. When the read came back
        // short it is a claim about the RPC instead, and saying the wrong one
        // told visitors a pool with four trades had never traded.
        empty={partial ? UNREADABLE : "No trades yet."}
      />
    );
  } catch {
    return <ActivityList items={[]} empty={UNREADABLE} />;
  }
}

const UNREADABLE =
  "Could not read this pool's trade history just now — the public RPC is rate-limiting. Try again in a moment.";

function ChartUnavailable() {
  return (
    <div className="flex aspect-[16/10] w-full items-center justify-center px-8">
      <p className="text-center text-[14px] text-j-faint">
        Price history could not be read just now — the public RPC is
        rate-limiting. Try again in a moment.
      </p>
    </div>
  );
}

function ChartPending() {
  return (
    <div className="flex aspect-[16/10] w-full items-center justify-center p-6">
      <Skeleton className="h-full w-full rounded-j" />
    </div>
  );
}

function ActivityPending() {
  return (
    <ul className="divide-y divide-j-line">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="flex items-center gap-3 py-3">
          <Skeleton className="size-[22px] rounded-full" />
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-3 w-16" />
        </li>
      ))}
    </ul>
  );
}
