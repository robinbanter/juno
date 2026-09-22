import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";

import { Tappable } from "./Press";
import { Button } from "./kit";
import { juno, USDC_DEVNET, WSOL_MINT } from "../lib/api";
import { useApi } from "../lib/useApi";
import { theme } from "../theme";

/**
 * The wallet itself: its address, what it holds, and how to fund it.
 *
 * The profile used to show a shortened address and nothing else — no way to
 * copy it, no balance, no way to get the devnet SOL every action costs. A new
 * user could browse everything and do nothing, with no hint as to why.
 *
 * Balances are read from chain and shown as a dash when the read fails, never
 * as zero: "0 SOL" on a throttled read would tell someone to go and fund a
 * wallet that is already funded.
 */
export function WalletCard({ address }: { address: string }) {
  const sol = useApi(() => juno.balance(address, WSOL_MINT), [address]);
  const usdc = useApi(() => juno.balance(address, USDC_DEVNET), [address]);
  const [copied, setCopied] = useState(false);
  const [funding, setFunding] = useState(false);
  const [message, setMessage] = useState<{ tone: "pos" | "neg"; text: string; url?: string } | null>(null);

  const copy = async () => {
    await Clipboard.setStringAsync(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const fund = async () => {
    setFunding(true);
    setMessage(null);
    try {
      const result = await juno.faucet(address);
      setMessage({ tone: "pos", text: `${result.amount} devnet SOL received.` });
      sol.refresh();
    } catch (error) {
      const text = error instanceof Error ? error.message : "The faucet did not answer.";
      setMessage({
        tone: "neg",
        text,
        url: /faucet\.solana\.com/.test(text) ? "https://faucet.solana.com" : undefined,
      });
    } finally {
      setFunding(false);
    }
  };

  const figure = (state: typeof sol) =>
    state.loading ? "…" : state.data?.balance === null || state.data === null || state.error ? "—" : state.data.balance.toFixed(state.data.balance < 1 ? 4 : 2);

  const empty = sol.data?.balance === 0;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.label}>Wallet · devnet</Text>
        <Tappable onPress={() => void copy()} to={0.95} accessibilityRole="button" accessibilityLabel="Copy address">
          <View style={styles.copy}>
            <Text style={styles.copyText}>{copied ? "Copied" : "Copy address"}</Text>
          </View>
        </Tappable>
      </View>
      <Text style={styles.address} selectable numberOfLines={1} ellipsizeMode="middle">
        {address}
      </Text>

      <View style={styles.balances}>
        <View style={styles.balance}>
          <Text style={styles.amount}>{figure(sol)}</Text>
          <Text style={styles.unit}>SOL</Text>
        </View>
        <View style={styles.rule} />
        <View style={styles.balance}>
          <Text style={styles.amount}>{figure(usdc)}</Text>
          <Text style={styles.unit}>USDC</Text>
        </View>
      </View>

      {empty ? (
        <Text style={styles.hint}>Every buy and launch costs a network fee. Fund this wallet to start.</Text>
      ) : null}

      <Button
        label={funding ? "Asking the faucet…" : "Get devnet SOL"}
        variant={empty ? "lime" : "quiet"}
        loading={funding}
        onPress={() => void fund()}
      />

      {message ? (
        <Text style={[styles.message, { color: message.tone === "pos" ? theme.colors.pos : theme.colors.neg }]}>
          {message.text}
          {message.url ? (
            <Text style={styles.link} onPress={() => void Linking.openURL(message.url!)}>
              {"  "}Open faucet
            </Text>
          ) : null}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    padding: 16,
    gap: 12,
    ...theme.shadow.card,
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { fontSize: 12, fontWeight: "700", color: theme.colors.muted, letterSpacing: 0.2 },
  copy: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: theme.colors.surfaceAlt },
  copyText: { fontSize: 12, fontWeight: "700", color: theme.colors.text },
  address: { fontSize: 13, fontWeight: "600", color: theme.colors.text, fontVariant: ["tabular-nums"] },
  balances: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceAlt,
  },
  balance: { flex: 1, flexDirection: "row", alignItems: "baseline", gap: 6 },
  amount: { fontSize: 20, fontWeight: "800", color: theme.colors.text, fontVariant: ["tabular-nums"] },
  unit: { fontSize: 12, fontWeight: "700", color: theme.colors.muted },
  rule: { width: StyleSheet.hairlineWidth, alignSelf: "stretch", backgroundColor: theme.colors.lineStrong, marginHorizontal: 12 },
  hint: { fontSize: 13, lineHeight: 18, color: theme.colors.muted },
  message: { fontSize: 13, lineHeight: 18 },
  link: { fontWeight: "800", color: theme.colors.focus },
});
