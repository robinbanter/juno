---
name: Juno
description: A social app where every post is a live market — set like a ledger, not a feed of cards.
colors:
  bg: "#DCE7D5"
  surface: "#FFFFFF"
  surface-alt: "#F5F7F2"
  ink: "#12150E"
  ink-soft: "#1C2118"
  text: "#12150E"
  muted: "#5C6655"
  faint: "#8B9683"
  on-ink: "#F3F7EE"
  line: "#E2EADC"
  line-strong: "#C4D2BB"
  lime: "#D6FF3D"
  lime-press: "#C2EA2E"
  lime-soft: "#EEFFB8"
  on-lime: "#12150E"
  pos: "#0E9F6E"
  neg: "#D92D20"
  focus: "#2E5BFF"
  web-bg: "#D3E3CB"
  web-brand: "#F2E230"
  mark-1: "#FFD27A"
  mark-2: "#F0A33C"
  mark-3: "#D97B22"
  mark-4: "#F6BB5C"
  mark-shadow: "rgba(38,16,4,0.85)"
  curve-hot: "#FFE066"
typography:
  display:
    fontFamily: "SF Pro (native) / Geist Sans (web)"
    fontSize: "40px"
    fontWeight: 800
    lineHeight: "44px"
    letterSpacing: "-1.2px"
  screen:
    fontFamily: "SF Pro (native) / Geist Sans (web)"
    fontSize: "30px"
    fontWeight: 800
    lineHeight: "34px"
    letterSpacing: "-0.8px"
  heading:
    fontFamily: "SF Pro (native) / Geist Sans (web)"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: "30px"
    letterSpacing: "-0.5px"
  title:
    fontFamily: "SF Pro (native) / Geist Sans (web)"
    fontSize: "21px"
    fontWeight: 700
    lineHeight: "26px"
    letterSpacing: "-0.4px"
  lead:
    fontFamily: "SF Pro (native) / Geist Sans (web)"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: "25px"
    letterSpacing: "-0.2px"
  body:
    fontFamily: "SF Pro (native) / Geist Sans (web)"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "23px"
    letterSpacing: "-0.1px"
  label:
    fontFamily: "SF Pro (native) / Geist Sans (web)"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: "19px"
    letterSpacing: "-0.1px"
  caption:
    fontFamily: "SF Pro (native) / Geist Sans (web)"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "16px"
    letterSpacing: "0"
  micro:
    fontFamily: "SF Pro (native) / Geist Sans (web)"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: "14px"
    letterSpacing: "0.2px"
rounded:
  sm: "10px"
  md: "16px"
  lg: "22px"
  xl: "30px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "24px"
components:
  ledger:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
  ledger-entry:
    padding: "16px"
  button-primary:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.on-lime}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "48px"
    typography: "{typography.body}"
  button-primary-active:
    backgroundColor: "{colors.lime-press}"
    textColor: "{colors.on-lime}"
  button-buy:
    backgroundColor: "{colors.pos}"
    textColor: "#FFFFFF"
    rounded: "{rounded.pill}"
    height: "48px"
  button-sell:
    backgroundColor: "{colors.neg}"
    textColor: "#FFFFFF"
    rounded: "{rounded.pill}"
    height: "48px"
  button-quiet:
    backgroundColor: "{colors.surface-alt}"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    height: "48px"
  segmented-on:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.on-lime}"
    rounded: "{rounded.pill}"
    padding: "8px 12px"
  segmented-off:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
  sheet:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "0 0 34px"
  tab-active:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.on-lime}"
    rounded: "{rounded.pill}"
    height: "44px"
  post-button:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.lime}"
    rounded: "{rounded.pill}"
    height: "44px"
    width: "48px"
---

# Design

## Overview

Juno is a social app where every post is a live market. The design point of
view follows from that and from the product's first principle — *a claim the app
cannot check does not ship*:

> **A ledger, not a deck of cards.**

One sheet of paper per screen, ruled into entries. Not one floating card per
row. A feed of identically-sized white rectangles is the default shape of a
generated interface, and here it cost twelve shadows and twelve gaps of chrome
around twelve rows of content in an app whose whole subject is *a list of things
that happened*. The sheet is denser, quieter, and shaped like the record it is.

