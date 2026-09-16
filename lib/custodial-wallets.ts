import "server-only";

import { eq } from "drizzle-orm";
import algosdk from "algosdk";
import { STABLECOIN_DECIMALS } from "./constants";
import {
  addressOf,
  getAccountFunding,
  getAlgoBalance,
  getAssetBalance,
  getDeployerSigner,
  getPaymentAssetId,
  getPlatformAddress,
  isOptedIn,
  optInToAsset,
  sendAlgo,
  transferAsset,
  type AlgoSigner,
} from "./algorand";
import { decryptSecretKey, encryptSecretKey } from "./custodial-keys";
export { decryptSecretKey, encryptSecretKey } from "./custodial-keys";
import { normalizeMoney } from "./custodial";
import { reserveSpend, releaseSpend } from "./spend-reservation";
import { getDb } from "./db";
import { custodialWallets } from "./db/schema";

const MONEY_SCALE = 8;
// Standard ALGO top-up for a custodial wallet: covers the 0.1 base min-balance,
// 0.1 for the USDC opt-in, and leaves ~0.1 for fees (~100 txns at 0.001 each).
// This is gas the platform provides; it is never USDC and never a balance.
const WALLET_ALGO_SEED_MICROALGOS = 300_000;
// Algorand raises an account's min balance by 0.1 ALGO per asset it opts in to.
const ASSET_MIN_BALANCE_MICROALGOS = 100_000;
// Spare ALGO kept above min-balance so the wallet can actually pay fees.
const FEE_HEADROOM_MICROALGOS = 50_000;
// The platform can't seed itself, so it needs enough ALGO on hand to opt in.
const MIN_ALGO_FOR_OPS = 205_000;




export async function getOrCreateCustodialWallet(userId: string) {
  const db = getDb();
  const existing = await db.query.custodialWallets.findFirst({
    where: eq(custodialWallets.userId, userId),
  });
  if (existing) return existing;

  const account = algosdk.generateAccount(); // ed25519 keypair
  const encrypted = encryptSecretKey(account.sk);
  // Race-safe: a concurrent request may insert first. onConflictDoNothing on the
  // unique userId lets the loser skip, then we re-select the winning row so both
  // callers converge on the same wallet (never a duplicate-key 500).
  await db
    .insert(custodialWallets)
    .values({ userId, address: account.addr.toString(), ...encrypted })
    .onConflictDoNothing({ target: custodialWallets.userId });
  const wallet = await db.query.custodialWallets.findFirst({
    where: eq(custodialWallets.userId, userId),
  });
  if (!wallet) throw new Error("Failed to create custodial wallet");
  return wallet;
}

function signerFor(wallet: {
  encryptedPrivateKey: string;
  iv: string;
  authTag: string;
  // Must be threaded through: once any row is re-sealed with a newer key,
  // decrypting with the default version 1 would fail its auth tag.
  keyVersion?: number;
}): AlgoSigner {
  return { sk: decryptSecretKey(wallet) };
}

export async function ensureUserTempoWallet(userId: string) {
  const wallet = await getOrCreateCustodialWallet(userId);
  return { address: wallet.address };
}

export async function getTempoWalletAddress(userId: string) {
  const wallet = await getDb().query.custodialWallets.findFirst({
    where: eq(custodialWallets.userId, userId),
    columns: { address: true },
  });
  return wallet?.address ?? null;
}

function moneyUnits(value: string) {
  const normalized = normalizeMoney(value);
  const [whole, fraction = ""] = normalized.split(".");
  return (
    BigInt(whole) * BigInt(10) ** BigInt(MONEY_SCALE) +
    BigInt(fraction.padEnd(MONEY_SCALE, "0").slice(0, MONEY_SCALE))
  );
}

function unitsToDecimal(units: bigint, scale: number) {
  const base = BigInt(10) ** BigInt(scale);
  const whole = units / base;
  const fraction = (units % base).toString().padStart(scale, "0");
  return `${whole}.${fraction}`;
}

export function addMoney(left: string, right: string) {
  return unitsToDecimal(moneyUnits(left) + moneyUnits(right), MONEY_SCALE);
}

