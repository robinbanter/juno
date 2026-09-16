"use client";

import { useRef } from "react";

import { cn } from "@/lib/utils";

export type TabItem = {
  id: string;
  /** Text label, or an icon for the profile's icon-only tab bar. */
  label: React.ReactNode;
  /** Small trailing count, as on `Comments 1`. */
  count?: number;
};

/**
 * Underlined tab bar. `icons` switches to the profile variant, where tabs
 * share the full width and show an icon instead of a label.
 */
export function Tabs({
  items,
  value,
  onChange,
  icons = false,
  className,
}: {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  icons?: boolean;
  className?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  /**
   * Arrow keys move between tabs and wrap, per the WAI-ARIA tabs pattern.
   * Without this the tab bar is reachable by keyboard but not operable by it —
   * Tab lands on the first tab and there is no way to reach the rest.
   */
  function onKeyDown(e: React.KeyboardEvent) {
    const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();

    const current = items.findIndex((i) => i.id === value);
    const last = items.length - 1;
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? last
          : e.key === "ArrowRight"
            ? (current + 1) % items.length
            : (current - 1 + items.length) % items.length;

    onChange(items[next].id);
    // Follow focus, so the newly selected tab is where the next key lands.
    listRef.current
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      [next]?.focus();
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      onKeyDown={onKeyDown}
      className={cn("flex border-b border-j-line", icons && "w-full", className)}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={active}
            // Roving tabindex: one stop for the whole group, arrows do the rest.
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={cn(
              "relative flex items-center justify-center gap-1.5 pb-3 text-[14px] font-medium",
              "transition-colors duration-150",
              "focus-visible:ring-2 focus-visible:ring-j-focus focus-visible:outline-none",
              icons ? "flex-1 pt-3" : "px-4 first:pl-0",
              active ? "text-j-ink" : "text-j-faint hover:text-j-muted",
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[11px] leading-none",
                  active ? "bg-j-surface text-j-ink" : "text-j-faint",
                )}
              >
                {item.count}
              </span>
            )}
            {/* The indicator is a child of the tab so it tracks width without
                any measurement. */}
            <span
              aria-hidden="true"
              className={cn(
                "absolute inset-x-0 -bottom-px h-0.5 rounded-full transition-opacity",
                active ? "bg-j-ink opacity-100" : "opacity-0",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
