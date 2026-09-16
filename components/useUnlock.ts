"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppAuth } from "./useAppAuth";

function friendlyUnlockError(err: unknown): string {
  console.error("[unlock] failed:", err);
  if (err instanceof Error) return err.message;
  return "Couldn't complete the unlock. Please try again.";
}

export type UnlockState = "locked" | "pending" | "unlocked" | "error";

function haptic(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* unsupported — non-fatal */
    }
  }
}

/**
 * The pay-to-unlock flow now uses the server-side app-balance ledger. The
 * client only requests an unlock; the API derives the actor from Clerk.
 */
export function useUnlock(
  postId: string,
  _price: string,
  opts?: { onUnlock?: (signedUrl: string, settlementMs: number) => void },
) {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAppAuth();
  const [state, setState] = useState<UnlockState>("locked");
  const [error, setError] = useState<string | null>(null);

  const unlock = useCallback(async () => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.push("/sign-in");
      return;
    }

    setState("pending");
    setError(null);
    haptic(8);

    try {
      const started = Date.now();
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId,
          settlementStartedAt: started,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          settlementError?: string;
        };
        if (body.error === "Settlement failed") {
          throw new Error(
            body.settlementError
              ? `Tempo settlement failed: ${body.settlementError}`
              : "Tempo settlement failed",
          );
        }
        throw new Error(body.error ?? "Unlock failed");
      }

      const { signedUrl, settlementMs } = (await res.json()) as {
        signedUrl: string;
        settlementMs: number;
      };
      setState("unlocked");
      haptic([6, 40, 12]);
      window.dispatchEvent(new Event("veil:balance-changed"));
      opts?.onUnlock?.(signedUrl, settlementMs);
    } catch (err) {
      setState("error");
      setError(friendlyUnlockError(err));
    }
  }, [isLoaded, isSignedIn, opts, postId, router]);

  return {
    state,
    error,
    unlock,
    connected: isSignedIn === true,
  };
}
