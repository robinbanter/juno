import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Linking, RefreshControl, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import styled from "styled-components/native";

import { CoinGlyph, Identicon } from "../../components/art";
import {
  Avatar,
  Body,
  Button,
  Caption,
  Card,
  Col,
  Delta,
  Heading,
  Label,
  Mono,
  Pill,
  Placeholder,
  Progress,
  Row,
  Skeleton,
  Stat,
  Title,
} from "../../components/kit";
import { TradeSheet } from "../../components/TradeSheet";
import { juno, type NavReference } from "../../lib/api";
import { money, since, tokens, useApi } from "../../lib/useApi";
import { theme } from "../../theme";

/**
 * One coin: what it is, what it costs, and how to trade it.
 *
 * The NAV band is the part worth reading closely. Only equity-shaped presets
 * have one, and it exists because a bonding curve has no idea what the asset it
 * claims to track actually costs — Pyth is what closes that loop.
 */
export default function CoinScreen() {
  const { mint } = useLocalSearchParams<{ mint: string }>();
  const router = useRouter();
  const [sheet, setSheet] = useState<"buy" | "sell" | null>(null);

  const detail = useApi(() => juno.coin(mint), [mint]);
  const coin = detail.data?.coin;

  return (
    <Page edges={["top"]}>
      <Nav>
        <Back onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
          <BackMark>‹</BackMark>
        </Back>
      </Nav>

      {detail.loading ? (
        <Loading>
          <Skeleton h={260} round={22} />
          <Skeleton h={18} w="60%" />
        </Loading>
      ) : detail.error || !coin ? (
        <Placeholder title="Could not load this coin" detail={detail.error ?? undefined} />
      ) : (
        <>
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 170, gap: 12 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={detail.refreshing}
                onRefresh={detail.refresh}
                tintColor={theme.colors.muted}
              />
            }
          >
            {juno.media(coin.media.url) ? (
              <Hero source={{ uri: juno.media(coin.media.url)! }} />
            ) : (
              <HeroEmpty>
                <CoinGlyph size={96} seed={coin.address} />
              </HeroEmpty>
            )}

            <Col gap={8}>
              <Title>{coin.name}</Title>
              <Row gap={8}>
                <Pill label={`$${coin.symbol}`} tone="lime" />
                <Pill label={coin.curvePreset} />
                {coin.curve.graduated ? <Pill label="Graduated" tone="pos" /> : null}
              </Row>
              {coin.description ? <Body muted>{coin.description}</Body> : null}
            </Col>

            <Card>
              <Row>
                <Stat
                  value={money(coin.marketCap, coin.marketCapCurrency)}
                  label="Market cap"
                />
                <Stat
                  value={money(coin.volume24h, coin.marketCapCurrency)}
                  label="24h volume"
                />
                <Stat
                  value={money(coin.creatorRewards, coin.marketCapCurrency)}
                  label="Creator fees"
                />
              </Row>
              <Row justify="center" style={{ marginTop: 10 }}>
                <Delta pct={coin.marketCapChangePct} />
              </Row>
            </Card>

            {!coin.curve.graduated ? (
              <Card>
                <Row justify="space-between">
                  <Label muted>Curve progress</Label>
                  <Mono>{(coin.curve.progress * 100).toFixed(2)}%</Mono>
                </Row>
                <Spacer />
                <Progress pct={coin.curve.progress * 100} />
                <Caption style={{ marginTop: 8 }}>
                  {money(coin.curve.raisedUsd, coin.marketCapCurrency)} of{" "}
                  {money(coin.curve.thresholdUsd, coin.marketCapCurrency)} to graduate into a
                  DAMM v2 pool
                </Caption>
              </Card>
            ) : null}

            {coin.nav ? <NavBand nav={coin.nav} /> : null}

            <Heading style={{ marginTop: 6 }}>Activity</Heading>
            {(detail.data?.activity.length ?? 0) === 0 ? (
              <Card>
                <Body muted>No trades yet.</Body>
              </Card>
            ) : (
              detail.data!.activity.slice(0, 12).map((row) => (
                <Card key={row.id}>
                  <Row gap={10}>
                    <Identicon seed={row.actor.handle} size={22} />
                    <Label numberOfLines={1} style={{ width: 84 }}>
                      {row.actor.handle}
                    </Label>
                    <Side $buy={row.side === "buy"}>{row.side}</Side>
                    <Mono muted style={{ flex: 1, textAlign: "right" }}>
                      {tokens(row.amount)}
                    </Mono>
                    <Caption>{since(row.timestamp)}</Caption>
                  </Row>
                </Card>
              ))
            )}

            <LinkTap onPress={() => Linking.openURL(juno.explorer("account", coin.pool))}>
              <LinkText>View the pool on Solscan ↗</LinkText>
            </LinkTap>
          </ScrollView>

          <Actions>
            {coin.curve.graduated ? (
              <GraduatedNote>
                This curve has graduated. Trading continues in its DAMM v2 pool.
              </GraduatedNote>
            ) : (
              <>
                <Button
                  label="Buy"
                  variant="lime"
                  tall
                  onPress={() => setSheet("buy")}
                  style={{ flex: 1 }}
                />
                <Button
                  label="Sell"
                  variant="quiet"
                  tall
                  onPress={() => setSheet("sell")}
                  style={{ flex: 1 }}
                />
              </>
            )}
          </Actions>

          {sheet ? (
            <TradeSheet
              coin={coin}
              side={sheet}
              onClose={() => setSheet(null)}
              onDone={() => {
                setSheet(null);
                detail.refresh();
              }}
            />
          ) : null}
        </>
      )}
    </Page>
  );
}

