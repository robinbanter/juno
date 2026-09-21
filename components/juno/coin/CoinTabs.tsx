"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import { money, percent, shortAddress, since, tokenAmount, usd } from "@/lib/juno/format";
import { CURVE_PRESETS } from "@/lib/juno/curves";
import type { Coin, Comment, Holder } from "@/lib/juno/types";
import { Avatar } from "../ui/Avatar";
import { Tabs } from "../ui/Tabs";
import { CommentComposer } from "./CommentComposer";
import { EconomicsPanel } from "./EconomicsPanel";

type TabId = "activity" | "holders" | "comments" | "details";

export function CoinTabs({
  coin,
  activity,
  holders,
  comments,
}: {
  coin: Coin;
  /** Streamed in on the server — see the coin page's Suspense boundaries. */
  activity: React.ReactNode;
  /** Null when the holder read was refused — see `listPoolHolders`. */
  holders: Holder[] | null;
  comments: Comment[];
}) {
  const [tab, setTab] = useState<TabId>("activity");
  // Seeded from the server render, then extended optimistically as the
  // visitor posts — so their own comment never waits on a refetch.
  const [posted, setPosted] = useState<Comment[]>([]);
  const allComments = [...posted, ...comments];

  return (
    <section className="mt-8">
      <Tabs
        value={tab}
        onChange={(id) => setTab(id as TabId)}
        items={[
          { id: "activity", label: "Activity" },
          { id: "holders", label: "Holders" },
          { id: "comments", label: "Comments", count: allComments.length },
          { id: "details", label: "Details" },
        ]}
      />

      <div className="pt-2">
        {tab === "activity" && activity}
        {tab === "holders" && <HoldersList items={holders} />}
        {tab === "comments" && (
          <>
            <CommentComposer
              coinMint={coin.address}
              onPosted={(c) => setPosted((prev) => [c, ...prev])}
            />
            <CommentsList items={allComments} />
          </>
        )}
        {tab === "details" && <DetailsPanel coin={coin} />}
      </div>
    </section>
  );
}

function HoldersList({ items }: { items: Holder[] | null }) {
  // "No holders yet" about a pool that has traded is the kind of thing a
  // visitor checks once and stops trusting the page over.
  if (items === null) {
    return (
      <Empty>
        Could not read this pool&rsquo;s holders just now — the public RPC
        refuses this call under load. Try again in a moment.
      </Empty>
    );
  }
  if (items.length === 0) return <Empty>No holders yet.</Empty>;

  return (
    <ul className="divide-y divide-j-line">
      {items.map((holder) => (
        <li key={holder.wallet} className="flex items-center gap-3 py-3 text-[14px]">
          <span className="w-5 shrink-0 tabular-nums text-j-faint">{holder.rank}</span>
          <Avatar src={holder.actor.avatarUrl} alt={holder.actor.handle} size={22} />
          <span className="min-w-0 flex-1 truncate font-medium">
            {holder.actor.handle || shortAddress(holder.wallet)}
          </span>
          <span className="w-20 shrink-0 text-right tabular-nums">
            {tokenAmount(holder.balance)}
          </span>
          <span className="w-14 shrink-0 text-right tabular-nums text-j-muted">
            {(holder.share * 100).toFixed(2)}%
          </span>
        </li>
      ))}
    </ul>
  );
}

function CommentsList({ items }: { items: Comment[] }) {
  if (items.length === 0) return <Empty>No comments yet.</Empty>;

  return (
    <ul className="divide-y divide-j-line">
      {items.map((comment) => (
        <li key={comment.id} className="flex gap-3 py-3">
          <Avatar src={comment.actor.avatarUrl} alt={comment.actor.handle} size={24} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-[14px]">
              <span className="font-medium">{comment.actor.handle}</span>
              {comment.side && (
                <span
                  className={cn(
                    "font-semibold capitalize",
                    comment.side === "buy" ? "text-j-pos" : "text-j-neg",
                  )}
                >
                  {comment.side}
                </span>
              )}
              <span className="text-j-faint">{since(comment.timestamp)}</span>
            </p>
            <p className="mt-0.5 text-[14px] leading-snug">{comment.body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * The part a Juno trader actually needs to judge a launch: which curve it was
 * issued on, and where it stands against graduation.
 */
function DetailsPanel({ coin }: { coin: Coin }) {
  const preset = CURVE_PRESETS[coin.curvePreset];

  return (
    <div className="flex flex-col gap-4 py-3">
      <dl className="flex flex-col gap-2.5 text-[14px]">
        <Row label="Curve">{preset.label}</Row>
        <Row label="Quote token">{coin.quote.symbol}</Row>
        <Row label="Base mint" mono>
          {shortAddress(coin.address, 6, 6)}
        </Row>
        <Row label="DBC pool" mono>
          {shortAddress(coin.pool, 6, 6)}
        </Row>
        <Row label="Config key" mono>
          {shortAddress(coin.config, 6, 6)}
        </Row>
        <Row label="Graduation threshold">{usd(coin.curve.thresholdUsd)}</Row>
        <Row label="Curve progress">{percent(coin.curve.progress, 1).replace("+", "")}</Row>
        <Row label="Total volume">{money(coin.totalVolume, coin.marketCapCurrency)}</Row>
        {coin.graduatedPool && (
          <Row label="DAMM v2 pool" mono>
            {shortAddress(coin.graduatedPool, 6, 6)}
          </Row>
        )}
      </dl>

      <p className="rounded-j bg-j-surface px-3 py-2.5 text-[14px] leading-relaxed text-j-muted">
        {preset.rationale}
      </p>

      {/* What the config actually enforces, as opposed to what it promises. */}
      <EconomicsPanel fee={coin.fee ?? null} supply={coin.supply ?? null} className="pt-1" />
    </div>
  );
}

function Row({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-j-muted">{label}</dt>
      <dd className={cn("font-medium", mono && "font-mono text-[12px]")}>{children}</dd>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-12 text-center text-[14px] text-j-faint">{children}</p>;
}