Everything else follows from the ledger:

- **Rules separate entries. Nothing else.** A second hairline *inside* an entry,
  at the same weight, makes four separators read as equally important where
  there is one. Inside an entry, hierarchy is spacing.
- **Nothing nests.** A coin reference on a post is a line item, not a filled
  well inside a card inside a canvas.
- **Figures are the subject.** This is a market app read in columns. Tabular
  numerals everywhere, left edges shared, and the number that answers the
  screen's question set at `title` while the ones supporting it stay at `label`.
- **Unknown is a state.** `—`, never `0`. Three states on every read: this is
  so, this is not so, nobody knows.

Palette and typeface are inherited and pinned — neon lime on sage, the platform
face. The point of view lives in structure, density, and the type scale, not in
a new colour.

Light only. `userInterfaceStyle` is pinned to `light` and the palette was
validated against a light surface. This is not a category default: a market app
usually reaches for dark, and Juno deliberately does not, because the product's
claim is that a market is a social object rather than a terminal.

## Colors

Sage canvas, white sheets, near-black ink, and one electric lime carrying every
primary action.

**The lime always carries dark ink.** Measured, not assumed: `#D6FF3D` on
`#12150E` is **16.00:1**; on white it is **1.15:1** and unusable. There is no
white-on-lime variant to reach for by mistake.

**Direction was re-picked for a light surface, not carried over from a dark
theme.** `pos #0E9F6E` and `neg #D92D20` pass the six palette checks against
white, but their deuteranopia separation is **ΔE 9.0** — above the floor, not
comfortably clear of it. So **direction is never colour alone**: every delta
carries a sign, every trade spells out "bought" or "sold", and the caret glyph
is a second non-colour signal.

The lime is an action colour and never decoration. Graduation progress and the
brand mark are the only non-interactive things allowed to use it.

`--j-brand #F2E230` exists on web only, for the mark and the graduation bar. It
is never a control.

The graduation bar runs `pos → brand → curve-hot` (`--j-curve`): jade while
there is curve left to buy through, warming as the pool approaches its migration
threshold. `curve-hot #FFE066` appears only as that gradient's end stop.

`mark-1` through `mark-4` and `mark-shadow` are the Juno mark's own gradient and
terminator (`JunoMark.tsx`) — a brand asset, not a UI ramp. Nothing else in the
product may use them.

## Typography

One family, one scale, ratio ~1.15. A product UI carries more type elements than
a brand surface, so the steps are deliberately close — exaggerated contrast
between a label and the value beside it reads as noise, not hierarchy. Weight and
colour separate at the small end; size only takes over at `title`.

Sizes: `micro 11 · caption 12 · label 14 · body 16 · lead 17 · title 21 ·
heading 26 · screen 30 · display 40`. Every native size comes from
`theme.type`, so no screen can invent a fifteenth; before this there were
fourteen ad-hoc sizes between 11 and 44.

The web was set on its own near-miss ramp — 13 where native used 14, 15 where
native used 16, three different sizes (24/26/28) doing one heading's job. Those
were not extra steps, they were the same roles a pixel or two adrift, and they
are now on the shared ramp. `heading 26` is the one genuine step the web needed
that native did not: a section heading between `title` and `screen`.

Negative tracking above `body`: a grotesque's default spacing was drawn for 16px
and looks loose at 30 and 40.

**Figures are typeset, not costumed.** `Mono` is the platform face with
`font-variant: tabular-nums` — *not* a monospace family. Monospace as a stand-in
for "technical" is a costume; tabular numerals are the actual requirement, because
every figure in this product is compared against the one above it.

Native text scales with Dynamic Type; `allowFontScaling` is never disabled.

## Layout

- **8pt grid.** `space(n) = n * 4`; entries pad at 16.
- **Ledger, not cards.** `Ledger` + `Entry` (`components/kit.tsx`) is the
  default container for any list. `Card` remains for a single self-contained
  panel — a chart, a form — never for rows of the same shape.
- **Hairlines at device scale.** `theme.hairline` is `StyleSheet.hairlineWidth`.
  A rule declared as `1` renders three device pixels thick on a 3× screen, which
  is the commonest reason a light interface looks heavier than it was drawn.
