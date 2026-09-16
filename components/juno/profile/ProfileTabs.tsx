"use client";

import { Clapperboard, Grid2x2, ShoppingBag, Zap } from "lucide-react";

import { Tabs } from "../ui/Tabs";

export type ProfileTabId = "posts" | "reels" | "collected" | "activity";

/**
 * The icon-only tab bar under a profile header: posts they coined, coins they
 * hold, and their trading activity.
 */
export function ProfileTabs({
  value,
  onChange,
}: {
  value: ProfileTabId;
  onChange: (id: ProfileTabId) => void;
}) {
  return (
    <Tabs
      icons
      value={value}
      onChange={(id) => onChange(id as ProfileTabId)}
      className="mt-6"
      items={[
        { id: "posts", label: <Grid2x2 size={20} aria-label="Posts" /> },
        { id: "reels", label: <Clapperboard size={20} aria-label="Reels" /> },
        { id: "collected", label: <ShoppingBag size={20} aria-label="Collected" /> },
        { id: "activity", label: <Zap size={20} aria-label="Activity" /> },
      ]}
    />
  );
}
