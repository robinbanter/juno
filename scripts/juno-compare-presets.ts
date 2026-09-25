/**
 * The four curve presets, side by side, on one controlled config.
 *
 * Every preset is built at the same starting and migration market cap and the
 * same quote token, so the only thing that differs between rows is the
 * sixteen liquidity weights. That is the comparison the presets' taglines
 * claim — "deep at the issue price", "near-flat" — measured instead of
 * asserted.
 *
 * Pure maths: `buildCurveWithLiquidityWeights` is local, no RPC, no pool, no
 * transaction. Nothing here costs anything or touches a chain.
 *
 *   npx tsx scripts/juno-compare-presets.ts [--initial 1000] [--migration 25000] [--markdown]
 *
 * How the numbers are read off the curve: inside one segment DBC is
 * concentrated liquidity, so the quote needed to move the square-root price
 * from a to b is L·(b − a), and a 1% price move is a √1.01 move in root price.
 * The raw products are calibrated against the config's own
 * `migrationQuoteThreshold` — the whole curve must sum to exactly what the
 * program says graduation takes — so a wrong scale factor cannot hide.
 */
import { buildCurveWithLiquidityWeights, type TokenDecimal } from "@meteora-ag/dynamic-bonding-curve-sdk";
import type BN from "bn.js";

import { CURVE_PRESET_LIST, buildPresetParams, type CurvePreset } from "../lib/juno/curves";

type CurvePresetId = CurvePreset["id"];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const QUOTE_DECIMALS = 6; // USDC: quote amounts below read directly as dollars
const BASE_DECIMALS = 6;

type Segment = { from: number; to: number; liquidity: number };

type Row = {
  preset: CurvePresetId;
  raised: number;
  startPrice: number;
  endPrice: number;
  /** Quote that moves price 1%, at the open. */
  onePctAtOpen: number;
  /** Same, once 25/50/75% of the graduation quote has come in. */
  onePctAt: number[];
  /** Same, just before graduation. */
  onePctAtClose: number;
  /** Quote it takes to double the opening price. */
  toDouble: number;
  /** Largest 1% depth over smallest, across the curve. */
  depthSpread: number;
};

function num(value: BN): number {
  return Number(value.toString());
}

function analyse(preset: CurvePresetId, initial: number, migration: number): Row {
  const config = buildCurveWithLiquidityWeights(
    buildPresetParams({
      preset,
      initialMarketCap: initial,
      migrationMarketCap: migration,
      quoteDecimals: QUOTE_DECIMALS as TokenDecimal,
    }),
  ) as unknown as {
    sqrtStartPrice: BN;
    curve: Array<{ sqrtPrice: BN; liquidity: BN }>;
    migrationQuoteThreshold: BN;
  };

  // Root prices as plain numbers, in the program's Q64 units. Relative
  // precision is all that matters: every answer is calibrated below.
  const segments: Segment[] = [];
  let from = num(config.sqrtStartPrice);
  for (const point of config.curve) {
    if (point.liquidity.isZero()) continue;
    const to = num(point.sqrtPrice);
    segments.push({ from, to, liquidity: num(point.liquidity) });
    from = to;
  }

  const rawTotal = segments.reduce((sum, s) => sum + s.liquidity * (s.to - s.from), 0);
  const raised = num(config.migrationQuoteThreshold) / 10 ** QUOTE_DECIMALS;
  const scale = raised / rawTotal; // raw L·Δ√P → dollars

  const Q64 = 2 ** 64;
  const priceOf = (sqrt: number) =>
    (sqrt / Q64) ** 2 * 10 ** (BASE_DECIMALS - QUOTE_DECIMALS);

  // Walk the curve: where are we after `spent` dollars have come in?
  const locate = (spent: number): { sqrt: number; segment: Segment } => {
    let left = spent;
    for (const segment of segments) {
      const whole = segment.liquidity * (segment.to - segment.from) * scale;
      if (left <= whole) {
        return { sqrt: segment.from + left / (segment.liquidity * scale), segment };
      }
      left -= whole;
    }
    const last = segments[segments.length - 1];
    return { sqrt: last.to, segment: last };
  };

  // Quote to move 1% up from a point, walking across segment boundaries.
  const quoteToMove = (sqrt: number, factor: number): number => {
    const target = sqrt * Math.sqrt(factor);
    let cost = 0;
    for (const s of segments) {
      const lo = Math.max(s.from, sqrt);
      const hi = Math.min(s.to, target);
      if (hi > lo) cost += s.liquidity * (hi - lo) * scale;
    }
    return cost;
  };

  const start = segments[0].from;
  const end = segments[segments.length - 1].to;
  const onePctAt = [0.25, 0.5, 0.75].map((f) => quoteToMove(locate(raised * f).sqrt, 1.01));
  const onePctAtOpen = quoteToMove(start, 1.01);
  const onePctAtClose = quoteToMove(end / Math.sqrt(1.01), 1.01);
  const all = [onePctAtOpen, ...onePctAt, onePctAtClose];

  return {
    preset,
    raised,
    startPrice: priceOf(start),
    endPrice: priceOf(end),
    onePctAtOpen,
    onePctAt,
    onePctAtClose,
    toDouble: priceOf(end) / priceOf(start) >= 2 ? quoteToMove(start, 2) : NaN,
    depthSpread: Math.max(...all) / Math.min(...all),
  };
}

const usd = (n: number) =>
  Number.isNaN(n) ? "—" : n >= 1000 ? `$${Math.round(n).toLocaleString("en-US")}` : `$${n.toFixed(2)}`;

function table(initial: number, migration: number) {
  const rows = CURVE_PRESET_LIST.map((p) => analyse(p.id, initial, migration));
  const markdown = process.argv.includes("--markdown");

  const header = [
    "preset",
    "raised to graduate",
    "end/start price",
    "1% at open",
    "1% at 25%",
    "1% at 50%",
    "1% at 75%",
    "1% at close",
    "to 2× open price",
    "deepest/thinnest",
  ];
  const body = rows.map((r) => [
    `\`${r.preset}\``,
    usd(r.raised),
    `${(r.endPrice / r.startPrice).toFixed(1)}×`,
    usd(r.onePctAtOpen),
    ...r.onePctAt.map(usd),
    usd(r.onePctAtClose),
    usd(r.toDouble),
    `${r.depthSpread.toFixed(1)}×`,
  ]);

  console.log(
    `\nFDV $${initial.toLocaleString("en-US")} → $${migration.toLocaleString("en-US")}, USDC quote, 1B supply. "1% at X%" = dollars that move price 1% once X% of the graduation quote is in.\n`,
  );
  if (markdown) {
    console.log(`| ${header.join(" | ")} |`);
    console.log(`|${header.map(() => "---").join("|")}|`);
    for (const line of body) console.log(`| ${line.join(" | ")} |`);
  } else {
    const widths = header.map((h, i) => Math.max(h.length, ...body.map((b) => b[i].length)));
    const fmt = (cells: string[]) => cells.map((c, i) => c.padStart(widths[i])).join("  ");
    console.log(fmt(header));
    for (const line of body) console.log(fmt(line));
  }
  return rows;
}

const initial = Number(arg("initial") ?? 1_000);
const migration = Number(arg("migration") ?? 25_000);
table(initial, migration);

// E2: is tight-nav near-flat? Only if the caps say so — weights place
// liquidity within a price range, they cannot shrink the range.
if (!arg("initial") && !arg("migration")) {
  table(100_000, 120_000);
}
