import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, RefreshControl, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import styled from "styled-components/native";

import { CoinGlyph, Identicon } from "../../components/art";
import { Candles } from "../../components/Candles";
import { Avatar, Body, Button, Caption, Card, ChevronLeft, Col, Delta, Display, ExternalGlyph, Heading, Label, Mono, Pill, Placeholder, Progress, Row, Skeleton, Stat, Title } from "../../components/kit";
import { AlertSheet, PlanSheet, SaveCard, WatchToggle, type SavedState } from "../../components/Save";
import { TradeSheet } from "../../components/TradeSheet";
import { juno, type NavReference, type Plan } from "../../lib/api";
import { useWallet } from "../../lib/wallet";
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
  const [savingsSheet, setSavingsSheet] = useState<"alert" | "plan" | null>(null);
  /**
   * The plan this buy is a contribution to, if any.
   *
   * Held while the trade sheet is open so the fill can be recorded against the
   * right row — and cleared when the sheet closes, so an ordinary buy made
   * straight afterwards is not silently counted towards a savings goal.
   */
  const [contributing, setContributing] = useState<Omit<Plan, "coin"> | null>(null);

  const wallet = useWallet();
  const detail = useApi(() => juno.coin(mint), [mint]);
  const coin = detail.data?.coin;

  /*
   * Watching, alerts and plans for this wallet on this coin.
   *
   * Postgres only — no chain reads — because this decides what a button says
   * and the list endpoints that answer the same questions each hydrate every
   * pool to do it. Held in local state as well as fetched, so a toggle shows
   * immediately instead of after a round trip.
   */
  const savedRead = useApi(
    async () => (wallet.address ? juno.saved(wallet.address, mint) : null),
    [wallet.address, mint],
  );
  const [savedLocal, setSavedLocal] = useState<SavedState | null>(null);
  const [savedError, setSavedError] = useState<string | null>(null);
  useEffect(() => {
    if (!savedRead.data) return;
    setSavedLocal({
      watching: savedRead.data.watching,
      alertPrice: savedRead.data.alertPrice,
      alertSetAtPrice: savedRead.data.alertSetAtPrice,
      plans: savedRead.data.plans,
    });
  }, [savedRead.data]);

  // What this wallet holds of this coin, so the sell sheet can show a real
  // balance instead of a dash. Read from the portfolio rather than a second
  // chain call — it is the same figure, already fetched.
  const portfolio = useApi(
    async () => (wallet.address ? juno.portfolio(wallet.address) : null),
    [wallet.address],
  );
  const holding =
    portfolio.data?.positions.find((position) => position.baseMint === mint)?.balance ?? null;

  /* What a buy would spend from. Read separately because it is the quote side,
     which the portfolio does not cover: it accounts for coins held, not for the
     SOL that buys them. */
  const quoteMint = coin?.quote.mint ?? null;
  const spendable = useApi(
    async () =>
      wallet.address && quoteMint ? juno.balance(wallet.address, quoteMint) : null,
    [wallet.address, quoteMint],
  );

  const art = coin ? juno.still(coin.media) : null;

  return (
    <Page edges={["top"]}>
      <Nav>
        <Back onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
          <ChevronLeft />
        </Back>
        <NavGrow />
        <WatchToggle
          saved={savedLocal}
          wallet={wallet.address}
          baseMint={mint}
          onChange={setSavedLocal}
        />
      </Nav>

      {detail.loading ? (
        /* Shaped like the screen it precedes — identity row, price and chart
           card, stats row, description — rather than one big block over an
           empty screen. A coin read can take fifteen seconds against the
           public endpoint, which is a long time to look at nothing. */
        <Loading>
          <Row gap={12}>
            <Skeleton h={76} w={76} round={22} />
            <Col gap={8} style={{ flex: 1 }}>
              <Skeleton h={22} w="80%" />
              <Skeleton h={14} w="45%" />
            </Col>
          </Row>
          <Skeleton h={300} round={22} />
          <Skeleton h={78} round={22} />
          <Skeleton h={64} round={22} />
        </Loading>
      ) : detail.error || !coin ? (
        <Placeholder
          title="Could not load this coin"
          detail={detail.error ?? undefined}
          action={<Button label="Try again" onPress={detail.refresh} />}
        />
      ) : (
        <>
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140, gap: 12 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={detail.refreshing}
                onRefresh={detail.refresh}
                tintColor={theme.colors.muted}
              />
            }
          >
            {/* Identity first, compact. The old layout opened with a square
                the height of the screen that was usually empty — a coin with no
                artwork got a huge white void where the price should be. */}
            <Row gap={12}>
              {art ? (
                <Thumb source={{ uri: art }} />
              ) : (
                <ThumbEmpty>
                  <CoinGlyph size={56} seed={coin.address} />
                </ThumbEmpty>
              )}
              <Col gap={6} style={{ flex: 1 }}>
                <Title numberOfLines={2}>{coin.name}</Title>
                <Row gap={6}>
                  <Pill label={`$${coin.symbol}`} tone="lime" />
                  <Pill label={coin.curvePreset} />
                  {coin.curve.graduated ? <Pill label="Graduated" tone="pos" /> : null}
                </Row>
              </Col>
            </Row>

            {/* The price, then the chart. This is a trading screen. */}
            <Card>
              <Row justify="space-between" align="flex-end">
                <Col gap={2}>
                  <Caption>Price</Caption>
                  <Display style={{ fontSize: theme.type.screen.size }}>
                    {price(coin.priceUsd, coin.marketCapCurrency)}
                  </Display>
                </Col>
                <Col gap={4} style={{ alignItems: "flex-end" }}>
                  <Delta pct={coin.marketCapChangePct} />
                  <Caption>24h</Caption>
                </Col>
              </Row>

              <Divider />

              <Candles
                ticks={coin.priceHistory}
                partial={coin.priceHistoryPartial === true}
                livePrice={coin.priceUsd}
                format={(v: number) => price(v, coin.marketCapCurrency)}
              />
            </Card>

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
                  value={
                    coin.holders === null ? "—" : String(coin.holders)
                  }
                  label="Holders"
                />
              </Row>
            </Card>

            {coin.description ? (
              <Card>
                <Body muted>{coin.description}</Body>
              </Card>
            ) : null}

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

            <SaveCard
              coin={coin}
              saved={savedLocal}
              wallet={wallet.address}
              error={savedError}
              onEditAlert={() => setSavingsSheet("alert")}
              onNewPlan={() => setSavingsSheet("plan")}
              onContribute={(plan) => {
                setContributing(plan);
                setSheet("buy");
              }}
              onTogglePlan={(plan) => void togglePlan(plan)}
            />

            <Heading style={{ marginTop: 6 }}>Activity</Heading>
            {(detail.data?.activity.length ?? 0) === 0 ? (
              <Card>
                {/* An empty list that was never successfully read is not an
                    empty market. Saying "No trades yet" there is a claim the
                    app did not earn. */}
                <Body muted>
                  {detail.data?.activityPartial
                    ? "Trade history could not be read — the RPC is rate-limiting."
                    : "No trades yet."}
                </Body>
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
              <LinkText>View the pool on Solscan</LinkText>
              <ExternalGlyph />
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
              holding={holding}
              quoteBalance={spendable.data?.balance ?? null}
              initialAmount={sheet === "buy" && contributing ? String(contributing.amount) : ""}
              onFilled={(spent) => void recordFill(spent)}
              onClose={() => {
                setSheet(null);
                setContributing(null);
              }}
              onDone={() => {
                setSheet(null);
                setContributing(null);
                detail.refresh();
              }}
            />
          ) : null}

          <AlertSheet
            visible={savingsSheet === "alert"}
            onClose={() => setSavingsSheet(null)}
            coin={coin}
            wallet={wallet.address}
            saved={savedLocal}
            onSaved={setSavedLocal}
          />
          <PlanSheet
            visible={savingsSheet === "plan"}
            onClose={() => setSavingsSheet(null)}
            coin={coin}
            wallet={wallet.address}
            saved={savedLocal}
            onSaved={setSavedLocal}
          />
        </>
      )}
    </Page>
  );

  /** Pause or resume, optimistically, rolling back if the write is refused. */
  async function togglePlan(plan: Omit<Plan, "coin">) {
    if (!savedLocal) return;
    const next = !plan.active;
    setSavedError(null);
    setSavedLocal({
      ...savedLocal,
      plans: savedLocal.plans.map((row) =>
        row.id === plan.id ? { ...row, active: next, due: next && row.due } : row,
      ),
    });
    try {
      await juno.setPlanActive(plan.id, next);
    } catch (caught) {
      setSavedLocal(savedLocal);
      setSavedError(caught instanceof Error ? caught.message : "That could not be saved");
    }
  }

  /**
   * A buy confirmed on chain; if it was a contribution, write it down.
   *
   * Not optimistic, and deliberately so. Everything else on this card can be
   * rolled back on a failed write; a contribution total is the one figure that
   * is supposed to mean *this actually happened*, so it moves only once the
   * server has agreed, and the row it returns is what replaces the local one.
   */
  async function recordFill(spent: number) {
    const plan = contributing;
    if (!plan || spent <= 0) return;
    setSavedError(null);
    try {
      const { plan: fresh } = await juno.recordContribution(plan.id, spent);
      setSavedLocal((current) =>
        current === null
          ? current
          : {
              ...current,
              plans: current.plans.map((row) => (row.id === fresh.id ? { ...row, ...fresh } : row)),
            },
      );
    } catch (caught) {
      // The swap landed either way — this only failed to be *recorded*, and
      // saying so is better than a progress bar that quietly did not move.
      setSavedError(
        caught instanceof Error
          ? `The buy went through, but it was not recorded against your plan: ${caught.message}`
          : "The buy went through, but it was not recorded against your plan.",
      );
    }
  }
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
  flex-direction: row;
  align-items: center;
  padding-horizontal: ${(p) => p.theme.space(4)}px;
  padding-bottom: ${(p) => p.theme.space(2)}px;
