import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";

import { shortAddress } from "@/lib/juno/format";
import { identicon } from "@/lib/juno/identicon";

import { hydratePool } from "@/lib/juno/chain";
import { cluster, explorer, meteoraPoolUrl } from "@/lib/juno/cluster";
import { GraduatedNotice } from "@/components/juno/coin/GraduatedNotice";
import { QUOTE_TOKENS } from "@/lib/juno/dbc";
import { listPoolActivityReport, listPoolHolders } from "@/lib/juno/activity";
import { CURVE_PRESETS } from "@/lib/juno/curves";
import type { NavContext } from "@/lib/juno/nav";
import { feedIdFor, quoteTokenUsdPrice, readPythFeed } from "@/lib/juno/pyth";
import { getPool } from "@/lib/juno/registry";
import { likeState, listComments } from "@/lib/juno/social";
import { CoinMedia } from "@/components/juno/coin/CoinMedia";
import { CoinSummary } from "@/components/juno/coin/CoinSummary";
import { CoinTabs } from "@/components/juno/coin/CoinTabs";
import { CreatorPanel } from "@/components/juno/coin/CreatorPanel";
import { NavBandPanel } from "@/components/juno/coin/NavBandPanel";
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

  // Two different failures, and they must not be confused:
  //   - hydratePool returns null  -> the pool is not on this cluster: a real 404
  //   - hydratePool throws        -> the RPC refused the read (usually a 429)
  // Treating the second as the first would tell a visitor that a coin which
  // plainly exists does not. It is in the registry; only the live read failed.
  const hydrated = await hydrateWithRetry(row);
  if ("error" in hydrated) return <ChainUnavailable row={row} />;
  const coin = hydrated.coin;
  if (!coin) notFound();

  // Null when SOL/USD is not live on-chain. Trade values then stay in quote
  // units instead of being converted at a rate nobody published — the same
  // rule `hydratePool` applies to market caps. Cached, so this does not
  // re-read the account `hydratePool` just read.
  const quoteUsd = await quoteTokenUsdPrice(row.quoteMint).catch(() => null);

  // The NAV band applies to pools launched against a Pyth feed on a preset
  // that defines a band. Everything else simply has no panel.
  const navFeedId = feedIdFor(row.navFeedId);
  const bandBps = CURVE_PRESETS[coin.curvePreset]?.navBandBps;
  const nav: NavContext | null =
    navFeedId && bandBps !== undefined
      ? { feedName: row.navFeedId!, bandBps, reading: await readPythFeed(navFeedId), quoteUsd }
      : null;

  const [activityReport, holders, comments, likes] = await Promise.all([
    listPoolActivityReport(row.poolAddress, row.baseMint, {
      quoteSymbol: coin.quote.symbol,
      rate: quoteUsd,
    }),
    listPoolHolders(row.baseMint),
    listComments(row.baseMint, cluster()).catch(() => []),
    // Seeded here so the heart paints its real number instead of a 0 that
    // jumps once the client fetch lands. No viewer wallet server-side, so
    // `liked` is resolved on the client.
    likeState(row.baseMint, cluster()).catch(() => ({ count: 0, liked: false })),
  ]);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pt-2 lg:px-8">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
        <div className="min-w-0 flex-1 lg:sticky lg:top-20">
          <CoinMedia coin={coin} />
        </div>

        <aside className="w-full shrink-0 lg:max-w-[420px]">
          <CoinSummary coin={{ ...coin, likes: likes.count }} />
          {nav && (
            <NavBandPanel
              nav={nav}
              // `priceUsd` is only in dollars when `hydratePool` had a live
              // quote rate; otherwise it is in quote units and must not be
              // compared against a dollar NAV.
              curvePriceUsd={coin.marketCapCurrency === "USD" ? coin.priceUsd : null}
              quoteSymbol={coin.quote.symbol}
              className="mt-4"
            />
          )}
          {/* A migrated curve cannot be swapped — the program rejects it.
              Trading continues in the DAMM v2 pool it graduated into. */}
          {coin.curve.graduated ? (
            <GraduatedNotice coin={coin} className="mt-4" />
          ) : (
            <TradePanelClient
              coin={coin}
              quoteTokens={QUOTE_TOKENS}
              quoteUsd={quoteUsd}
              nav={nav}
              className="mt-4"
            />
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
            activity={activityReport.rows}
            activityUnavailable={activityReport.unreadable}
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
 * One retry, because the failure this exists for is usually a transient 429 on
 * the public RPC, and the snapshot is the one read this page cannot do without.
 * Nothing is cached on a throw, so the second attempt is a genuinely fresh read.
 */
async function hydrateWithRetry(
  row: NonNullable<Awaited<ReturnType<typeof getPool>>>,
): Promise<{ coin: Awaited<ReturnType<typeof hydratePool>> } | { error: unknown }> {
  try {
    return { coin: await hydratePool(row, { detailed: true }) };
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 800));
    try {
      return { coin: await hydratePool(row, { detailed: true }) };
    } catch (error) {
      return { error };
    }
  }
}

/**
 * The coin exists — it is in the registry — but its live numbers could not be
 * read. Says exactly that, keeps the identity the registry does know, and
 * offers the two useful next steps: try again, or verify on-chain directly.
 * No price, market cap or curve progress is shown, because none was read.
 */
function ChainUnavailable({
  row,
}: {
  row: NonNullable<Awaited<ReturnType<typeof getPool>>>;
}) {
  return (
    <div className="mx-auto w-full max-w-[640px] px-4 pt-10 text-center lg:px-8">
      <p className="text-[13px] font-semibold tracking-wide text-j-faint uppercase">
        {row.symbol}
      </p>
      <h1 className="mt-1 text-[28px] font-bold tracking-tight">{row.name}</h1>
      <p className="mx-auto mt-4 max-w-[440px] text-[15px] leading-[1.5] text-j-muted">
        This coin exists, but its live market data could not be read — the Solana
        RPC refused the request, most likely because it is rate-limited. Nothing
        is shown rather than a stale or guessed price.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <a
          href={`/coin/${row.baseMint}`}
          className="inline-flex h-11 items-center rounded-full bg-j-ink px-5 text-[15px] font-semibold text-j-bg"
        >
          Try again
        </a>
        <a
          href={explorer.account(row.poolAddress)}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex h-11 items-center gap-1.5 rounded-full border border-j-line-strong px-5 text-[15px] font-medium"
        >
          View pool on Solscan
          <ExternalLink size={14} />
        </a>
      </div>
    </div>
  );
}
