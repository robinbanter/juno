import { cn } from "@/lib/utils";

type Variant = "buy" | "sell" | "contrast" | "outline" | "ghost";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  // The two saturated fills on a Juno page. Both take the canvas colour as
  // their label: jade and coral are light enough that white text on them
  // fails contrast, and dark-on-bright is the more emphatic pairing anyway.
  buy: "bg-j-pos text-j-bg hover:bg-j-pos-press active:bg-j-pos-press",
  sell: "bg-j-neg text-j-bg hover:opacity-90",
  // The high-contrast neutral. On a dark canvas that inverts to a light
  // fill — the same role Zora's near-black button played on white.
  contrast: "bg-j-ink text-j-bg hover:bg-j-ink/90",
  outline: "border border-j-line-strong bg-transparent text-j-ink hover:bg-j-surface",
  ghost: "text-j-muted hover:bg-j-surface hover:text-j-ink",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-4 text-[14px]",
  md: "h-11 px-5 text-[16px]",
  lg: "h-[52px] px-6 text-[16px]",
};

export function Button({
  variant = "outline",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-semibold",
        "transition-colors duration-150 outline-none",
        // The offset colour must be named: it defaults to white, which draws
        // a white halo around every focused control on a dark canvas.
        "focus-visible:ring-2 focus-visible:ring-j-focus focus-visible:ring-offset-2 focus-visible:ring-offset-j-bg",
        "disabled:cursor-not-allowed disabled:opacity-40",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
}

/**
 * The square bordered affordances that sit beside the primary actions —
 * the bell, the overflow menu, the mail button on a profile.
 */
export function IconButton({
  label,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-[14px]",
        "border border-j-line-strong bg-transparent text-j-ink",
        "transition-colors duration-150 hover:bg-j-surface",
        "focus-visible:ring-2 focus-visible:ring-j-focus focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