/** USD (8dp string) → ASA base units (6dp), rounded up. */
function usdToAssetUnits(amountUsd: string): bigint {
  const divisor = BigInt(10) ** BigInt(MONEY_SCALE - STABLECOIN_DECIMALS); // 100
  return (moneyUnits(amountUsd) + divisor - BigInt(1)) / divisor;
}

export function userWalletFeeReserveUsd() {
  // Fees are paid in ALGO on Algorand, seeded separately — no USD reserve needed.
  // `||`: an empty USER_WALLET_FEE_RESERVE_USD survives `??` and normalizeMoney
  // rejects "", so a blank env var would throw instead of meaning "no reserve".
  return normalizeMoney(process.env.USER_WALLET_FEE_RESERVE_USD?.trim() || "0");
}

export type CustodialSettlementResult =
  | { ok: true; txHash: string; walletAddress: string }
  | { ok: false; reason: string };

/**
 * Ensure a wallet can transact: seed enough ALGO to cover its min-balance + fees,
 * then opt it in to the payment asset.
 *
 * The ALGO requirement is read from algod (`minBalance`) rather than assumed: it
 * grows by 0.1 ALGO per asset the account holds, so a wallet holding anything
 * unexpected needs more than a fixed constant would ever predict. We seed the
 * actual shortfall plus headroom for future fees.
 */
async function ensureWalletReady(signer: AlgoSigner, assetId: number): Promise<void> {
  const address = addressOf(signer.sk);
  const funding = await getAccountFunding(address);
  const needsOptIn = !funding.assetIds.includes(assetId);

  // What the account must hold once it's opted in: its current min balance, plus
  // 0.1 ALGO for the new asset if it isn't in it yet, plus a fee buffer.
  const required =
    funding.minBalance +
    (needsOptIn ? BigInt(ASSET_MIN_BALANCE_MICROALGOS) : BigInt(0)) +
    BigInt(FEE_HEADROOM_MICROALGOS);

  if (funding.microAlgos < required) {
    const deficit = required - funding.microAlgos;
    await sendAlgo({
      signer: getDeployerSigner(),
      to: address,
      // Round the top-up up to the standard seed so we're not re-seeding on every
      // call for a few microAlgos at a time.
      microAlgos:
        deficit > BigInt(WALLET_ALGO_SEED_MICROALGOS) ? deficit : BigInt(WALLET_ALGO_SEED_MICROALGOS),
      note: "norr:seed",
    });
  }

  if (needsOptIn) {
    try {
      await optInToAsset(signer, assetId);
    } catch (err) {
      // A concurrent settlement may have opted the same fresh wallet in first;
      // tolerate that, but surface a genuine failure.
      if (!(await isOptedIn(address, assetId))) throw err;
    }
  }
}

async function settle(
  userId: string,
  to: string,
  amountUsd: string,
  note: string,
): Promise<CustodialSettlementResult> {
  try {
    const assetId = getPaymentAssetId();
    // The recipient must have opted in to the ASA or the transfer fails on-chain
    // with a cryptic "receiver error". Check first and return a clear reason.
    if (!(await isOptedIn(to, assetId))) {
      return { ok: false, reason: "Recipient hasn't opted in to USDC yet" };
    }
    const wallet = await getOrCreateCustodialWallet(userId);
    const signer = signerFor(wallet);
    await ensureWalletReady(signer, assetId);
    const txHash = await transferAsset({
      signer,
      to,
      assetId,
      amount: usdToAssetUnits(amountUsd),
      note,
    });
    return { ok: true, txHash, walletAddress: wallet.address };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "settlement failed" };
  }
}

export async function settleUnlockWithCustodialWallet({
  userId,
  amountUsd,
  reference,
}: {
  userId: string;
  amountUsd: string;
  reference: string;
}): Promise<CustodialSettlementResult> {
  // USDC isn't our asset, so the platform is not implicitly opted in — make sure
  // it can receive before the fan's wallet tries to pay it.
  try {
    await ensurePlatformReady();
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "Platform wallet not ready" };
  }
  return settle(userId, getPlatformAddress(), amountUsd, `unlock:${reference.slice(0, 12)}`);
}

