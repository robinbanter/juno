import { useRouter } from "expo-router";
import { FlatList, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import styled from "styled-components/native";

import { CoinArt, Identicon } from "../../components/art";
import { JunoMark } from "../../components/logo";
import {
  Avatar,
  Body,
  Button,
  Caption,
  Delta,
  Stat,
  Card,
  Col,
  Heading,
  Label,
  Mono,
  Pill,
  Placeholder,
  Row,
  Skeleton,
  Title,
} from "../../components/kit";
import { juno, type FeedItem } from "../../lib/api";
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
 */
export default function SocialScreen() {
  const router = useRouter();
  const feed = useApi(() => juno.feed(40), []);

  return (
    <Page edges={["top"]}>
      <Header>
        <Row gap={10}>
          <JunoMark size={30} color={theme.colors.text} />
          <Col gap={2}>
            <Title>juno</Title>
            <Label muted>Every post is a market</Label>
          </Col>
        </Row>
      </Header>

      {feed.loading ? (
        <Loading>
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <Skeleton h={14} w="45%" />
              <Skeleton h={12} w="90%" style={{ marginTop: 14 }} />
              <Skeleton h={12} w="70%" style={{ marginTop: 8 }} />
            </Card>
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
          data={feed.data?.items ?? []}
          keyExtractor={(item) => `${item.kind}:${item.id}`}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 130, gap: 12 }}
          showsVerticalScrollIndicator={false}
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
            feed.data?.tradesPartial && (feed.data?.items.length ?? 0) > 0 ? (
              <Card>
                <Body muted>
                  Some pools would not load, so the trades above are not every
                  trade on this cluster. Pull to retry.
                </Body>
              </Card>
            ) : null
          }
          ListEmptyComponent={
            feed.data?.tradesPartial ? (
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
          renderItem={({ item }) => (
            <FeedRow
              item={item}
              onOpen={(mint) => router.push(`/coin/${mint}`)}
              onOpenPost={(postId) => router.push(`/post/${postId}`)}
            />
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
    return (
      <Tap onPress={() => onOpen(item.coin.address)}>
        <Card>
          <Row gap={8}>
            <Identicon seed={item.actor.handle} />
            <Label numberOfLines={1} style={{ fontWeight: "700", maxWidth: 110 }}>
              {item.actor.handle}
            </Label>
            <Label muted>{buying ? "bought" : "sold"}</Label>
            <Label style={{ fontWeight: "700" }} numberOfLines={1}>
              ${item.coin.symbol || item.coin.name}
            </Label>
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
              size={64}
              radius={18}
            />
            <Col gap={4} style={{ flex: 1 }}>
              <Heading numberOfLines={1} style={{ fontSize: 16 }}>
                {item.coin.name}
              </Heading>
              <Pill label={buying ? "Buy" : "Sell"} tone={buying ? "pos" : "neg"} />
            </Col>
          </Row>

          {/* The numbers that make this a trade rather than an event: what was
              paid, what it cost per token, and where that price is now. The
              move is only shown when both prices are known — a live price the
              RPC would not serve is left as a dash, never as 0%. */}
          <Figures>
            <Stat value={tokens(item.amount)} label="Amount" />
            <Stat
              value={money(item.valueUsd, item.currency)}
              label={`Total (${item.currency})`}
            />
            <Stat
              value={money(item.price, item.currency, { compact: false })}
              label="Price"
            />
            <Col gap={2} style={{ flex: 1, alignItems: "center" }}>
              <Delta
                pct={
                  item.priceNow !== null && item.price > 0
                    ? (item.priceNow - item.price) / item.price
                    : null
                }
              />
              <Caption>Since</Caption>
            </Col>
          </Figures>
        </Card>
      </Tap>
    );
  }

  return (
    <Tap onPress={() => onOpenPost(item.id)}>
      <Card>
        <Row gap={8}>
          <Identicon seed={item.author.wallet} />
          <Label numberOfLines={1} style={{ fontWeight: "700" }}>
            {item.author.handle}
          </Label>
          <Grow />
          <Caption>{since(item.timestamp)}</Caption>
        </Row>

        <Body style={{ marginTop: 12 }}>{item.body}</Body>

        {item.coin ? (
          <CoinChip onPress={() => onOpen(item.coin!.address)}>
            <Label style={{ fontWeight: "700" }}>${item.coin.symbol}</Label>
            <Label muted numberOfLines={1} style={{ flex: 1 }}>
              {item.coin.name}
            </Label>
            <Chevron>›</Chevron>
          </CoinChip>
        ) : null}

        {/* The conversation, and a way into it. A post you cannot answer is an
            announcement, and this is supposed to be a social app. */}
        <Engagement>
          <Label muted>
            {item.replyCount === 0
              ? "Reply"
              : `${item.replyCount} ${item.replyCount === 1 ? "reply" : "replies"}`}
          </Label>
          <Grow />
          <Chevron>›</Chevron>
        </Engagement>
      </Card>
    </Tap>
  );
}

const Page = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(p) => p.theme.colors.bg};
`;

const Header = styled.View`
  padding-horizontal: ${(p) => p.theme.space(4)}px;
  padding-bottom: ${(p) => p.theme.space(3)}px;
`;

const Loading = styled.View`
  padding-horizontal: ${(p) => p.theme.space(4)}px;
  gap: ${(p) => p.theme.space(3)}px;
`;

const Tap = styled.Pressable``;

const Grow = styled.View`
  flex: 1;
`;

const CoinChip = styled.Pressable`
  flex-direction: row;
  align-items: center;
  gap: ${(p) => p.theme.space(2)}px;
  background-color: ${(p) => p.theme.colors.surfaceAlt};
  padding-horizontal: ${(p) => p.theme.space(3)}px;
  padding-vertical: ${(p) => p.theme.space(2)}px;
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

const Engagement = styled.View`
  flex-direction: row;
  align-items: center;
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