`;

const NavGrow = styled.View`
  flex: 1;
`;

const Back = styled.Pressable`
  width: 36px;
  height: 36px;
  border-radius: 18px;
  background-color: ${(p) => p.theme.colors.surface};
  align-items: center;
  justify-content: center;
`;


const Loading = styled.View`
  padding-horizontal: ${(p) => p.theme.space(4)}px;
  gap: ${(p) => p.theme.space(4)}px;
`;

const Thumb = styled.Image`
  width: 76px;
  height: 76px;
  border-radius: ${(p) => p.theme.radius.lg}px;
  background-color: ${(p) => p.theme.colors.surfaceAlt};
`;

const ThumbEmpty = styled.View`
  width: 76px;
  height: 76px;
  border-radius: ${(p) => p.theme.radius.lg}px;
  background-color: ${(p) => p.theme.colors.surface};
  align-items: center;
  justify-content: center;
`;

const Divider = styled.View`
  height: 1px;
  background-color: ${(p) => p.theme.colors.line};
  margin-vertical: ${(p) => p.theme.space(3)}px;
`;

/**
 * Prices on a bonding curve start far below a cent, so a two-decimal format
 * collapses them all to zero. Significant digits are what make an early curve
 * readable at all.
 */
function price(value: number, currency: string): string {
  if (!Number.isFinite(value)) return "—";
  if (value >= 0.01) return money(value, currency, { compact: false });
  const figure = value.toPrecision(3);
  return currency === "USD" ? `$${figure}` : `${figure} ${currency}`;
}

const Spacer = styled.View`
  height: 8px;
