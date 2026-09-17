import { ExternalLink } from "lucide-react";

import { cn } from "@/lib/utils";
import { explorer } from "@/lib/juno/cluster";
import { dammV2PoolFor } from "@/lib/juno/damm";
import type { Coin } from "@/lib/juno/types";

/**
 * Replaces the trade panel once a pool has migrated.
 *
 * The bonding curve is finished and the DBC program rejects any further swap
 * against it. Rendering a trade panel there is not just dead UI — calling the
 * quoter throws `Virtual pool is completed`. The market still exists, in DAMM
 * v2, so the honest thing is to point at it.
 */
export function GraduatedNotice({ coin, className }: { coin: Coin; className?: string }) {
  const damm = dammV2PoolFor(coin);

  return (
    <section
      className={cn("rounded-j-lg border border-j-line bg-j-surface p-4", className)}
    >
      <h2 className="text-[15px] font-semibold text-j-pos">Graduated</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-j-muted">
        This curve completed and migrated into a Meteora DAMM v2 pool. The
        bonding curve is closed; trading continues in the AMM, where the
        liquidity is permanently locked.
      </p>

      <div className="mt-3 flex flex-col gap-1.5 text-[13px]">
        {damm && (
          <a
            href={explorer.account(damm)}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-1.5 font-medium hover:underline"
          >
            DAMM v2 pool
            <ExternalLink size={12} className="text-j-muted" />
          </a>
        )}
        <a
          href={explorer.account(coin.pool)}
          target="_blank"
          rel="noreferrer noopener"
          className="flex items-center gap-1.5 text-j-muted hover:text-j-ink"
        >
          Original bonding curve
          <ExternalLink size={12} />
        </a>
      </div>
    </section>
  );
}
