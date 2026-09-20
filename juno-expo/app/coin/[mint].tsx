import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  Image,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CoinGlyph } from "../../components/art";
import { Button, Card, Delta, Pill, Placeholder, Skeleton, Stat } from "../../components/ui";
import { TradeSheet } from "../../components/TradeSheet";
import { juno, type NavReference } from "../../lib/api";
import { money, since, tokens, useApi } from "../../lib/useApi";
import { colors, radius, spacing, type } from "../../theme/tokens";

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
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.nav}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
      </View>

      {detail.loading ? (
        <View style={styles.body}>
          <Skeleton height={220} />
          <Skeleton height={18} width="60%" style={{ marginTop: spacing.lg }} />
        </View>
      ) : detail.error || !coin ? (
        <Placeholder title="Could not load this coin" detail={detail.error ?? undefined} />
      ) : (
        <>
          <ScrollView
            contentContainerStyle={styles.body}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={detail.refreshing} onRefresh={detail.refresh} tintColor={colors.muted} />
            }
          >
            {juno.media(coin.media.url) ? (
              <Image source={{ uri: juno.media(coin.media.url)! }} style={styles.hero} />
            ) : (
              <View style={styles.heroEmpty}>
                <CoinGlyph size={92} seed={coin.address} />
              </View>
            )}

            <View style={styles.heading}>
              <Text style={styles.name}>{coin.name}</Text>
              <View style={styles.headingRow}>
                <Pill label={`$${coin.symbol}`} tone="primary" />
                <Pill label={coin.curvePreset} />
                {coin.curve.graduated && <Pill label="Graduated" tone="pos" />}
              </View>
              {coin.description ? <Text style={styles.description}>{coin.description}</Text> : null}
            </View>

            <Card style={styles.stats}>
              <Stat
                label="Market cap"
                value={money(coin.marketCap, coin.marketCapCurrency)}
              />
              <Stat label="24h" value={<Delta pct={coin.marketCapChangePct} />} />
              <Stat
                label="24h volume"
                value={money(coin.volume24h, coin.marketCapCurrency)}
              />
            </Card>

            {/* Curve progress governs graduation, so it is shown as the share
                of the migration threshold rather than a raw reserve. */}
            {!coin.curve.graduated && (
              <Card style={styles.curve}>
                <View style={styles.curveHead}>
                  <Text style={styles.curveLabel}>Curve progress</Text>
                  <Text style={styles.curvePct}>
                    {(coin.curve.progress * 100).toFixed(2)}%
                  </Text>
                </View>
                <View style={styles.track}>
                  <View
                    style={[styles.fill, { width: `${Math.min(100, coin.curve.progress * 100)}%` }]}
                  />
                </View>
                <Text style={styles.curveFoot}>
                  {money(coin.curve.raisedUsd, coin.marketCapCurrency)} of{" "}
                  {money(coin.curve.thresholdUsd, coin.marketCapCurrency)} to graduate into a
                  DAMM v2 pool
                </Text>
              </Card>
            )}

            {coin.nav && <NavBand nav={coin.nav} />}

            <Text style={styles.sectionTitle}>Activity</Text>
            {(detail.data?.activity.length ?? 0) === 0 ? (
              <Card>
                <Text style={styles.empty}>No trades yet.</Text>
              </Card>
            ) : (
              detail.data!.activity.slice(0, 12).map((row) => (
                <Card key={row.id} style={styles.activity}>
                  <Image source={{ uri: row.actor.avatarUrl }} style={styles.activityAvatar} />
                  <Text style={styles.activityHandle} numberOfLines={1}>
                    {row.actor.handle}
                  </Text>
                  <Text
                    style={[
                      styles.activitySide,
                      { color: row.side === "buy" ? colors.pos : colors.neg },
                    ]}
                  >
                    {row.side}
                  </Text>
                  <Text style={styles.activityAmount}>{tokens(row.amount)}</Text>
                  <Text style={styles.activityWhen}>{since(row.timestamp)}</Text>
                </Card>
              ))
            )}

            <Pressable
              onPress={() => Linking.openURL(juno.explorer("account", coin.pool))}
              style={styles.proof}
            >
              <Text style={styles.proofText}>View the pool on Solscan ↗</Text>
            </Pressable>
          </ScrollView>

          <View style={styles.actions}>
            {coin.curve.graduated ? (
              <Text style={styles.graduatedNote}>
                This curve has graduated. Trading continues in its DAMM v2 pool.
              </Text>
            ) : (
              <>
                <Button label="Buy" variant="buy" onPress={() => setSheet("buy")} style={{ flex: 1 }} />
                <Button label="Sell" variant="sell" onPress={() => setSheet("sell")} style={{ flex: 1 }} />
              </>
            )}
          </View>

          {sheet && (
            <TradeSheet
              coin={coin}
              side={sheet}
              onClose={() => setSheet(null)}
              onDone={() => {
                setSheet(null);
                detail.refresh();
              }}
            />
          )}
        </>
      )}
    </SafeAreaView>
  );
}

