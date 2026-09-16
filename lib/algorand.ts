import "server-only";

import algosdk from "algosdk";
import { algoConfig, algoNetwork, USDC_ASSET_ID } from "@/lib/constants";

/**
 * Algorand foundation for Norr — replaces the Tempo/EVM (viem) layer.
 *
 * The payment token is **real USDC** on Algorand (Circle's ASA). There is no
 * treasury and no minting: users fund themselves by sending their own USDC to
 * their custodial wallet, and every balance shown is that on-chain holding.
 *
 * Algorand specifics that differ from EVM:
 *  - A receiver must OPT IN to an ASA before it can hold any (a 0-amount self
 *    transfer). Opt-in raises the account's min-balance by 0.1 ALGO. This is why
 *    a wallet must be provisioned BEFORE a user can deposit USDC into it.
 *  - Every account must hold a min balance of ALGO (0.1 base + 0.1 per ASA) and
 *    pay a ~0.001 ALGO fee per txn, so a fresh custodial wallet needs a little
 *    ALGO seeded before it can opt in / transact. ALGO for gas is the only thing
 *    the platform funds.
 */

/** A minimal signer: the 64-byte ed25519 secret key. Address is derived from it. */
export type AlgoSigner = { sk: Uint8Array };

/** USDC uses 6 decimals on both networks. */
export const ASSET_DECIMALS = 6;

export function getAlgod(): algosdk.Algodv2 {
  const server = process.env.ALGOD_SERVER ?? algoConfig().algod;
  const token = process.env.ALGOD_TOKEN ?? "";
  const port = process.env.ALGOD_PORT ? Number(process.env.ALGOD_PORT) : 443;
  return new algosdk.Algodv2(token, server, port);
}

export function getIndexer(): algosdk.Indexer {
  const server = process.env.INDEXER_SERVER ?? algoConfig().indexer;
  const token = process.env.INDEXER_TOKEN ?? "";
  const port = process.env.INDEXER_PORT ? Number(process.env.INDEXER_PORT) : 443;
  return new algosdk.Indexer(token, server, port);
}

/** Base32 Algorand address for a secret key. */
export function addressOf(sk: Uint8Array): string {
  return algosdk.encodeAddress(sk.slice(32, 64));
}

/** The platform/deployer account (loaded from DEPLOYER_MNEMONIC). */
export function getDeployerSigner(): AlgoSigner {
  const mnemonic = process.env.DEPLOYER_MNEMONIC;
  if (!mnemonic) throw new Error("DEPLOYER_MNEMONIC is not set");
  const { sk } = algosdk.mnemonicToSecretKey(mnemonic.trim());
  return { sk };
}

/**
 * Platform receiver address = the deployer. Unlike a self-minted ASA (where the
 * creator is implicitly opted in), USDC is Circle's asset — so the platform
 * account must opt itself in before it can receive revenue. `npm run wallet:setup`
 * does that; the settlement path also self-heals via `ensurePlatformReady`.
 */
export function getPlatformAddress(): string {
  return addressOf(getDeployerSigner().sk);
}

/**
 * The payment asset: **real USDC** on the active network.
 *
 * MainNet 31566704 · TestNet 10458941. `USDC_ASSET_ID_OVERRIDE` exists only for
 * local forks/sandboxes — leave it unset to use the canonical asset.
 */
export function getPaymentAssetId(): number {
  const override = process.env.USDC_ASSET_ID_OVERRIDE?.trim();
  if (override) {
    const n = Number(override);
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error(`USDC_ASSET_ID_OVERRIDE is invalid (must be a positive integer): ${override}`);
    }
    return n;
  }
  return USDC_ASSET_ID[algoNetwork()];
}

/** Display label for the payment asset. */
export const PAYMENT_ASSET_SYMBOL = "USDC";

/**
 * True when the error means "account/holding does not exist on chain yet"
 * (a fresh, unfunded, or un-opted-in address) — as opposed to a transient
 * algod/network error we must NOT swallow.
 */
function isNotFoundError(err: unknown): boolean {
  const e = err as { status?: number; response?: { status?: number; statusCode?: number } };
  const status = e?.status ?? e?.response?.status ?? e?.response?.statusCode;
  if (status === 404) return true;
  return /no accounts? found|account.*not found|asset.*not found|404/i.test(
    String((err as { message?: string })?.message ?? err),
  );
}

/**
 * Raw ASA holding (base units) for an address, 0 if not opted in / no account.
 * Real algod/network errors are rethrown, never masked as a 0 balance.
 */
export async function getAssetBalance(address: string, assetId: number): Promise<bigint> {
  try {
    const info = await getAlgod().accountInformation(address).do();
    const holding = info.assets?.find((a) => Number(a.assetId) === assetId);
    return holding ? BigInt(holding.amount) : BigInt(0);
  } catch (err) {
    if (isNotFoundError(err)) return BigInt(0);
    throw err;
  }
}

/** ALGO balance (microAlgos). 0 for an account that doesn't exist on chain yet. */
export async function getAlgoBalance(address: string): Promise<bigint> {
  try {
    const info = await getAlgod().accountInformation(address).do();
    return BigInt(info.amount);
  } catch (err) {
    if (isNotFoundError(err)) return BigInt(0);
    throw err;
  }
}

/** True when `address` has opted in to `assetId`. Network errors are rethrown. */
export async function isOptedIn(address: string, assetId: number): Promise<boolean> {
  try {
    const info = await getAlgod().accountInformation(address).do();
    return !!info.assets?.some((a) => Number(a.assetId) === assetId);
  } catch (err) {
    if (isNotFoundError(err)) return false;
    throw err;
  }
}

