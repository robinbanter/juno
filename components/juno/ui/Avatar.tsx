import { cn } from "@/lib/utils";

/**
 * Creator avatars. The profile header variant carries a hairline ring with a
 * gap, which is what separates it visually from the inline avatars in an
 * activity row.
 */
export function Avatar({
  src,
  alt,
  size = 32,
  ring = false,
  className,
}: {
  src: string;
  alt: string;
  size?: number;
  ring?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block shrink-0 overflow-hidden rounded-full bg-j-surface",
        ring && "ring-1 ring-j-line-strong ring-offset-2 ring-offset-j-bg",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {/* Avatars come from arbitrary creator-supplied URLs, so they stay as
          plain <img> rather than going through the Image optimiser. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className="size-full object-cover"
      />
    </span>
  );
}
