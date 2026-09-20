import React from "react";
import { ActivityIndicator, type StyleProp, type ViewStyle } from "react-native";
import styled, { css } from "styled-components/native";

import { theme } from "../theme";

/**
 * The component kit, written from scratch with styled-components.
 *
 * One file on purpose. At this size a component per file buys nothing and makes
 * the visual language harder to hold together, which is the thing that actually
 * decides whether an app looks deliberate or assembled.
 */

/* ------------------------------------------------------------------ */
/* Surfaces                                                            */
/* ------------------------------------------------------------------ */

export const Screen = styled.View`
  flex: 1;
  background-color: ${(p) => p.theme.colors.bg};
`;

export const Card = styled.View`
  background-color: ${(p) => p.theme.colors.surface};
  border-radius: ${(p) => p.theme.radius.lg}px;
  padding: ${(p) => p.theme.space(4)}px;
`;

/** A card that wants contrast — the one dark surface in a light app. */
export const InkCard = styled.View`
  background-color: ${(p) => p.theme.colors.ink};
  border-radius: ${(p) => p.theme.radius.lg}px;
  padding: ${(p) => p.theme.space(5)}px;
`;

export const Row = styled.View<{ gap?: number; align?: string; justify?: string }>`
  flex-direction: row;
  align-items: ${(p) => p.align ?? "center"};
  justify-content: ${(p) => p.justify ?? "flex-start"};
  ${(p) => (p.gap ? css`gap: ${p.gap}px;` : "")}
`;

export const Col = styled.View<{ gap?: number }>`
  ${(p) => (p.gap ? css`gap: ${p.gap}px;` : "")}
`;

export const Spacer = styled.View<{ h?: number }>`
  height: ${(p) => p.h ?? 12}px;
`;

/* ------------------------------------------------------------------ */
/* Type                                                                */
/* ------------------------------------------------------------------ */

export const Display = styled.Text`
  font-size: 44px;
  font-weight: 800;
  letter-spacing: -1.2px;
  color: ${(p) => p.theme.colors.text};
`;

export const Title = styled.Text`
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.5px;
  color: ${(p) => p.theme.colors.text};
`;

export const Heading = styled.Text`
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.2px;
  color: ${(p) => p.theme.colors.text};
`;

export const Body = styled.Text<{ muted?: boolean }>`
  font-size: 15px;
  line-height: 21px;
  color: ${(p) => (p.muted ? p.theme.colors.muted : p.theme.colors.text)};
`;

export const Label = styled.Text<{ muted?: boolean }>`
  font-size: 13px;
  font-weight: 500;
  color: ${(p) => (p.muted ? p.theme.colors.muted : p.theme.colors.text)};
`;

export const Caption = styled.Text`
  font-size: 11px;
  font-weight: 500;
  color: ${(p) => p.theme.colors.faint};
`;

/** Figures that line up in columns. Never for a display-size number. */
export const Mono = styled.Text<{ muted?: boolean }>`
  font-size: 14px;
  font-weight: 600;
  font-variant: tabular-nums;
  color: ${(p) => (p.muted ? p.theme.colors.muted : p.theme.colors.text)};
`;

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */

type Variant = "lime" | "ink" | "buy" | "sell" | "quiet";

const FILL: Record<Variant, { bg: string; fg: string }> = {
  lime: { bg: theme.colors.lime, fg: theme.colors.onLime },
  ink: { bg: theme.colors.ink, fg: theme.colors.onInk },
  buy: { bg: theme.colors.pos, fg: "#FFFFFF" },
  sell: { bg: theme.colors.neg, fg: "#FFFFFF" },
  quiet: { bg: theme.colors.surfaceAlt, fg: theme.colors.text },
};

const Touchable = styled.Pressable<{ $bg: string; $inactive: boolean; $tall: boolean }>`
  height: ${(p) => (p.$tall ? 58 : 48)}px;
  border-radius: ${(p) => p.theme.radius.pill}px;
  align-items: center;
  justify-content: center;
  padding-horizontal: ${(p) => p.theme.space(6)}px;
  background-color: ${(p) => p.$bg};
  opacity: ${(p) => (p.$inactive ? 0.45 : 1)};
`;

const ButtonLabel = styled.Text<{ $fg: string }>`
  font-size: 16px;
  font-weight: 700;
  color: ${(p) => p.$fg};
`;