async function signSubmitWait(txn: algosdk.Transaction, sk: Uint8Array): Promise<string> {
  const algod = getAlgod();
  const signed = txn.signTxn(sk);
  const { txid } = await algod.sendRawTransaction(signed).do();
  // Wait up to ~12 rounds (~36s). If waitForConfirmation times out but the txn
  // actually landed, re-check once before surfacing a failure — otherwise a slow
  // confirmation could be misread as "settlement failed" and trigger a rollback
  // even though the funds already moved on-chain.
  try {
    await algosdk.waitForConfirmation(algod, txid, 12);
  } catch (err) {
    const info = await algod.pendingTransactionInformation(txid).do().catch(() => null);
    if (!info || (!info.confirmedRound && !info.poolError)) throw err;
    if (info.poolError) throw new Error(`txn ${txid} rejected: ${info.poolError}`);
  }
  return txid;
}

/** Opt an account in to the ASA (0-amount self transfer). Guard with isOptedIn to avoid re-opt. */
export async function optInToAsset(signer: AlgoSigner, assetId: number): Promise<string> {
  const address = addressOf(signer.sk);
  const sp = await getAlgod().getTransactionParams().do();
  const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    sender: address,
    receiver: address,
    amount: 0,
    assetIndex: assetId,
    suggestedParams: sp,
  });
  return signSubmitWait(txn, signer.sk);
}

/** Transfer ASA base units from `signer` to `to` with an optional note. */
export async function transferAsset({
  signer,
  to,
  assetId,
  amount,
  note,
}: {
  signer: AlgoSigner;
  to: string;
  assetId: number;
  amount: bigint;
  note?: string;
}): Promise<string> {
  const sp = await getAlgod().getTransactionParams().do();
  const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    sender: addressOf(signer.sk),
    receiver: to,
    amount,
    assetIndex: assetId,
    note: note ? new TextEncoder().encode(note) : undefined,
    suggestedParams: sp,
  });
  return signSubmitWait(txn, signer.sk);
}

/** Send microAlgos (used to seed a fresh custodial wallet so it can opt in / pay fees). */
export async function sendAlgo({
  signer,
  to,
  microAlgos,
  note,
}: {
  signer: AlgoSigner;
  to: string;
  microAlgos: number | bigint;
  note?: string;
}): Promise<string> {
  const sp = await getAlgod().getTransactionParams().do();
  const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: addressOf(signer.sk),
    receiver: to,
    amount: microAlgos,
    note: note ? new TextEncoder().encode(note) : undefined,
    suggestedParams: sp,
  });
  return signSubmitWait(txn, signer.sk);
}

export type AccountFunding = {
  /** Current ALGO balance, in microAlgos. */
  microAlgos: bigint;
  /** The min balance algod actually requires for THIS account, given what it holds. */
  minBalance: bigint;
  assetIds: number[];
};

/** Base min-balance for an account that doesn't exist on chain yet (0.1 ALGO). */
const BASE_MIN_BALANCE = BigInt(100_000);

/**
 * What an account holds and what it's required to hold.
 *
 * `minBalance` comes from algod rather than being computed locally: it depends on
 * how many assets/apps the account is already in (0.1 ALGO each), so any
 * hardcoded guess breaks the moment an account holds something unexpected.
 */
export async function getAccountFunding(address: string): Promise<AccountFunding> {
  try {
    const info = await getAlgod().accountInformation(address).do();
    return {
      microAlgos: BigInt(info.amount),
      minBalance: BigInt(info.minBalance),
      assetIds: (info.assets ?? []).map((a) => Number(a.assetId)),
    };
  } catch (err) {
    if (isNotFoundError(err)) {
      return { microAlgos: BigInt(0), minBalance: BASE_MIN_BALANCE, assetIds: [] };
    }
    throw err;
  }
}

export type AssetTransfer = {
  txid: string;
  amount: bigint;
  sender: string;
  receiver: string;
  /** Unix seconds; null while the txn is still being indexed. */
  roundTime: number | null;
};

/**
 * Asset transfers INTO an address — the real deposit history now that funding is
 * user-supplied rather than a card ledger. Self-transfers (opt-ins, which are
 * 0-amount transfers to self) are filtered out.
 *
 * The indexer lags the chain by a round or two, so a just-sent deposit can be
 * missing here while already counted in the balance (which reads algod).
 */
export async function listIncomingAssetTransfers(
  address: string,
  assetId: number,
  limit = 25,
): Promise<AssetTransfer[]> {
  try {
    const res = await getIndexer()
      .lookupAccountTransactions(address)
      .assetID(assetId)
      .txType("axfer")
      .limit(limit)
      .do();

    const out: AssetTransfer[] = [];
    for (const txn of res.transactions ?? []) {
      const axfer = txn.assetTransferTransaction;
      const receiver = axfer?.receiver;
      if (!axfer || receiver !== address) continue;
      const amount = BigInt(axfer.amount ?? 0);
      const sender = String(txn.sender ?? "");
      if (amount <= BigInt(0) || sender === address) continue; // skip opt-ins & self-sends
      out.push({
        txid: String(txn.id ?? ""),
        amount,
        sender,
        receiver,
        roundTime: txn.roundTime != null ? Number(txn.roundTime) : null,
      });
    }
    return out;
  } catch (err) {
    if (isNotFoundError(err)) return []; // address has no history yet
    throw err;
  }
}
