import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CurvePreview } from "../../components/CurvePreview";
import { Button, Card, Pill } from "../../components/kit";
import { juno, WSOL_MINT } from "../../lib/api";
import { useWallet } from "../../lib/wallet";
import { theme } from "../../theme";

/**
 * Post — which here means launching a real market.
 *
 * This is Juno's whole claim in one screen. Publishing does not create a row in
 * a table; it creates a Meteora bonding curve pool on Solana, with a sixteen
 * segment curve chosen from a preset, and the post *is* that market.
 *
 * ## Two signatures, and why it cannot be one
 *
 * A launch is two transactions: create the curve config, then open the pool
 * against it. They cannot be bundled — a sixteen-segment curve plus the pool
 * init serialises to about 1488 bytes against Solana's 1232 byte packet limit,
 * and dropping curve points to fit would gut the exact thing that makes these
 * presets worth anything.
 *
 * So the second signature can fail after the first has landed, leaving a config
 * on-chain with no pool. That is a real state and the screen says so plainly
 * rather than reporting a generic failure, because the config is not lost — it
 * is a usable account, and the retry is cheap.
 */

const PRESETS = [
  {
    id: "content",
    label: "Content",
    blurb: "Back-loaded. Cheap to enter, steepens as attention arrives.",
  },
  {
    id: "thin-name",
    label: "Thin name",
    blurb: "Front-loaded. Deep at the issue price so early size fills.",
  },
  {
    id: "ipo-book",
    label: "IPO book",
    blurb: "Deep at both ends, thin in the middle. Book-building.",
  },
  {
    id: "tight-nav",
    label: "Tight NAV",
    blurb: "Uniform. Tracks an underlying like a spread, not a launch.",
  },
] as const;

