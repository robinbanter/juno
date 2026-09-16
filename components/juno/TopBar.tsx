"use client";

import Link from "next/link";
import { Search } from "lucide-react";

import { JunoMark } from "./ui/JunoMark";
import { ConnectButton } from "./wallet/ConnectButton";

/**
 * Sticky header, full width above the rail: brand lockup left, search centred,
 * auth right.
 *
 * The lockup lives here rather than in the rail because the rail is 72px wide
 * and the wordmark does not fit beside the mark at that width — stacking it
 * there would have read as two logos rather than one.
 */
export function TopBar() {
  return (
    <header className="sticky top-0 z-40 h-16 bg-j-bg/85 backdrop-blur-md">
      <div className="flex h-16 items-center gap-3 px-4 lg:px-5">
        <Link
          href="/explore"
          aria-label="Juno home"
          className="flex shrink-0 items-center gap-2 rounded-full pr-1 focus-visible:ring-2 focus-visible:ring-j-focus focus-visible:outline-none"
        >
          <JunoMark size={30} />
          <span className="text-[19px] leading-none font-semibold tracking-tight">
            juno
          </span>
        </Link>

        <form action="/explore" role="search" className="mx-auto w-full max-w-[480px]">
          <label className="relative flex items-center">
            <Search
              size={18}
              className="pointer-events-none absolute left-4 text-j-faint"
              aria-hidden="true"
            />
            <span className="sr-only">Search Juno</span>
            <input
              name="q"
              type="search"
              autoComplete="off"
              placeholder="Search for creators, trends, or traders..."
              className="h-11 w-full rounded-full bg-j-surface pr-4 pl-11 text-[15px] text-j-ink placeholder:text-j-faint focus-visible:ring-2 focus-visible:ring-j-focus focus-visible:outline-none"
            />
          </label>
        </form>

        <div className="flex shrink-0 items-center gap-2">
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
