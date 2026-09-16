import { cn } from "@/lib/utils";

/**
 * The three-cell bordered stat block above the trade panel. Cells are divided
 * by hairlines rather than gaps so the group reads as one object.
 */
export function StatCards({
  items,
  className,
}: {
  items: Array<{ label: string; value: React.ReactNode; icon?: React.ReactNode }>;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid overflow-hidden rounded-j border border-j-line",
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item, i) => (
        <div
          key={item.label}
          className={cn(
            "flex flex-col items-center gap-1.5 px-2 py-3 text-center",
            i > 0 && "border-l border-j-line",
          )}
        >
          <dt className="text-[12px] leading-none text-j-faint">{item.label}</dt>
          <dd className="flex items-center gap-1 text-[14px] leading-none font-semibold whitespace-nowrap">
            {item.icon}
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
