import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import styled from "styled-components/native";

import { CoinArt, Identicon } from "../../components/art";
import { JunoMark } from "../../components/logo";
import { Enter, Tappable } from "../../components/Press";
import {
  Body,
  Button,
  Caption,
  Delta,
  Card,
  Col,
  Label,
  Mono,
  Placeholder,
  Row,
  Segmented,
  Skeleton,
  Title,
} from "../../components/kit";
import { juno, type FeedItem } from "../../lib/api";
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
 * ## Telling them apart without reading them
 *
 * Both used to be the same white card, so the difference only arrived after you
 * had parsed the contents — which on a feed you scroll is too late. Now a trade
 * carries a coloured edge in its own direction and leads with the coin's
 * artwork; a post leads with its words, at reading size. Scrolling past, the
 * shape alone tells you which is which and the colour tells you which way.
 *
 * The edge is never the only signal: every trade also spells out "bought" or
 * "sold" in words, because the green and the red are only ΔE 9.0 apart under
 * deuteranopia.
 */

const FILTERS = [
  { id: "all", label: "All" },
  { id: "trades", label: "Trades" },
  { id: "posts", label: "Posts" },
] as const;

type Filter = (typeof FILTERS)[number]["id"];

export default function SocialScreen() {
  const router = useRouter();
  // Re-reads when this device posts. Not on every focus: the feed walks every
  // pool against a rate-limited RPC and costs the better part of fifteen
  // seconds, which is not a price to pay for switching tabs.
  const revision = useFeedRevision();
  const feed = useApi(() => juno.feed(40), [revision]);
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
          {/* What is actually on screen, counted rather than claimed. Absent
              while loading, because "0 live" would be a reading nobody took. */}
          {feed.data ? (
            <LiveChip>
              <Dot />
              <LiveText>
                {counts.trades} {counts.trades === 1 ? "trade" : "trades"} · {counts.posts}{" "}
                {counts.posts === 1 ? "post" : "posts"}
              </LiveText>
            </LiveChip>
          ) : null}
        </Row>

        {feed.data ? (
          <FilterRow>
            <Segmented items={FILTERS} value={filter} onChange={setFilter} />
          </FilterRow>
        ) : null}
      </Header>

      {feed.loading ? (
        <Loading>
          {[0, 1, 2].map((i) => (
            <Enter key={i} index={i}>
              <Card>
                <Row gap={10}>
                  <Skeleton h={30} w={30} round={15} />
                  <Col gap={6} style={{ flex: 1 }}>
                    <Skeleton h={13} w="45%" />
                    <Skeleton h={11} w="28%" />
                  </Col>
                </Row>
                <Skeleton h={12} w="92%" style={{ marginTop: 16 }} />
                <Skeleton h={12} w="64%" style={{ marginTop: 8 }} />
              </Card>
            </Enter>
          ))}
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
        <FlatList
          data={items}
          keyExtractor={(item) => `${item.kind}:${item.id}`}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 130, gap: 12 }}
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
          refreshControl={
            <RefreshControl
              refreshing={feed.refreshing}
              onRefresh={feed.refresh}
              tintColor={theme.colors.muted}
            />
          }
          ListFooterComponent={
            // Posts are complete; trades are walked against an endpoint that
            // refuses. Saying so is cheaper than a feed that looks quiet.
            feed.data?.tradesPartial && items.length > 0 && filter !== "posts" ? (
              <Card>
                <Body muted>
                  Some pools would not load, so the trades above are not every
                  trade on this cluster. Pull to retry.
                </Body>
              </Card>
            ) : null
          }
          ListEmptyComponent={
            filter !== "all" && (feed.data?.items.length ?? 0) > 0 ? (
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
          }
          renderItem={({ item, index }) => (
            // Only the first screenful is staggered. Past that the delay stops
            // being an entrance and becomes a row that is late.
            <Enter index={index} key={`${filter}:${item.id}`}>
              <FeedRow
                item={item}
                onOpen={(mint) => router.push(`/coin/${mint}`)}
                onOpenPost={(postId) => router.push(`/post/${postId}`)}
              />
            </Enter>
          )}
        />
      )}
    </Page>
  );
}

