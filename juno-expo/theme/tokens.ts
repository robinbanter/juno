/**
 * Juno's light theme.
 *
 * Sage canvas, white cards, yellow as the one action colour. A trading app
 * usually reaches for dark, and this deliberately does not: the point of Juno
 * is that a market is a social object, and the feed should feel closer to a
 * place people post than to a terminal.
 *
 * ## The colours are validated, not chosen by eye
 *
 * Every value below that carries meaning was run through a six-check palette
 * validator against a white surface — lightness band, chroma floor, colourblind
 * separation of adjacent pairs, normal-vision separation, and contrast against
 * the surface.
 *
 * Two results worth recording, because they are not obvious:
 *
 * `pos`/`neg` (#0E9F6E / #D92D20) pass every check, including deuteranopia at
 * dE 9.0 — above the safe floor. That is still close enough that direction must
 * also be carried by a sign or an arrow in text; colour alone is never allowed
 * to say which way a price moved.
 *
 * The chart amber started as #F2A413, taken from the reference design, and
 * **failed**: on a light surface it contrasts at 2.08:1, under the 3:1 floor.
 * It is snapped to #C77700, which passes. A colour that reads well on a dark
 * canvas is not automatically legible on a pale one, and the validator is how
 * that gets caught rather than shipped.
 */

export const colors = {
  /** Sage canvas. */
  bg: "#D3E3CB",
  /** Raised surfaces: cards, sheets, inputs. */
  surface: "#FFFFFF",
  /** A second surface for chips and wells sitting on top of a card. */
  surfaceSunken: "#F1F5EE",

  ink: "#1C1C1C",
  muted: "#5A6357",
  faint: "#8A927F",

  line: "#DCE4D6",
  lineStrong: "#B9C6B1",

  /** The one action colour. Always paired with `ink`, never white. */
  primary: "#F2E230",
  primaryPress: "#DFD01F",
  /** Ink on primary — yellow is far too light to carry white text. */
  onPrimary: "#1C1C1C",

  /** Direction. Buy/up and sell/down. */
  pos: "#0E9F6E",
  neg: "#D92D20",

  /** Amount exceeds balance, destructive confirmations. */
  danger: "#D92D20",
  focus: "#2E5BFF",

  /** Categorical series for charts, in fixed order. Never cycled. */
  series: ["#2E5BFF", "#0E9F6E", "#C77700", "#8B5CF6"] as const,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/**
 * Type scale.
 *
 * `tabular` is set only where digits line up vertically — table rows, axis
 * ticks, balances in a list. A large standalone number uses proportional
 * figures, because equal-width digits make a display-size value look loose.
 */
export const type = {
  display: { fontSize: 40, fontWeight: "700", letterSpacing: -0.8 },
  title: { fontSize: 28, fontWeight: "700", letterSpacing: -0.4 },
  heading: { fontSize: 20, fontWeight: "700", letterSpacing: -0.2 },
  body: { fontSize: 15, fontWeight: "400" },
  bodyStrong: { fontSize: 15, fontWeight: "600" },
  label: { fontSize: 13, fontWeight: "500" },
  caption: { fontSize: 11, fontWeight: "500" },
} as const;

/**
 * Shadows.
 *
 * Light surfaces need far less spread than dark ones to read as lifted — the
 * dark theme's 40px blur at 0.6 opacity would look like smoke here.
 */
export const shadow = {
  card: {
    shadowColor: "#2A3326",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  raised: {
    shadowColor: "#2A3326",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
} as const;

export type Colors = typeof colors;
