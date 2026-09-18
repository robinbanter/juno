import { PublicKey } from "@solana/web3.js";

/**
 * Pyth price accounts on Solana, read straight off the chain.
 *
 * Pyth's pull oracle posts verified prices into `PriceUpdateV2` accounts owned
 * by the Pyth Solana Receiver. For a set of sponsored feeds, the Pyth Data
 * Association keeps those accounts updated on its own dime at fixed
 * addresses — PDAs of the push-oracle program, seeded by a shard id and the
 * feed id. Reading one needs a plain `getAccountInfo`, no key and no Hermes.
 *
 * Program ids and the PDA derivation are taken from
 * `@pythnetwork/pyth-solana-receiver` 0.13.0 (`address.ts`,
 * `getPriceFeedAccountForProgram`); the byte layout from that package's
 * `pyth_solana_receiver` IDL. They are the same on devnet and mainnet.
 *
 * Pure: no RPC here, so it can be unit-tested and imported anywhere.
 */

export const PYTH_RECEIVER_PROGRAM = "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ";
export const PYTH_PUSH_ORACLE_PROGRAM = "pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT";

/**
 * Sponsored feeds live on shard 0, but not every feed is refreshed there on
 * every cluster — mainnet's fresh equity prices are on shard 1, for one. The
 * reader checks both and keeps the newest.
 */
export const PYTH_SHARDS = [0, 1] as const;

/** Anchor discriminator: `sha256("account:PriceUpdateV2")[0..8]`. */
export const PRICE_UPDATE_V2_DISCRIMINATOR = Uint8Array.from([
  34, 241, 35, 99, 157, 126, 244, 205,
]);

export function priceFeedAccount(feedIdHex: string, shard = 0): PublicKey {
  const id = feedIdHex.replace(/^0x/, "");
  if (!/^[0-9a-f]{64}$/i.test(id)) throw new Error(`Not a Pyth feed id: ${feedIdHex}`);
  const shardSeed = new Uint8Array(2);
  new DataView(shardSeed.buffer).setUint16(0, shard, true);
  return PublicKey.findProgramAddressSync(
    [shardSeed, hexToBytes(id)],
    new PublicKey(PYTH_PUSH_ORACLE_PROGRAM),
  )[0];
}

export type PriceUpdate = {
  feedId: string;
  /** Raw integer price; the real value is `price * 10^exponent`. */
  price: bigint;
  conf: bigint;
  exponent: number;
  /** Unix seconds. */
  publishTime: number;
  /**
   * `Full` means a Wormhole guardian quorum signed the update. `Partial`
   * carries how many signatures were checked.
   */
  verification: { level: "full" } | { level: "partial"; signatures: number };
  postedSlot: bigint;
};

/**
 * Decode a `PriceUpdateV2` account. Returns null for anything that is not
 * one — wrong discriminator, truncated data — rather than throwing, so a
 * surprise at one address cannot take a page down.
 *
 * Layout (Borsh, after the 8-byte discriminator):
 *   write_authority     Pubkey  32
 *   verification_level  enum    1 (+1 for Partial's num_signatures)
 *   feed_id             [u8;32] 32
 *   price               i64     8
 *   conf                u64     8
 *   exponent            i32     4
 *   publish_time        i64     8
 *   prev_publish_time   i64     8
 *   ema_price           i64     8
 *   ema_conf            u64     8
 *   posted_slot         u64     8
 *
 * The enum is variable-width, so every offset after it moves by one byte
 * between Full and Partial accounts. A fixed-offset reader gets Partial wrong.
 */
export function decodePriceUpdateV2(data: Uint8Array): PriceUpdate | null {
  if (data.length < 8 + 32 + 1) return null;
  for (let i = 0; i < 8; i++) {
    if (data[i] !== PRICE_UPDATE_V2_DISCRIMINATOR[i]) return null;
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let o = 8 + 32;

  const tag = data[o++];
  let verification: PriceUpdate["verification"];
  if (tag === 0) {
    verification = { level: "partial", signatures: data[o++] };
  } else if (tag === 1) {
    verification = { level: "full" };
  } else {
    return null;
  }

  if (data.length < o + 32 + 8 * 7 + 4) return null;
  const feedId = bytesToHex(data.subarray(o, o + 32));
  o += 32;
  const price = view.getBigInt64(o, true);
  o += 8;
  const conf = view.getBigUint64(o, true);
  o += 8;
  const exponent = view.getInt32(o, true);
  o += 4;
  const publishTime = Number(view.getBigInt64(o, true));
  o += 8;
  o += 8 + 8 + 8; // prev_publish_time, ema_price, ema_conf
  const postedSlot = view.getBigUint64(o, true);

  return { feedId, price, conf, exponent, publishTime, verification, postedSlot };
}

/** `price * 10^exponent` as a float — fine for display and band maths. */
export function scaled(value: bigint, exponent: number): number {
  return Number(value) * 10 ** exponent;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
