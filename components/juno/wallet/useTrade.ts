"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

import {
  buildSwapTransaction,
  fetchPoolSnapshot,
  getConnection,
  invalidatePoolSnapshot,
  sendTransaction,
  WSOL,
  type PoolSnapshot,
} from "@/lib/juno/dbc";
import type { Coin, TradeSide } from "@/lib/juno/types";
import { describeError } from "./useLaunch";

/**
 * SOL held back from the spendable balance: two token-account rents (the coin
 * account and the temporary wSOL account, ~0.002 SOL each) plus fees.
 */
const SOL_FEE_RESERVE = 0.01;

export type TradeState =
  | { status: "idle" }
  | { status: "signing" }
  | { status: "confirming" }
  | { status: "done"; signature: string }
  | { status: "error"; message: string };

/**
 * Live pool state, wallet balances and the swap itself.
 *
 * The snapshot is fetched in the browser rather than passed down from the
 * server page: a quote has to price against the pool as it is *now*, and a
 * server-rendered snapshot is already stale by the time someone types an
 * amount into the field.
 */
export function useTrade(coin: Coin) {
  const { publicKey, signTransaction } = useWallet();
  const { setVisible } = useWalletModal();

  const [snapshot, setSnapshot] = useState<PoolSnapshot | null>(null);
  const [balanceUsd, setBalanceUsd] = useState(0);
  const [holding, setHolding] = useState(0);
  const [state, setState] = useState<TradeState>({ status: "idle" });

  const refresh = useCallback(
    async (force = false) => {
      // After a trade the cached snapshot is exactly the thing that is wrong.
      if (force) invalidatePoolSnapshot(coin.pool);
      const next = await fetchPoolSnapshot(coin.pool).catch(() => null);
      if (next) setSnapshot(next);
    },
    [coin.pool],
  );

  /**
   * Deliberately not fetched on mount. Most visitors to a coin page never type
   * an amount, and reading the pool for all of them puts a round trip on every
   * page load — enough to get 429d by the public RPC. `ensureSnapshot` pulls
   * it the first time a quote is actually needed.
   */
  const ensureSnapshot = useCallback(async () => {
    if (snapshot) return snapshot;
    const next = await fetchPoolSnapshot(coin.pool).catch(() => null);
    if (next) setSnapshot(next);
    return next;
  }, [snapshot, coin.pool]);

  // Balances drive the "insufficient" state, so they must be real reads.
  const refreshBalances = useCallback(async () => {
    if (!publicKey) {
      setBalanceUsd(0);
      setHolding(0);
      return;
    }
    const connection = getConnection();

    // A SOL-quoted pool is paid from native SOL: the swap wraps it in the same
    // transaction. Reading only the wrapped-SOL token account, which almost no
    // wallet holds, reported a funded wallet as "Balance: 0 SOL" and disabled
    // every buy behind "Insufficient balance".
    const quoteIsSol = coin.quote.mint === WSOL.mint;

    const [quote, base, lamports] = await Promise.all([
      connection
        .getParsedTokenAccountsByOwner(publicKey, {
          mint: new PublicKey(coin.quote.mint),
        })
        .catch(() => null),
      connection
        .getParsedTokenAccountsByOwner(publicKey, {
          mint: new PublicKey(coin.address),
        })
        .catch(() => null),
      quoteIsSol ? connection.getBalance(publicKey).catch(() => 0) : Promise.resolve(0),
    ]);

    const sum = (accounts: typeof quote) =>
      accounts?.value.reduce(
        (total, entry) =>
          total + (entry.account.data.parsed?.info?.tokenAmount?.uiAmount ?? 0),
        0,
      ) ?? 0;

    // Native SOL less what the swap itself needs: the network fee, and rent
    // for any token account it has to open. Offering that as spendable would
    // make "Max" a transaction that fails.
    const spendableSol = Math.max(0, lamports / LAMPORTS_PER_SOL - SOL_FEE_RESERVE);

    setBalanceUsd(sum(quote) + spendableSol);
    setHolding(sum(base));
  }, [publicKey, coin.quote.mint, coin.address]);

  useEffect(() => {
    void refreshBalances();
  }, [refreshBalances]);

  const swap = useCallback(
    async (input: { side: TradeSide; amountIn: number; minimumAmountOut: number }) => {
      if (!publicKey || !signTransaction) {
        setVisible(true);
        return;
      }
      const current = await ensureSnapshot();
      if (!current) {
        setState({ status: "error", message: "Pool is not readable right now." });
        return;
      }

      try {
        setState({ status: "signing" });
        const transaction = await buildSwapTransaction({
          snapshot: current,
          owner: publicKey,
          side: input.side,
          amountIn: input.amountIn,
          minimumAmountOut: input.minimumAmountOut,
        });

        const signature = await sendTransaction({
          transaction,
          payer: publicKey,
          signTransaction,
          onSent: () => setState({ status: "confirming" }),
        });

        setState({ status: "done", signature });
        // The trade moved the curve and the wallet; re-read both, bypassing
        // the snapshot cache.
        await Promise.all([refresh(true), refreshBalances()]);
      } catch (error) {
        setState({ status: "error", message: describeError(error) });
      }
    },
    [publicKey, signTransaction, setVisible, ensureSnapshot, refresh, refreshBalances],
  );

  return {
    snapshot,
    ensureSnapshot,
    balanceUsd,
    holding,
    state,
    swap,
    reset: () => setState({ status: "idle" }),
    connected: Boolean(publicKey),
  };
}
