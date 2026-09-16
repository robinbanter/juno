"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  ArrowUpRight,
  Copy,
  Check,
  ExternalLink,
  LogOut,
  Plus,
  Wallet,
} from "lucide-react";
import { algoAddressUrl } from "@/lib/constants";
import { useAppSignOut } from "./useAppAuth";

type OnChain = { algo: string; usdc: string; optedIn: boolean };

function formatUsd(value: string | null) {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isFinite(n) ? n : 0);
}

/** Wallet panel: balance, address (copy + explorer), on-chain holdings, disconnect. */
export function WalletModal({
  open,
  onClose,
  address,
}: {
  open: boolean;
  onClose: () => void;
  address: string | null;
}) {
  const router = useRouter();
  const signOut = useAppSignOut();
  const [copied, setCopied] = useState(false);
  const [appBalance, setAppBalance] = useState<string | null>(null);
  const [onchain, setOnchain] = useState<OnChain | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !address) return;
    let cancelled = false;
    setLoading(true);
    setOnchain(null);
    Promise.all([
      fetch("/api/account", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch(`/api/wallet/balance?address=${address}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]).then(([acct, chain]) => {
      if (cancelled) return;
      setAppBalance(acct?.account?.availableBalance ?? null);
      if (chain && !chain.error) {
        setOnchain({ algo: chain.algo, usdc: chain.usdc, optedIn: chain.optedIn });
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, address]);

  if (!open || !address) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  };
  const short = `${address.slice(0, 8)}…${address.slice(-8)}`;

  return (
    <>
      <button
        type="button"
        aria-label="Close wallet"
        onClick={onClose}
        className="fixed inset-0 z-[60] cursor-default"
        style={{ background: "rgba(4,3,5,.6)", animation: "vscrim .2s ease both" }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Wallet"
        className="bg-surface border-hairline fixed top-1/2 left-1/2 z-[61] w-[360px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-3xl border p-5"
        style={{
          boxShadow: "0 24px 70px rgba(0,0,0,.55)",
          animation: "vdrawer .24s cubic-bezier(.22,1,.36,1) both",
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[15px] font-bold">
            <Wallet size={18} className="text-primary" /> Wallet
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted hover:text-text"
          >
            <X size={20} />
          </button>
        </div>

        {/* Balance */}
        <div className="bg-surface-2 border-hairline mt-4 rounded-2xl border p-4">
          <div className="text-faint text-[11.5px] font-medium tracking-wide uppercase">
            Available balance
          </div>
          <div className="mt-1 text-[30px] leading-none font-bold">
            {formatUsd(appBalance)}
          </div>
          <div className="mt-3.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                router.push("/add-funds");
                onClose();
              }}
              className="bg-primary text-primary-fg inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-[13px] font-bold"
            >
              <Plus size={15} /> Add funds
            </button>
            <button
              type="button"
              onClick={() => {
                router.push("/withdraw");
                onClose();
              }}
              className="bg-surface-3 text-text border-hairline inline-flex items-center gap-1.5 rounded-pill border px-4 py-2 text-[13px] font-bold"
            >
              <ArrowUpRight size={15} /> Withdraw
            </button>
          </div>
        </div>

        {/* Address */}
        <div className="mt-3">
          <div className="text-faint text-[11.5px] font-medium tracking-wide uppercase">
            Algorand address
          </div>
          <div className="bg-surface-2 border-hairline mt-1.5 flex items-center gap-2 rounded-xl border px-3 py-2.5">
            <span className="flex-1 truncate font-mono text-[13px]">{short}</span>
            <button
              type="button"
              onClick={copy}
              title="Copy address"
              className="text-muted hover:text-text shrink-0"
            >
              {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
            </button>
            <a
              href={algoAddressUrl(address)}
              target="_blank"
              rel="noreferrer"
              title="View on explorer"
              className="text-muted hover:text-text shrink-0"
            >
              <ExternalLink size={16} />
            </a>
          </div>
        </div>

        {/* On-chain holdings */}
        <div className="mt-3">
          <div className="text-faint text-[11.5px] font-medium tracking-wide uppercase">
            On-chain · Algorand TestNet
          </div>
          <div className="bg-surface-2 border-hairline mt-1.5 rounded-xl border">
            <BalanceRow label="ALGO" value={loading ? "…" : (onchain?.algo ?? "—")} />
            <div className="bg-hairline mx-3.5 h-px" />
            <BalanceRow
              label="USDC"
              value={loading ? "…" : onchain ? `$${onchain.usdc}` : "—"}
            />
          </div>
        </div>

        {/* Disconnect */}
        <button
          type="button"
          onClick={() => {
            void signOut({ redirectUrl: "/" });
            onClose();
          }}
          className="text-danger mt-4 flex w-full items-center justify-center gap-2 rounded-pill py-2.5 text-[14px] font-semibold"
          style={{ border: "1px solid var(--hairline-2)" }}
        >
          <LogOut size={16} /> Disconnect
        </button>
      </div>
    </>
  );
}

function BalanceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-3.5 py-2.5">
      <span className="text-muted text-[13px]">{label}</span>
      <span className="font-mono text-[14px] font-semibold">{value}</span>
    </div>
  );
}
