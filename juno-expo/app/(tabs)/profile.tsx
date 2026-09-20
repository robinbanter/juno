import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { PortfolioArt } from "../../components/art";
import { Button, Card, Delta, Placeholder, Pill, Skeleton } from "../../components/ui";
import { juno } from "../../lib/api";
import { money, tokens, useApi } from "../../lib/useApi";
import { useWallet } from "../../lib/wallet";
import { colors, radius, spacing, type } from "../../theme/tokens";

/**
 * Portfolio.
 *
 * Holdings are read from chain. Cost is not on-chain anywhere, so it is derived
 * from this wallet's own decoded trades — which means a position acquired some
 * other way has a balance but no cost, and is shown with a dash rather than a
 * fabricated zero. A zero cost would imply the entire holding is profit.
 */
export default function ProfileScreen() {
  const wallet = useWallet();
  const router = useRouter();
  const portfolio = useApi(
    async () => (wallet.address ? juno.portfolio(wallet.address) : null),
    [wallet.address],
  );

  if (!wallet.ready) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <View style={styles.body}>
          <Skeleton height={120} />
        </View>
      </SafeAreaView>
    );
  }

  if (!wallet.address) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <Placeholder
          title="No wallet yet"
          detail="Create one to trade and to launch your own coins. It takes no sign-up."
          action={<Button label="Create wallet" onPress={() => wallet.connect().then(portfolio.refresh)} />}
        />
      </SafeAreaView>
    );
  }

  const data = portfolio.data;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={portfolio.refreshing} onRefresh={portfolio.refresh} tintColor={colors.muted} />
        }
      >
        <Text style={styles.title}>Portfolio</Text>

        <Card style={styles.hero}>
          <PortfolioArt size={130} />
          <Text style={styles.heroLabel}>Total value</Text>
          {portfolio.loading ? (
            <Skeleton height={38} width="60%" />
          ) : (
            <Text style={styles.heroValue}>
              {money(data?.totalValue ?? 0, data?.currency === "mixed" ? "USD" : (data?.currency ?? "USD"), {
                compact: false,
              })}
            </Text>
          )}
          <Delta pct={data?.totalPnlPct ?? null} style={styles.heroDelta} />

          {/* A partial read means some pool's history could not be fully
              walked, so the cost figures are incomplete. Saying so beats
              presenting a short basis as final. */}
          {data?.partial && (
            <Text style={styles.caveat}>
              Some trade history could not be read, so cost figures may be incomplete.
            </Text>
          )}
        </Card>

        <View style={styles.walletRow}>
          <Text style={styles.walletLabel}>Wallet</Text>
          <Text style={styles.walletValue} numberOfLines={1}>
            {wallet.address.slice(0, 4)}…{wallet.address.slice(-4)}
          </Text>
          <Pill label={wallet.mode === "local" ? "Device key · devnet" : "Embedded"} />
        </View>

        <Text style={styles.sectionTitle}>Holdings</Text>

        {portfolio.loading ? (
          <Card><Skeleton height={16} width="70%" /></Card>
        ) : portfolio.error ? (
          <Card><Text style={styles.error}>{portfolio.error}</Text></Card>
        ) : (data?.positions.length ?? 0) === 0 ? (
          <Card>
            <Text style={styles.empty}>
              Nothing held yet. Buy a coin from the Trade tab and it shows up here.
            </Text>
          </Card>
        ) : (
          data!.positions.map((position) => (
            <Card key={position.baseMint} style={styles.position}>
              <View style={styles.positionTop}>
                <Text style={styles.positionName} numberOfLines={1}>
                  {position.name}
                </Text>
                <Text style={styles.positionValue}>
                  {money(position.value, position.currency)}
                </Text>
              </View>
              <View style={styles.positionBottom}>
                <Text style={styles.positionMeta}>
                  {tokens(position.balance)} ${position.symbol}
                </Text>
                <Delta pct={position.unrealisedPnlPct} />
              </View>
              <Text style={styles.positionCost}>
                {position.averageCost === null
                  ? "No recorded cost for this holding"
                  : `Avg cost ${money(position.averageCost, position.currency, { compact: false })}`}
              </Text>
            </Card>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: spacing.lg, paddingBottom: 120, gap: spacing.md },
  title: { ...type.title, color: colors.ink },
  hero: { alignItems: "center", gap: spacing.xs, paddingVertical: spacing.xl },
  heroLabel: { ...type.label, color: colors.muted },
  heroValue: { ...type.display, color: colors.ink },
  heroDelta: { marginTop: 2 },
  caveat: { ...type.caption, color: colors.faint, textAlign: "center", marginTop: spacing.sm, paddingHorizontal: spacing.lg },
  walletRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.xs },
  walletLabel: { ...type.label, color: colors.muted },
  walletValue: { ...type.bodyStrong, color: colors.ink, flex: 1 },
  sectionTitle: { ...type.heading, color: colors.ink, marginTop: spacing.sm },
  position: { gap: 6 },
  positionTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md },
  positionName: { ...type.bodyStrong, color: colors.ink, flex: 1 },
  positionValue: { ...type.bodyStrong, color: colors.ink, fontVariant: ["tabular-nums"] },
  positionBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  positionMeta: { ...type.label, color: colors.muted, fontVariant: ["tabular-nums"] },
  positionCost: { ...type.caption, color: colors.faint },
  empty: { ...type.body, color: colors.muted, lineHeight: 21 },
  error: { ...type.body, color: colors.neg },
});
