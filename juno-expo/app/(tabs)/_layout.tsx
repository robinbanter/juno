import { Tabs, useRouter } from "expo-router";
import { Platform, Pressable, StyleSheet, Text, View, type ColorValue } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";

import { colors, radius, shadow, spacing, type } from "../../theme/tokens";

/**
 * The bottom bar: five slots, Post raised in the centre.
 *
 * The arrangement is the product in miniature. Social and Trade sit on the
 * left, Reels and Profile on the right, and the thing that *makes* a market
 * sits in the middle where a thumb lands — because Juno's claim is that posting
 * and launching are the same act, and a bar that buried Post in a menu would
 * be arguing the opposite.
 *
 * The centre button is deliberately not a tab. Tapping it opens the composer
 * over whatever you were reading rather than swapping the screen underneath
 * you, which is what every app people already use does with a compose action.
 */
export default function TabsLayout() {
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.faint,
        tabBarLabelStyle: styles.label,
        tabBarStyle: styles.bar,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="social"
        options={{
          title: "Social",
          tabBarIcon: ({ color }: { color: ColorValue }) => <HomeIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="trade"
        options={{
          title: "Trade",
          tabBarIcon: ({ color }: { color: ColorValue }) => <TradeIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="post"
        options={{
          title: "",
          tabBarButton: () => (
            <PostButton onPress={() => router.push("/(tabs)/post")} />
          ),
        }}
      />
      <Tabs.Screen
        name="reels"
        options={{
          title: "Reels",
          tabBarIcon: ({ color }: { color: ColorValue }) => <ReelsIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }: { color: ColorValue }) => <ProfileIcon color={color} />,
        }}
      />
    </Tabs>
  );
}

function PostButton({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.postSlot}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Post — launch a coin"
        style={({ pressed }) => [styles.postButton, pressed && { transform: [{ scale: 0.95 }] }]}
      >
        <Svg width={26} height={26} viewBox="0 0 24 24">
          <Path
            d="M12 5v14M5 12h14"
            stroke={colors.onPrimary}
            strokeWidth={2.6}
            strokeLinecap="round"
          />
        </Svg>
      </Pressable>
      <Text style={styles.postLabel}>Post</Text>
    </View>
  );
}

/* Icons are inline SVG rather than an icon font: five glyphs do not justify a
   dependency, and these can carry the theme's exact stroke weight. */

function HomeIcon({ color }: { color: ColorValue }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 10.2 12 3.5l9 6.7V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function TradeIcon({ color }: { color: ColorValue }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={12} width={4} height={8} rx={1} stroke={color} strokeWidth={1.8} />
      <Rect x={10} y={7} width={4} height={13} rx={1} stroke={color} strokeWidth={1.8} />
      <Rect x={17} y={3} width={4} height={17} rx={1} stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

function ReelsIcon({ color }: { color: ColorValue }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={4} width={18} height={16} rx={3} stroke={color} strokeWidth={1.8} />
      <Path d="M10 9.5 15 12l-5 2.5z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
    </Svg>
  );
}

function ProfileIcon({ color }: { color: ColorValue }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8.5} r={3.6} stroke={color} strokeWidth={1.8} />
      <Path
        d="M4.8 20c.7-3.6 3.6-5.6 7.2-5.6s6.5 2 7.2 5.6"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    borderTopWidth: 0,
    height: Platform.OS === "ios" ? 88 : 68,
    paddingTop: spacing.sm,
    paddingBottom: Platform.OS === "ios" ? spacing.xl : spacing.sm,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    position: "absolute",
    ...shadow.raised,
  },
  label: { ...type.caption, marginTop: 2 },
  postSlot: { flex: 1, alignItems: "center", justifyContent: "flex-start" },
  postButton: {
    width: 52,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.card,
  },
  postLabel: { ...type.caption, color: colors.ink, marginTop: 3 },
});
