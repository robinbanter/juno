import { useState } from "react";
import { RefreshControl, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import styled from "styled-components/native";

import { PortfolioArt } from "../../components/art";
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
  Skeleton,
  Stat,
  Tabs,
  Title,
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
 * Portfolio.
 *
 * Holdings are read from chain. Cost is not on-chain anywhere, so it is derived
 * from this wallet's own decoded trades — which means a position acquired some
 * other way has a balance but no cost, and shows a dash rather than a
 * fabricated zero. A zero cost would imply the whole holding is profit.
 */
export default function ProfileScreen() {
  const wallet = useWallet();
  const [tab, setTab] = useState<Tab>("holdings");
  const portfolio = useApi(
    async () => (wallet.address ? juno.portfolio(wallet.address) : null),
    [wallet.address],
  );

  if (!wallet.ready) {
    return (
      <Page edges={["top"]}>
        <Body style={{ padding: 16 }}>
          <Skeleton h={140} />
        </Body>
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
            <Button
              label="Create wallet"
              onPress={() => wallet.connect().then(portfolio.refresh)}
            />
          }
        />
      </Page>
    );
  }

  const data = portfolio.data;
  const currency = data?.currency === "mixed" ? "USD" : (data?.currency ?? "USD");

  return (
    <Page edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 130, gap: 12 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={portfolio.refreshing}
            onRefresh={portfolio.refresh}
            tintColor={theme.colors.muted}
          />
        }
      >
        {/* The hero, taken from the portfolio reference: one big value, a
            signed badge under it, and a 3D object rather than a chart — a chart
            would imply a performance history a new wallet has not got. */}
        <Hero>
          <PortfolioArt size={116} />
          <Caption>Total value</Caption>
          {portfolio.loading ? (
            <Skeleton h={40} w="60%" />
          ) : (
            <Display>{money(data?.totalValue ?? 0, currency, { compact: false })}</Display>
          )}
          <DeltaBadge pct={data?.totalPnlPct ?? null} />

          <Row gap={0} style={{ marginTop: 18, alignSelf: "stretch" }}>
            <Stat
              value={String(data?.positions.length ?? 0)}
              label="Positions"
            />
            <Stat
              value={
                data?.totalPnl === null || data?.totalPnl === undefined
                  ? "—"
                  : money(data.totalPnl, currency)
              }
              label="P&L"
              tone={
                data?.totalPnl === null || data?.totalPnl === undefined
                  ? undefined
                  : data.totalPnl >= 0
                    ? "pos"
                    : "neg"
              }
            />
            <Stat
              value={`${wallet.address.slice(0, 4)}…${wallet.address.slice(-4)}`}
              label="Wallet"
            />
          </Row>
        </Hero>

        <Row gap={8}>
          <Pill label={wallet.mode === "local" ? "Device key · devnet" : "Embedded wallet"} />
          {data?.partial ? <Pill label="Partial read" tone="neg" /> : null}
        </Row>

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
          ) : (data?.positions.length ?? 0) === 0 ? (
            <Card>
              <Body muted>
                Nothing held yet. Buy a coin from the Trade tab and it shows up here.
              </Body>
            </Card>
          ) : (
            data!.positions.map((position) => (
              <Card key={position.baseMint}>
                <Row justify="space-between" gap={12}>
                  <Heading numberOfLines={1} style={{ fontSize: 16, flex: 1 }}>
                    {position.name}
                  </Heading>
                  <Mono style={{ fontSize: 15 }}>
                    {money(position.value, position.currency)}
                  </Mono>
                </Row>
                <Row justify="space-between" style={{ marginTop: 6 }}>
                  <Mono muted>
                    {tokens(position.balance)} ${position.symbol}
                  </Mono>
                  <Delta pct={position.unrealisedPnlPct} />
                </Row>
                <Caption style={{ marginTop: 6 }}>
                  {position.averageCost === null
                    ? "No recorded cost for this holding"
                    : `Avg cost ${money(position.averageCost, position.currency, { compact: false })}`}
                </Caption>
              </Card>
            ))
          )
        ) : tab === "activity" ? (
          <Card>
            <Body muted>
              Your trades appear on each coin&rsquo;s page, and in the Social feed.
            </Body>
          </Card>
        ) : (
          <Card>
            <Body muted>
              This wallet lives in the device keychain and signs on-device. It is
              a devnet key and is not recoverable — Juno never sees it.
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

const Hero = styled.View`
  background-color: ${(p) => p.theme.colors.surface};
  border-radius: ${(p) => p.theme.radius.xl}px;
  padding-vertical: ${(p) => p.theme.space(6)}px;
  padding-horizontal: ${(p) => p.theme.space(4)}px;
  align-items: center;
  gap: ${(p) => p.theme.space(1)}px;
`;
