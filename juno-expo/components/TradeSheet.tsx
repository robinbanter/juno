import { useCallback, useEffect, useMemo, useState } from "react";
import { Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { Button, Card, Pill } from "./ui";
import { juno, type Coin } from "../lib/api";
import { money, tokens } from "../lib/useApi";
import { useWallet } from "../lib/wallet";
import { colors, radius, shadow, spacing, type } from "../theme/tokens";

/**
 * Buy and sell, with a numpad.
 *
 * A system keyboard is the wrong control for this. It covers half the screen —
 * including the quote the person is deciding on — it offers characters an
 * amount cannot contain, and on iOS the decimal key depends on locale. A
 * purpose-built pad keeps the number, the quote and the button visible at once,
 * which is the whole decision in one view.
 *
 * ## The quote is fetched, not computed
 *
 * The amount could be multiplied by the last price to show an estimate, and
 * that estimate would be wrong in exactly the way that matters: a bonding curve
 * moves as it fills, so a large order does not clear at the spot price. The
 * server quotes against the live curve and returns the transaction built
 * against that same quote, so what is shown is what will be signed.
 *
 * Debounced, because a quote is an RPC round trip and typing "125" should not
 * cost three of them.
 */

const QUICK_BUY = [0.05, 0.1, 0.25, 0.5];
const QUICK_SELL_PCT = [0.25, 0.5, 0.75, 1];

type Stage = "entry" | "confirming" | "done";

export function TradeSheet({
  coin,
  side,
  onClose,
  onDone,
}: {
  coin: Coin;
  side: "buy" | "sell";
  onClose: () => void;
  onDone: () => void;
}) {
  const wallet = useWallet();
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<Awaited<ReturnType<typeof juno.buildSwap>> | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [stage, setStage] = useState<Stage>("entry");
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);

  const value = Number(amount || "0");
  const valid = Number.isFinite(value) && value > 0;
  const unit = side === "buy" ? coin.quote.symbol : coin.symbol;

  /* The quote, debounced. */
  useEffect(() => {
    if (!valid || !wallet.address) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    setQuoting(true);
    setError(null);

    const timer = setTimeout(async () => {
      try {
        const built = await juno.buildSwap({
          mint: coin.address,
          owner: wallet.address!,
          side,
          amountIn: value,
        });
        if (!cancelled) setQuote(built);
      } catch (caught) {
        if (!cancelled) {
          setQuote(null);
          setError(caught instanceof Error ? caught.message : "Could not quote this trade");
        }
      } finally {
        if (!cancelled) setQuoting(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [amount, valid, value, side, coin.address, wallet.address]);

  const press = useCallback((key: string) => {
    setSignature(null);
    setAmount((current) => {
      if (key === "back") return current.slice(0, -1);
      if (key === ".") return current.includes(".") ? current : current === "" ? "0." : `${current}.`;
      // No leading zeros: "05" is not an amount anyone meant to type.
      const next = current === "0" ? key : current + key;
      // Guard the decimal tail so a tap cannot build an unrepresentable number.
      const [, decimals = ""] = next.split(".");
      if (decimals.length > 9) return current;
      return next;
    });
  }, []);

  async function confirm() {
    if (!quote) return;
    setStage("confirming");
    setError(null);
    try {
      const address = wallet.address ?? (await wallet.connect());
      if (!address) throw new Error("No wallet available");

      const signed = await wallet.sign(quote.unsigned.transaction);
      const { signature: landed } = await juno.submit({
        transaction: signed,
        window: quote.window,
        poolAddress: quote.pool,
      });
      setSignature(landed);
      setStage("done");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The trade failed");
      setStage("entry");
    }
  }

  const receiving = useMemo(() => {
    if (!quote) return null;
    return side === "buy"
      ? `${tokens(quote.quote.amountOut)} ${coin.symbol}`
      : money(quote.quote.amountOut, coin.quote.symbol, { compact: false });
  }, [quote, side, coin.symbol, coin.quote.symbol]);

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} />

      <View style={styles.sheet}>
        <View style={styles.grabber} />

        <View style={styles.head}>
          <Text style={styles.title}>
            {side === "buy" ? "Buy" : "Sell"} ${coin.symbol}
          </Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
            <Text style={styles.close}>✕</Text>
          </Pressable>
        </View>

        {stage === "done" && signature ? (
          <View style={styles.done}>
            <Text style={styles.doneTitle}>Done</Text>
            <Text style={styles.doneDetail}>
              {side === "buy" ? "Bought" : "Sold"} {receiving ?? ""} — confirmed on Solana.
            </Text>
            <Pressable onPress={() => Linking.openURL(juno.explorer("tx", signature))}>
              <Text style={styles.doneLink}>View the transaction ↗</Text>
            </Pressable>
            <Button label="Done" onPress={onDone} style={{ marginTop: spacing.lg }} />
          </View>
        ) : (
          <>
            <View style={styles.amountBlock}>
              <Text style={styles.amount}>
                {amount || "0"} <Text style={styles.unit}>{unit}</Text>
              </Text>
              <Text style={styles.receiving}>
                {quoting
                  ? "Quoting against the curve…"
                  : receiving
                    ? `You receive ~${receiving}`
                    : valid
                      ? " "
                      : "Enter an amount"}
              </Text>
              {quote && quote.quote.priceImpact > 0.02 && (
                <Pill
                  label={`Price impact ${(quote.quote.priceImpact * 100).toFixed(1)}%`}
                  tone="neg"
                />
              )}
            </View>

            <View style={styles.quick}>
              {(side === "buy" ? QUICK_BUY : QUICK_SELL_PCT).map((preset) => (
                <Pressable
                  key={preset}
                  style={styles.quickChip}
                  onPress={() => setAmount(String(preset))}
                >
                  <Text style={styles.quickLabel}>
                    {side === "buy" ? `${preset}` : `${preset * 100}%`}
                  </Text>
                </Pressable>
              ))}
            </View>

            {error && <Text style={styles.error}>{error}</Text>}

            <Numpad onPress={press} />

            <Button
              label={
                stage === "confirming"
                  ? "Confirming…"
                  : side === "buy"
                    ? "Buy"
                    : "Sell"
              }
              variant={side === "buy" ? "buy" : "sell"}
              onPress={confirm}
              loading={stage === "confirming" || wallet.signing}
              disabled={!quote || quoting}
            />
          </>
        )}
      </View>
    </Modal>
  );
}

function Numpad({ onPress }: { onPress: (key: string) => void }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"];
  return (
    <View style={styles.pad}>
      {keys.map((key) => (
        <Pressable
          key={key}
          onPress={() => onPress(key)}
          accessibilityRole="button"
          accessibilityLabel={key === "back" ? "Delete" : key}
          style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
        >
          <Text style={styles.keyLabel}>{key === "back" ? "⌫" : key}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(20,26,18,0.45)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
    ...shadow.raised,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    alignSelf: "center",
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { ...type.heading, color: colors.ink },
  close: { ...type.heading, color: colors.muted },
  amountBlock: { alignItems: "center", gap: 6, paddingVertical: spacing.sm },
  amount: { ...type.display, color: colors.ink },
  unit: { ...type.heading, color: colors.muted },
  receiving: { ...type.label, color: colors.muted, minHeight: 18 },
  quick: { flexDirection: "row", gap: spacing.sm },
  quickChip: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSunken,
    alignItems: "center",
  },
  quickLabel: { ...type.label, color: colors.ink },
  pad: { flexDirection: "row", flexWrap: "wrap" },
  key: {
    width: "33.33%",
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  keyPressed: { backgroundColor: colors.surfaceSunken, borderRadius: radius.md },
  keyLabel: { fontSize: 24, fontWeight: "500", color: colors.ink },
  error: { ...type.label, color: colors.neg, textAlign: "center" },
  done: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl },
  doneTitle: { ...type.title, color: colors.pos },
  doneDetail: { ...type.body, color: colors.ink, textAlign: "center" },
  doneLink: { ...type.label, color: colors.focus, marginTop: spacing.sm },
});
