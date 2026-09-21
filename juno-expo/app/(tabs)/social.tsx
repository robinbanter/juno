import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { RefreshControl, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import styled from "styled-components/native";

import { CoinArt, Identicon } from "../../components/art";
import { JunoMark } from "../../components/logo";
import { Tappable } from "../../components/Press";
import {
  Button,
  Caption,
  Chevron,
  Col,
  Delta,
  Entry,
  Label,
  Ledger,
  Mono,
  Placeholder,
  Row,
  Segmented,
  Skeleton,
  Title,
} from "../../components/kit";
import { juno, type FeedItem } from "../../lib/api";
import { useWallet } from "../../lib/wallet";
import { useFeedRevision } from "../../lib/refresh";
import { money, since, tokens, useApi } from "../../lib/useApi";
import { theme } from "../../theme";

/**
 * The social feed: real trades and creator posts, interleaved.
 *
 * The two kinds of item have opposite natures and the screen does not pretend
 * otherwise. A trade is a fact about the chain — it carries a signature and
 * anyone can check it. A post is something a person wrote. Mixing them is what
 * makes this a social app rather than a block explorer, and a reader can always
 * tell which is which.
 *
 * ## One sheet, ruled — not a deck of cards
 *
 * Every row used to be its own floating white rectangle. That is the default
 * shape of a generated feed, and it cost twelve shadows and twelve gaps of
 * chrome around twelve rows of content in an app whose subject is a list of
 * things that happened. The feed is now one surface ruled into entries: denser,
 * quieter, and shaped like the record it is.
 *
 * It also settles a question the cards could not. A trade briefly carried a 4px
 * coloured edge to mark its direction, which is a stripe doing a number's job.
 * On a ledger the direction lives where a trader already looks — in the figure,
 * signed and coloured, with the verb spelled out beside it. Colour is never the
 * only signal: "bought" and "sold" are written, because the green and the red
 * are only ΔE 9.0 apart under deuteranopia.
 *
 * ## Nothing animates in
 *
 * There was a staggered entrance. It was decoration on a surface whose job is a
 * task: the feed can take fifteen seconds to read, and a cascade on top of that
 * is making someone watch it load. The skeletons say "loading"; the rows just
 * arrive.
 */

const FILTERS = [
  { id: "all", label: "All" },
  { id: "trades", label: "Trades" },
  { id: "posts", label: "Posts" },
] as const;

type Filter = (typeof FILTERS)[number]["id"];

type Scope = "everyone" | "following";

export default function SocialScreen() {
  const router = useRouter();
  // Re-reads when this device posts. Not on every focus: the feed walks every
  // pool against a rate-limited RPC and costs the better part of fifteen
  // seconds, which is not a price to pay for switching tabs.
  const revision = useFeedRevision();
  const wallet = useWallet();
  /*
   * Who the feed is of, and what kind of thing it shows, are separate
   * questions — and only the first one changes what the server walks. Scope
   * is in the fetch's deps; the kind filter never refetches.
   */
  const [scope, setScope] = useState<Scope>("everyone");
  const onlyFollowing = scope === "following" && !!wallet.address;
  const feed = useApi(
    () => juno.feed(40, onlyFollowing ? wallet.address! : undefined),
    [revision, onlyFollowing, wallet.address],
  );
  const [filter, setFilter] = useState<Filter>("all");

  const items = useMemo(() => {
    const all = feed.data?.items ?? [];
    if (filter === "trades") return all.filter((item) => item.kind === "trade");
    if (filter === "posts") return all.filter((item) => item.kind === "post");
    return all;
  }, [feed.data?.items, filter]);

  const counts = useMemo(() => {
    const all = feed.data?.items ?? [];
    return {
      trades: all.filter((item) => item.kind === "trade").length,
      posts: all.filter((item) => item.kind === "post").length,
    };
  }, [feed.data?.items]);

  return (
    <Page edges={["top"]}>
      <Header>
        <Row gap={10}>
          <JunoMark size={30} color={theme.colors.text} />
          <Col gap={2} style={{ flex: 1 }}>
            <Title>juno</Title>
            <Label muted>Every post is a market</Label>
          </Col>
          {/* Whose feed this is. A wallet is needed to have a following list
              at all, so before there is one the switch is simply absent
              rather than present and refusing. */}
          {wallet.address ? (
            <Tappable
              onPress={() => setScope((current) => (current === "everyone" ? "following" : "everyone"))}
              to={0.94}
            >
              <ScopeChip
                $on={scope === "following"}
                accessibilityRole="button"
                accessibilityLabel={
                  scope === "following" ? "Showing wallets you follow" : "Showing everyone"
                }
              >
                <ScopeText $on={scope === "following"}>
                  {scope === "following" ? "Following" : "Everyone"}
                </ScopeText>
              </ScopeChip>
            </Tappable>
          ) : null}
        </Row>

        {/* Always rendered, so the sheet below does not jump down the screen at
            the moment the data lands. Disabled while there is nothing to
            filter — a control that looks live and does nothing is worse than
            one that says it is waiting. */}
        <FilterRow>
          <Segmented items={FILTERS} value={filter} onChange={feed.data ? setFilter : () => {}} />
        </FilterRow>

        {/* What is actually on screen, counted rather than claimed. Absent
            while loading, because "0 live" would be a reading nobody took. */}
        {feed.data ? (
          <LiveText>
            {counts.trades} {counts.trades === 1 ? "trade" : "trades"} · {counts.posts}{" "}
            {counts.posts === 1 ? "post" : "posts"}
            {feed.data.scope === "following" && feed.data.followingCount !== null
              ? ` · from ${feed.data.followingCount} ${
                  feed.data.followingCount === 1 ? "wallet" : "wallets"
                } you follow`
              : ""}
          </LiveText>
        ) : null}
      </Header>

      {feed.loading ? (
        // Shaped like the ledger it precedes, on the same sheet, so the page
        // does not change structure when the content lands.
        <Loading>
          <Ledger>
            {[0, 1, 2, 3].map((i) => (
              <Entry key={i} $first={i === 0}>
                <Row gap={10}>
                  <Skeleton h={26} w={26} round={13} />
                  <Skeleton h={13} w="38%" />
                </Row>
                <Skeleton h={12} w="92%" style={{ marginTop: 14 }} />
                <Skeleton h={12} w="58%" style={{ marginTop: 8 }} />
              </Entry>
            ))}
          </Ledger>
        </Loading>
      ) : feed.error ? (
        // A dead end with no way out of it is the worst version of this
        // screen: the public RPC recovers on its own within a minute, so the
        // only thing missing was something to press.
        <Placeholder
          title="Could not load the feed"
          detail={feed.error}
          action={<Button label="Try again" onPress={feed.refresh} />}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{
            // `width: "100%"` pins the content container to the scroll
            // view's own width. Without it a vertical ScrollView sizes its
            // content box to the widest child, so one long unbroken line
            // widens the container and every Text then measures against
            // that wider box — laying out on one line and getting clipped
            // by the sheet's edge. The tell was that it moved between
            // entries as the data changed.
            width: "100%",
            paddingHorizontal: 16,
            paddingBottom: 130,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={feed.refreshing}
              onRefresh={feed.refresh}
              tintColor={theme.colors.muted}
            />
          }
        >
          {items.length === 0 ? (
            feed.data?.scope === "following" ? (
              // Two different nothings. Following nobody is a thing to fix by
              // going and following someone; following people who have been
              // quiet is a thing to fix by waiting — and the count is the only
              // way to tell them apart.
              <Placeholder
                title={
                  feed.data.followingCount === 0
                    ? "You are not following anyone yet"
                    : "Quiet in here"
                }
                detail={
                  feed.data.followingCount === 0
                    ? "Open the Traders board, find someone worth watching, and follow them. Their trades and posts land here."
                    : `Nothing recent from the ${feed.data.followingCount} ${
                        feed.data.followingCount === 1 ? "wallet" : "wallets"
                      } you follow.`
                }
                action={
                  <Button
                    label={feed.data.followingCount === 0 ? "Find traders" : "Show everyone"}
                    variant="quiet"
                    onPress={() =>
                      feed.data!.followingCount === 0
                        ? router.push("/(tabs)/trade?sort=traders" as never)
                        : setScope("everyone")
                    }
                  />
                }
              />
            ) : filter !== "all" && (feed.data?.items.length ?? 0) > 0 ? (
              // A filter finding nothing is a fact about the filter, not about
              // the cluster, and must not borrow the cluster's error copy.
              <Placeholder
                title={filter === "trades" ? "No trades in view" : "No posts in view"}
                detail="Nothing of this kind in the current feed. Switch back to All."
                action={<Button label="Show all" variant="quiet" onPress={() => setFilter("all")} />}
              />
            ) : feed.data?.tradesPartial ? (
              <Placeholder
                title="Could not read the cluster"
                detail="The RPC is rate-limiting, so neither trades nor posts could be listed. Pull to retry."
              />
            ) : (
              <Placeholder
                title="Nothing here yet"
                detail="Trades and posts appear as they happen."
              />
            )
          ) : (
            <Ledger>
              {items.map((item, index) => (
                <FeedRow
                  key={`${item.kind}:${item.id}`}
                  item={item}
                  first={index === 0}
                  onOpen={(mint) => router.push(`/coin/${mint}`)}
                  onOpenPost={(postId) => router.push(`/post/${postId}`)}
                  onOpenTrader={(target) => router.push(`/trader/${target}` as never)}
                />
              ))}
            </Ledger>
          )}

          {/* Posts are complete; trades are walked against an endpoint that
              refuses. A footnote under the sheet, not another card on it —
              this is a caveat about the record, not an entry in it. */}
          {feed.data?.tradesPartial && items.length > 0 && filter !== "posts" ? (
            <Footnote>
              Some pools would not load, so the trades above are not every trade
              on this cluster. Pull to retry.
            </Footnote>
          ) : null}
        </ScrollView>
      )}
    </Page>
  );
}

function FeedRow({
  item,
  first,
  onOpen,
  onOpenPost,
  onOpenTrader,
}: {
  item: FeedItem;
  /** The first entry carries no rule above it. */
  first: boolean;
  onOpen: (mint: string) => void;
  onOpenPost: (postId: string) => void;
  onOpenTrader: (wallet: string) => void;
}) {
  if (item.kind === "trade") {
    const buying = item.side === "buy";
    const move =
      item.priceNow !== null && item.price > 0 ? (item.priceNow - item.price) / item.price : null;

    return (
      <Tappable onPress={() => onOpen(item.coin.address)} to={0.985}>
        <Entry $first={first}>
          <Row gap={8}>
            {/* The name is the way to the person; the rest of the row is the
                way to the coin. Two destinations on one card, and which is
                which follows from what you touched. The identicon is seeded on
                the wallet rather than the handle so it matches the trader
                screen it leads to — a shortened address is not a stable key. */}
            <Byline
              onPress={() => onOpenTrader(item.actor.wallet)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.actor.handle}`}
            >
              <Identicon seed={item.actor.wallet} size={22} />
              <Label numberOfLines={1} style={{ fontWeight: "700", maxWidth: 104 }}>
                {item.actor.handle}
              </Label>
            </Byline>
            {/* The verb, in the direction's colour. Colour and word together —
                neither carries it alone. */}
            <Verb $tone={buying ? theme.colors.pos : theme.colors.neg}>
              {buying ? "bought" : "sold"}
            </Verb>
            <Grow />
            <Caption>{since(item.timestamp)}</Caption>
          </Row>

          <Row gap={12} style={{ marginTop: 12 }}>
            <CoinArt
              uri={juno.still({
                kind: item.coin.mediaKind === "video" ? "video" : "image",
                url: item.coin.mediaUrl ?? "",
                posterUrl: item.coin.posterUrl ?? undefined,
              })}
              seed={item.coin.address}
              size={52}
              radius={16}
            />
            <Col gap={3} style={{ flex: 1 }}>
              <Ticker numberOfLines={1}>${item.coin.symbol || item.coin.name}</Ticker>
              <Label muted numberOfLines={1}>
                {item.coin.name}
              </Label>
            </Col>
            {/* The subject of the card, at the size that says so: what the
                position did after the decision. Absent, never zero, when the
                live price could not be read. */}
            <Col gap={1} style={{ alignItems: "flex-end" }}>
              <Delta pct={move} />
              <Caption>since the fill</Caption>
            </Col>
          </Row>

          {/* What they said about it, when they said anything. This is the
              difference between a ticker tape and a social feed — and the
              signature on the same row is what makes it checkable. */}
          {item.note ? <Note>{item.note}</Note> : null}

          <Figures>
            <Column>
              <Mono>{tokens(item.amount)}</Mono>
              <Caption>Amount</Caption>
            </Column>
            <Column>
              <Mono>{money(item.valueUsd, item.currency)}</Mono>
              <Caption>Total</Caption>
            </Column>
            <Column>
              <Mono>{money(item.price, item.currency, { compact: false })}</Mono>
              <Caption>Price paid</Caption>
            </Column>
          </Figures>
        </Entry>
      </Tappable>
    );
  }

  const art = item.mediaUrl
    ? juno.still({ kind: item.mediaKind === "video" ? "video" : "image", url: item.mediaUrl })
    : null;

  return (
    <Entry $first={first}>
      <Row gap={10} align="center">
        <Byline
          onPress={() => onOpenTrader(item.author.wallet)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Open ${item.author.handle}`}
        >
          <Identicon seed={item.author.wallet} size={30} />
          <Label numberOfLines={1} style={{ fontWeight: "700" }}>
            {item.author.handle}
          </Label>
        </Byline>
        <Grow />
        <Caption>{since(item.timestamp)}</Caption>
      </Row>

      {/* The media, edge to edge inside the entry and square. A post that is a
          picture should be looked at, not described in a caption beside a
          thumbnail. */}
      {art ? (
        <Tappable onPress={() => onOpenPost(item.id)} to={0.99}>
          <Media source={{ uri: art }} resizeMode="cover" />
        </Tappable>
      ) : null}

      {/* Price, conversation, share — and the thing this app is for. */}
      {item.coin ? (
        <ActionRow>
          <Tappable onPress={() => onOpen(item.coin!.address)} to={0.95}>
            <Row gap={6} align="center">
              {/* No arrow when the direction is unknown. `?? 0 >= 0` drew a
                  green up-arrow beside a dash, which asserts a rise nobody
                  measured — on a price that had not even been read. */}
              {item.coin.changePct !== null ? <Arrow $up={item.coin.changePct >= 0} /> : null}
              <PriceText $tone={priceTone(item.coin.priceUsd, item.coin.changePct)}>
                {item.coin.priceUsd === null
                  ? "—"
                  : money(item.coin.priceUsd, item.coin.currency, { compact: false })}
              </PriceText>
            </Row>
          </Tappable>

          <Tappable onPress={() => onOpenPost(item.id)} to={0.9}>
            <Row gap={5} align="center">
              <ReplyGlyph />
              <Caption>{item.replyCount}</Caption>
            </Row>
          </Tappable>

          <Grow />
          <Tappable onPress={() => onOpen(item.coin!.address)} to={0.96}>
            <BuyTap accessibilityRole="button" accessibilityLabel={`Buy $${item.coin.symbol}`}>
              <BuyText>Buy</BuyText>
            </BuyTap>
          </Tappable>
        </ActionRow>
      ) : null}

      {item.coin ? (
        <Tappable onPress={() => onOpen(item.coin!.address)} to={0.99}>
          <Row gap={6} align="center" style={{ marginTop: 10 }}>
            <Ticker style={{ fontSize: theme.type.label.size }}>${item.coin.symbol}</Ticker>
            <Label muted numberOfLines={1} style={{ flex: 1 }}>
              {item.coin.name}
            </Label>
            {/* Absent, not zero, when the holder read was refused — which the
                public endpoint does often, and "held by 0" is a claim about a
                coin with holders. */}
            {item.coin.holders !== null ? (
              <Caption>
                Held by {item.coin.holders} {item.coin.holders === 1 ? "wallet" : "wallets"}
              </Caption>
            ) : null}
            <Chevron size={15} />
          </Row>
        </Tappable>
      ) : null}

      {/* The post's own words, at reading size. This is the content; on a
          trade entry the equivalent weight goes to the figure. */}
      <PostBody numberOfLines={art ? 3 : undefined}>{item.body}</PostBody>

      <Tappable onPress={() => onOpenPost(item.id)} to={0.99}>
        <Engagement>
          {/* A count, or an invitation — never "0 comments", which reads as a
              verdict on the post. */}
          <Caption>
            {item.replyCount === 0
              ? "Add a comment"
              : `View all ${item.replyCount} ${item.replyCount === 1 ? "comment" : "comments"}`}
          </Caption>
        </Engagement>
      </Tappable>
    </Entry>
  );
}

/**
 * Colour only where a direction was actually measured.
 *
 * An unread price and an unmeasured change both come back as muted ink, which
 * is the visual form of "nobody knows" — the same rule the dash follows.
 */
function priceTone(price: number | null, changePct: number | null): "pos" | "neg" | "flat" {
  if (price === null || changePct === null) return "flat";
  return changePct >= 0 ? "pos" : "neg";
}

function ReplyGlyph() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20 12.4c0 3.9-3.6 7-8 7a9 9 0 0 1-2.4-.3L5 21l1.2-3.3A6.6 6.6 0 0 1 4 12.4c0-3.9 3.6-7 8-7s8 3.1 8 7z"
        stroke={theme.colors.faint}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * A caveat about the record, set under it rather than on it.
 *
 * It was a white card, which put a note about the data at the same visual
 * weight as the data. On the canvas, in muted ink, it reads as the footnote it
 * is — and the sheet above keeps its edge.
 */
const Footnote = styled.Text`
  margin-top: ${(p) => p.theme.space(3)}px;
  padding-horizontal: ${(p) => p.theme.space(2)}px;
  font-size: ${(p) => p.theme.type.caption.size}px;
  line-height: ${(p) => p.theme.type.caption.height}px;
  color: ${(p) => p.theme.colors.muted};
`;

const Page = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(p) => p.theme.colors.bg};
`;

const Header = styled.View`
  padding-horizontal: ${(p) => p.theme.space(4)}px;
  padding-bottom: ${(p) => p.theme.space(3)}px;
  gap: ${(p) => p.theme.space(3)}px;