- **Safe areas are respected**; the tab bar is 86pt on iOS with 26pt bottom
  padding, and pushed routes pin their action bar to `bottom: 0` with clearance
  for the home indicator.
- **Touch targets ≥44pt.** Tab slots, buttons and the sheet's grab area are all
  taller than the mark they draw.

## Elevation & Depth

Light surfaces need far less spread than dark ones to read as lifted; a dark
theme's 40px blur looks like smoke here.

- `card`: `0 5px 14px rgba(42,51,38,0.07)`
- `raised`: `0 10px 22px rgba(42,51,38,0.14)` — the tab bar and the sheet.

Every shadow carries an offset *and* a soft blur. No zero-offset halos, no hard
block shadows, no glass or backdrop-blur as decoration.

## Shapes

`sm 10 · md 16 · lg 22 · xl 30 · pill 999`.

Sheets take `xl` on their top corners only. Ledgers and cards take `lg`. Chips,
buttons and the active tab pill take `pill`. Coin artwork takes `md` at list
size and `lg` at header size.

## Components

- **`Ledger` / `Entry`** — the default list container. `Entry $first` carries no
  rule above it.
- **`Button`** — five variants (`lime` primary, `ink`, `buy`, `sell`, `quiet`),
  48pt tall, pill. Every one scales to 0.97 on press.
- **`Tappable`** — any pressable surface, scaling to 0.97–0.985. On a phone
  there is no hover state; the press is the entire conversation.
- **`BottomSheet`** — overlay, not `Modal` (a `Modal` is a separate `UIWindow`
  on iOS and puts the sheet outside the view tree). Spring in, 230ms ease-out
  down, scrim opacity interpolated from the sheet's own position, native
  `Gesture.Pan()` drag-to-dismiss at 28% of height or 0.55px/ms.
- **`Delta` / `Figure` / `Mono`** — the figure vocabulary. `Delta` renders `—`
  with no caret and no colour when the value is unknown.
- **`Placeholder`** — every failure state carries a *Try again* action.
- **Icons** — authored SVG at a **1.9 stroke**, one consistent set. No icon
  font, no emoji, and no typographic characters standing in for glyphs.

### Browser surfaces (web)

The parts nobody draws still carry the design, and they are the cheapest signal
that a page was built rather than assembled. Scoped to `.juno`: `::selection` in
brand-on-ink, `caret-color` in ink, `accent-color` in `pos`, a focus ring in
`--j-focus` (Norr's is crimson and belongs to another product), a real 10px
themed scrollbar (the app above hides scrollbars globally, which is wrong on a
market list where the bar is the only thing saying how much record is left), a
3px underline offset, and `font-variant-numeric: tabular-nums` on every figure
element.

## Do's and Don'ts

**Do**

- Reach for `Ledger` + `Entry` before `Card` for anything that repeats.
- Put the number that answers the screen's question at `title` or above, and
  everything supporting it at `label` or below.
- Spell direction out in words as well as colour.
- Render an unmeasured value as `—`.
- Give every failure state something to press.
- Draw new icons as SVG at the 1.9 stroke.

**Don't**

- **No cards as page structure.** A deck of same-sized rectangles is the lazy
  container, and nested cards are always wrong.
- **No eyebrow or kicker above a heading.** No brief earns it back; the heading
  carries its own weight.
- **No coloured `border-left` above 1px** on an entry to signal state. A stripe
  doing a figure's job. Direction belongs in the number.
- **No unicode glyph standing in for an icon** — `›`, `‹`, `▲`, `▼`, `↗` are
  type set in the body face, carrying its weight and baseline rather than the
  icon set's.
- **No staggered list entrance, and no page-load choreography.** These surfaces
  are for completing a task; the feed already takes fifteen seconds to read and
  a cascade on top is asking someone to watch it load. Motion conveys state —
  a press, a sheet, a glyph turning — and nothing else.
- **No hero-metric template**: big number, three supporting stats in their own
  card, accent badge. Put the supporting figures under the figure they support,
  on one sheet.
- No gradient text, no glassmorphism, no monospace as a costume, no progress
  rings or sparklines standing in for content.
- No white text on lime, ever.
