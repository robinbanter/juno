"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import type { QuoteToken } from "@/lib/juno/types";

/**
 * Quote-token selector inside the amount field.
 *
 * A pool is created against exactly one quote mint, so this does not change
 * the pool — it changes what the trader pays with, and anything other than the
 * pool's own quote token has to be routed. Options that would need a route are
 * marked so the panel can explain the extra hop.
 */
export function TokenSelect({
  value,
  options,
  onChange,
  poolQuoteMint,
}: {
  value: QuoteToken;
  options: QuoteToken[];
  onChange: (token: QuoteToken) => void;
  poolQuoteMint: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-j-line-strong bg-j-surface py-1.5 pr-2 pl-2.5 text-[14px] font-semibold transition-colors hover:bg-j-surface focus-visible:ring-2 focus-visible:ring-j-focus focus-visible:outline-none"
      >
        <TokenMark symbol={value.symbol} />
        {value.symbol}
        <ChevronDown size={15} className="text-j-muted" aria-hidden="true" />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute top-full right-0 z-20 mt-1.5 min-w-[180px] overflow-hidden rounded-j border border-j-line bg-j-surface py-1 shadow-[var(--j-shadow-pop)]"
        >
          {options.map((token) => {
            const native = token.mint === poolQuoteMint;
            return (
              <li key={token.mint}>
                <button
                  type="button"
                  role="option"
                  aria-selected={token.mint === value.mint}
                  onClick={() => {
                    onChange(token);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-[14px] transition-colors hover:bg-j-surface",
                    token.mint === value.mint && "font-semibold",
                  )}
                >
                  <TokenMark symbol={token.symbol} />
                  <span className="flex-1">{token.symbol}</span>
                  {!native && (
                    <span className="text-[11px] text-j-faint">routed</span>
                  )}
                  {token.mint === value.mint && (
                    <Check size={15} className="text-j-pos" aria-hidden="true" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const MARKS: Record<string, string> = {
  USDC: "#2775ca",
  SOL: "#9945ff",
  ETH: "#627eea",
};

function TokenMark({ symbol }: { symbol: string }) {
  return (
    <span
      className="flex size-[18px] items-center justify-center rounded-full text-[9px] font-bold text-white"
      style={{ background: MARKS[symbol] ?? "var(--j-line-strong)" }}
      aria-hidden="true"
    >
      {symbol.slice(0, 1)}
    </span>
  );
}
