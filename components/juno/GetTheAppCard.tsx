"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";

import { JunoMark } from "./ui/JunoMark";

/**
 * The dismissible install prompt pinned to the bottom-right on desktop.
 * Dismissal is local state only — it reappears on reload, matching the
 * reference; persist it if that becomes annoying.
 *
 * Suppressed on coin pages. The trade panel is a right-hand column, so its
 * Buy button lands in the bottom-right corner — exactly where this card sits.
 * An install nag is never worth covering the one action that moves money.
 */
export function GetTheAppCard({ url = "https://juno.fun/app" }: { url?: string }) {
  const [dismissed, setDismissed] = useState(false);
  const pathname = usePathname();

  if (dismissed || pathname?.startsWith("/coin/")) return null;

  return (
    <aside className="fixed right-6 bottom-6 z-40 hidden lg:block">
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="absolute -top-9 right-0 flex size-7 items-center justify-center rounded-full text-j-muted transition-colors hover:bg-j-surface hover:text-j-ink"
      >
        <X size={18} />
      </button>

      <div className="w-[130px] rounded-j-lg border border-j-line bg-j-surface p-3 shadow-[var(--j-shadow-pop)]">
        <p className="mb-2 text-[14px] leading-none font-semibold">Get the App</p>
        {/* The QR keeps a light tile regardless of theme — a scanner needs
            dark modules on a light field, not the other way round. */}
        <div className="relative overflow-hidden rounded-[6px] bg-white p-1.5">
          <Qr url={url} />
          <span className="absolute inset-0 m-auto flex size-6 items-center justify-center rounded-full bg-white">
            <JunoMark size={16} />
          </span>
        </div>
      </div>
    </aside>
  );
}

/**
 * A real QR, encoded with the `qrcode` package the repo already depends on.
 *
 * The previous placeholder drew random modules, which looked convincing and
 * scanned as nothing — worse than showing no code at all, because a visitor
 * would blame their camera.
 */
function Qr({ url }: { url: string }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Loaded lazily so the encoder stays off the initial bundle for a card
    // most visitors dismiss.
    void import("qrcode").then(({ default: QRCode }) =>
      QRCode.toString(url, {
        type: "svg",
        margin: 0,
        errorCorrectionLevel: "M",
        color: { dark: "#121212", light: "#ffffff" },
      }).then((out) => {
        if (!cancelled) setSvg(out);
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!svg) {
    return <div className="size-full animate-pulse rounded-[2px] bg-black/10" />;
  }

  return (
    <div
      role="img"
      aria-label="QR code to download the Juno app"
      className="[&>svg]:size-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