export default function PostScreen() {
  const router = useRouter();
  const wallet = useWallet();
  /*
   * Which kind of thing is being launched, chosen in the create sheet.
   *
   * It was hardcoded to "post", so the phone could not launch a reel at all
   * while the web could — and a reel is a different object in the feed, not a
   * cosmetic label: it decides whether this lands in the grid or the swipe
   * feed. Defaulting to "post" keeps a direct visit to this route working.
   */
  const { format } = useLocalSearchParams<{ format?: string }>();
  const kind: "post" | "reel" = format === "reel" ? "reel" : "post";

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [preset, setPreset] = useState<string>("content");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const symbolOk = /^[A-Z0-9]{2,10}$/.test(symbol.trim().toUpperCase());
  const canLaunch = name.trim().length > 0 && symbolOk && !busy;

  async function launch() {
    setBusy(true);
    setError(null);
    try {
      const address = wallet.address ?? (await wallet.connect());

      setStatus("Building the launch…");
      const built = await juno.buildLaunch({
        creator: address,
        name: name.trim(),
        symbol: symbol.trim().toUpperCase(),
        preset,
      });

      // In order, and each must confirm before the next is valid: the pool
      // cannot be opened against a config that does not exist yet.
      let poolSignature = "";
      for (const [index, step] of built.steps.entries()) {
        setStatus(`${step.label}… (${index + 1}/${built.steps.length})`);
        const signed = await wallet.sign(step.transaction);
        try {
          const { signature } = await juno.submit({
            transaction: signed,
            window: built.window,
          });
          // The last step opens the pool, and its signature is the receipt a
          // judge clicks.
          poolSignature = signature;
        } catch (stepError) {
          if (index > 0) {
            throw new Error(
              `The curve config was created, but opening the pool failed: ${
                stepError instanceof Error ? stepError.message : "unknown error"
              }. Nothing is lost — try again.`,
            );
          }
          throw stepError;
        }
      }

      setStatus("Recording the launch…");
      await juno
        .recordLaunch({
          baseMint: built.baseMint,
          poolAddress: built.pool,
          configAddress: built.config,
          quoteMint: WSOL_MINT,
          creatorWallet: address,
          name: name.trim(),
          symbol: symbol.trim().toUpperCase(),
          format: kind,
          curvePreset: preset,
          createSignature: poolSignature,
        })
        .catch(() => {
          // The pool exists on-chain either way. A failed index write means it
          // is missing from the app's list, not that the launch failed.
        });

      setStatus(null);
      router.push(`/coin/${built.baseMint}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Launch failed");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>
            {kind === "reel" ? "Launch a reel" : "Launch a coin"}
          </Text>
          <Text style={styles.lede}>
            {kind === "reel"
              ? "A vertical video with a real Meteora bonding curve behind it. It lands in the swipe feed."
              : "Publishing opens a real Meteora bonding curve on Solana. The post is the market."}
          </Text>

          <Card style={styles.form}>
            <Field label="Name">
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Night Market"
                placeholderTextColor={theme.colors.faint}
                style={styles.input}
                maxLength={64}
              />
            </Field>

            <Field label="Ticker" hint={symbol.length > 0 && !symbolOk ? "2–10 letters or digits" : undefined}>
              <TextInput
                value={symbol}
                onChangeText={(next) => setSymbol(next.toUpperCase())}
                placeholder="NIGHT"
                placeholderTextColor={theme.colors.faint}
                autoCapitalize="characters"
                style={styles.input}
                maxLength={10}
              />
            </Field>
          </Card>

          <Text style={styles.sectionTitle}>Curve</Text>
          <Text style={styles.sectionLede}>
            Sixteen liquidity-weighted segments. The weights decide how the price
            behaves, not just where it starts.
          </Text>

          <View style={styles.presets}>
            {PRESETS.map((option) => {
              const on = preset === option.id;
              return (
                <Pressable key={option.id} onPress={() => setPreset(option.id)}>
                  <Card style={[styles.preset, on && styles.presetOn]}>
                    <View style={styles.presetRow}>
                      <View style={styles.presetText}>
                        <View style={styles.presetHead}>
                          <Text style={styles.presetLabel}>{option.label}</Text>
                          {on && <Pill label="Selected" tone="lime" />}
                        </View>
                        <Text style={styles.presetBlurb}>{option.blurb}</Text>
                      </View>
                      {/* The curve itself, drawn from the same sixteen weights
                          the launch uses. The weights are the whole decision. */}
                      <CurvePreview preset={option.id} active={on} />
                    </View>
                  </Card>
                </Pressable>
              );
            })}
          </View>

          {error && (
            <Card style={styles.errorCard}>
              <Text style={styles.errorText}>{error}</Text>
            </Card>
          )}

          <Button
            label={status ?? "Launch coin"}
            tall
            onPress={launch}
            loading={busy}
            disabled={!canLaunch}
          />
          <Text style={styles.footnote}>
            Two signatures: one to create the curve config, one to open the pool.
            They cannot be combined — a sixteen-segment curve does not fit in a
            single Solana packet with the pool init.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  body: { paddingHorizontal: 16, paddingBottom: 140, gap: 12 },
  title: { fontSize: theme.type.screen.size, fontWeight: "800", color: theme.colors.ink },
  lede: { fontSize: theme.type.body.size, color: theme.colors.muted, lineHeight: 21 },
  form: { gap: 16 },
  fieldLabel: { fontSize: theme.type.label.size, fontWeight: "500", color: theme.colors.muted },
  fieldHint: { fontSize: theme.type.micro.size, fontWeight: "500", color: theme.colors.neg },
  input: {
    height: 48,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceAlt,
    paddingHorizontal: 16,
    fontSize: theme.type.body.size,
    color: theme.colors.text,
  },
  sectionTitle: { fontSize: theme.type.title.size, fontWeight: "700", color: theme.colors.text, marginTop: 8 },
  sectionLede: { fontSize: theme.type.label.size, fontWeight: "500", color: theme.colors.muted, lineHeight: 19 },
  presets: { gap: 8 },
  preset: { gap: 6, padding: 16 },
  presetOn: { borderWidth: 2, borderColor: theme.colors.lime },
  presetRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  presetText: { flex: 1, gap: 6 },
  presetHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  presetLabel: { fontSize: theme.type.body.size, fontWeight: "600", color: theme.colors.ink },
  presetBlurb: { fontSize: theme.type.label.size, fontWeight: "500", color: theme.colors.muted, lineHeight: 19 },
  errorCard: { backgroundColor: "rgba(217,45,32,0.08)" },
  errorText: { fontSize: theme.type.body.size, color: theme.colors.neg, lineHeight: 21 },
  footnote: { fontSize: theme.type.micro.size, fontWeight: "500", color: theme.colors.faint, lineHeight: 16, marginTop: 8 },
});
