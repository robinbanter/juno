"use client";

import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { GetTheAppCard } from "./GetTheAppCard";
import { MobileNav } from "./MobileNav";
import { SideRail } from "./SideRail";
import { TopBar } from "./TopBar";

/**
 * The app frame every Juno route renders inside.
 *
 * `.juno` switches the subtree into the token scope defined in
 * `app/globals.css`; the surrounding Norr app owns `:root`.
 *
 * The header spans the full width and the rail sits beneath it, so the brand
 * lockup lands in the true top-left corner rather than indented past the rail.
 */
export function JunoShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Reels own the whole viewport and supply their own controls; the standard
  // page padding and the install card would both sit on top of the video.
  const immersive = pathname?.startsWith("/reels") ?? false;

  return (
    <div className="juno min-h-dvh w-full font-sans">
      <TopBar />
      <SideRail />
      <main
        className={cn(
          "lg:pl-[72px]",
          // Reels size themselves to the gap between the chrome; adding
          // padding here would push the feed past the viewport.
          immersive ? "" : "pb-28 lg:pb-24",
        )}
      >
        {children}
      </main>
      <MobileNav />
      {!immersive && <GetTheAppCard />}
    </div>
  );
}
