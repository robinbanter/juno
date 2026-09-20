import { useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card, Delta, Placeholder, Skeleton } from "../../components/ui";
import { juno, type Coin } from "../../lib/api";
import { money, useApi } from "../../lib/useApi";
import { colors, radius, spacing, type } from "../../theme/tokens";

type Sort = "new" | "marketCap" | "graduating";

/**
 * The market list.
 *
 * Every Juno coin, priced, sortable. This is the tab that gives the buy/sell
 * sheet somewhere to be reached from — the sheet itself is per-coin, so a tab
 * that opened straight into it would have nothing to trade.
 *
 * "Graduating" is the sort worth having: it surfaces the pools closest to their
 * migration threshold, which are the ones about to become permanent AMM
 * markets.
 */
export default function TradeScreen() {
  const router = useRouter();
  const [sort, setSort] = useState<Sort>("new");
  const coins = useApi(
    () => juno.coins(sort === "new" ? undefined : sort),
    [sort],
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Trade</Text>
        <View style={styles.sorts}>
          {(
            [
              ["new", "New"],
              ["marketCap", "Top"],
              ["graduating", "Graduating"],
            ] as const
          ).map(([id, label]) => (
            <Pressable
              key={id}
              onPress={() => setSort(id)}
              style={[styles.sortChip, sort === id && styles.sortChipOn]}
            >
              <Text style={[styles.sortLabel, sort === id && styles.sortLabelOn]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {coins.loading ? (
        <View style={styles.list}>
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} style={styles.row}>
              <Skeleton height={48} width={48} />
              <View style={{ flex: 1, gap: 8 }}>
                <Skeleton height={13} width="55%" />
                <Skeleton height={11} width="35%" />
              </View>
            </Card>
          ))}
        </View>
      ) : coins.error ? (
        <Placeholder title="Could not load the market" detail={coins.error} />
      ) : (
        <FlatList
          data={coins.data?.coins ?? []}
          keyExtractor={(coin) => coin.address}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={coins.refreshing} onRefresh={coins.refresh} tintColor={colors.muted} />
          }
          ListEmptyComponent={
            <Placeholder title="No coins yet" detail="Launch one from the Post tab." />
          }
          renderItem={({ item }) => (
            <CoinRow coin={item} onPress={() => router.push(`/coin/${item.address}`)} />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function CoinRow({ coin, onPress }: { coin: Coin; onPress: () => void }) {
  const art = juno.media(coin.media.url);
  const progress = Math.round(coin.curve.progress * 100);

  return (
    <Pressable onPress={onPress}>
      <Card style={styles.row}>
        {art ? (
          <Image source={{ uri: art }} style={styles.art} />
        ) : (
          <View style={[styles.art, { borderWidth: 1, borderColor: colors.line }]} />
        )}

        <View style={styles.facts}>
          <Text style={styles.name} numberOfLines={1}>
            {coin.name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            ${coin.symbol} · {coin.curvePreset}
          </Text>
          {/* Curve progress is the number that governs graduation, so it is
              shown as a share rather than a raw reserve figure. */}
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.min(100, progress)}%` }]} />
          </View>
        </View>

        <View style={styles.numbers}>
          <Text style={styles.cap}>{money(coin.marketCap, coin.marketCapCurrency)}</Text>
          <Delta pct={coin.marketCapChangePct} />
          <Text style={styles.progressLabel}>
            {coin.curve.graduated ? "Graduated" : `${progress}% to grad`}
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.md },
  title: { ...type.title, color: colors.ink },
  sorts: { flexDirection: "row", gap: spacing.sm },
  sortChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  sortChipOn: { backgroundColor: colors.primary },
  sortLabel: { ...type.label, color: colors.muted },
  sortLabelOn: { color: colors.onPrimary },
  list: { paddingHorizontal: spacing.lg, paddingBottom: 120, gap: spacing.md },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  art: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.surfaceSunken },
  facts: { flex: 1, gap: 4 },
  name: { ...type.bodyStrong, color: colors.ink },
  meta: { ...type.caption, color: colors.muted },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.line, overflow: "hidden", marginTop: 4 },
  fill: { height: 4, backgroundColor: colors.pos },
  numbers: { alignItems: "flex-end", gap: 3 },
  cap: { ...type.bodyStrong, color: colors.ink, fontVariant: ["tabular-nums"] },
  progressLabel: { ...type.caption, color: colors.faint },
});
