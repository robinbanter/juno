"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppAuth } from "./useAppAuth";
import { ConnectWalletButton } from "./ConnectWalletButton";

export function Onboarding() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAppAuth();

  useEffect(() => {
    if (isLoaded && isSignedIn) router.replace("/");
  }, [isLoaded, isSignedIn, router]);

  if (isLoaded && isSignedIn) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden"
      style={{
        background:
          "radial-gradient(120% 60% at 50% -8%, rgba(124,58,237,.18), transparent 60%), var(--bg)",
      }}
    >
      <div
        className="mx-auto flex h-full w-full max-w-md flex-col px-7"
        style={{
          paddingTop: "max(28px, calc(env(safe-area-inset-top, 0px) + 14px))",
          paddingBottom: "max(18px, env(safe-area-inset-bottom, 0px))",
        }}
      >
        <div className="mt-auto mb-7 flex items-center justify-center gap-4">
          <Image
            src="/unveil-eye-logo-v2.png"
            alt=""
            width={92}
            height={92}
            priority
            className="h-[92px] w-[92px] object-contain"
            style={{ mixBlendMode: "screen", filter: "hue-rotate(270deg) saturate(1.15)" }}
          />
          <span
            className="font-bold"
            style={{
              fontFamily: "var(--font-brand-satoshi), sans-serif",
              fontSize: 27,
              letterSpacing: 0,
            }}
          >
            NORR
          </span>
        </div>

        <div className="mb-1 text-center text-[17px] font-semibold">Log in</div>
        <p className="text-faint mb-7 text-center text-[13px] leading-[1.55]">
          Connect your wallet to get an Algorand account instantly — no seed
          phrase, no extension.
        </p>

        {/* The txnlab Connect Wallet button, backed by the Privy embedded wallet. */}
        <div className="flex justify-center [&_.wui-custom-trigger]:w-full [&_.wui-custom-trigger>button]:w-full [&_.wui-custom-trigger>button]:h-[52px] [&_.wui-custom-trigger>button]:justify-center [&_.wui-custom-trigger>button]:rounded-pill">
          <ConnectWalletButton />
        </div>

        <p className="text-faint mt-4 mb-auto text-center text-[12.5px] leading-[1.55]">
          By connecting and using Norr, you agree to our{" "}
          <Link
            href="/terms"
            className="text-primary underline-offset-2 hover:underline"
          >
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link
            href="/privacy"
            className="text-primary underline-offset-2 hover:underline"
          >
            Privacy Policy
          </Link>
          , and confirm that you are at least 18 years old.
        </p>
      </div>
    </div>
  );
}
