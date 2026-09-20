import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { OnboardingArt } from "../components/art";
import { Button } from "../components/ui";
import { colors, spacing, type } from "../theme/tokens";

/**
 * Onboarding.
 *
 * One screen, one action. Get Started drops straight into the feed — it does
 * not ask for an account, because a social feed behind a login is dead on
 * arrival and the first thing anyone sees should be the product working. A
 * wallet is created later, at the moment someone actually needs one.
 */
export default function Onboarding() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.art}>
        <OnboardingArt size={300} />
      </View>

      <View style={styles.copy}>
        <Text style={styles.title}>Social Trading{"\n"}Community</Text>
        <Text style={styles.subtitle}>
          Every post is a live market. Back the work you believe in, and the
          creator earns the trading fees.
        </Text>
      </View>

      <Button
        label="Get Started"
        onPress={() => router.replace("/(tabs)/social")}
        style={styles.cta}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.xl },
  art: { flex: 1, alignItems: "center", justifyContent: "center" },
  copy: { gap: spacing.md, paddingBottom: spacing.xxl },
  title: { ...type.display, color: colors.ink, lineHeight: 46 },
  subtitle: { ...type.body, color: colors.muted, lineHeight: 22, maxWidth: 320 },
  cta: { marginBottom: spacing.xl },
});
