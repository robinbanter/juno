import React from "react";
import { Tabs, usePathname, useRouter } from "expo-router";
import { Platform } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import styled from "styled-components/native";

import { theme } from "../../theme";

/**
 * The bottom bar: five slots, Post raised in the centre.
 *
 * The arrangement is the product in miniature. Social and Trade sit on the
 * left, Reels and Profile on the right, and the thing that *makes* a market
 * sits in the middle where a thumb lands — because Juno's claim is that posting
 * and launching are the same act, and a bar that buried Post in a menu would be
 * arguing the opposite.
 *
 * The active item is a lime pill; inactive ones are bare glyphs. No labels at
 * all — five icons are already legible, the label only ever appeared on the tab
 * you were demonstrably already on, and dropping it lets each slot breathe.
 * `accessibilityLabel` still names every tab for a screen reader.
 */
export default function TabsLayout() {
  const router = useRouter();
  // Which tab is active comes from the route, not from the button's
  // `accessibilityState`. That prop is not populated for a custom
  // `tabBarButton`, so reading it left every slot looking inactive — the lime
  // pill never appeared on the tab you were actually on.
  const pathname = usePathname();

  const slot =
    (label: string, Icon: (p: { color: string }) => React.ReactElement, href: string) =>
    () => (
      <Slot
        label={label}
        icon={Icon}
        active={pathname.startsWith(href.replace("/(tabs)", ""))}
        onPress={() => router.push(href as never)}
      />
    );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopWidth: 0,
          height: Platform.OS === "ios" ? 86 : 70,
          paddingTop: 10,
          paddingBottom: Platform.OS === "ios" ? 26 : 10,
          paddingHorizontal: 8,
          borderTopLeftRadius: theme.radius.xl,
          borderTopRightRadius: theme.radius.xl,
          position: "absolute",
          ...theme.shadow.raised,
        },
        sceneStyle: { backgroundColor: theme.colors.bg },
      }}
    >
      <Tabs.Screen
        name="social"
        options={{ tabBarButton: slot("Social", HomeIcon, "/(tabs)/social") }}
      />
      <Tabs.Screen
        name="trade"
        options={{ tabBarButton: slot("Trade", TradeIcon, "/(tabs)/trade") }}
      />
      <Tabs.Screen
        name="post"
        options={{
          tabBarButton: () => <PostSlot onPress={() => router.push("/(tabs)/post")} />,
        }}
      />
      <Tabs.Screen
        name="reels"
        options={{ tabBarButton: slot("Reels", ReelsIcon, "/(tabs)/reels") }}
      />
      <Tabs.Screen
        name="profile"
        options={{ tabBarButton: slot("Profile", ProfileIcon, "/(tabs)/profile") }}
      />
    </Tabs>
  );
}

function Slot({
  label,
  icon: Icon,
  active,
  onPress,
}: {
  label: string;
  icon: (props: { color: string }) => React.ReactElement;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <SlotBox
      onPress={onPress}
      $on={active}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
    >
      <Icon color={active ? theme.colors.onLime : theme.colors.faint} />
    </SlotBox>
  );
}

function PostSlot({ onPress }: { onPress: () => void }) {
  return (
    <PostBox onPress={onPress} accessibilityRole="button" accessibilityLabel="Post — launch a coin">
      <PostDisc>
        <Svg width={24} height={24} viewBox="0 0 24 24">
          <Path
            d="M12 5v14M5 12h14"
            stroke={theme.colors.lime}
            strokeWidth={2.6}
            strokeLinecap="round"
          />
        </Svg>
      </PostDisc>
    </PostBox>
  );
}

const SlotBox = styled.Pressable<{ $on: boolean }>`
  flex: 1;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  height: 44px;
  margin-horizontal: 2px;
  border-radius: ${(p) => p.theme.radius.pill}px;
  background-color: ${(p) => (p.$on ? p.theme.colors.lime : "transparent")};
`;

const PostBox = styled.Pressable`
  width: 62px;
  align-items: center;
  justify-content: center;
`;

const PostDisc = styled.View`
  width: 48px;
  height: 44px;
  border-radius: ${(p) => p.theme.radius.pill}px;
  background-color: ${(p) => p.theme.colors.ink};
  align-items: center;
  justify-content: center;
`;

/* Icons are inline SVG rather than an icon font: five glyphs do not justify a
   dependency, and these carry the theme's exact stroke weight. */

function HomeIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 10.2 12 3.5l9 6.7V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"
        stroke={color}
        strokeWidth={1.9}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function TradeIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={12} width={4} height={8} rx={1.4} stroke={color} strokeWidth={1.9} />
      <Rect x={10} y={7} width={4} height={13} rx={1.4} stroke={color} strokeWidth={1.9} />
      <Rect x={17} y={3} width={4} height={17} rx={1.4} stroke={color} strokeWidth={1.9} />
    </Svg>
  );
}

function ReelsIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={4} width={18} height={16} rx={3.4} stroke={color} strokeWidth={1.9} />
      <Path d="M10 9.5 15 12l-5 2.5z" stroke={color} strokeWidth={1.9} strokeLinejoin="round" />
    </Svg>
  );
}

function ProfileIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8.5} r={3.6} stroke={color} strokeWidth={1.9} />
      <Path
        d="M4.8 20c.7-3.6 3.6-5.6 7.2-5.6s6.5 2 7.2 5.6"
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
      />
    </Svg>
  );
}
