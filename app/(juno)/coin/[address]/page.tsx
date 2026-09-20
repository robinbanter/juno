import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";

import { shortAddress } from "@/lib/juno/format";
import { identicon } from "@/lib/juno/identicon";

import { hydratePool, poolActivity } from "@/lib/juno/chain";
import { cluster, explorer, meteoraPoolUrl } from "@/lib/juno/cluster";
import { GraduatedNotice } from "@/components/juno/coin/GraduatedNotice";
import { QUOTE_TOKENS } from "@/lib/juno/dbc";
import { listPoolHolders } from "@/lib/juno/activity";
import { getPool } from "@/lib/juno/registry";
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

  // Trade history is the one slow read. The page renders a fully priced
  // market without it and streams the chart and activity in behind their own
  // Suspense boundaries, rather than holding the whole page for a dozen paced
  // transaction fetches.
  const coin = await hydratePool(row, { detailed: true, history: false });
  if (!coin) notFound();

  const [holders, comments] = await Promise.all([
    listPoolHolders(row.baseMint),
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
          <CoinSummary coin={coin} />
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
            <Proof href={meteoraPoolUrl(coin.pool)}>Meteora</Proof>
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
async function StreamedChart({ address }: { address: string }) {
  const row = await getPool(address);
  if (!row) return <ChartPending />;
  const coin = await hydratePool(row, { detailed: true });
  if (!coin) return <ChartPending />;
  return <PriceChart coin={coin} />;
}

async function StreamedActivity({ address }: { address: string }) {
  const row = await getPool(address);
  if (!row) return <ActivityList items={[]} />;
  return <ActivityList items={await poolActivity(row, 20)} />;
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
