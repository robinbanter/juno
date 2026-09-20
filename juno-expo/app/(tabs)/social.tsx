import { useRouter } from "expo-router";
import { FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card, Delta, Pill, Placeholder, Skeleton } from "../../components/ui";
import { juno, type FeedItem } from "../../lib/api";
import { money, since, tokens, useApi } from "../../lib/useApi";
import { colors, radius, spacing, type } from "../../theme/tokens";

/**
 * The social feed: real trades and creator posts, interleaved.
 *
 * The two kinds of item have opposite natures and the screen does not pretend
 * otherwise. A trade is a fact about the chain — it carries a signature and can
 * be checked by anyone. A post is something a person wrote. Mixing them is what
 * makes this a social app rather than a block explorer, but a reader can always
 * tell which is which.
 */
export default function SocialScreen() {
  const router = useRouter();
  const feed = useApi(() => juno.feed(40), []);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.wordmark}>juno</Text>
        <Text style={styles.subtitle}>Every post is a market</Text>
      </View>

      {feed.loading ? (
        <View style={styles.list}>
          {[0, 1, 2].map((i) => (
            <Card key={i} style={styles.item}>
              <Skeleton height={14} width="45%" />
              <Skeleton height={12} width="90%" style={{ marginTop: spacing.md }} />
              <Skeleton height={12} width="70%" style={{ marginTop: spacing.sm }} />
            </Card>
          ))}
        </View>
      ) : feed.error ? (
        <Placeholder
          title="Could not load the feed"
          detail={feed.error}
        />
      ) : (
        <FlatList
          data={feed.data?.items ?? []}
          keyExtractor={(item) => `${item.kind}:${item.id}`}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={feed.refreshing} onRefresh={feed.refresh} tintColor={colors.muted} />
          }
          ListEmptyComponent={
            <Placeholder
              title="Nothing here yet"
              detail="Trades and posts will appear as they happen."
            />
          }
          renderItem={({ item }) => (
            <FeedRow
              item={item}
              onOpenCoin={(mint) => router.push(`/coin/${mint}`)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function FeedRow({
  item,
  onOpenCoin,
}: {
  item: FeedItem;
  onOpenCoin: (mint: string) => void;
}) {
  if (item.kind === "trade") {
    const buying = item.side === "buy";
    return (
      <Pressable onPress={() => onOpenCoin(item.coin.address)}>
        <Card style={styles.item}>
          <View style={styles.row}>
            <Image source={{ uri: item.actor.avatarUrl }} style={styles.avatar} />
            <Text style={styles.handle} numberOfLines={1}>
              {item.actor.handle}
            </Text>
            <Text style={styles.verb}>{buying ? "bought" : "sold"}</Text>
            <Text style={styles.ticker} numberOfLines={1}>
              ${item.coin.symbol || item.coin.name}
            </Text>
            <View style={{ flex: 1 }} />
            <Text style={styles.when}>{since(item.timestamp)}</Text>
          </View>

          <View style={styles.tradeBody}>
            {juno.media(item.coin.mediaUrl) ? (
              <Image
                source={{ uri: juno.media(item.coin.mediaUrl)! }}
                style={styles.thumb}
              />
            ) : (
              <View style={[styles.thumb, styles.thumbEmpty]} />
            )}

            <View style={styles.tradeFacts}>
              <Text style={styles.coinName} numberOfLines={1}>
                {item.coin.name}
              </Text>
              <Text style={styles.tradeSize}>
                {tokens(item.amount)} for {money(item.valueUsd)}
              </Text>
              <Pill label={buying ? "Buy" : "Sell"} tone={buying ? "pos" : "neg"} />
            </View>
          </View>
        </Card>
      </Pressable>
    );
  }

  return (
    <Card style={styles.item}>
      <View style={styles.row}>
        <Image source={{ uri: item.author.avatarUrl }} style={styles.avatar} />
        <Text style={styles.handle} numberOfLines={1}>
          {item.author.handle}
        </Text>
        <View style={{ flex: 1 }} />
        <Text style={styles.when}>{since(item.timestamp)}</Text>
      </View>

      <Text style={styles.postBody}>{item.body}</Text>

      {item.coin && (
        <Pressable onPress={() => onOpenCoin(item.coin!.address)} style={styles.coinChip}>
          <Text style={styles.coinChipText}>${item.coin.symbol}</Text>
          <Text style={styles.coinChipName} numberOfLines={1}>
            {item.coin.name}
          </Text>
        </Pressable>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  wordmark: { ...type.title, color: colors.ink },
  subtitle: { ...type.label, color: colors.muted, marginTop: 2 },
  list: { paddingHorizontal: spacing.lg, paddingBottom: 120, gap: spacing.md },
  item: { gap: spacing.md },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  avatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surfaceSunken },
  handle: { ...type.bodyStrong, color: colors.ink, maxWidth: 110 },
  verb: { ...type.body, color: colors.muted },
  ticker: { ...type.bodyStrong, color: colors.ink, maxWidth: 110 },
  when: { ...type.caption, color: colors.faint },
  tradeBody: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  thumb: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.surfaceSunken },
  thumbEmpty: { borderWidth: 1, borderColor: colors.line },
  tradeFacts: { flex: 1, gap: 4 },
  coinName: { ...type.bodyStrong, color: colors.ink },
  tradeSize: { ...type.label, color: colors.muted, fontVariant: ["tabular-nums"] },
  postBody: { ...type.body, color: colors.ink, lineHeight: 22 },
  coinChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSunken,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  coinChipText: { ...type.bodyStrong, color: colors.ink },
  coinChipName: { ...type.label, color: colors.muted, flex: 1 },
});
