"use client";

import { Lock } from "lucide-react";
import { formatUsd } from "@/lib/constants";
import { useUnlock } from "./useUnlock";

export function UnlockButton({
  postId,
  price,
  onUnlock,
}: {
  postId: string;
  price: string;
  onUnlock: (signedUrl: string, settlementMs: number) => void;
}) {
  const { state, error, unlock, connected } = useUnlock(postId, price, {
    onUnlock,
  });

  if (state === "unlocked") return null;
  const pending = state === "pending";

  return (
    <div className="flex w-full flex-col items-center gap-2.5">
      <button
        type="button"
        onClick={unlock}
        disabled={pending}
        className="bg-primary text-primary-fg flex h-[50px] min-w-[188px] items-center justify-center gap-2.5 rounded-pill px-6 text-[15.5px] font-semibold transition-transform duration-[140ms] ease-[var(--ease-veil)] active:scale-[0.96] disabled:opacity-60"
        style={{ boxShadow: "0 8px 30px var(--primary-glow)" }}
      >
        {pending ? (
          <>
            <span
              aria-hidden
              className="size-[17px] rounded-full border-2 border-white/35 border-t-white"
              style={{ animation: "vspin 0.7s linear infinite" }}
            />
            <span>Unlocking…</span>
          </>
        ) : (
          <>
            <Lock size={18} strokeWidth={2.2} />
            <span>
              {connected ? "Unlock" : "Sign in"} ·{" "}
              <span className="tabular font-medium">${formatUsd(price)}</span>
            </span>
          </>
        )}
      </button>

      {error ? (
        <p className="text-danger text-center text-xs">{error}</p>
      ) : (
        <p className="text-center text-xs" style={{ color: "rgba(245,242,243,.7)" }}>
          Tap to unlock and reveal
        </p>
      )}
    </div>
  );
}
