"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, CircleUser, Clapperboard, House, Plus } from "lucide-react";

import { useWallet } from "@solana/wallet-adapter-react";

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
  // Your profile is your wallet; with none connected, send them to create.
  const items = [
    ...ITEMS,
    publicKey
      ? { href: `/creator/${publicKey.toBase58()}`, label: "Profile", Icon: CircleUser }
      : { href: "/create", label: "Launch", Icon: CircleUser },
  ];

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-j-line bg-j-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <ul className="flex items-stretch">
        {items.map(({ href, label, Icon }) => {
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
                <span className="text-[10px] leading-none">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
