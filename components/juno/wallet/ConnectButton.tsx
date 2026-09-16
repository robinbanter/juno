"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Wallet } from "lucide-react";

import { cn } from "@/lib/utils";
import { cluster, explorer } from "@/lib/juno/cluster";
import { shortAddress } from "@/lib/juno/format";
import { Button } from "../ui/Button";

/**
 * Connect / connected state for the header.
 *
 * Deliberately not `WalletMultiButton` from the adapter's UI package — that
 * ships its own dark theme and would be the one control on the page not using
 * Juno's tokens.
 */
export function ConnectButton() {
  const { publicKey, disconnect, connecting, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // The adapter reads localStorage on mount, so the first client render can
  // disagree with the server's. Render the connected state only after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!mounted || !connected || !publicKey) {
    return (
      <Button
        variant="contrast"
        size="sm"
        onClick={() => setVisible(true)}
        disabled={connecting}
      >
        {connecting ? "Connecting…" : "Connect"}
      </Button>
    );
  }

  const address = publicKey.toBase58();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "flex h-9 items-center gap-2 rounded-full border border-j-line-strong px-3 text-[13px] font-semibold",
          "transition-colors hover:bg-j-surface focus-visible:ring-2 focus-visible:ring-j-focus focus-visible:outline-none",
        )}
      >
        <Wallet size={15} className="text-j-muted" />
        <span className="font-mono">{shortAddress(address)}</span>
        <ChevronDown size={14} className="text-j-muted" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 z-50 mt-1.5 w-56 overflow-hidden rounded-j border border-j-line bg-j-surface py-1 shadow-[var(--j-shadow-pop)]"
        >
          <p className="px-3 pt-1.5 pb-2 text-[11px] text-j-faint">
            Connected on {cluster()}
          </p>
          <a
            href={explorer.account(address)}
            target="_blank"
            rel="noreferrer noopener"
            className="block px-3 py-2 text-[13px] transition-colors hover:bg-j-bg"
          >
            View on Solscan
          </a>
          <button
            type="button"
            onClick={() => {
              void disconnect();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-j-neg transition-colors hover:bg-j-bg"
          >
            <LogOut size={14} />
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
