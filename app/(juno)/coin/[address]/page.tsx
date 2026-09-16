import { notFound } from "next/navigation";

import { QUOTE_TOKENS } from "@/lib/juno/dbc";
import { DEMO_ACTIVITY, DEMO_COINS, DEMO_COMMENTS, DEMO_HOLDERS } from "@/lib/juno/mock";
import { CoinMedia } from "@/components/juno/coin/CoinMedia";
import { CoinSummary } from "@/components/juno/coin/CoinSummary";
import { CoinTabs } from "@/components/juno/coin/CoinTabs";
import { TradePanelClient } from "./TradePanelClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  const coin = DEMO_COINS.find((c) => c.address === address);
  return { title: coin?.name ?? "Coin" };
}

export default async function CoinPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;

  // Replace with `fetchPoolSnapshot(poolAddress)` once pools are live —
  // `PoolSnapshot` already carries price and curve in these units.
  const coin = DEMO_COINS.find((c) => c.address === address);
  if (!coin) notFound();

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pt-2 lg:px-8">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
        <div className="min-w-0 flex-1 lg:sticky lg:top-20">
          <CoinMedia coin={coin} />
        </div>

        <aside className="w-full shrink-0 lg:max-w-[420px]">
          <CoinSummary coin={coin} />
          <TradePanelClient coin={coin} quoteTokens={QUOTE_TOKENS} className="mt-4" />
          <CoinTabs
            coin={coin}
            activity={DEMO_ACTIVITY}
            holders={DEMO_HOLDERS}
            comments={DEMO_COMMENTS}
          />
        </aside>
      </div>
    </div>
  );
}
