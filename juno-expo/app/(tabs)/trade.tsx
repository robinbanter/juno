import { useRouter } from "expo-router";
import { useState } from "react";
import { RefreshControl, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import styled from "styled-components/native";

import {
  Button,
  Caption,
  Col,
  Delta,
  Entry,
  Label,
  Ledger,
  Mono,
  Placeholder,
  Progress,
  Row,
  Segmented,
  Skeleton,
  Title,
} from "../../components/kit";
import { CoinArt } from "../../components/art";
import { Tappable } from "../../components/Press";
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
          <Ledger>
            {[0, 1, 2, 3, 4].map((i) => (
              <Entry key={i} $first={i === 0}>
                <Row gap={12}>
                  <Skeleton h={44} w={44} round={14} />
                  <Col gap={8} style={{ flex: 1 }}>
                    <Skeleton h={14} w="55%" />
                    <Skeleton h={11} w="35%" />
                  </Col>
                  <Skeleton h={16} w={66} />
                </Row>
              </Entry>
            ))}
          </Ledger>
        </Loading>
      ) : coins.error ? (
        <Placeholder
          title="Could not load the market"
          detail={coins.error}
          action={<Button label="Try again" onPress={coins.refresh} />}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 130 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={coins.refreshing}
              onRefresh={coins.refresh}
              tintColor={theme.colors.muted}
            />
          }
        >
          {/* Eleven pools in and nine rows out is a market list two coins short
              of itself. It says so rather than looking complete — as a note
              above the record, not an entry in it. */}
          {(coins.data?.missing ?? 0) > 0 && (coins.data?.coins.length ?? 0) > 0 ? (
            <Footnote>
              {coins.data!.missing} more{" "}
              {coins.data!.missing === 1 ? "coin is" : "coins are"} listed but could
              not be priced — the RPC is rate-limiting. Pull to retry.
            </Footnote>
          ) : null}

          {(coins.data?.coins.length ?? 0) === 0 ? (
            (coins.data?.missing ?? 0) > 0 ? (
              <Placeholder
                title="Could not read the market"
                detail={`${coins.data!.missing} pools are listed on this cluster but none would load. The RPC is rate-limiting — pull to retry.`}
              />
            ) : (
              <Placeholder title="No coins yet" detail="Launch one from the Post tab." />
            )
          ) : (
            <Ledger>
              {coins.data!.coins.map((coin, index) => (
                <CoinRow
                  key={coin.address}
                  coin={coin}
                  first={index === 0}
                  onPress={() => router.push(`/coin/${coin.address}`)}
                />
              ))}
            </Ledger>
          )}
        </ScrollView>
      )}
    </Page>
  );
}

/**
 * One market, as a line in a ledger.
 *
 * Three columns that mean three different things, so they are set three
 * different ways: identity on the left in text, the figure on the right in
 * tabular numerals, and the curve as a rule beneath — a market's progress
 * towards graduation is a quantity, and a thin measured bar says that better
 * than a percentage repeated in words.
 */
function CoinRow({
  coin,
  first,
  onPress,
}: {
  coin: Coin;
  first: boolean;
  onPress: () => void;
}) {
  const art = juno.still(coin.media);
  const pct = coin.curve.progress * 100;

  return (
    <Tappable onPress={onPress} to={0.985}>
      <Entry $first={first}>
        <Row gap={12}>
          <CoinArt uri={art} seed={coin.address} size={44} radius={14} />

          <Col gap={2} style={{ flex: 1 }}>
            <Label numberOfLines={1} style={{ fontWeight: "700" }}>
              {coin.name}
            </Label>
            <Caption>
              ${coin.symbol} · {coin.curvePreset}
            </Caption>
          </Col>

          <Col gap={2} style={{ alignItems: "flex-end" }}>
            <Mono>{money(coin.marketCap, coin.marketCapCurrency)}</Mono>
            <Delta pct={coin.marketCapChangePct} />
          </Col>
        </Row>

        <CurveLine>
          <Progress pct={pct} />
          <Caption>
            {coin.curve.graduated ? "Graduated" : `${pct.toFixed(0)}% to graduation`}
          </Caption>
        </CurveLine>
      </Entry>
    </Tappable>
  );
}

/** The curve, set as a measurement under the row rather than beside the name. */
const CurveLine = styled.View`
  margin-top: ${(p) => p.theme.space(3)}px;
  gap: 6px;
`;

const Footnote = styled.Text`
  margin-bottom: ${(p) => p.theme.space(3)}px;
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

const Loading = styled.View`
  padding-horizontal: ${(p) => p.theme.space(4)}px;
  gap: ${(p) => p.theme.space(3)}px;
`;