/**
 * Where the curve sits against the underlying.
 *
 * Three states, kept distinct because conflating them is the whole problem. An
 * equity feed outside exchange hours shows Friday's close — normal, and labelled
 * as such rather than dressed up as live.
 */
function NavBand({ nav }: { nav: NavReference }) {
  const label = /^Equity\.[A-Z]+\.([A-Z.]+)\/USD$/.exec(nav.feed)?.[1] ?? nav.feed.slice(0, 8);
  const state =
    nav.state === "live" ? "Live" : nav.state === "closed" ? "Market closed · last close" : "Stale";

  return (
    <Card>
      <Row justify="space-between">
        <Label style={{ fontWeight: "700" }}>{label} reference</Label>
        <Caption
          style={{
            color:
              nav.state === "live"
                ? theme.colors.pos
                : nav.state === "stale"
                  ? theme.colors.neg
                  : theme.colors.muted,
          }}
        >
          {state}
        </Caption>
      </Row>
      <Row justify="space-between" align="baseline" style={{ marginTop: 8 }}>
        <Heading>{money(nav.priceUsd, "USD", { compact: false })}</Heading>
        <Mono style={{ color: nav.withinBand ? theme.colors.pos : theme.colors.neg }}>
          {nav.deviation >= 0 ? "+" : ""}
          {(nav.deviation * 100).toFixed(2)}%
        </Mono>
      </Row>
      <Caption style={{ marginTop: 8 }}>
        {nav.withinBand
          ? `Inside this preset's ${nav.bandBps / 100}% band. Read from Pyth on-chain.`
          : `Outside this preset's ${nav.bandBps / 100}% band.`}
      </Caption>
    </Card>
  );
}

const Page = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(p) => p.theme.colors.bg};
`;

const Nav = styled.View`
  padding-horizontal: ${(p) => p.theme.space(4)}px;
  padding-bottom: ${(p) => p.theme.space(2)}px;
`;

const Back = styled.Pressable`
  width: 36px;
  height: 36px;
  border-radius: 18px;
  background-color: ${(p) => p.theme.colors.surface};
  align-items: center;
  justify-content: center;
`;

const BackMark = styled.Text`
  font-size: 24px;
  line-height: 26px;
  font-weight: 700;
  color: ${(p) => p.theme.colors.text};
`;

const Loading = styled.View`
  padding-horizontal: ${(p) => p.theme.space(4)}px;
  gap: ${(p) => p.theme.space(4)}px;
`;

const Hero = styled.Image`
  width: 100%;
  aspect-ratio: 1;
  border-radius: ${(p) => p.theme.radius.xl}px;
  background-color: ${(p) => p.theme.colors.surfaceAlt};
`;

const HeroEmpty = styled.View`
  width: 100%;
  aspect-ratio: 1;
  border-radius: ${(p) => p.theme.radius.xl}px;
  background-color: ${(p) => p.theme.colors.surface};
  align-items: center;
  justify-content: center;
`;

const Spacer = styled.View`
  height: 8px;
`;

const Side = styled.Text<{ $buy: boolean }>`
  font-size: 13px;
  font-weight: 700;
  text-transform: capitalize;
  width: 38px;
  color: ${(p) => (p.$buy ? p.theme.colors.pos : p.theme.colors.neg)};
`;

const LinkTap = styled.Pressable`
  padding-vertical: ${(p) => p.theme.space(3)}px;
`;

const LinkText = styled.Text`
  font-size: 13px;
  font-weight: 600;
  color: ${(p) => p.theme.colors.focus};
`;

const Actions = styled.View`
  position: absolute;
  left: ${(p) => p.theme.space(4)}px;
  right: ${(p) => p.theme.space(4)}px;
  bottom: 104px;
  flex-direction: row;
  gap: ${(p) => p.theme.space(3)}px;
`;

const GraduatedNote = styled.Text`
  flex: 1;
  font-size: 13px;
  color: ${(p) => p.theme.colors.muted};
  background-color: ${(p) => p.theme.colors.surface};
  padding: ${(p) => p.theme.space(4)}px;
  border-radius: ${(p) => p.theme.radius.md}px;
  text-align: center;
`;
