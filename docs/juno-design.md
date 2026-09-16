# Juno — design and DBC reference

Juno is a content-coin app on Solana. Every post is a token, and every token is
a [Meteora Dynamic Bonding Curve][dbc] pool that graduates into DAMM v2
liquidity.

This document records the two things that are easy to get wrong later: what
the design tokens mean, and why the curve presets are shaped the way they are.

## Palette

The layout and component anatomy were modelled on Zora — that structure is a
good answer for this product. The palette deliberately is not: Juno is its own
thing and should not read as a reskin. Where Zora is stark white with a neon
green, Juno is deep space with Jupiter amber.

All tokens live in `app/globals.css` under `.juno`.

| Token | Value | Role |
| --- | --- | --- |
| `--j-bg` | `#0d0b12` | canvas — near-black, violet cast so ambers read warm |
| `--j-ink` | `#f4f1f8` | primary text; also the high-contrast button fill |
| `--j-muted` | `#a79fb8` | labels, secondary text |
| `--j-faint` | `#6f6684` | placeholders, inactive tabs |
| `--j-surface` | `#171320` | chips, search pill, menus |
| `--j-input` | `#141020` | trade amount field |
| `--j-line` / `--j-line-strong` | `#241e31` / `#3a3150` | hairlines, borders |
| `--j-brand` | `#ffb020` | mark and graduation bar **only** |
| `--j-pos` | `#1fd98a` | buy, and positive deltas |
| `--j-neg` | `#ff5c6c` | sell, and negative deltas |
| `--j-danger` | `#ff4d4d` | amount exceeds balance |
| `--j-focus` | `#7c6bff` | focus ring |

Three rules hold this together:

1. **Brand never drives a control.** Amber is the mark and the graduation bar.
   If it also fought for the Buy button, neither would mean anything.
2. **Direction owns saturation.** Jade and coral are the only other saturated
   colours, and they only ever mean buy/up and sell/down.
3. **Bright fills take the canvas colour as their label** (`text-j-bg`), not
   white. White on `#1fd98a` fails contrast; dark-on-bright passes and hits
   harder.

Jade/coral also separate on both hue *and* lightness, so they stay
distinguishable for red-green colour blindness — which Zora's green/magenta
pairing does not.

The graduation bar is a gradient, not a flat fill: `#1fd98a → #ffb020 →
#ffe066`. Jade while there is curve left to buy through, amber as the pool
approaches its migration threshold.

Scoping note: Juno and Norr currently share one Next app and one `:root`, so
Juno's tokens live under a `.juno` class that `components/juno/JunoShell.tsx`
applies. `lib/juno/routes.ts` lists the routes Juno owns, so Norr's global
chrome (the 18+ gate) stands down on them.

## Routes

| Route | What it is |
| --- | --- |
| `/explore` | grid of every coin; `?q=` searches, `?sort=trending` ranks by 24h volume |
| `/reels` | full-bleed vertical swipe feed |
| `/coin/[address]` | a coin's page — media, stats, trade panel, activity |
| `/creator/[handle]` | profile: posts, reels, collected, activity |
| `/create` | launch a post or reel, and pick its curve |
| `/activity` | every trade across Juno |

Juno and Norr share one app, so `lib/juno/routes.ts` declares which prefixes
Juno owns. A route missing from that list still renders correctly and then
gets Norr's 18+ gate painted over it — a silent failure, so
`tests/unit/juno-routes.test.ts` asserts the list covers every directory under
`app/(juno)/`.

## Component map

```
components/juno/
  JunoShell            app frame — header, rail, mobile nav, token scope
  TopBar               brand lockup, search, auth (full width, above the rail)
  SideRail             fixed icon rail, lg and up
  MobileNav            bottom tab bar, under lg
  GetTheAppCard        dismissible card with a real QR
  ui/
    Button, IconButton pill buttons; `buy` / `sell` / `contrast` fills
    Pill               capsule — ticker, Copy address
    Avatar             optional ring for the profile header
    Delta              value + direction triangle (jade up, coral down)
    StatCards          the three-cell bordered stat block
    Tabs               underlined tabs, full WAI-ARIA keyboard support
    JunoMark           the CSS-only banded gas-giant mark
  profile/
    ProfileHeader      identity, creator-coin MC, Buy / Follow / Message
    ProfileTabs        posts / reels / collected / activity
    MediaGrid          three-column grid, staggered on aspect ratio
  coin/
    CoinMedia          media with artwork ⇄ chart toggle
    CoinSummary        creator row, title, chips, stats, curve progress
    CurveProgress      graduation bar (+ thin overlay variant)
    TradePanel         buy/sell, amount, presets, quote, comment, CTA
    TokenSelect        quote-token picker; marks non-native as `routed`
    CoinTabs           Activity / Holders / Comments / Details
    ActivityList       trade rows, shared by the coin tab and /activity
  reels/
    ReelFeed           snap feed; one video plays, driven by IntersectionObserver
    ReelCard           a single reel + its overlay
    QuickBuySheet      impulse-buy surface, deliberately not the full panel
```

