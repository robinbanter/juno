import { useMemo, useState } from "react";
import { RefreshControl, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import styled from "styled-components/native";

import { AreaChart, RANGES, withinRange, type Range } from "../../components/AreaChart";
import { Identicon } from "../../components/art";
import {
  Body,
  Button,
  Caption,
  Card,
  Col,
  Delta,
  DeltaBadge,
  Display,
  Heading,
  Label,
  Mono,
  Pill,
  Placeholder,
  Row,
  Segmented,
  Skeleton,
  Stat,
  Tabs,
} from "../../components/kit";
import { juno } from "../../lib/api";
import { money, tokens, useApi } from "../../lib/useApi";
import { useWallet } from "../../lib/wallet";
import { theme } from "../../theme";

type Tab = "holdings" | "activity" | "about";

const TABS = [
  { id: "holdings" as const, label: "Holdings" },
  { id: "activity" as const, label: "Activity" },
  { id: "about" as const, label: "About" },
];

/**
 * Profile and portfolio.
 *
 * Holdings come from chain. Cost does not exist on-chain, so it is derived from
 * this wallet's own decoded trades — which means a position acquired any other
 * way has a balance but no cost, and shows a dash rather than a fabricated
 * zero. A zero cost would imply the whole holding is profit.
 *
 * The value chart is reconstructed the same way: every balance change is a
 * trade, every price is the trade that set it. A point per trade rather than
 * per interval, because no price was observed in between and smoothing across
 * that gap would draw a line through numbers nobody paid.
 */
export default function ProfileScreen() {
  const wallet = useWallet();
  const [tab, setTab] = useState<Tab>("holdings");
  const [range, setRange] = useState<Range>("ALL");

  const portfolio = useApi(
    async () => (wallet.address ? juno.portfolio(wallet.address) : null),
    [wallet.address],
  );

  const data = portfolio.data;
  const currency = data?.currency === "mixed" ? "USD" : (data?.currency ?? "USD");

  /*
   * P&L, or null when there is nothing to stand behind.
   *
   * `totalPnl` is already null when a holding has no recorded cost. The case
   * it does not cover is a partial walk that found no positions at all: the
   * sum over an empty list is zero, and zero here reads as "you are flat"
   * rather than "we did not finish looking".
   */
  const pnl =
    !data || data.totalPnl === null || (data.partial && data.positions.length === 0)
      ? null
      : data.totalPnl;

  const series = useMemo(
    () => withinRange(data?.history ?? [], range),
    [data?.history, range],
  );

  const volumes = useMemo(() => {
    if (!data) return [];
    const byTime = new Map<string, number>();
    for (const position of data.positions) {
      for (const trade of position.trades) {
        byTime.set(trade.t, (byTime.get(trade.t) ?? 0) + trade.base * trade.price);
      }
    }
    return series.map((point) => byTime.get(point.t) ?? 0);
  }, [data, series]);

  if (!wallet.ready) {
    return (
      <Page edges={["top"]}>
        <Padded>
          <Skeleton h={160} round={26} />
        </Padded>
      </Page>
    );
  }

  if (!wallet.address) {
    return (
      <Page edges={["top"]}>
        <Placeholder
          title="No wallet yet"
          detail="Create one to trade and to launch your own coins. No sign-up."
          action={
            <Button label="Create wallet" onPress={() => wallet.connect().then(portfolio.refresh)} />
          }
        />
      </Page>
    );
  }

  const short = `${wallet.address.slice(0, 4)}…${wallet.address.slice(-4)}`;

  return (
    <Page edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 130, gap: 14 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={portfolio.refreshing}
            onRefresh={portfolio.refresh}
            tintColor={theme.colors.muted}
          />
        }
      >
        {/* Identity, as in the profile reference: avatar, handle, address. */}
        <Identity>
          <Identicon seed={wallet.address} size={72} />
          <Heading>{short}</Heading>
          <Caption>{wallet.mode === "local" ? "Device key · devnet" : "Embedded wallet"}</Caption>
        </Identity>

        {/* Three-up stats, the reference's Trackers / PnL / WR row — but the
            three figures this app can actually stand behind.

            Three states, not two. `data` undefined is a read that failed.
            `data.partial` with nothing found is a read that did not finish
            looking — and "0 Positions, 0 Trades, $0" beside a badge admitting
            some history could not be read is the screen contradicting itself.
            Only a complete read of an empty wallet earns a zero. */}
        <Card>
          <Row>
            <Stat value={counted(data?.positions.length, data?.partial)} label="Positions" />
            <Stat
              value={pnl === null ? "—" : money(pnl, currency)}
              // Zero is neither a gain nor a loss, and it was rendering green.
              tone={pnl === null || pnl === 0 ? undefined : pnl > 0 ? "pos" : "neg"}
              label="P&L"
            />
            <Stat value={counted(data?.history.length, data?.partial)} label="Trades" />
          </Row>
        </Card>

        {/* Portfolio, per the portfolio reference: one big value, a signed
            badge, a time range, then the chart. */}
        <Card>
          <Centered>
            <Caption>Portfolio</Caption>
            {portfolio.loading ? (
              <Skeleton h={42} w="60%" />
            ) : (
              // A wallet holding nothing really is worth $0 and should say so.
              // A wallet whose pools could not all be read is not, and must not.
              <Display>
                {data && !(data.partial && data.positions.length === 0)
                  ? money(data.totalValue, currency, { compact: false })
                  : "—"}
              </Display>
            )}
            <DeltaBadge pct={data?.totalPnlPct ?? null} />
          </Centered>

          <RangeRow>
            <Segmented items={RANGES} value={range} onChange={setRange} />
          </RangeRow>

          <AreaChart
            points={series}
            bars={volumes}
            format={(v) => money(v, currency, { compact: true })}
            emptyLabel={
              data?.partial
                ? "Some pools would not load — history unknown."
                : undefined
            }
          />
        </Card>

        {data?.partial ? (
          <Pill
            label={
              data.positions.length === 0
                ? "Some pools could not be read — holdings unknown"
                : "Some pools could not be read — this may not be everything"
            }
            tone="neg"
          />
        ) : null}

        <Tabs items={TABS} value={tab} onChange={setTab} />

        {tab === "holdings" ? (
          portfolio.loading ? (
            <Card>
              <Skeleton h={16} w="70%" />
            </Card>
          ) : portfolio.error ? (
            <Card>
              <Body style={{ color: theme.colors.neg }}>{portfolio.error}</Body>
            </Card>
          ) : !data ? (
            <Card>
              <Body muted>Holdings could not be read.</Body>
            </Card>
          ) : data.positions.length === 0 ? (
            <Card>
              <Body muted>
                {data.partial
                  ? "Some pools would not load, so whether this wallet holds anything is unknown. Pull to retry."
                  : "Nothing held yet. Buy a coin from the Trade tab and it shows up here."}
              </Body>
            </Card>
          ) : (
            data!.positions.map((position) => (
              <Card key={position.baseMint}>
                <Row gap={12}>
                  <Identicon seed={position.baseMint} size={38} />
                  <Col gap={3} style={{ flex: 1 }}>
                    <Label style={{ fontWeight: "700" }} numberOfLines={1}>
                      {position.name}
                    </Label>
                    <Caption>
                      {tokens(position.balance)} ${position.symbol}
                    </Caption>
                  </Col>
                  <Col gap={3} style={{ alignItems: "flex-end" }}>
                    <Mono>{money(position.value, position.currency)}</Mono>
                    <Delta pct={position.unrealisedPnlPct} />
                  </Col>
                </Row>
                <Caption style={{ marginTop: 8 }}>
                  {position.averageCost === null
                    ? "No recorded cost for this holding"
                    : `Avg cost ${money(position.averageCost, position.currency, { compact: false })}`}
                </Caption>
              </Card>
            ))
          )
        ) : tab === "activity" ? (
          (data?.positions ?? []).flatMap((p) =>
            p.trades.map((t) => ({ ...t, name: p.name, symbol: p.symbol, currency: p.currency })),
          ).length === 0 ? (
            <Card>
              <Body muted>No trades yet.</Body>
            </Card>
          ) : (
            (data?.positions ?? [])
              .flatMap((p) =>
                p.trades.map((t) => ({ ...t, name: p.name, symbol: p.symbol, currency: p.currency })),
              )
              .sort((a, b) => Date.parse(b.t) - Date.parse(a.t))
              .slice(0, 20)
              .map((trade, i) => (
                <Card key={`${trade.t}-${i}`}>
                  <Row gap={10}>
                    <Side $buy={trade.side === "buy"}>{trade.side}</Side>
                    <Label numberOfLines={1} style={{ flex: 1 }}>
                      {trade.name}
                    </Label>
                    <Mono muted>{tokens(trade.base)}</Mono>
                  </Row>
                  <Caption style={{ marginTop: 6 }}>
                    at {money(trade.price, trade.currency, { compact: false })} ·{" "}
                    {new Date(trade.t).toLocaleString()}
                  </Caption>
                </Card>
              ))
          )
        ) : (
          <Card>
            <Body muted>
              This wallet lives in the device keychain and signs on-device. It is a
              devnet key and is not recoverable — Juno never sees it.
            </Body>
          </Card>
        )}
      </ScrollView>
    </Page>
  );
}

