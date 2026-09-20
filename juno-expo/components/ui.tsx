import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { colors, radius, shadow, spacing, type } from "../theme/tokens";

/**
 * The small set of primitives every screen is built from.
 *
 * Kept in one file on purpose: a component per file buys nothing at this size
 * and makes the visual language harder to keep consistent, which is the thing
 * that actually matters in an app whose whole point is that it looks
 * deliberate.
 */

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({
  label,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  style,
}: {
  label: string;
  onPress?: PressableProps["onPress"];
  variant?: "primary" | "buy" | "sell" | "quiet";
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = {
    primary: { bg: colors.primary, fg: colors.onPrimary },
    buy: { bg: colors.pos, fg: "#FFFFFF" },
    sell: { bg: colors.neg, fg: "#FFFFFF" },
    quiet: { bg: colors.surfaceSunken, fg: colors.ink },
  }[variant];

  const inactive = disabled || loading;

  return (
    <Pressable
      onPress={inactive ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.bg },
        pressed && !inactive && styles.buttonPressed,
        inactive && styles.buttonDisabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <Text style={[styles.buttonLabel, { color: palette.fg }]}>{label}</Text>
      )}
    </Pressable>
  );
}

/**
 * A value with its direction.
 *
 * `direction` may be null, which means unknown — a market whose whole history
 * is inside the window, or a read that came back short. That is rendered
 * without an arrow and without a colour, because an arrow is a claim about
 * which way a price moved and pointing one at a number nobody measured is
 * exactly the kind of thing a trading screen must not do.
 *
 * The arrow is also never the only signal: the percentage is always spelled
 * out beside it, so a red-green colourblind reader is never left guessing.
 */
export function Delta({
  pct,
  style,
}: {
  pct: number | null | undefined;
  style?: StyleProp<TextStyle>;
}) {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) {
    return <Text style={[styles.deltaUnknown, style]}>—</Text>;
  }
  const up = pct >= 0;
  return (
    <Text style={[styles.delta, { color: up ? colors.pos : colors.neg }, style]}>
      {up ? "▲" : "▼"} {up ? "+" : ""}
      {(pct * 100).toFixed(2)}%
    </Text>
  );
}

export function Pill({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "pos" | "neg" | "primary" }) {
  const bg = {
    neutral: colors.surfaceSunken,
    pos: "rgba(14,159,110,0.12)",
    neg: "rgba(217,45,32,0.12)",
    primary: "rgba(242,226,48,0.35)",
  }[tone];
  const fg = { neutral: colors.muted, pos: colors.pos, neg: colors.neg, primary: colors.ink }[tone];

  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillLabel, { color: fg }]}>{label}</Text>
    </View>
  );
}

/** A labelled figure. `tabular` because these line up in rows. */
export function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "pos" | "neg" }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      {typeof value === "string" || typeof value === "number" ? (
        <Text
          style={[
            styles.statValue,
            tone === "pos" && { color: colors.pos },
            tone === "neg" && { color: colors.neg },
          ]}
        >
          {value}
        </Text>
      ) : (
        value
      )}
    </View>
  );
}

/** A screen-level state: loading, empty, or failed. Never a silent blank. */
export function Placeholder({
  title,
  detail,
  action,
  busy = false,
}: {
  title: string;
  detail?: string;
  action?: React.ReactNode;
  busy?: boolean;
}) {
  return (
    <View style={styles.placeholder}>
      {busy && <ActivityIndicator color={colors.muted} style={{ marginBottom: spacing.md }} />}
      <Text style={styles.placeholderTitle}>{title}</Text>
      {detail ? <Text style={styles.placeholderDetail}>{detail}</Text> : null}
      {action ? <View style={{ marginTop: spacing.lg }}>{action}</View> : null}
    </View>
  );
}

/** A block shaped like the content it precedes. */
export function Skeleton({ height = 16, width = "100%", style }: { height?: number; width?: number | string; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[
        { height, width: width as ViewStyle["width"], backgroundColor: colors.line, borderRadius: radius.sm },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.card,
  },
  button: {
    height: 52,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  buttonPressed: { opacity: 0.86, transform: [{ scale: 0.99 }] },
  buttonDisabled: { opacity: 0.4 },
  buttonLabel: { ...type.bodyStrong, fontSize: 16 },
  delta: { ...type.label, fontVariant: ["tabular-nums"] },
  deltaUnknown: { ...type.label, color: colors.faint },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  pillLabel: { ...type.caption },
  stat: { flex: 1, gap: 2 },
  statLabel: { ...type.caption, color: colors.muted },
  statValue: { ...type.bodyStrong, color: colors.ink, fontVariant: ["tabular-nums"] },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
    gap: spacing.xs,
  },
  placeholderTitle: { ...type.bodyStrong, color: colors.ink, textAlign: "center" },
  placeholderDetail: { ...type.body, color: colors.muted, textAlign: "center", lineHeight: 21 },
});
