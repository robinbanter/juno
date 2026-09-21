import { useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import styled from "styled-components/native";

import {
  Body,
  Caption,
  Card,
  Col,
  Delta,
  Heading,
  Label,
  Mono,
  Placeholder,
  Progress,
  Row,
  Segmented,
  Skeleton,
  Title,
} from "../../components/kit";
import { juno, type Coin } from "../../lib/api";
import { money, useApi } from "../../lib/useApi";
import { theme } from "../../theme";

type Sort = "new" | "marketCap" | "graduating";

const SORTS = [
  { id: "new" as const, label: "New" },
  { id: "marketCap" as const, label: "Top" },
  { id: "graduating" as const, label: "Graduating" },
];

/**
 * The market list.
 *
 * Every Juno coin, priced, sortable. This tab gives the buy/sell sheet
 * somewhere to be reached from — the sheet is per-coin, so a tab that opened
 * straight into it would have nothing to trade.
 *
 * "Graduating" is the sort worth having: it surfaces the pools closest to their
 * migration threshold, the ones about to become permanent AMM markets.
 */
export default function TradeScreen() {
  const router = useRouter();
  const [sort, setSort] = useState<Sort>("new");
  const coins = useApi(() => juno.coins(sort === "new" ? undefined : sort), [sort]);

  return (
    <Page edges={["top"]}>
      <Header>
        <Title>Trade</Title>
        <Segmented items={SORTS} value={sort} onChange={setSort} />
      </Header>

      {coins.loading ? (
        <Loading>
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}>
              <Row gap={12}>
                <Skeleton h={48} w={48} round={16} />
                <Col gap={8} style={{ flex: 1 }}>
                  <Skeleton h={13} w="55%" />
                  <Skeleton h={11} w="35%" />
                </Col>
              </Row>
            </Card>
          ))}
        </Loading>
      ) : coins.error ? (
        <Placeholder title="Could not load the market" detail={coins.error} />
      ) : (
        <FlatList
          data={coins.data?.coins ?? []}
          keyExtractor={(coin) => coin.address}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 130, gap: 12 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={coins.refreshing}
              onRefresh={coins.refresh}
              tintColor={theme.colors.muted}
            />
          }
          ListHeaderComponent={
            // Eleven pools in and nine rows out is a market list two coins
            // short of itself. It says so rather than looking complete.
            (coins.data?.missing ?? 0) > 0 && (coins.data?.coins.length ?? 0) > 0 ? (
              <Card>
                <Body muted>
                  {coins.data!.missing} more{" "}
                  {coins.data!.missing === 1 ? "coin is" : "coins are"} listed but
                  could not be priced — the RPC is rate-limiting. Pull to retry.
                </Body>
              </Card>
            ) : null
          }
          ListEmptyComponent={
            (coins.data?.missing ?? 0) > 0 ? (
              <Placeholder
                title="Could not read the market"
                detail={`${coins.data!.missing} pools are listed on this cluster but none would load. The RPC is rate-limiting — pull to retry.`}
              />
            ) : (
              <Placeholder title="No coins yet" detail="Launch one from the Post tab." />
            )
          }
          renderItem={({ item }) => (
            <CoinRow coin={item} onPress={() => router.push(`/coin/${item.address}`)} />
          )}
        />
      )}
    </Page>
  );
}

function CoinRow({ coin, onPress }: { coin: Coin; onPress: () => void }) {
  const art = juno.media(coin.media.url);
  const pct = coin.curve.progress * 100;

  return (
    <Tap onPress={onPress}>
      <Card>
        <Row gap={12}>
          {art ? <Art source={{ uri: art }} /> : <ArtEmpty />}

          <Col gap={4} style={{ flex: 1 }}>
            <Heading numberOfLines={1} style={{ fontSize: 16 }}>
              {coin.name}
            </Heading>
            <Caption>
              ${coin.symbol} · {coin.curvePreset}
            </Caption>
            <Progress pct={pct} />
          </Col>

          <Col gap={3} style={{ alignItems: "flex-end" }}>
            <Mono style={{ fontSize: 15 }}>
              {money(coin.marketCap, coin.marketCapCurrency)}
            </Mono>
            <Delta pct={coin.marketCapChangePct} />
            <Caption>
              {coin.curve.graduated ? "Graduated" : `${pct.toFixed(0)}% to grad`}
            </Caption>
          </Col>
        </Row>
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
  gap: ${(p) => p.theme.space(3)}px;
`;

const Loading = styled.View`
  padding-horizontal: ${(p) => p.theme.space(4)}px;
  gap: ${(p) => p.theme.space(3)}px;
`;

const Tap = styled.Pressable``;

const Art = styled.Image`
  width: 48px;
  height: 48px;
  border-radius: ${(p) => p.theme.radius.md}px;
  background-color: ${(p) => p.theme.colors.surfaceAlt};
`;

const ArtEmpty = styled.View`
  width: 48px;
  height: 48px;
  border-radius: ${(p) => p.theme.radius.md}px;
  background-color: ${(p) => p.theme.colors.surfaceAlt};
`;
