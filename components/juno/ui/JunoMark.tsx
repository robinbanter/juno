import { cn } from "@/lib/utils";

/**
 * The Juno mark: a banded gas-giant sphere.
 *
 * Pure CSS rather than an asset so it stays crisp at any size. The bands are
 * a repeating gradient rotated slightly off-axis, with a specular highlight
 * and a terminator shadow layered over them to sell the curvature.
 */
export function JunoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn("inline-block shrink-0 rounded-full", className)}
      style={{
        width: size,
        height: size,
        backgroundImage: [
          // Specular highlight, offset up-left like a lit sphere.
          "radial-gradient(circle at 30% 26%, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0) 38%)",
          // Terminator — the unlit limb.
          "radial-gradient(circle at 78% 82%, rgba(38,16,4,0.85) 0%, rgba(38,16,4,0) 58%)",
          // Cloud bands.
          "repeating-linear-gradient(170deg, #ffd27a 0%, #f0a33c 7%, #d97b22 13%, #f6bb5c 20%)",
        ].join(", "),
        boxShadow: "inset 0 -1px 3px rgba(0,0,0,0.5)",
      }}
      aria-hidden="true"
    />
  );
}
