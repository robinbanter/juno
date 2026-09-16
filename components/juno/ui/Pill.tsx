import { cn } from "@/lib/utils";

/**
 * The grey capsule used for a coin's ticker and for `Copy address`.
 * Renders as a button when given an `onClick`, otherwise as a static chip.
 */
export function Pill({
  icon,
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode }) {
  const interactive = Boolean(props.onClick);
  const classes = cn(
    "inline-flex max-w-full items-center gap-1.5 rounded-full bg-j-surface",
    "px-3 py-1.5 text-[13px] font-medium text-j-ink",
    interactive && "transition-colors hover:bg-j-line focus-visible:ring-2 focus-visible:ring-j-focus focus-visible:outline-none",
    className,
  );

  if (!interactive) {
    return (
      <span className={classes}>
        {icon}
        <span className="truncate">{children}</span>
      </span>
    );
  }

  return (
    <button type="button" className={classes} {...props}>
      {icon}
      <span className="truncate">{children}</span>
    </button>
  );
}