`;

const FilterRow = styled.View`
  align-self: flex-start;
`;

const Byline = styled.Pressable`
  flex-direction: row;
  align-items: center;
  gap: 8px;
`;

const ScopeChip = styled.View<{ $on: boolean }>`
  padding-horizontal: ${(p) => p.theme.space(3)}px;
  padding-vertical: 7px;
  border-radius: ${(p) => p.theme.radius.pill}px;
  background-color: ${(p) => (p.$on ? p.theme.colors.ink : p.theme.colors.surface)};
`;

const ScopeText = styled.Text<{ $on: boolean }>`
  font-size: ${(p) => p.theme.type.caption.size}px;
  font-weight: 700;
  letter-spacing: ${(p) => p.theme.type.caption.tracking}px;
  color: ${(p) => (p.$on ? p.theme.colors.onInk : p.theme.colors.muted)};
`;

const LiveText = styled.Text`
  font-size: ${(p) => p.theme.type.micro.size}px;
  font-weight: 600;
  color: ${(p) => p.theme.colors.muted};
  font-variant: tabular-nums;
`;

const Loading = styled.View`
  padding-horizontal: ${(p) => p.theme.space(4)}px;
  gap: ${(p) => p.theme.space(3)}px;
`;



const Verb = styled.Text<{ $tone: string }>`
  font-size: ${(p) => p.theme.type.label.size}px;
  font-weight: 700;
  color: ${(p) => p.$tone};
