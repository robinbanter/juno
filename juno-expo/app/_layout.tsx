import "../lib/polyfills";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "styled-components/native";

import { WalletProvider } from "../lib/wallet";
import { theme } from "../theme";

/**
 * The app shell.
 *
 * Light throughout and pinned there: `userInterfaceStyle` is "light" in
 * app.json, so a phone in dark mode does not get a half-inverted version of a
 * palette that was validated against a light surface.
 *
 * `GestureHandlerRootView` has to be the outermost view, not a wrapper further
 * down: native gesture recognizers are attached relative to it, and a detector
 * mounted outside its subtree silently never fires.
 */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <ThemeProvider theme={theme}>
      <SafeAreaProvider>
        <WalletProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: theme.colors.bg },
              animation: "slide_from_right",
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="coin/[mint]" />
            <Stack.Screen name="trader/[wallet]" />
            <Stack.Screen name="post/[id]" />
          </Stack>
        </WalletProvider>
      </SafeAreaProvider>
    </ThemeProvider>
    </GestureHandlerRootView>
  );
}
