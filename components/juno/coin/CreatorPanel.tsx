"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { ExternalLink } from "lucide-react";

import { explorer } from "@/lib/juno/cluster";
import {
  buildClaimCreatorFeesTransaction,
  dammV2ConfigFor,
  fetchCreatorFees,
  planMigration,
  sendTransaction,
  type FeeBalance,
} from "@/lib/juno/dbc";
import { CURVE_PRESETS } from "@/lib/juno/curves";
import { tokenAmount, usd } from "@/lib/juno/format";
import type { Coin } from "@/lib/juno/types";
import { Button } from "../ui/Button";
import { describeError } from "../wallet/useLaunch";

type Action = "idle" | "claiming" | "migrating";

/**
 * The creator's side of a coin: collect accrued fees, and graduate the pool.
 *
 * Only rendered for the wallet that created it. Both actions were previously
 * promises the product made and could not keep — the page showed fees
 * accruing with no way to take them, and a graduation bar that filled to 100%
 * and then did nothing.
 */
export function CreatorPanel({ coin }: { coin: Coin }) {
  const { publicKey, signTransaction } = useWallet();
  const [fees, setFees] = useState<FeeBalance | null>(null);
  const [action, setAction] = useState<Action>("idle");
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isCreator = publicKey?.toBase58() === coin.creator.wallet;

  const refresh = useCallback(async () => {
    if (!isCreator) return;
    setFees(await fetchCreatorFees(coin.pool).catch(() => null));
  }, [isCreator, coin.pool]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!isCreator) return null;

  const claimable = (fees?.quoteAmount ?? 0) + (fees?.baseAmount ?? 0);
  // The program rejects an early migration, so the button is gated on the
  // program's own progress figure rather than letting someone pay to find out.
  const canMigrate = coin.curve.progress >= 1 && !coin.curve.graduated;

  async function run(kind: Exclude<Action, "idle">) {
    if (!publicKey || !signTransaction) return;
    setError(null);
    setSignature(null);
    setAction(kind);
    try {
      if (kind === "claiming") {
        const transaction = await buildClaimCreatorFeesTransaction({
          creator: publicKey,
          pool: coin.pool,
        });
        setSignature(
          await sendTransaction({ transaction, payer: publicKey, signTransaction }),
        );
      } else {
        const preset = CURVE_PRESETS[coin.curvePreset];
        const plan = await planMigration({
          payer: publicKey,
          pool: coin.pool,
          dammConfig: dammV2ConfigFor(preset.migrationFeeOption),
        });
        setSignature(
          await sendTransaction({
            transaction: plan.transaction,
            payer: publicKey,
            signTransaction,
            signers: plan.signers,
          }),
        );
      }
      await refresh();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setAction("idle");
    }
  }

  return (
    <section className="mt-4 rounded-j border border-j-line p-4">
      <h2 className="text-[14px] font-semibold">You created this</h2>

      <dl className="mt-3 flex flex-col gap-1.5 text-[14px]">
        <div className="flex items-center justify-between">
          <dt className="text-j-muted">Unclaimed fees</dt>
          <dd className="font-semibold tabular-nums">
            {fees ? usd(fees.quoteAmount) : "—"}
            {fees && fees.baseAmount > 0 && (
              <span className="ml-1 text-j-muted">
                + {tokenAmount(fees.baseAmount)} {coin.symbol}
              </span>
            )}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-j-muted">Lifetime pool fees</dt>
          <dd className="tabular-nums">{fees ? usd(fees.claimedQuote) : "—"}</dd>
        </div>
      </dl>

      <div className="mt-3 flex gap-2">
        <Button
          variant="outline"
          size="md"
          className="flex-1"
          disabled={action !== "idle" || claimable <= 0}
          onClick={() => void run("claiming")}
        >
          {action === "claiming" ? "Claiming…" : "Claim fees"}
        </Button>
        <Button
          variant="buy"
          size="md"
          className="flex-1"
          disabled={action !== "idle" || !canMigrate}
          onClick={() => void run("migrating")}
        >
          {action === "migrating" ? "Migrating…" : "Graduate"}
        </Button>
      </div>

      {!canMigrate && !coin.curve.graduated && (
        <p className="mt-2 text-[12px] text-j-faint">
          Graduation unlocks at 100% of the curve. Currently{" "}
          {(coin.curve.progress * 100).toFixed(2)}%.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-2 text-[12px] text-j-danger">
          {error}
        </p>
      )}

      {signature && (
        <a
          href={explorer.tx(signature)}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-2 flex items-center gap-1 text-[12px] text-j-pos hover:underline"
        >
          Confirmed — view transaction
          <ExternalLink size={11} />
        </a>
      )}
    </section>
  );
}