`;

const Ticker = styled.Text`
  font-size: ${(p) => p.theme.type.body.size}px;
  font-weight: 800;
  letter-spacing: -0.2px;
  color: ${(p) => p.theme.colors.text};
`;

/**
 * The post's words.
 *
 * `width: 100%` is load-bearing, not tidiness. Without it one body in the feed
 * laid itself out on a single line and was clipped by the sheet's edge while
 * every other body wrapped — the giveaway being that the *shortest* post was
 * the one cut off, because the longer ones overflowed the bad measurement far
 * enough to wrap anyway. Binding the Text to its parent's content width makes
 * the wrap independent of the string.
 */
const PostBody = styled.Text`
  width: 100%;
  margin-top: ${(p) => p.theme.space(3)}px;
  font-size: ${(p) => p.theme.type.lead.size}px;
  line-height: 24px;
  color: ${(p) => p.theme.colors.text};
`;

const Grow = styled.View`
  flex: 1;
`;

/**
 * A square, full-bleed inside the entry.
 *
 * Square rather than the media's own ratio: a feed of mixed aspect ratios
 * makes every scroll a different distance and the eye loses its place. The
 * post screen shows it uncropped.
 */
const Media = styled.Image`
  width: 100%;
  aspect-ratio: 1;
  margin-top: ${(p) => p.theme.space(3)}px;
  border-radius: ${(p) => p.theme.radius.md}px;
  background-color: ${(p) => p.theme.colors.surfaceAlt};
