"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Check, KeyRound, X } from "lucide-react";
import { usePasskeyEnrollment } from "./usePasskeyEnrollment";

// Auth surfaces where a bottom enrollment banner would be out of place.
const HIDDEN_ROUTES = ["/sign-in", "/sso-callback"];

export function PasskeyEnrollmentPrompt() {
  const pathname = usePathname();
  const {
    canEnroll,
    isDismissed,
    isPending,
    success,
    error,
    enrollPasskey,
    dismissPrompt,
  } = usePasskeyEnrollment();
  const [closedSuccess, setClosedSuccess] = useState(false);

  const onHiddenRoute = HIDDEN_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  // After enrollment the user gains a passkey, so `canEnroll` flips false — we
  // keep showing a brief confirmation until the user closes it.
  const showSuccess = success && !closedSuccess;
  const showPrompt = canEnroll && !isDismissed;

  if (onHiddenRoute) return null;
  if (!showPrompt && !showSuccess) return null;

  return (
    <div
      className="fixed inset-x-0 z-40 px-4"
      // Float clear of the fixed bottom nav (z-30) plus the safe-area inset.
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 84px)" }}
    >
      <div
        className="border-hairline bg-surface mx-auto flex w-full max-w-md items-center gap-3 rounded-[16px] border p-3"
        style={{ boxShadow: "0 16px 40px rgba(0,0,0,.45)" }}
      >
        {showSuccess ? (
          <>
            <span
              className="text-primary-fg flex size-9 shrink-0 items-center justify-center rounded-full"
              style={{ background: "var(--success)" }}
            >
              <Check size={18} strokeWidth={2.4} />
            </span>
            <p className="text-text min-w-0 flex-1 text-[13.5px] font-semibold leading-snug">
              Passkey added. Future logins will be faster.
            </p>
            <button
              type="button"
              onClick={() => setClosedSuccess(true)}
              aria-label="Dismiss"
              className="text-faint hover:text-text flex size-8 shrink-0 items-center justify-center"
            >
              <X size={18} />
            </button>
          </>
        ) : (
          <>
            <span className="bg-primary/15 text-primary flex size-9 shrink-0 items-center justify-center rounded-full">
              <KeyRound size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-text text-[13.5px] font-semibold leading-snug">
                Add a passkey for faster, safer login.
              </p>
              {error && <p className="text-danger mt-0.5 text-[12px]">{error}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={dismissPrompt}
                disabled={isPending}
                className="text-muted hover:text-text rounded-[10px] px-2.5 py-2 text-[13px] font-semibold disabled:opacity-50"
              >
                Later
              </button>
              <button
                type="button"
                onClick={enrollPasskey}
                disabled={isPending}
                className="bg-primary text-primary-fg rounded-[10px] px-3.5 py-2 text-[13px] font-bold transition-transform duration-[140ms] ease-[var(--ease-veil)] active:scale-[0.97] disabled:opacity-60"
              >
                {isPending ? "Opening…" : "Add passkey"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
