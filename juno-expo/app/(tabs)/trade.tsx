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
  Pill,
  Placeholder,
  Progress,
  Row,
  Segmented,
  Skeleton,
  Title,
} from "../../components/kit";
import { CoinArt, Identicon } from "../../components/art";
import { Tappable } from "../../components/Press";
import { juno, type Coin, type Trader } from "../../lib/api";
import { useLinkedState } from "../../lib/linked";
import { money, useApi } from "../../lib/useApi";
import { theme } from "../../theme";

type Sort = "new" | "marketCap" | "graduating" | "traders";

const SORTS = [
  { id: "new" as const, label: "New" },
  { id: "marketCap" as const, label: "Top" },
  { id: "graduating" as const, label: "Graduating" },
  { id: "traders" as const, label: "Traders" },
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
 *
 * ## Traders is a fourth sort, not a sixth tab
 *
 * Ranking people belongs next to ranking coins: both answer "what should I buy",
 * one through the asset and one through whoever already decided. Making it a tab
 * would have pushed the bar past five slots, which is where a tab bar stops
 * being scannable — and it would have implied the two lists are unrelated when
 * the whole point is that they are the same question.
 */
export default function TradeScreen() {
  const router = useRouter();
  /*
   * The selected list is addressable.
   *
   * `?sort=traders` opens straight onto the leaderboard. A segment that only
   * exists in component state cannot be linked to, which matters here for the
   * same reason it matters on the web: a demo, a share and a deep link all want
   * to land on a specific view rather than on the default one and a tap.
   */
  const [sort, setSort] = useLinkedState<Sort>(
    "sort",
    SORTS.map((option) => option.id),
    "new",
  );
  const onTraders = sort === "traders";
  // Each list is fetched only while its own segment is selected: the
  // leaderboard walks every pool's history and is not worth paying for while
  // someone is looking at coins.
  const coins = useApi(
    () => (onTraders ? Promise.resolve(null) : juno.coins(sort === "new" ? undefined : sort)),
    [sort],
  );
  const board = useApi(() => (onTraders ? juno.leaderboard(25) : Promise.resolve(null)), [sort]);

  return (
    <Page edges={["top"]}>
      <Header>
        <Title>Trade</Title>
        <Segmented items={SORTS} value={sort} onChange={setSort} />
      </Header>

      {onTraders ? (
        <TraderBoard board={board} onOpen={(wallet) => router.push(`/trader/${wallet}` as never)} />
      ) : coins.loading ? (

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


/**
 * Traders, ranked by profit they have taken.
 *
 * Ranked on **realised** only. A wallet that bought and never sold has taken no
 * risk off the table, and ranking on paper gains would order the board by who
 * bought earliest rather than who traded well. The open position is shown
 * beside the rank so the picture is complete, and it never decides the order.
 *
 * `—` on a win rate is not a zero. It means no sell had a cost inside the read
 * window to compare against, which is unmeasured rather than bad.
 */
function TraderBoard({
  board,
  onOpen,
}: {
  board: ReturnType<typeof useApi<{ partial: boolean; poolsRead: number; traders: Trader[] } | null>>;
  onOpen: (wallet: string) => void;
}) {
  if (board.loading) {
    return (
      <Loading>
        <Ledger>
          {[0, 1, 2, 3].map((i) => (
            <Entry key={i} $first={i === 0}>
              <Row gap={12}>
                <Skeleton h={26} w={26} round={13} />
                <Skeleton h={14} w="40%" />
                <Col style={{ flex: 1 }} />
                <Skeleton h={16} w={64} />
              </Row>
            </Entry>
          ))}
        </Ledger>
      </Loading>
    );
  }

  if (board.error) {
    return (
      <Placeholder
        title="Could not rank traders"
        detail={board.error}
        action={<Button label="Try again" onPress={board.refresh} />}
      />
    );
  }

  const traders = board.data?.traders ?? [];

  return (
    <ScrollView
      contentContainerStyle={{ width: "100%", paddingHorizontal: 16, paddingBottom: 130 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={board.refreshing}
          onRefresh={board.refresh}
          tintColor={theme.colors.muted}
        />
      }
    >
      {/* A rank built from a short read is short. Saying so costs one line and
          is the difference between a board and a claim. */}
      {board.data?.partial ? (
        <Footnote>
          Ranked from {board.data.poolsRead}{" "}
          {board.data.poolsRead === 1 ? "pool" : "pools"} — some histories would not
          load, so this is not every trade on the cluster. Pull to retry.
        </Footnote>
      ) : null}

      {traders.length === 0 ? (
        <Placeholder
          title={board.data?.partial ? "Could not read the cluster" : "Nobody has traded yet"}
          detail={
            board.data?.partial
              ? "The RPC is rate-limiting, so no pool history could be walked. Pull to retry."
              : "The board fills in as soon as the first swap lands."
          }
        />
      ) : (
        <Ledger>
          {traders.map((trader, index) => (
            <Tappable key={trader.wallet} onPress={() => onOpen(trader.wallet)} to={0.985}>
              <Entry $first={index === 0}>
                <Row gap={12}>
                  <Rank>{index + 1}</Rank>
                  <Identicon seed={trader.wallet} size={28} />
                  <Col gap={2} style={{ flex: 1 }}>
                    <Row gap={6}>
                      <Label style={{ fontWeight: "700" }} numberOfLines={1}>
                        {trader.wallet.slice(0, 4)}…{trader.wallet.slice(-4)}
                      </Label>
                      {trader.isCreator ? <Pill label="Creator" tone="lime" /> : null}
                    </Row>
                    <Caption>
                      {trader.trades} {trader.trades === 1 ? "fill" : "fills"} ·{" "}
                      {trader.coins} {trader.coins === 1 ? "coin" : "coins"}
                      {trader.followers > 0 ? ` · ${trader.followers} following` : ""}
                    </Caption>
                  </Col>
                  <Col gap={2} style={{ alignItems: "flex-end" }}>
                    <Mono
                      style={{
                        color:
                          trader.realised > 0
                            ? theme.colors.pos
                            : trader.realised < 0
                              ? theme.colors.neg
                              : theme.colors.text,
                      }}
                    >
                      {trader.realised > 0 ? "+" : ""}
                      {money(trader.realised, "USD")}
                    </Mono>
                    <Caption>taken</Caption>
                  </Col>
                </Row>

                <Row gap={16} style={{ marginTop: 12 }}>
                  <Col gap={2} style={{ flex: 1 }}>
                    <Mono muted>
                      {trader.unrealised === null ? "—" : money(trader.unrealised, "USD")}
                    </Mono>
                    <Caption>Open</Caption>
                  </Col>
                  <Col gap={2} style={{ flex: 1 }}>
                    <Mono muted>{money(trader.holding, "USD")}</Mono>
                    <Caption>Holding</Caption>
                  </Col>
                  <Col gap={2} style={{ flex: 1 }}>
                    <Mono muted>
                      {trader.winRate === null ? "—" : `${Math.round(trader.winRate * 100)}%`}
                    </Mono>
                    <Caption>Win rate</Caption>
                  </Col>
                </Row>
              </Entry>
            </Tappable>
          ))}
        </Ledger>
      )}
    </ScrollView>
  );
}

const Rank = styled.Text`
  width: 18px;
  font-size: ${(p) => p.theme.type.caption.size}px;
  font-weight: 700;
  font-variant: tabular-nums;
  color: ${(p) => p.theme.colors.faint};
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



