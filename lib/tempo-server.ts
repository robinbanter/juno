import "server-only";

import { STABLECOIN_DECIMALS } from "./constants";
import {
  getDeployerSigner,
  getIndexer,
  getPaymentAssetId,
  getPlatformAddress,
  transferAsset,
} from "./algorand";

// The platform-side on-chain ops, migrated from Tempo/EVM to Algorand ASA.
// (File name kept so existing imports — e.g. app/api/unlock — stay stable.)

export type PaymentCheck = { ok: true } | { ok: false; reason: string };
export type ChainOpResult = { ok: true; txHash?: string } | { ok: false; reason: string };

/** Look up a transaction, retrying to absorb indexer ingestion lag (~up to 4s). */
async function lookupTransactionWithRetry(txId: string, attempts = 4) {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await getIndexer().lookupTransactionByID(txId).do();
      return res.transaction;
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      }
    }
  }
  throw lastErr;
}

/** USD (string) → ASA base units (6dp), rounded down for verification thresholds. */
function usdToAssetUnits(value: string): bigint {
  const [whole = "0", frac = ""] = value.trim().split(".");
  const f = frac.padEnd(STABLECOIN_DECIMALS, "0").slice(0, STABLECOIN_DECIMALS);
  return BigInt(whole || "0") * BigInt(10) ** BigInt(STABLECOIN_DECIMALS) + BigInt(f || "0");
}

/**
 * Verify, server-side, that `txId` is a real on-chain USDC payment:
 *  1. the transaction exists and confirmed;
 *  2. it's an ASA transfer of the payment asset (USDC);
 *  3. to the platform address;
 *  4. for at least `expectedAmountUsd`; and
 *  5. sent FROM `fromAddress`.
 */
export async function verifyTempoPayment(
  txId: string,
  expectedAmountUsd: string,
  fromAddress: string,
): Promise<PaymentCheck> {
  if (!txId) return { ok: false, reason: "missing tx id" };

  const platform = getPlatformAddress();
  const assetId = getPaymentAssetId();

  // A just-submitted payment may not be indexed yet — retry with backoff before
  // giving up, so a valid fresh payment isn't rejected as "not found".
  let txn;
  try {
    txn = await lookupTransactionWithRetry(txId);
  } catch {
    return { ok: false, reason: "transaction not found" };
  }

  const axfer = txn?.assetTransferTransaction;
  if (!axfer) return { ok: false, reason: "not an asset transfer" };
  if (Number(axfer.assetId) !== assetId) return { ok: false, reason: "wrong asset" };
  if (axfer.receiver !== platform) return { ok: false, reason: "wrong recipient" };
  if (BigInt(axfer.amount) < usdToAssetUnits(expectedAmountUsd)) {
    return { ok: false, reason: "amount too low" };
  }
  if (txn.sender !== fromAddress) return { ok: false, reason: "payment sender mismatch" };

  return { ok: true };
}

/** Pay a creator their share of an unlock (ASA transfer from the platform/deployer). */
export async function sendCreatorPayout(
  creatorAddress: string,
  amountUsd: number,
  originalTxId: string,
): Promise<ChainOpResult> {
  if (amountUsd <= 0) return { ok: false, reason: "non-positive payout" };
  try {
    const txHash = await transferAsset({
      signer: getDeployerSigner(),
      to: creatorAddress,
      assetId: getPaymentAssetId(),
      amount: usdToAssetUnits(amountUsd.toFixed(STABLECOIN_DECIMALS)),
      note: `payout:${originalTxId.slice(0, 10)}`,
    });
    return { ok: true, txHash };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "payout failed" };
  }
}

/**
 * Loyalty points are tracked in the DB ledger (see lib/db/queries loyalty).
 * On-chain loyalty minting is not used on Algorand yet; this is a ledger no-op
 * kept for API compatibility.
 */
export async function mintLoyalty(): Promise<ChainOpResult> {
  return { ok: true };
}