`;

const ActionRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${(p) => p.theme.space(4)}px;
  margin-top: ${(p) => p.theme.space(3)}px;
`;

/** The direction, drawn — so it is not colour alone carrying it. */
const Arrow = styled.View<{ $up: boolean }>`
  width: 0;
  height: 0;
  border-left-width: 5px;
  border-right-width: 5px;
  border-left-color: transparent;
  border-right-color: transparent;
  border-bottom-width: ${(p) => (p.$up ? 8 : 0)}px;
  border-top-width: ${(p) => (p.$up ? 0 : 8)}px;
  border-bottom-color: ${(p) => (p.$up ? p.theme.colors.pos : "transparent")};
  border-top-color: ${(p) => (p.$up ? "transparent" : p.theme.colors.neg)};
`;

const PriceText = styled.Text<{ $tone: "pos" | "neg" | "flat" }>`
  font-size: ${(p) => p.theme.type.label.size}px;
  font-weight: 800;
  font-variant: tabular-nums;
  color: ${(p) =>
    p.$tone === "pos"
      ? p.theme.colors.pos
      : p.$tone === "neg"
        ? p.theme.colors.neg
        : p.theme.colors.muted};
`;

const BuyTap = styled.View`
  padding: 9px 22px;
  border-radius: ${(p) => p.theme.radius.pill}px;
  background-color: ${(p) => p.theme.colors.lime};
`;

