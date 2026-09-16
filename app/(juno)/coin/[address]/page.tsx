import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";

import { hydratePool } from "@/lib/juno/chain";
import { explorer, meteoraPoolUrl } from "@/lib/juno/cluster";
import { QUOTE_TOKENS } from "@/lib/juno/dbc";
import { listPoolActivity, listPoolHolders } from "@/lib/juno/activity";
import { getPool } from "@/lib/juno/registry";
import { CoinMedia } from "@/components/juno/coin/CoinMedia";
import { CoinSummary } from "@/components/juno/coin/CoinSummary";
import { CoinTabs } from "@/components/juno/coin/CoinTabs";
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

  const coin = await hydratePool(row);
  if (!coin) notFound();

  const [activity, holders] = await Promise.all([
    listPoolActivity(row.poolAddress),
    listPoolHolders(row.baseMint),
  ]);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pt-2 lg:px-8">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
        <div className="min-w-0 flex-1 lg:sticky lg:top-20">
          <CoinMedia coin={coin} />
        </div>

        <aside className="w-full shrink-0 lg:max-w-[420px]">
          <CoinSummary coin={coin} />
          <TradePanelClient coin={coin} quoteTokens={QUOTE_TOKENS} className="mt-4" />

          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px]">
            <Proof href={explorer.account(coin.pool)}>Pool</Proof>
            <Proof href={explorer.token(coin.address)}>Mint</Proof>
            <Proof href={explorer.account(coin.config)}>Config</Proof>
            <Proof href={explorer.tx(row.createSignature)}>Launch tx</Proof>
            <Proof href={meteoraPoolUrl(coin.pool)}>Meteora</Proof>
          </div>

          <CoinTabs coin={coin} activity={activity} holders={holders} comments={[]} />
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
