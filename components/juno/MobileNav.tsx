"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, CircleUser, Clapperboard, House, Plus } from "lucide-react";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/explore", label: "Home", Icon: House },
  { href: "/reels", label: "Reels", Icon: Clapperboard },
  { href: "/create", label: "Create", Icon: Plus },
  { href: "/activity", label: "Activity", Icon: Activity },
] as const;

/**
 * Bottom tab bar under `lg`, where the side rail is hidden.
 *
 * Without it the mobile layout had no navigation at all — every route was a
 * dead end once you scrolled past the header.
 */
export function MobileNav() {
  const pathname = usePathname();
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  // Your profile *is* your wallet. With none connected there is no profile to
  // route to, so the slot opens the connect modal instead of duplicating the
  // Create tab — which also gave two children the same React key.
  const profile = publicKey
    ? { href: `/creator/${publicKey.toBase58()}`, label: "Profile", Icon: CircleUser }
    : null;

  return (
    <nav
      aria-label="Primary mobile"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-j-line bg-j-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <ul className="flex items-stretch">
        {ITEMS.map(({ href, label, Icon }) => {
          const active = pathname === href;
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-0.5 transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-j-focus focus-visible:outline-none",
                  active ? "text-j-ink" : "text-j-faint",
                )}
              >
                <Icon size={21} strokeWidth={active ? 2.2 : 1.75} />
                <span className="text-[11px] leading-none">{label}</span>
              </Link>
            </li>
          );
        })}

        <li className="flex-1">
          {profile ? (
            <Link
              href={profile.href}
              aria-label={profile.label}
              aria-current={pathname === profile.href ? "page" : undefined}
              className={cn(
                "flex h-14 flex-col items-center justify-center gap-0.5 transition-colors",
                "focus-visible:ring-2 focus-visible:ring-j-focus focus-visible:outline-none",
                pathname === profile.href ? "text-j-ink" : "text-j-faint",
              )}
            >
              <CircleUser size={21} strokeWidth={1.75} />
              <span className="text-[11px] leading-none">Profile</span>
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setVisible(true)}
              aria-label="Connect wallet"
              className={cn(
                "flex h-14 w-full flex-col items-center justify-center gap-0.5 text-j-faint transition-colors",
                "focus-visible:ring-2 focus-visible:ring-j-focus focus-visible:outline-none",
              )}
            >
              <CircleUser size={21} strokeWidth={1.75} />
              <span className="text-[11px] leading-none">Connect</span>
            </button>
          )}
        </li>
      </ul>
    </nav>
  );
}
