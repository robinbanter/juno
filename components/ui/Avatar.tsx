import { Check } from "lucide-react";

const SIZES = { sm: 28, md: 36, lg: 44, xl: 78 } as const;

type Size = keyof typeof SIZES;

/**
 * Circular avatar. Falls back to a deterministic wine gradient seeded from the
 * name when no image is supplied (matches the prototype's gradient avatars).
 */
export function Avatar({
  src,
  name,
  size = "md",
  verified = false,
  className = "",
}: {
  src?: string | null;
  name?: string | null;
  size?: Size;
  verified?: boolean;
  className?: string;
}) {
  const px = SIZES[size];
  const gradient = gradientFor(name ?? "?");
  const badge = px >= 44 ? Math.round(px * 0.38) : Math.round(px * 0.42);

  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{ width: px, height: px }}
    >
      <div
        role={name ? "img" : undefined}
        aria-label={name ? (verified ? `${name}, verified` : name) : undefined}
        className="size-full overflow-hidden rounded-full bg-cover bg-center"
        style={src ? { backgroundImage: `url(${src})` } : { background: gradient }}
      >
        {!src && name && (
          <span className="flex size-full items-center justify-center font-semibold text-white/90"
            style={{ fontSize: px * 0.4 }}>
            {name[0]?.toUpperCase()}
          </span>
        )}
      </div>
      {verified && (
        <span
          className="bg-primary absolute -right-0.5 -bottom-0.5 flex items-center justify-center rounded-full"
          style={{ width: badge, height: badge, border: "2px solid var(--surface-2)" }}
        >
          <Check size={badge * 0.55} strokeWidth={3.5} color="#fff" />
        </span>
      )}
    </div>
  );
}

const GRADIENTS = [
  "conic-gradient(from 200deg,#5a2333,#2a1620,#5a2333)",
  "conic-gradient(from 160deg,#6a1d2e,#2a121a,#6a1d2e)",
  "linear-gradient(135deg,#3a3640,#1c1a22)",
  "radial-gradient(120% 120% at 30% 12%,#5a2738,#1f131a)",
  "linear-gradient(135deg,#3a1622,#160d12)",
];

function gradientFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}