/**
 * Settle a fan → creator payment. The creator is paid into their *custodial*
 * wallet (we hold its key), so we first make that wallet able to RECEIVE the ASA
 * — seed ALGO for min-balance + opt it in — then transfer. This is the Algorand
 * equivalent of "the recipient must be provisioned before it can hold the token".
 */
async function settleToCreator(
  userId: string,
  creatorUserId: string,
  amountUsd: string,
  note: string,
): Promise<CustodialSettlementResult> {
  // Never settle a payment to yourself (defense-in-depth; routes also guard this).
  if (userId === creatorUserId) {
    return { ok: false, reason: "Cannot pay your own account" };
  }
  try {
    const creatorWallet = await getOrCreateCustodialWallet(creatorUserId);
    await ensureWalletReady(signerFor(creatorWallet), getPaymentAssetId());
    return settle(userId, creatorWallet.address, amountUsd, note);
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "settlement failed" };
  }
}

export async function settleCallWithCustodialWallet({
  userId,
  creatorUserId,
  amountUsd,
  reference,
}: {
  userId: string;
  creatorUserId: string;
  amountUsd: string;
  reference: string;
}): Promise<CustodialSettlementResult> {
  return settleToCreator(userId, creatorUserId, amountUsd, `call:${reference.slice(0, 18)}`);
}

export async function settleTipWithCustodialWallet({
  userId,
  creatorUserId,
  amountUsd,
  reference,
}: {
  userId: string;
  creatorUserId: string;
  amountUsd: string;
  reference: string;
}): Promise<CustodialSettlementResult> {
  return settleToCreator(userId, creatorUserId, amountUsd, `tip:${reference.slice(0, 18)}`);
}

export type WithdrawalResult =
  | { ok: true; txHash: string; amountUsd: string; to: string }
  | { ok: false; reason: string; code: WithdrawalErrorCode };

export type WithdrawalErrorCode =
  | "invalid_address"
  | "invalid_amount"
  | "insufficient_funds"
  | "recipient_not_opted_in"
  | "same_wallet"
  | "failed";

/**
 * Send USDC out of a user's custodial wallet to an address they control.
 *
 * This is the only way money leaves the platform, and it moves real funds, so it
 * validates rather than trusting the caller:
 *  - the destination must be a real Algorand address, and not the user's own
 *    custodial wallet (a no-op that would just burn a fee);
 *  - the destination must be opted in to USDC, or the network rejects the
 *    transfer and the user's funds bounce;
 *  - the amount is capped by the *spendable* balance (on-chain − escrow), so
 *    money reserved for an in-flight call can never be withdrawn out from under
 *    the settlement that's about to claim it.
 */
