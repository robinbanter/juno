import "../lib/polyfills";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { WalletProvider } from "../lib/wallet";
import { colors } from "../theme/tokens";

/**
 * The app shell.
 *
 * Light throughout and pinned there: `userInterfaceStyle` is "light" in
 * app.json, so a phone in dark mode does not get a half-inverted version of a
 * palette that was validated against a white surface.
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <WalletProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            // Sheets present from the bottom; everything else pushes.
            animation: "slide_from_right",
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="coin/[mint]" />
        </Stack>
      </WalletProvider>
    </SafeAreaProvider>
  );
}
