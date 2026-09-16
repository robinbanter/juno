import "server-only";

import { eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import { userBalances } from "./db/schema";
import { STABLECOIN_DECIMALS } from "./constants";

/**
 * The single place a spend is authorised against the wallet.
 *
 * Every spend (unlock, region unlock, withdrawal) settles on-chain
 * asynchronously, so the money is committed before it has left the wallet. That
 * gap is tracked as `escrow`, and the only safe question is:
 *
 *     is (on-chain − escrow) >= amount, RIGHT NOW, with nobody else deciding?
 *
 * Both paths used to answer it with an unlocked read and then act — a textbook
 * check-then-act race across two code paths that never touched the same row.
 * Measured: firing an unlock and a withdrawal together, a fan unlocked a $4.00
 * post AND withdrew the whole $6.00 balance, keeping the media and the money.
 *
 * `SELECT … FOR UPDATE` on the balance row is what serializes them: whoever gets
 * the lock first escrows, and the other then *sees* that escrow and is refused.
 *
 * The on-chain figure is read before the lock — it must be, it's a network call —
 * and that is sound, because on-chain only decreases via spends and every spend
 * escrows here first. The escrow can never under-count what's committed.
 */

const SCALE = BigInt(10) ** BigInt(STABLECOIN_DECIMALS);

export function usdToUnits(value: string): bigint {
  const raw = (value ?? "0").trim();
  const negative = raw.startsWith("-");
  const [whole = "0", frac = ""] = (negative ? raw.slice(1) : raw).split(".");
  const units =
    BigInt(whole || "0") * SCALE +
    BigInt(frac.padEnd(STABLECOIN_DECIMALS, "0").slice(0, STABLECOIN_DECIMALS) || "0");
  return negative ? -units : units;
}

export function unitsToUsd(units: bigint): string {
  const negative = units < BigInt(0);
  const u = negative ? -units : units;
  return `${negative ? "-" : ""}${u / SCALE}.${(u % SCALE).toString().padStart(STABLECOIN_DECIMALS, "0")}00`;
}

/**
 * What the chain will ACTUALLY take for this amount.
 *
 * The ledger stores 8dp; USDC is 6dp. The transfer rounds UP (you cannot send a
 * fraction of a base unit), so truncating here would authorise less than the
 * transfer spends: `1.50000001` escrowed 1500000 while the chain took 1500001,
 * and `0.00000001` escrowed NOTHING while still spending a unit — a reservation
 * invisible to the next caller's check.
 *
 * Rounding the authorisation the same way the transfer rounds keeps escrow >=
 * spend, always. Erring toward reserving too much is the safe direction; erring
 * the other way is how you authorise money that is already gone.
 */
export function usdToChainUnits(value: string): bigint {
  const units = usdToUnits8dp(value);
  const divisor = BigInt(10) ** BigInt(LEDGER_DECIMALS - STABLECOIN_DECIMALS);
  const negative = units < BigInt(0);
  const u = negative ? -units : units;
  const ceiled = (u + divisor - BigInt(1)) / divisor;
  return negative ? -ceiled : ceiled;
}

const LEDGER_DECIMALS = 8;

/** Full 8dp ledger precision — for reading stored balances exactly. */
function usdToUnits8dp(value: string): bigint {
  const raw = (value ?? "0").trim();
  const negative = raw.startsWith("-");
  const [whole = "0", frac = ""] = (negative ? raw.slice(1) : raw).split(".");
  const units =
    BigInt(whole || "0") * BigInt(10) ** BigInt(LEDGER_DECIMALS) +
    BigInt(frac.padEnd(LEDGER_DECIMALS, "0").slice(0, LEDGER_DECIMALS) || "0");
  return negative ? -units : units;
}

export type SpendCheck = { ok: true } | { ok: false; spendable: string };

/** A drizzle transaction handle. */
type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/**
 * Lock the balance row, verify the spend fits, and escrow it — atomically.
 *
 * Call INSIDE the caller's transaction so the reservation commits or rolls back
 * with whatever else that transaction is doing (recording an unlock, say).
 */
export async function checkAndEscrow(
  tx: Tx,
  userId: string,
  amountUsd: string,
  onChainUnits: bigint,
): Promise<SpendCheck> {
  await tx.insert(userBalances).values({ userId }).onConflictDoNothing();

  // The lock. Everything below is serialized against any other spend for this
  // user; without it, two callers both read escrow=0 and both proceed.
  const [row] = await tx
    .select({ escrowedBalance: userBalances.escrowedBalance })
    .from(userBalances)
    .where(eq(userBalances.userId, userId))
    .for("update");

  const escrow = usdToUnits(row?.escrowedBalance ?? "0");
  const spendable = onChainUnits - escrow;

  // Authorise (and reserve) what the CHAIN will take, not what the 8dp ledger
  // string says — the transfer rounds up, so truncating here reserves less than
  // it spends. See usdToChainUnits.
  const want = usdToChainUnits(amountUsd);

  // `< 0`, not `<= 0`: a free post costs 0 and must still unlock. Rejecting zero
  // here broke every $0 unlock — the route calls this for them too. Only a
  // negative amount is nonsense, and it would *credit* the escrow if allowed.
  if (want < BigInt(0) || want > spendable) {
    return { ok: false, spendable: unitsToUsd(spendable > BigInt(0) ? spendable : BigInt(0)) };
  }

  // Reserve the rounded-up figure too, so the stored escrow is exactly what the
  // chain will remove. Storing the raw 8dp string would round back down on the
  // next read and make part of this reservation invisible. `releaseSpend` must
  // reproduce this EXACT figure — see there.
  const reserveUsd = escrowedFor(amountUsd);

  await tx
    .update(userBalances)
    .set({
      escrowedBalance: sql`${userBalances.escrowedBalance} + ${reserveUsd}`,
      updatedAt: new Date(),
    })
    .where(eq(userBalances.userId, userId));

  return { ok: true };
}

/** Reserve in a transaction of its own — for a spend with nothing else to record. */
export async function reserveSpend(
  userId: string,
  amountUsd: string,
  onChainUnits: bigint,
): Promise<SpendCheck> {
  return getDb().transaction((tx) => checkAndEscrow(tx, userId, amountUsd, onChainUnits));
}

/**
 * Exactly what `checkAndEscrow` stores for an amount.
 *
 * Reserve and release MUST agree to the last unit. They are the same function
 * because computing it twice is how they drift apart.
 */
export function escrowedFor(amountUsd: string): string {
  return unitsToUsd(usdToChainUnits(amountUsd));
}

/**
 * Release a reservation once the transfer resolves — either way.
 *
 * MUST run even on failure: a leaked reservation locks the user out of their own
 * money permanently. GREATEST(…, 0) so a double release can't mint spendable
 * balance out of nothing.
 *
 * Releases `escrowedFor(amount)`, NOT the raw amount — because that is what was
 * reserved. Subtracting the raw string instead would strand the rounding
 * remainder in escrow on every spend: reserving 1.50000001 stores 1.50000100,
 * so releasing 1.50000001 leaves 0.00000099 behind, for good. Amounts reach
 * here at up to 8dp (normalizeMoney allows it, and a withdrawal amount comes
 * straight from the user), so this is reachable, and it accumulates — a slow
 * leak that locks away the user's own money is worse than the rounding it came
 * from.
 */
export async function releaseSpend(userId: string, amountUsd: string): Promise<void> {
  const releaseUsd = escrowedFor(amountUsd);
  await getDb()
    .update(userBalances)
    .set({
      escrowedBalance: sql`GREATEST(${userBalances.escrowedBalance} - ${releaseUsd}, 0)`,
      updatedAt: new Date(),
    })
    .where(eq(userBalances.userId, userId));
}