export function Button({
  label,
  onPress,
  variant = "lime",
  loading = false,
  disabled = false,
  tall = false,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  tall?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const fill = FILL[variant];
  const inactive = disabled || loading;

  return (
    <Touchable
      onPress={inactive ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      $bg={fill.bg}
      $inactive={inactive}
      $tall={tall}
      style={style}
    >
      {loading ? (
        <ActivityIndicator color={fill.fg} />
      ) : (
        <ButtonLabel $fg={fill.fg}>{label}</ButtonLabel>
      )}
    </Touchable>
  );
}

/* ------------------------------------------------------------------ */
/* Pill                                                                */
/* ------------------------------------------------------------------ */

const PillBox = styled.View<{ $bg: string }>`
  padding-horizontal: ${(p) => p.theme.space(3)}px;
  padding-vertical: 5px;
  border-radius: ${(p) => p.theme.radius.pill}px;
  background-color: ${(p) => p.$bg};
  align-self: flex-start;
`;

const PillText = styled.Text<{ $fg: string }>`
  font-size: 11px;
  font-weight: 600;
  color: ${(p) => p.$fg};
`;

export function Pill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "pos" | "neg" | "lime" | "ink";
}) {
  const map = {
    neutral: { bg: theme.colors.surfaceAlt, fg: theme.colors.muted },
    pos: { bg: theme.colors.posSoft, fg: theme.colors.pos },
    neg: { bg: theme.colors.negSoft, fg: theme.colors.neg },
    lime: { bg: theme.colors.limeSoft, fg: theme.colors.onLime },
    ink: { bg: theme.colors.ink, fg: theme.colors.onInk },
  }[tone];

  return (
    <PillBox $bg={map.bg}>
      <PillText $fg={map.fg}>{label}</PillText>
    </PillBox>
  );
}

/* ------------------------------------------------------------------ */
/* Delta                                                               */
/* ------------------------------------------------------------------ */

const DeltaText = styled.Text<{ $fg: string }>`
  font-size: 13px;
  font-weight: 700;
  font-variant: tabular-nums;
  color: ${(p) => p.$fg};
`;

/**
 * A percentage with its direction.
 *
 * Null means unknown — a market whose whole history sits inside the window, or
 * a read that came back short. That renders as an em dash with no arrow and no
 * colour, because an arrow is a claim about which way a price moved and
 * pointing one at a number nobody measured is what a trading screen must never
 * do. The sign is always written out, so the arrow is never the only signal.
 */
export function Delta({ pct }: { pct: number | null | undefined }) {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) {
    return <DeltaText $fg={theme.colors.faint}>—</DeltaText>;
  }
  const up = pct >= 0;
  return (
    <DeltaText $fg={up ? theme.colors.pos : theme.colors.neg}>
      {up ? "▲" : "▼"} {up ? "+" : ""}
      {(pct * 100).toFixed(2)}%
    </DeltaText>
  );
}

/** The green/red badge from the portfolio reference. */
const BadgeBox = styled.View<{ $bg: string }>`
  padding-horizontal: 10px;
  padding-vertical: 4px;
  border-radius: ${(p) => p.theme.radius.pill}px;
  background-color: ${(p) => p.$bg};
  align-self: center;
`;

export function DeltaBadge({ pct }: { pct: number | null | undefined }) {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) {
    return (
      <BadgeBox $bg={theme.colors.surfaceAlt}>
        <PillText $fg={theme.colors.faint}>—</PillText>
      </BadgeBox>
    );
  }
  const up = pct >= 0;
  return (
    <BadgeBox $bg={up ? theme.colors.posSoft : theme.colors.negSoft}>
      <PillText $fg={up ? theme.colors.pos : theme.colors.neg}>
        {up ? "+" : ""}
        {(pct * 100).toFixed(1)}%
      </PillText>
    </BadgeBox>
  );
}

/* ------------------------------------------------------------------ */
/* Stat — the three-up row from the profile reference                  */
/* ------------------------------------------------------------------ */

const StatCol = styled.View`
  flex: 1;
  align-items: center;
  gap: 2px;
`;

const StatValue = styled.Text<{ $fg?: string }>`
  font-size: 17px;
  font-weight: 700;
  font-variant: tabular-nums;
  color: ${(p) => p.$fg ?? p.theme.colors.text};
`;

export function Stat({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone?: "pos" | "neg";
}) {
  return (
    <StatCol>
      <StatValue
        $fg={tone === "pos" ? theme.colors.pos : tone === "neg" ? theme.colors.neg : undefined}
      >
        {value}
      </StatValue>
      <Caption>{label}</Caption>
    </StatCol>
  );
}

/* ------------------------------------------------------------------ */
/* Tabs — the underline row from the profile reference                 */
/* ------------------------------------------------------------------ */

const TabRow = styled.View`
  flex-direction: row;
  border-bottom-width: 1px;
  border-bottom-color: ${(p) => p.theme.colors.line};
`;

