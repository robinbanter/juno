import { ExternalLink } from "lucide-react";

import { cn } from "@/lib/utils";
import { percent, since, usd } from "@/lib/juno/format";
import { navBand, type NavContext } from "@/lib/juno/nav";
import { pythAccountUrl } from "@/lib/juno/pyth-source";

/**
 * The pool's curve price against its Pyth reference, with the preset's band.
 *
 * Only a live feed gets a number. A stale one says when it last published and
 * nothing more; an equity feed that stopped updating months ago must not be
 * read as today's NAV.
 */
export function NavBandPanel({
  nav,
  curvePriceUsd,
  quoteSymbol,
  className,
}: {
  nav: NavContext;
  /** The pool's spot price in USD, or null when its quote token has no live rate. */
  curvePriceUsd: number | null;
  quoteSymbol: string;
  className?: string;
}) {
  const { reading, bandBps, feedName } = nav;
  const band =
    reading.status === "live" && curvePriceUsd !== null
      ? navBand({ priceUsd: curvePriceUsd, navUsd: reading.priceUsd, bandBps })
      : null;

  return (
    <section
      aria-label="NAV band"
      className={cn("rounded-j border border-j-line p-3 text-[13px]", className)}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-semibold">NAV band · Pyth</span>
        <span className="truncate font-mono text-[11px] text-j-faint">{feedName}</span>
      </div>

      {reading.status === "live" ? (
        <>
          <dl className="mt-2 grid grid-cols-3 gap-2">
            <Stat label="Reference">
              {usd(reading.priceUsd)}
              <span className="block text-[11px] font-normal text-j-faint">
                ±{usd(reading.confidence)}
              </span>
            </Stat>
            <Stat label="Curve">
              {curvePriceUsd === null ? "—" : usd(curvePriceUsd)}
            </Stat>
            <Stat label={`Band ±${(bandBps / 100).toFixed(bandBps % 100 ? 1 : 0)}%`}>
              {band ? (
                <span className={band.withinBand ? "text-j-pos" : "text-j-danger"}>
                  {percent(band.deviation, Math.abs(band.deviation) >= 10 ? 0 : 2)}
                </span>
              ) : (
                "—"
              )}
            </Stat>
          </dl>
          <p className="mt-2 text-[12px] leading-snug text-j-muted">
            {band
              ? band.withinBand
                ? "The curve is trading inside the band."
                : `The curve is ${band.deviation > 0 ? "above" : "below"} the band (${usd(band.lowUsd)}–${usd(band.highUsd)}).`
              : `No live USD rate for ${quoteSymbol}, so the curve cannot be compared.`}
          </p>
        </>
      ) : reading.status === "stale" ? (
        <p className="mt-2 text-[12px] leading-snug text-j-muted">
          <span className="font-semibold text-j-ink">Stale.</span> Pyth last published this
          feed {since(reading.publishedAt)} ago ({reading.publishedAt.slice(0, 10)}). No
          reference price is shown and the band is not checked.
        </p>
      ) : (
        <p className="mt-2 text-[12px] leading-snug text-j-muted">
          <span className="font-semibold text-j-ink">No NAV.</span> {reading.reason}.
        </p>
      )}

      {reading.status !== "unavailable" && (
        <p className="mt-2 flex items-center gap-3 text-[11px] text-j-faint">
          {reading.status === "live" && <span>Published {since(reading.publishedAt)} ago</span>}
          {reading.account && (
            <a
              // The network the price was read from — mainnet on a fork, not
              // the app's own cluster.
              href={pythAccountUrl(reading.account)}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center gap-1 hover:text-j-ink"
            >
              Price account
              <ExternalLink size={10} />
            </a>
          )}
        </p>
      )}
    </section>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-j-muted">{label}</dt>
      <dd className="font-semibold tabular-nums">{children}</dd>
    </div>
  );
}
