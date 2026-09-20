import { useRouter } from "expo-router";
import { FlatList, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import styled from "styled-components/native";

import { Identicon } from "../../components/art";
import {
  Avatar,
  Body,
  Caption,
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
        <Col gap={2}>
          <Title>juno</Title>
          <Label muted>Every post is a market</Label>
        </Col>
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
        <Placeholder title="Could not load the feed" detail={feed.error} />
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
          ListEmptyComponent={
            <Placeholder
              title="Nothing here yet"
              detail="Trades and posts appear as they happen."
            />
          }
          renderItem={({ item }) => (
            <FeedRow item={item} onOpen={(mint) => router.push(`/coin/${mint}`)} />
          )}
        />
      )}
    </Page>
  );
}

function FeedRow({
  item,
  onOpen,
}: {
  item: FeedItem;
  onOpen: (mint: string) => void;
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
            {juno.media(item.coin.mediaUrl) ? (
              <Thumb source={{ uri: juno.media(item.coin.mediaUrl)! }} />
            ) : (
              <ThumbEmpty />
            )}
            <Col gap={4} style={{ flex: 1 }}>
              <Heading numberOfLines={1} style={{ fontSize: 16 }}>
                {item.coin.name}
              </Heading>
              <Mono muted>
                {tokens(item.amount)} for {money(item.valueUsd)}
              </Mono>
              <Pill label={buying ? "Buy" : "Sell"} tone={buying ? "pos" : "neg"} />
            </Col>
          </Row>
        </Card>
      </Tap>
    );
  }

  return (
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
        </CoinChip>
      ) : null}
    </Card>
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

const Thumb = styled.Image`
  width: 64px;
  height: 64px;
  border-radius: ${(p) => p.theme.radius.md}px;
  background-color: ${(p) => p.theme.colors.surfaceAlt};
`;

const ThumbEmpty = styled.View`
  width: 64px;
  height: 64px;
  border-radius: ${(p) => p.theme.radius.md}px;
  background-color: ${(p) => p.theme.colors.surfaceAlt};
  border-width: 1px;
  border-color: ${(p) => p.theme.colors.line};
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