const TabItem = styled.Pressable<{ $on: boolean }>`
  flex: 1;
  align-items: center;
  padding-vertical: ${(p) => p.theme.space(3)}px;
  border-bottom-width: 2px;
  border-bottom-color: ${(p) => (p.$on ? p.theme.colors.text : "transparent")};
`;

const TabLabel = styled.Text<{ $on: boolean }>`
  font-size: 14px;
  font-weight: ${(p) => (p.$on ? 700 : 500)};
  color: ${(p) => (p.$on ? p.theme.colors.text : p.theme.colors.faint)};
`;

export function Tabs<T extends string>({
  items,
  value,
  onChange,
}: {
  items: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <TabRow>
      {items.map((item) => (
        <TabItem
          key={item.id}
          $on={item.id === value}
          onPress={() => onChange(item.id)}
          accessibilityRole="tab"
          accessibilityState={{ selected: item.id === value }}
        >
          <TabLabel $on={item.id === value}>{item.label}</TabLabel>
        </TabItem>
      ))}
    </TabRow>
  );
}

/** Rounded segmented control — the Minute/Hour/Day row from reference 3. */
const SegRow = styled.View`
  flex-direction: row;
  gap: ${(p) => p.theme.space(1)}px;
`;

const Seg = styled.Pressable<{ $on: boolean }>`
  padding-horizontal: ${(p) => p.theme.space(3)}px;
  padding-vertical: ${(p) => p.theme.space(2)}px;
  border-radius: ${(p) => p.theme.radius.pill}px;
  background-color: ${(p) => (p.$on ? p.theme.colors.lime : "transparent")};
`;

const SegLabel = styled.Text<{ $on: boolean }>`
  font-size: 12px;
  font-weight: ${(p) => (p.$on ? 700 : 500)};
  color: ${(p) => (p.$on ? p.theme.colors.onLime : p.theme.colors.muted)};
`;

export function Segmented<T extends string>({
  items,
  value,
  onChange,
}: {
  items: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <SegRow>
      {items.map((item) => (
        <Seg key={item.id} $on={item.id === value} onPress={() => onChange(item.id)}>
          <SegLabel $on={item.id === value}>{item.label}</SegLabel>
        </Seg>
      ))}
    </SegRow>
  );
}

/* ------------------------------------------------------------------ */
/* States                                                              */
/* ------------------------------------------------------------------ */

const PlaceholderBox = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: ${(p) => p.theme.space(8)}px;
  gap: ${(p) => p.theme.space(1)}px;
`;

const PlaceholderTitle = styled.Text`
  font-size: 15px;
  font-weight: 700;
  color: ${(p) => p.theme.colors.text};
  text-align: center;
`;

const PlaceholderDetail = styled.Text`
  font-size: 14px;
  line-height: 21px;
  color: ${(p) => p.theme.colors.muted};
  text-align: center;
`;

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
    <PlaceholderBox>
      {busy ? <ActivityIndicator color={theme.colors.muted} /> : null}
      <PlaceholderTitle>{title}</PlaceholderTitle>
      {detail ? <PlaceholderDetail>{detail}</PlaceholderDetail> : null}
      {action ? <Spacer h={16} /> : null}
      {action}
    </PlaceholderBox>
  );
}

export const Skeleton = styled.View<{ h?: number; w?: string | number; round?: number }>`
  height: ${(p) => p.h ?? 16}px;
  width: ${(p) => (typeof p.w === "number" ? `${p.w}px` : (p.w ?? "100%"))};
  border-radius: ${(p) => p.round ?? p.theme.radius.sm}px;
  background-color: ${(p) => p.theme.colors.line};
`;

export const Avatar = styled.Image<{ size?: number }>`
  width: ${(p) => p.size ?? 26}px;
  height: ${(p) => p.size ?? 26}px;
  border-radius: ${(p) => (p.size ?? 26) / 2}px;
  background-color: ${(p) => p.theme.colors.surfaceAlt};
`;

/** Curve progress. Lime as it approaches the migration threshold. */
const Track = styled.View`
  height: 6px;
  border-radius: 3px;
  background-color: ${(p) => p.theme.colors.line};
  overflow: hidden;
`;

const Fill = styled.View<{ $pct: number }>`
  height: 6px;
  width: ${(p) => Math.max(2, Math.min(100, p.$pct))}%;
  background-color: ${(p) => (p.$pct > 70 ? p.theme.colors.lime : p.theme.colors.pos)};
`;

export function Progress({ pct }: { pct: number }) {
  return (
    <Track>
      <Fill $pct={pct} />
    </Track>
  );
}
