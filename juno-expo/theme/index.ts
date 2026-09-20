import "styled-components/native";

/**
 * Juno's theme — neon lime on sage.
 *
 * Sage canvas, near-white cards, and one electric lime that carries every
 * primary action. A trading app usually reaches for dark; this deliberately
 * does not, because the point of Juno is that a market is a social object and
 * the feed should feel like somewhere people post rather than a terminal.
 *
 * ## The lime always carries dark ink
 *
 * Measured, not assumed: `#D6FF3D` against `#12150E` is **16.00:1**, and
 * against white it is **1.15:1** — unusable. So `onLime` is ink and there is
 * no white-on-lime variant to reach for by mistake.
 *
 * ## Direction colours were re-picked, not carried over
 *
 * `pos`/`neg` pass all six palette checks against the card surface, including
 * deuteranopia separation at ΔE 9.0. That is above the safe floor but not
 * comfortably clear of it, so direction is always spelled out in text beside
 * the arrow — colour is never the only thing saying which way a price moved.
 */
export const theme = {
  colors: {
    /** Sage canvas. */
    bg: "#DCE7D5",
    /** Cards, sheets, the tab bar. */
    surface: "#FFFFFF",
    /** Wells and chips sitting on a card. */
    surfaceAlt: "#F5F7F2",
    /** A near-black panel, for the one surface that wants contrast. */
    ink: "#12150E",
    inkSoft: "#1C2118",

    text: "#12150E",
    muted: "#5C6655",
    faint: "#8B9683",
    onInk: "#F3F7EE",

    line: "#E2EADC",
    lineStrong: "#C4D2BB",

    /** The one action colour. */
    lime: "#D6FF3D",
    limePress: "#C2EA2E",
    limeSoft: "#EEFFB8",
    onLime: "#12150E",

    /** Direction. */
    pos: "#0E9F6E",
    neg: "#D92D20",
    posSoft: "rgba(14,159,110,0.12)",
    negSoft: "rgba(217,45,32,0.10)",

    focus: "#2E5BFF",
    /** Chart series, in fixed order. Never cycled. */
    series: ["#2E5BFF", "#0E9F6E", "#C77700", "#8B5CF6"],
  },

  radius: { sm: 10, md: 16, lg: 22, xl: 30, pill: 999 },

  space: (n: number) => n * 4,

  /**
   * Light surfaces need far less shadow spread than dark ones to read as
   * lifted — a dark theme's 40px blur would look like smoke here.
   */
  shadow: {
    card: {
      shadowColor: "#2A3326",
      shadowOpacity: 0.07,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 5 },
      elevation: 3,
    },
    raised: {
      shadowColor: "#2A3326",
      shadowOpacity: 0.14,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 10 },
      elevation: 10,
    },
  },
} as const;

export type Theme = typeof theme;

declare module "styled-components/native" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface DefaultTheme extends Theme {}
}
