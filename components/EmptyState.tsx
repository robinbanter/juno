import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  body,
}: {
  icon?: LucideIcon;
  title: string;
  body?: string;
}) {
  return (
    <div className="mt-24 flex flex-col items-center gap-3 text-center">
      <div
        className="text-primary flex size-16 items-center justify-center rounded-full"
        style={{ background: "var(--primary-tint)" }}
        aria-hidden
      >
        {Icon ? <Icon size={28} /> : <span className="text-2xl font-bold">V</span>}
      </div>
      <p className="text-text mt-1 font-semibold">{title}</p>
      {body && <p className="text-faint max-w-xs text-sm">{body}</p>}
    </div>
  );
}
