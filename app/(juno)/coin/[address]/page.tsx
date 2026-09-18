import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";

import { shortAddress } from "@/lib/juno/format";
import { identicon } from "@/lib/juno/identicon";

import { hydratePool } from "@/lib/juno/chain";
import { cluster, explorer, meteoraPoolUrl } from "@/lib/juno/cluster";
import { GraduatedNotice } from "@/components/juno/coin/GraduatedNotice";
import { QUOTE_TOKENS } from "@/lib/juno/dbc";
import { listPoolActivity, listPoolHolders } from "@/lib/juno/activity";
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

  const coin = await hydratePool(row, { detailed: true });
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

  const [activity, holders, comments, likes] = await Promise.all([
    listPoolActivity(row.poolAddress, row.baseMint, {
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
            activity={activity}
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
