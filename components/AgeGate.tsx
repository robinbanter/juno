"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldAlert } from "lucide-react";

import { isJunoRoute } from "@/lib/juno/routes";

/**
 * 18+ confirmation shown before any content is visible.
 *
 * Be clear about what this is: a self-attestation, the baseline every adult site
 * carries. It is trivially bypassable and is NOT age verification — jurisdictions
 * that mandate real checks (UK OSA, several US states) require a vendor doing ID
 * or estimation, and this is not a substitute for one. It's the floor, not the
 * ceiling.
 *
 * Stored in localStorage rather than a cookie: it's a UI preference, not an
 * authorisation, and pretending otherwise by making the server trust it would be
 * worse than not having it.
 */
const STORAGE_KEY = "norr:age-confirmed";

export function AgeGate() {
  // Start hidden so the gate never flashes over the page for a returning
  // visitor, and never renders at all during SSR where localStorage is absent.
  const [decided, setDecided] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    try {
      setDecided(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // Storage blocked (private mode, embedded webview) — ask every time rather
      // than silently letting someone through.
      setDecided(false);
    }
  }, []);

  // Juno shares this root layout but is a different product with no adult
  // content, so the gate does not apply there.
  if (decided || isJunoRoute(pathname)) return null;

  function confirm() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Can't persist; still let them through for this session.
    }
    setDecided(true);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="age-gate-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-bg/95 px-5 backdrop-blur-xl"
    >
      <div className="bg-surface border-hairline w-full max-w-sm rounded-card border p-6 text-center shadow-card">
        <span className="bg-primary-tint text-primary mx-auto flex size-12 items-center justify-center rounded-full">
          <ShieldAlert size={24} />
        </span>
        <h1 id="age-gate-title" className="mt-4 text-[22px] font-bold">
          18+ only
        </h1>
        <p className="text-muted mt-2 text-[14.5px] leading-[1.6]">
          This site contains adult content. By entering you confirm you are at
          least 18 years old (or the age of majority where you live) and that
          viewing this content is legal in your jurisdiction.
        </p>

        <button
          type="button"
          onClick={confirm}
          className="bg-primary text-primary-fg hover:bg-primary-hover mt-6 h-12 w-full rounded-pill text-[15px] font-semibold transition-colors"
        >
          I am 18 or older — enter
        </button>
        <a
          href="https://www.google.com"
          className="text-muted hover:text-text mt-3 block text-[14px] font-semibold"
        >
          Leave
        </a>

        <p className="text-faint mt-5 text-[12px] leading-[1.6]">
          By entering you agree to our{" "}
          <Link href="/terms" className="text-muted underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-muted underline">
            Privacy Policy
          </Link>
          . Report content that violates them from any post; see{" "}
          <Link href="/legal/compliance" className="text-muted underline">
            compliance
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