/**
 * Where the curve sits against the underlying.
 *
 * Three states, kept distinct because conflating them is the whole problem. An
 * equity feed outside exchange hours is showing Friday's close — that is normal
 * and is labelled as such, not dressed up as a live price.
 */
function NavBand({ nav }: { nav: NavReference }) {
  const label = /^Equity\.[A-Z]+\.([A-Z.]+)\/USD$/.exec(nav.feed)?.[1] ?? nav.feed.slice(0, 8);
  const state =
    nav.state === "live" ? "Live" : nav.state === "closed" ? "Market closed · last close" : "Stale";

  return (
    <Card style={styles.nav_}>
      <View style={styles.navHead}>
        <Text style={styles.navTitle}>{label} reference</Text>
        <Text
          style={[
            styles.navState,
            { color: nav.state === "live" ? colors.pos : nav.state === "stale" ? colors.neg : colors.muted },
          ]}
        >
          {state}
        </Text>
      </View>
      <View style={styles.navRow}>
        <Text style={styles.navPrice}>{money(nav.priceUsd, "USD", { compact: false })}</Text>
        <Text style={[styles.navDev, { color: nav.withinBand ? colors.pos : colors.neg }]}>
          {nav.deviation >= 0 ? "+" : ""}
          {(nav.deviation * 100).toFixed(2)}%
        </Text>
      </View>
      <Text style={styles.navFoot}>
        {nav.withinBand
          ? `Inside this preset's ${nav.bandBps / 100}% band. Read from Pyth on-chain.`
          : `Outside this preset's ${nav.bandBps / 100}% band.`}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  nav: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  back: { ...type.bodyStrong, color: colors.ink },
  body: { paddingHorizontal: spacing.lg, paddingBottom: 150, gap: spacing.md },
  hero: { width: "100%", aspectRatio: 1, borderRadius: radius.lg, backgroundColor: colors.surfaceSunken },
  heroEmpty: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  heading: { gap: spacing.sm },
  name: { ...type.title, color: colors.ink },
  headingRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  description: { ...type.body, color: colors.muted, lineHeight: 21 },
  stats: { flexDirection: "row", gap: spacing.md },
  curve: { gap: spacing.sm },
  curveHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  curveLabel: { ...type.label, color: colors.muted },
  curvePct: { ...type.bodyStrong, color: colors.ink, fontVariant: ["tabular-nums"] },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.line, overflow: "hidden" },
  fill: { height: 6, backgroundColor: colors.pos },
  curveFoot: { ...type.caption, color: colors.faint, lineHeight: 16 },
  nav_: { gap: spacing.sm },
  navHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  navTitle: { ...type.bodyStrong, color: colors.ink },
  navState: { ...type.caption },
  navRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  navPrice: { ...type.heading, color: colors.ink, fontVariant: ["tabular-nums"] },
  navDev: { ...type.bodyStrong, fontVariant: ["tabular-nums"] },
  navFoot: { ...type.caption, color: colors.faint, lineHeight: 16 },
  sectionTitle: { ...type.heading, color: colors.ink, marginTop: spacing.sm },
  activity: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md },
  activityAvatar: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.surfaceSunken },
  activityHandle: { ...type.label, color: colors.ink, width: 86 },
  activitySide: { ...type.label, textTransform: "capitalize", width: 40 },
  activityAmount: { ...type.label, color: colors.muted, flex: 1, textAlign: "right", fontVariant: ["tabular-nums"] },
  activityWhen: { ...type.caption, color: colors.faint, width: 34, textAlign: "right" },
  empty: { ...type.body, color: colors.muted },
  proof: { paddingVertical: spacing.md },
  proofText: { ...type.label, color: colors.focus },
  actions: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: 100,
    flexDirection: "row",
    gap: spacing.md,
  },
  graduatedNote: {
    ...type.label,
    color: colors.muted,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.md,
    flex: 1,
    textAlign: "center",
  },
});