function FeedRow({
  item,
  onOpen,
  onOpenPost,
}: {
  item: FeedItem;
  onOpen: (mint: string) => void;
  onOpenPost: (postId: string) => void;
}) {
  if (item.kind === "trade") {
    const buying = item.side === "buy";
    const tone = buying ? theme.colors.pos : theme.colors.neg;
    const move =
      item.priceNow !== null && item.price > 0 ? (item.priceNow - item.price) / item.price : null;

    return (
      <Tappable onPress={() => onOpen(item.coin.address)}>
        <TradeCard>
          {/* Direction as an edge. Colour is never alone — "bought"/"sold" is
              spelled out a line below. */}
          <Edge $tone={tone} />

          <Row gap={8}>
            <Identicon seed={item.actor.handle} size={22} />
            <Label numberOfLines={1} style={{ fontWeight: "700", maxWidth: 104 }}>
              {item.actor.handle}
            </Label>
            <Verb $tone={tone}>{buying ? "bought" : "sold"}</Verb>
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
              size={58}
              radius={18}
            />
            <Col gap={3} style={{ flex: 1 }}>
              <Ticker numberOfLines={1}>${item.coin.symbol || item.coin.name}</Ticker>
              <Label muted numberOfLines={1}>
                {item.coin.name}
              </Label>
            </Col>
            {/* The move since the trade is the one number worth the largest
                type on this card: it is what happened *after* the decision.
                Absent, never zero, when the live price could not be read. */}
            <Col gap={2} style={{ alignItems: "flex-end" }}>
              <Delta pct={move} />
              <Caption>since</Caption>
            </Col>
          </Row>

          <Figures>
            <Figure>
              <Mono>{tokens(item.amount)}</Mono>
              <Caption>Amount</Caption>
            </Figure>
            <Figure>
              <Mono>{money(item.valueUsd, item.currency)}</Mono>
              <Caption>Total</Caption>
            </Figure>
            <Figure>
              <Mono>{money(item.price, item.currency, { compact: false })}</Mono>
              <Caption>Price paid</Caption>
            </Figure>
          </Figures>
        </TradeCard>
      </Tappable>
    );
  }

  return (
    <Tappable onPress={() => onOpenPost(item.id)}>
      <Card>
        <Row gap={10}>
          <Identicon seed={item.author.wallet} size={26} />
          <Label numberOfLines={1} style={{ fontWeight: "700" }}>
            {item.author.handle}
          </Label>
          <Grow />
          <Caption>{since(item.timestamp)}</Caption>
        </Row>

        {/* The post's own words, at reading size. This is the content; on a
            trade card the equivalent weight goes to the number. */}
        <PostBody>{item.body}</PostBody>

        {item.coin ? (
          <CoinChip onPress={() => onOpen(item.coin!.address)}>
            <Ticker style={{ fontSize: 14 }}>${item.coin.symbol}</Ticker>
            <Label muted numberOfLines={1} style={{ flex: 1 }}>
              {item.coin.name}
            </Label>
            <Chevron>›</Chevron>
          </CoinChip>
        ) : null}

        {/* The conversation, and a way into it. A post you cannot answer is an
            announcement, and this is supposed to be a social app. */}
        <Engagement>
          <ReplyGlyph />
          <Label muted>
            {item.replyCount === 0
              ? "Reply"
              : `${item.replyCount} ${item.replyCount === 1 ? "reply" : "replies"}`}
          </Label>
          <Grow />
          <Chevron>›</Chevron>
        </Engagement>
      </Card>
    </Tappable>
  );
}

/** A speech bubble, drawn — a bordered circle with one square corner was not one. */
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

const LiveChip = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  padding-horizontal: ${(p) => p.theme.space(3)}px;
  padding-vertical: 6px;
  border-radius: ${(p) => p.theme.radius.pill}px;
  background-color: ${(p) => p.theme.colors.surface};
`;

const Dot = styled.View`
  width: 6px;
  height: 6px;
  border-radius: 3px;
  background-color: ${(p) => p.theme.colors.pos};
`;

const LiveText = styled.Text`
  font-size: 11px;
  font-weight: 600;
  color: ${(p) => p.theme.colors.muted};
  font-variant: tabular-nums;
`;

const Loading = styled.View`
  padding-horizontal: ${(p) => p.theme.space(4)}px;
  gap: ${(p) => p.theme.space(3)}px;
`;

/**
 * A trade card, which is a `Card` with a stripe down its left edge.
 *
 * `overflow: hidden` is what lets the stripe sit flush inside the corner
 * radius instead of poking out of it — the kind of two-pixel detail nobody
 * consciously sees and everybody notices when it is wrong.
 */
const TradeCard = styled(Card)`
  overflow: hidden;
  padding-left: ${(p) => p.theme.space(5)}px;
`;

const Edge = styled.View<{ $tone: string }>`
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background-color: ${(p) => p.$tone};
`;

const Verb = styled.Text<{ $tone: string }>`
  font-size: 13px;
  font-weight: 700;
  color: ${(p) => p.$tone};
`;

const Ticker = styled.Text`
  font-size: 16px;
  font-weight: 800;
  letter-spacing: -0.2px;
  color: ${(p) => p.theme.colors.text};
`;

const PostBody = styled.Text`
  margin-top: ${(p) => p.theme.space(3)}px;
  font-size: 17px;
  line-height: 24px;
  color: ${(p) => p.theme.colors.text};
`;

const Grow = styled.View`
  flex: 1;
`;

const CoinChip = styled.Pressable`
  flex-direction: row;
  align-items: center;
  gap: ${(p) => p.theme.space(2)}px;
  background-color: ${(p) => p.theme.colors.surfaceAlt};
  padding-horizontal: ${(p) => p.theme.space(3)}px;
  padding-vertical: ${(p) => p.theme.space(3)}px;
  border-radius: ${(p) => p.theme.radius.md}px;
  margin-top: ${(p) => p.theme.space(3)}px;
`;

const Figures = styled.View`
  flex-direction: row;
  margin-top: ${(p) => p.theme.space(3)}px;
  padding-top: ${(p) => p.theme.space(3)}px;
  border-top-width: 1px;
  border-top-color: ${(p) => p.theme.colors.line};
`;

/**
 * Left-aligned, not centred.
 *
 * Three figures centred in equal columns leaves their digits wandering, and
 * these are numbers people compare down a scrolling feed. A shared left edge
 * gives the eye one line to run along.
 */
const Figure = styled.View`
  flex: 1;
  gap: 2px;
`;

const Engagement = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${(p) => p.theme.space(2)}px;
  margin-top: ${(p) => p.theme.space(3)}px;
  padding-top: ${(p) => p.theme.space(3)}px;
  border-top-width: 1px;
  border-top-color: ${(p) => p.theme.colors.line};
`;

const Chevron = styled.Text`
  font-size: 18px;
  font-weight: 700;
  color: ${(p) => p.theme.colors.faint};
`;
