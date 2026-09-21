import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewToken,
} from "react-native";

import { Button, Placeholder } from "../../components/kit";
import { juno, type Coin } from "../../lib/api";
import { money, useApi } from "../../lib/useApi";
import { theme } from "../../theme";

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get("window");

/**
 * Reels: the vertical feed, one coin per screen.
 *
 * Only one video plays at a time, decided by which card is actually on screen
 * rather than by scroll position arithmetic. `viewabilityConfig` is the right
 * tool because it accounts for partially visible cards mid-swipe — two videos
 * playing at once is both a battery problem and an audio mess.
 */
export default function ReelsScreen() {
  const router = useRouter();
  const reels = useApi(async () => {
    const { coins } = await juno.coins();
    return coins.filter((coin) => coin.format === "reel" && coin.media.kind === "video");
  }, []);

  const [activeIndex, setActiveIndex] = useState(0);
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0];
    if (first?.index !== null && first?.index !== undefined) setActiveIndex(first.index);
  }).current;

  if (reels.loading) {
    return <View style={styles.screen}><Placeholder title="Loading reels" busy /></View>;
  }

  if (reels.error) {
    return (
      <View style={styles.screen}>
        <Placeholder
          title="Could not load reels"
          detail={reels.error}
          action={<Button label="Try again" onPress={reels.refresh} />}
        />
      </View>
    );
  }

  if ((reels.data?.length ?? 0) === 0) {
    return (
      <View style={styles.screen}>
        <Placeholder
          title="No reels yet"
          detail="A reel is a vertical video coin. Post one and it lands here."
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={reels.data ?? []}
        keyExtractor={(coin) => coin.address}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={SCREEN_H}
        decelerationRate="fast"
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        renderItem={({ item, index }) => (
          <Reel
            coin={item}
            active={index === activeIndex}
            onOpen={() => router.push(`/coin/${item.address}`)}
          />
        )}
      />
    </View>
  );
}

function Reel({ coin, active, onOpen }: { coin: Coin; active: boolean; onOpen: () => void }) {
  const uri = juno.media(coin.media.url);

  const player = useVideoPlayer(uri ?? "", (instance) => {
    instance.loop = true;
    instance.muted = true;
  });

  // Play only the card in view. Driven off `active` rather than a scroll
  // handler so it stays correct when the list is re-ordered or refreshed.
  const { isPlaying } = useEvent(player, "playingChange", { isPlaying: player.playing });
  if (active && !isPlaying) player.play();
  if (!active && isPlaying) player.pause();

  return (
    <View style={styles.reel}>
      {uri ? (
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          nativeControls={false}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.surfaceAlt }]} />
      )}

      <View style={styles.scrim} />

      <View style={styles.overlay}>
        <Text style={styles.reelName} numberOfLines={2}>
          {coin.name}
        </Text>
        <Text style={styles.reelMeta}>
          ${coin.symbol} · {money(coin.marketCap, coin.marketCapCurrency)} cap
        </Text>
        <Button label="Trade" onPress={onOpen} style={styles.reelCta} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000" },
  reel: { width: SCREEN_W, height: SCREEN_H, justifyContent: "flex-end" },
  scrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  overlay: { padding: 24, paddingBottom: 130, gap: 8 },
  reelName: { fontSize: 28, fontWeight: "800", color: "#FFFFFF" },
  reelMeta: { fontSize: 13, fontWeight: "500", color: "rgba(255,255,255,0.86)" },
  reelCta: { marginTop: 12, alignSelf: "flex-start", paddingHorizontal: 40 },
});
