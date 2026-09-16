"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "icon";

const base =
  "inline-flex items-center justify-center gap-2 font-semibold select-none " +
  "transition-[transform,background-color,box-shadow] duration-[140ms] ease-[var(--ease-veil)] " +
  "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary:
    "rounded-pill bg-primary text-primary-fg hover:bg-primary-hover " +
    "hover:shadow-[var(--shadow-cta)] px-5 h-12 text-[15px]",
  secondary:
    "rounded-pill bg-surface-2 text-text border border-hairline " +
    "hover:bg-surface-3 px-5 h-12 text-[15px]",
  ghost: "rounded-pill text-muted hover:text-text hover:bg-surface-2 px-4 h-11 text-[14px]",
  icon: "rounded-full text-muted hover:text-text size-11 shrink-0",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  loading?: boolean;
  children?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", loading = false, className = "", children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={props.type ?? "button"}
        disabled={disabled || loading}
        className={`${base} ${variants[variant]} ${className}`}
        {...props}
      >
        {loading && (
          <span
            aria-hidden
            className="size-[17px] rounded-full border-2 border-white/35 border-t-white"
            style={{ animation: "vspin 0.7s linear infinite" }}
          />
        )}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
