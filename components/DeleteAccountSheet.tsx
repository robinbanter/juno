"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "./ui/Button";

/**
 * Delete your account.
 *
 * The dangerous part isn't the delete, it's the wallet: deleting destroys the
 * only copy of its key, so anything left in it is gone forever. The API refuses
 * while a balance exists — this surfaces that refusal as a route to `/withdraw`
 * rather than a dead error, and makes the user type DELETE first, because an
 * irreversible action one tap away from a settings list is a trap.
 */
export function DeleteAccountSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setConfirm("");
    setError(null);
    setBalance(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete", { method: "DELETE" });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        balance?: string;
      };
      if (!res.ok) {
        // Not a failure so much as a fork in the road: withdraw, then come back.
        if (body.code === "balance_remaining") setBalance(body.balance ?? null);
        throw new Error(body.error ?? "Could not delete your account");
      }
      // The session is dead; a client-side push would render against a user that
      // no longer exists.
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete your account");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 cursor-default bg-black/60"
        style={{ animation: "vscrim .2s ease both" }}
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        className="bg-surface border-hairline relative max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-card border-t px-5 pb-6 pt-5 text-text shadow-card"
        style={{ animation: "vrise .24s var(--ease-veil) both" }}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id="delete-title" className="text-[22px] font-bold">
            Delete account
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="text-muted hover:text-text flex size-10 shrink-0 items-center justify-center"
          >
            <X size={22} />
          </button>
        </div>

        <div className="flex items-start gap-3 rounded-md border border-danger/35 bg-danger/10 px-4 py-3">
          <AlertTriangle size={20} className="text-danger mt-0.5 shrink-0" />
          <p className="flex-1 text-[13.5px] leading-[1.6]">
            This deletes your posts, messages and wallet. Deleting destroys the
            only copy of your wallet key — <strong>any USDC left in it is gone
            forever</strong>, and nobody can recover it, including us.
          </p>
        </div>

        <p className="text-muted mt-4 text-[13.5px] leading-[1.6]">
          Your on-chain payment history stays on the public blockchain — that
          can&apos;t be deleted by anyone. Age and moderation records we&apos;re
          legally required to keep are also retained.
        </p>

        {balance && (
          <div className="border-hairline bg-surface-2 mt-4 rounded-md border px-4 py-3">
            <p className="text-[14px] leading-[1.6]">
              You still have <strong>${balance}</strong> in your wallet. Withdraw
              it first.
            </p>
            <button
              type="button"
              onClick={() => {
                onClose();
                router.push("/withdraw");
              }}
              className="text-primary hover:text-primary-hover mt-1.5 text-[14px] font-semibold"
            >
              Go to Withdraw →
            </button>
          </div>
        )}

        <label className="mt-4 block">
          <span className="text-faint text-[12px] font-bold uppercase tracking-[0.04em]">
            Type DELETE to confirm
          </span>
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="off"
            className="bg-surface-2 border-hairline text-text mt-2 h-[50px] w-full rounded-md border px-4 text-[16px] outline-none focus:border-danger"
          />
        </label>

        {error && !balance && (
          <p className="text-danger mt-3 text-[14px] font-semibold" role="alert">
            {error}
          </p>
        )}

        <Button
          onClick={submit}
          loading={submitting}
          disabled={confirm !== "DELETE" || submitting}
          className="mt-5 w-full !bg-danger hover:!bg-danger"
        >
          DELETE MY ACCOUNT
        </Button>
      </section>
    </div>
  );
}