### Posts and reels

`Coin.format` is `"post"` or `"reel"`. The distinction is not cosmetic:

- Posts are any aspect ratio, live in the grid, and open on a coin page.
- Reels are vertical video, live in the swipe feed, and default to the
  `content` curve — someone buying mid-scroll is making a much faster decision
  than someone reading a coin page, so the buy surface is a four-button sheet
  rather than the full trade panel.

Only the active reel plays. An `IntersectionObserver` on the scroll container
decides which one that is, which is far cheaper than a scroll handler doing
maths every frame, and it keeps three videos from decoding at once.

### Trade amounts

`TradePanel`'s `amountIn` is in the **input token's** UI units — quote units on
a buy, base units on a sell. That is the same convention `quoteTrade` in
`lib/juno/dbc.ts` uses, deliberately, so the two cannot drift. It is why sell
presets are shares of holdings (`25% / 50% / 75% / Max`) rather than dollar
amounts: a dollar figure is meaningless when the thing you are sizing is a
token balance.

## Curve presets

`lib/juno/curves.ts`. DBC allows sixteen curve segments with a liquidity
weight each (`buildCurveWithLiquidityWeights`). The weights are what give a
launch its character:

> more liquidity in a segment → more supply absorbed per unit of price → a
> flatter stretch of curve

A memecoin launch back-loads its weights — nearly free at the start, near
vertical at the end, graduate as fast as possible. Equity-like launches want
different properties in different places.

| Preset | Shape | For |
| --- | --- | --- |
| `content` | back-loaded (`1.2^i`) | default for a post; cheap entry, steepens with attention |
| `thin-name` | front-loaded (`0.82^i`) | newly tokenized low float; deep book at the issue price so early size does not gap the print |
| `ipo-book` | deep at both ends, thin in the middle | book-building: absorb the open, discover price mid-curve, flatten near the target cap |
| `tight-nav` | uniform | assets that should track an underlying; behaves like a spread, not a launch |

Every preset:

- decays fees from an anti-snipe opening to an equity-like spread, via
  `FeeSchedulerExponential`;
- migrates to **DAMM v2** (`MET_DAMM_V2`) — DAMM v1 is deprecated for new
  configs;
- avoids `BaseFeeMode.RateLimiter`, also deprecated for new configs;
- permanently locks the migrated liquidity, so a graduated pool keeps a floor
  instead of letting the creator pull it on day one.

`tests/unit/juno-curves.test.ts` runs each preset through the SDK's own
`validateConfigParameters`, so if Meteora tightens a constraint it fails there
rather than on mainnet.

### The `leftover` trap

`token.leftover` reads like a nicety and is not. The builder derives the supply
the curve actually consumes from the curve itself; when that lands above
`totalTokenSupply`, the excess must fit inside `leftover` or the build throws
`leftOverDelta must be less than totalLeftover`. Juno reserves 1% of supply.

Relatedly, `leftoverReceiver` must be a real key — the validator rejects
`PublicKey.default`, since an all-zeroes receiver would burn the remainder.

## On-chain surface

`lib/juno/dbc.ts` is the only module that touches the DBC program. Components
receive plain numbers in UI units; this module owns the BN arithmetic, the
decimals, and the account decoding.

Two things the Anchor-derived types get wrong, handled at that boundary with
narrow structural types:

- `VirtualPool` resolves to its outer wrapper — the real fields are under
  `.poolState`.
- `SwapResult` collapses to `any`, so `SwapQuoteResult` appears to have only
  `minimumAmountOut`.

Curve progress comes from `state.getPoolQuoteTokenCurveProgress` — the
program's own quote-side ratio, which is what gates migration. A price-derived
approximation would be a different number wearing the same label.

Quote decimals come from the quote **mint**, not the config: `PoolConfig`
carries only `tokenDecimal`, which is the base side.

## Configuration

| Variable | Purpose | Default |
| --- | --- | --- |
| `NEXT_PUBLIC_SOLANA_RPC` | RPC endpoint | `https://api.mainnet-beta.solana.com` |

Program id, identical on mainnet and devnet:
`dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN`

## Current state

Working: the full component library, the three routes (`/explore`,
`/creator/[handle]`, `/coin/[address]`), the curve presets, and the DBC read /
quote / transaction-building layer.

Not yet wired: pages read from `lib/juno/mock.ts` rather than from chain, and
no wallet adapter is connected, so the trade CTA is inert. Both are single
swap-in points — `fetchPoolSnapshot` and `quoteTrade` already return the exact
shapes the pages and `TradePanel` consume.

[dbc]: https://docs.meteora.ag/developer-guides/dbc