export async function withdrawUsdcFromCustodialWallet({
  userId,
  to,
  amountUsd,
}: {
  userId: string;
  to: string;
  amountUsd: string;
}): Promise<WithdrawalResult> {
  if (!algosdk.isValidAddress(to)) {
    return { ok: false, code: "invalid_address", reason: "That isn't a valid Algorand address" };
  }

  let amount: string;
  try {
    amount = normalizeMoney(amountUsd);
  } catch {
    return { ok: false, code: "invalid_amount", reason: "Enter a valid amount" };
  }
  if (usdToAssetUnits(amount) <= BigInt(0)) {
    return { ok: false, code: "invalid_amount", reason: "Enter an amount greater than zero" };
  }

  try {
    const assetId = getPaymentAssetId();
    const wallet = await getOrCreateCustodialWallet(userId);
    if (wallet.address === to) {
      return {
        ok: false,
        code: "same_wallet",
        reason: "That's this wallet's own address — withdraw to a different wallet",
      };
    }

    if (!(await isOptedIn(to, assetId))) {
      return {
        ok: false,
        code: "recipient_not_opted_in",
        reason:
          "That wallet hasn't opted in to USDC yet. Opt in from your wallet app, then try again.",
      };
    }

    // Reserve BEFORE sending, under a row lock on user_balances. A plain
    // "read spendable, then send" is a TOCTOU: an unlock settles asynchronously
    // and escrows in its own transaction, so two concurrent requests each saw the
    // full balance — a fan could unlock a post AND withdraw everything, keeping
    // the media and the money. Reserving here makes withdrawal participate in the
    // same ledger, so the two serialize.
    // The SAME authorisation every other spend uses. This used to be a second
    // implementation of it (`withdraw-reservation.ts`), which had already drifted:
    // it truncated the amount to 6dp while the transfer below rounds UP, so a
    // withdrawal of 1.50000001 escrowed 1500000 and sent 1500001, and 0.00000001
    // escrowed NOTHING while still spending a unit — a reservation invisible to
    // the next caller's check. Two copies of an invariant is one copy too many.
    const onChainUnits = await getAssetBalance(wallet.address, assetId);
    const reservation = await reserveSpend(userId, amount, onChainUnits);
    if (!reservation.ok) {
      return {
        ok: false,
        code: "insufficient_funds",
        reason: `You can withdraw up to $${reservation.spendable} right now`,
      };
    }

    try {
      const signer = signerFor(wallet);
      await ensureWalletReady(signer, assetId); // top up ALGO so the fee can be paid
      const txHash = await transferAsset({
        signer,
        to,
        assetId,
        amount: usdToAssetUnits(amount),
        note: "norr:withdraw",
      });
      return { ok: true, txHash, amountUsd: amount, to };
    } finally {
      // Always: if the send failed, a leaked reservation would lock the user out
      // of their own money permanently. On success the on-chain balance has
      // already dropped, so releasing here does not double-count.
      await releaseSpend(userId, amount);
    }
  } catch (err) {
    return {
      ok: false,
      code: "failed",
      reason: err instanceof Error ? err.message : "Withdrawal failed",
    };
  }
}

export type WalletProvisionResult = {
  address: string;
  assetId: number;
  ready: boolean;
  reason?: string;
};

/**
 * Make a user's custodial wallet able to RECEIVE USDC, and return the address to
 * deposit into.
 *
 * This is the money-IN path: there is no treasury and nothing is minted — the
 * user sends their own USDC here and their balance (read live from chain) moves.
 * But Algorand requires the receiving account to hold a min balance and to have
 * opted in to the asset first, or the incoming transfer is REJECTED. So the
 * platform seeds a little ALGO (gas only, ~0.3 ALGO) and signs the opt-in with
 * the key it holds for this wallet, before the address is safe to show.
 */
export async function provisionCustodialWalletForDeposits(
  userId: string,
): Promise<WalletProvisionResult> {
  const assetId = getPaymentAssetId();
  const wallet = await getOrCreateCustodialWallet(userId);
  try {
    await ensureWalletReady(signerFor(wallet), assetId);
    return { address: wallet.address, assetId, ready: true };
  } catch (err) {
    // Surface "not ready" rather than throwing: the address is still correct, but
    // depositing into a wallet that isn't opted in would bounce the user's funds.
    return {
      address: wallet.address,
      assetId,
      ready: false,
      reason: err instanceof Error ? err.message : "Could not prepare wallet",
    };
  }
}

/**
 * The platform's own account must be opted in to receive unlock revenue. With a
 * self-minted ASA the creator was implicitly opted in; USDC is Circle's asset, so
 * the deployer has to opt in like anyone else. Idempotent.
 *
 * Unlike a user wallet, the deployer can't be seeded (it IS the funding source) —
 * if it's short on ALGO that's an operator problem, so say so plainly.
 */
export async function ensurePlatformReady(): Promise<void> {
  const signer = getDeployerSigner();
  const address = addressOf(signer.sk);
  const assetId = getPaymentAssetId();
  if (await isOptedIn(address, assetId)) return;

  if ((await getAlgoBalance(address)) < BigInt(MIN_ALGO_FOR_OPS)) {
    throw new Error(
      `Platform account ${address} needs ALGO to opt in to asset ${assetId} — fund it and retry`,
    );
  }
  try {
    await optInToAsset(signer, assetId);
  } catch (err) {
    if (!(await isOptedIn(address, assetId))) throw err;
  }
}
