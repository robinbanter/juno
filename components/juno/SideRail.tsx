"use client";

import Link from "next/link";
import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Activity, CircleUser, Clapperboard, House, Plus, Zap } from "lucide-react";

import { useWallet } from "@solana/wallet-adapter-react";

import { cn } from "@/lib/utils";

const NAV = [
  { href: "/explore", label: "Home", Icon: House },
  { href: "/reels", label: "Reels", Icon: Clapperboard },
  { href: "/explore?sort=trending", label: "Trending", Icon: Zap },
] as const;

const NAV_BOTTOM = [
  { href: "/activity", label: "Activity", Icon: Activity },
] as const;

/**
 * The fixed left icon rail, below the header. Hidden under `lg`, where
 * `MobileNav` takes over.
 */
export function SideRail() {
  // useSearchParams needs a Suspense boundary on statically rendered routes
  // (/create). The fallback is the same rail without the query, so there is
  // nothing to flash.
  return (
    <Suspense fallback={<Rail sort={null} />}>
      <RailWithQuery />
    </Suspense>
  );
}

function RailWithQuery() {
  return <Rail sort={useSearchParams().get("sort")} />;
}

/**
 * Whether a rail item is the current page. Home and Trending share a path and
 * differ only in `?sort`, so the query decides between them — comparing the
 * path alone marked both active at once.
 */
function isActive(href: string, pathname: string, sort: string | null): boolean {
  const [path, query] = href.split("?");
  if (pathname !== path) return false;
  const want = new URLSearchParams(query ?? "").get("sort");
  return want === (sort === "trending" ? "trending" : null);
}

function Rail({ sort }: { sort: string | null }) {
  const pathname = usePathname();
  const { publicKey } = useWallet();
  // Your profile is your wallet. With none connected there is no profile to
  // link to, so the item routes to the connect flow instead of a dead page.
  const profileHref = publicKey ? `/creator/${publicKey.toBase58()}` : "/create";

  return (
    <nav
      aria-label="Primary"
      className="fixed top-16 bottom-0 left-0 z-30 hidden w-[72px] flex-col items-center gap-1 bg-j-bg pt-4 lg:flex"
    >
      {NAV.map((item) => (
        <RailLink
          key={item.href}
          {...item}
          active={isActive(item.href, pathname, sort)}
        />
      ))}

      {/* Create is boxed rather than bare — the only rail item that starts a
          flow instead of navigating. */}
      <Link
        href="/create"
        aria-label="Create"
        title="Create"
        aria-current={pathname === "/create" ? "page" : undefined}
        className={cn(
          "my-3 flex size-11 items-center justify-center rounded-[14px] border border-j-line-strong",
          "text-j-ink transition-colors hover:bg-j-surface",
          pathname === "/create" && "bg-j-surface",
          "focus-visible:ring-2 focus-visible:ring-j-focus focus-visible:outline-none",
        )}
      >
        <Plus size={22} strokeWidth={1.75} />
      </Link>

      {NAV_BOTTOM.map((item) => (
        <RailLink key={item.href} {...item} active={pathname === item.href} />
      ))}

      {publicKey && (
        <RailLink
          href={profileHref}
          label="Profile"
          Icon={CircleUser}
          active={pathname === profileHref}
        />
      )}
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