const BuyText = styled.Text`
  font-size: ${(p) => p.theme.type.label.size}px;
  font-weight: 800;
  color: ${(p) => p.theme.colors.onLime};
`;

/**
 * A trader's own words about their fill.
 *
 * Set on a tinted ground so it reads as a quotation rather than as the app
 * describing the trade — the figures below it are Juno's, this line is theirs.
 */
const Note = styled.Text`
  width: 100%;
  margin-top: ${(p) => p.theme.space(3)}px;
  padding: ${(p) => p.theme.space(3)}px;
  border-radius: ${(p) => p.theme.radius.md}px;
  background-color: ${(p) => p.theme.colors.surfaceAlt};
  font-size: ${(p) => p.theme.type.body.size}px;
  line-height: ${(p) => p.theme.type.body.height}px;
  color: ${(p) => p.theme.colors.text};
`;

/**
 * The market a post is about, as a line item rather than a filled well.
 *
 * It was a grey rounded box inside a white card inside a sage canvas — three
 * nested containers to say "this post names a coin". On a ruled sheet the
 * reference is a line: ticker, name, and the way in. Nothing nests.
 */
const CoinChip = styled.Pressable`
  flex-direction: row;
  align-items: center;
  gap: ${(p) => p.theme.space(2)}px;
  padding-vertical: ${(p) => p.theme.space(2)}px;
  margin-top: ${(p) => p.theme.space(2)}px;
`;

/**
 * Three figures on a shared left edge, not centred in equal columns.
 *
 * These are numbers people compare down a scrolling list. Centring leaves the
 * digits wandering between rows; a common left edge gives the eye one line to
 * run along, which is the whole reason a ledger is ruled.
 */
const Column = styled.View`
  flex: 1;
  gap: 2px;
`;

/**
 * No rule above these.
 *
 * The sheet is already ruled between entries; a second hairline inside one, at
 * the same weight, makes the eye read four separators of equal importance where
 * there is one. Inside an entry the hierarchy is spacing.
 */
const Figures = styled.View`
  flex-direction: row;
  margin-top: ${(p) => p.theme.space(4)}px;
`;


const Engagement = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  margin-top: ${(p) => p.theme.space(3)}px;
`;

