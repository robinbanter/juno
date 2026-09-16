"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, ExternalLink } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/Button";
import { useAppAuth } from "@/components/useAppAuth";
import { useWallet } from "@txnlab/use-wallet-react";
import { algoTxUrl } from "@/lib/constants";

type Account = {
  availableBalance: string;
  escrowedBalance: string;
  tempoWalletAddress: string | null;
};

type Done = { txid: string; amount: string; to: string };

function money(value: string | number | null | undefined) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

export default function WithdrawPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAppAuth();
  const { activeAddress } = useWallet();
  const [account, setAccount] = useState<Account | null>(null);
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/account", { cache: "no-store" });
    if (!res.ok) return;
    const body = (await res.json()) as { account: Account };
    setAccount(body.account);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.replace("/sign-in");
      return;
    }
    void refresh();
  }, [isLoaded, isSignedIn, router, refresh]);

  // Prefill the connected wallet: a typo in a 58-char address loses the funds
  // permanently, so the safest destination is one the user didn't have to type.
  useEffect(() => {
    if (activeAddress && !to) setTo(activeAddress);
  }, [activeAddress, to]);

  const available = Number(account?.availableBalance ?? 0);
  const escrowed = Number(account?.escrowedBalance ?? 0);
  const amountNum = Number(amount);
  const amountValid = Number.isFinite(amountNum) && amountNum > 0 && amountNum <= available;
  const canSubmit = to.trim().length === 58 && amountValid && !submitting;

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/account/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: to.trim(), amount }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        txid?: string;
        amount?: string;
        to?: string;
        error?: string;
      };
      if (!res.ok || !body.txid) throw new Error(body.error ?? "Withdrawal failed");

      setDone({ txid: body.txid, amount: body.amount ?? amount, to: body.to ?? to });
      setAmount("");
      window.dispatchEvent(new Event("veil:balance-changed"));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Withdrawal failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="bg-bg text-text flex min-h-dvh flex-1 flex-col">
      <header className="bg-surface/80 border-hairline pt-safe sticky top-0 z-40 border-b backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-md items-center gap-3 px-[18px] py-3.5">
          <button
            type="button"
            aria-label="Back"
            onClick={() => router.back()}
            className="text-muted hover:text-text -ml-2 flex size-[38px] items-center justify-center"
          >
            <ArrowLeft size={22} strokeWidth={2} />
          </button>
          <h1 className="flex-1 text-xl font-bold leading-none">Withdraw</h1>
        </div>
      </header>

      <section className="mx-auto w-full max-w-md flex-1 pb-28">
        <section className="border-hairline border-b px-[18px] py-6">
          <div className="tabular text-[28px] font-bold leading-none">{money(available)}</div>
          <div className="text-muted mt-2 text-[15px] leading-none">Available to withdraw</div>
          {escrowed > 0 && (
            <div className="text-faint mt-2 text-[13px]">
              {money(escrowed)} is held in an active call and can&apos;t be withdrawn yet.
            </div>
          )}
        </section>

        {done ? (
          <section className="px-[18px] py-7">
            <div className="border-hairline bg-surface-2 flex items-start gap-3 rounded-md border px-4 py-4">
              <CheckCircle2 size={22} className="text-success mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold">
                  Sent {money(done.amount)} USDC
                </div>
                <div className="text-faint mt-1 break-all text-[12.5px]">to {done.to}</div>
                <a
                  href={algoTxUrl(done.txid)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:text-primary-hover mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold"
                >
                  View on explorer <ExternalLink size={13} />
                </a>
              </div>
            </div>
            <Button variant="secondary" onClick={() => setDone(null)} className="mt-5 w-full">
              WITHDRAW AGAIN
            </Button>
          </section>
        ) : (
          <section className="px-[18px] py-6">
            <h2 className="text-faint text-[13px] font-bold tracking-[0.04em]">
              SEND USDC TO YOUR WALLET
            </h2>

            <label className="mt-5 block">
              <span className="text-faint text-[12px] font-bold uppercase tracking-[0.04em]">
                Destination address
              </span>
              <textarea
                value={to}
                onChange={(e) => setTo(e.target.value)}
                rows={2}
                spellCheck={false}
                placeholder="Your Algorand wallet address"
                className="bg-surface-2 border-hairline text-text tabular mt-2 w-full resize-none break-all rounded-md border px-4 py-3 text-[14px] outline-none focus:border-primary"
              />
              {activeAddress && to.trim() === activeAddress && (
                <span className="text-faint mt-1.5 block text-[12px]">
                  Your connected wallet.
                </span>
              )}
            </label>

            <label className="mt-4 block">
              <span className="text-faint text-[12px] font-bold uppercase tracking-[0.04em]">
                Amount
              </span>
              <div className="relative mt-2">
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="bg-surface-2 border-hairline text-text tabular h-[50px] w-full rounded-md border pl-4 pr-20 text-[16px] outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => setAmount(String(available))}
                  disabled={available <= 0}
                  className="text-primary hover:text-primary-hover absolute right-3 top-1/2 -translate-y-1/2 text-[13px] font-bold disabled:opacity-40"
                >
                  MAX
                </button>
              </div>
              {amount !== "" && !amountValid && (
                <span className="text-danger mt-1.5 block text-[12.5px] font-semibold">
                  {amountNum > available
                    ? `You can withdraw up to ${money(available)}`
                    : "Enter an amount greater than zero"}
                </span>
              )}
            </label>

            <div className="mt-4 flex items-start gap-3 rounded-md border border-gold/35 bg-gold/10 px-4 py-3">
              <AlertTriangle size={20} strokeWidth={2} className="text-gold mt-0.5 shrink-0" />
              <p className="flex-1 text-[13.5px] leading-[1.55]">
                Double-check the address. It must be an Algorand wallet that has
                opted in to USDC — sending to the wrong address cannot be undone.
              </p>
            </div>

            {error && (
              <p className="text-danger mt-4 text-[14px] font-semibold" role="alert">
                {error}
              </p>
            )}

            <Button
              onClick={submit}
              loading={submitting}
              disabled={!canSubmit}
              className="mt-5 w-full"
            >
              {amountValid ? `WITHDRAW ${money(amountNum)}` : "WITHDRAW"}
            </Button>
          </section>
        )}
      </section>

      <BottomNav />
    </main>
  );
}