const Page = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(p) => p.theme.colors.bg};
`;

const Padded = styled.View`
  padding: ${(p) => p.theme.space(4)}px;
`;

const Identity = styled.View`
  align-items: center;
  gap: 6px;
  padding-top: ${(p) => p.theme.space(2)}px;
`;

const Centered = styled.View`
  align-items: center;
  gap: ${(p) => p.theme.space(1)}px;
`;

const RangeRow = styled.View`
  align-items: center;
  margin-vertical: ${(p) => p.theme.space(3)}px;
`;

const Side = styled.Text<{ $buy: boolean }>`
  font-size: 13px;
  font-weight: 700;
  text-transform: capitalize;
  width: 38px;
  color: ${(p) => (p.$buy ? p.theme.colors.pos : p.theme.colors.neg)};
`;

/**
 * A count, or a dash when nobody finished counting.
 *
 * Undefined is a read that failed outright. Zero from a *partial* read is the
 * subtler case and the one that shipped: the walk stopped early and found
 * nothing, which is not the same as there being nothing. A non-zero count from
 * a partial read is still a real count of real positions — a floor, and the
 * badge under this row says so.
 */
function counted(value: number | undefined, partial: boolean | undefined): string {
  if (value === undefined) return "—";
  if (value === 0 && partial) return "—";
  return String(value);
}
