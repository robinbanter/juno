"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, CircleUser, Clapperboard, House, Plus, Zap } from "lucide-react";

import { cn } from "@/lib/utils";
import { DEMO_CREATOR } from "@/lib/juno/mock";

const NAV = [
  { href: "/explore", label: "Home", Icon: House },
  { href: "/reels", label: "Reels", Icon: Clapperboard },
  { href: "/explore?sort=trending", label: "Trending", Icon: Zap },
] as const;

const NAV_BOTTOM = [
  { href: "/activity", label: "Activity", Icon: Activity },
  // Points at the signed-in creator once auth exists; the demo profile
  // stands in so the link is never dead.
  { href: `/creator/${DEMO_CREATOR.handle}`, label: "Profile", Icon: CircleUser },
] as const;

/**
 * The fixed left icon rail, below the header. Hidden under `lg`, where
 * `MobileNav` takes over.
 */
export function SideRail() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed top-16 bottom-0 left-0 z-30 hidden w-[72px] flex-col items-center gap-1 bg-j-bg pt-4 lg:flex"
    >
      {NAV.map((item) => (
        <RailLink
          key={item.href}
          {...item}
          active={pathname === item.href.split("?")[0]}
        />
      ))}

      {/* Create is boxed rather than bare — the only rail item that starts a
          flow instead of navigating. */}
      <Link
        href="/create"
        aria-label="Create"
        title="Create"
        className={cn(
          "my-3 flex size-11 items-center justify-center rounded-[14px] border border-j-line-strong",
          "text-j-ink transition-colors hover:bg-j-surface",
          "focus-visible:ring-2 focus-visible:ring-j-focus focus-visible:outline-none",
        )}
      >
        <Plus size={22} strokeWidth={1.75} />
      </Link>

      {NAV_BOTTOM.map((item) => (
        <RailLink key={item.href} {...item} active={pathname === item.href} />
      ))}
    </nav>
  );
}

function RailLink({
  href,
  label,
  Icon,
  active,
}: {
  href: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex size-11 items-center justify-center rounded-[14px] transition-colors",
        "focus-visible:ring-2 focus-visible:ring-j-focus focus-visible:outline-none",
        active ? "bg-j-surface text-j-ink" : "text-j-muted hover:bg-j-surface hover:text-j-ink",
      )}
    >
      <Icon size={22} strokeWidth={active ? 2.2 : 1.75} />
    </Link>
  );
}