`;

const Side = styled.Text<{ $buy: boolean }>`
  font-size: ${(p) => p.theme.type.label.size}px;
  font-weight: 700;
  text-transform: capitalize;
  width: 38px;
  color: ${(p) => (p.$buy ? p.theme.colors.pos : p.theme.colors.neg)};
`;

const LinkTap = styled.Pressable`
  padding-vertical: ${(p) => p.theme.space(3)}px;
`;

const LinkText = styled.Text`
  font-size: ${(p) => p.theme.type.label.size}px;
  font-weight: 600;
  color: ${(p) => p.theme.colors.focus};
`;

/*
 * The sticky trade bar.
 *
 * Full-bleed with its own surface rather than two floating pills: floating,
 * whatever card happened to be scrolled underneath showed through between and
 * around them, which read as a rendering fault rather than as a layer.
 */
/**
 * Buy and Sell, pinned to the bottom of the screen.
 *
 * `bottom` was 86px, which is the height of the tab bar — but this route is
 * pushed on top of the tabs and has no tab bar under it. The result was an
 * 86px strip below the action bar where the page's own scrolling content
 * showed through, so the bar read as floating over a half-drawn screen rather
 * than sitting on the edge of it.
 */
const Actions = styled.View`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  flex-direction: row;
  gap: ${(p) => p.theme.space(3)}px;
  padding-horizontal: ${(p) => p.theme.space(4)}px;
  padding-top: ${(p) => p.theme.space(3)}px;
  /* Clear of the home indicator. */
  padding-bottom: ${(p) => p.theme.space(7)}px;
  background-color: ${(p) => p.theme.colors.bg};
  border-top-width: 1px;
  border-top-color: ${(p) => p.theme.colors.line};
`;

const GraduatedNote = styled.Text`
  flex: 1;
  font-size: ${(p) => p.theme.type.label.size}px;
  color: ${(p) => p.theme.colors.muted};
  background-color: ${(p) => p.theme.colors.surface};
  padding: ${(p) => p.theme.space(4)}px;
  border-radius: ${(p) => p.theme.radius.md}px;
  text-align: center;
`;
