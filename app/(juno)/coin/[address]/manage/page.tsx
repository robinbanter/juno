import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { cluster } from "@/lib/juno/cluster";
import { getPool } from "@/lib/juno/registry";
import { ManagePool } from "@/components/juno/manage/ManagePool";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  const row = await getPool(address);
  return { title: row ? `Manage ${row.name}` : "Manage pool" };
}

/**
 * Issuer tooling for one pool: monitor it, claim its fees, graduate it.
 *
 * The registry row supplies identity only. Every number on the page is read
 * from the chain in the browser by `ManagePool`, so it is as live as the last
 * refresh rather than as old as the server render.
 */
export default async function ManagePage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  const row = await getPool(address);
  if (!row || row.cluster !== cluster()) notFound();

  const quoteSymbol =
    row.quoteMint === "So11111111111111111111111111111111111111112" ? "SOL" : "USDC";

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pb-16 pt-2 lg:px-8">
      <Link
        href={`/coin/${row.baseMint}`}
        className="inline-flex items-center gap-1 text-[13px] text-j-muted hover:text-j-ink"
      >
        <ArrowLeft size={14} />
        {row.name}
      </Link>
      <h1 className="mt-2 text-[24px] font-semibold">Manage ${row.symbol}</h1>
      <p className="mt-1 max-w-[70ch] text-[13px] text-j-muted">
        Live state of this Meteora Dynamic Bonding Curve pool, read from the chain. The
        pool&apos;s creator can claim accrued trading fees and, once the curve is full,
        migrate it to DAMM v2 — the same transactions the <code>juno:claim</code> and{" "}
        <code>juno:graduate</code> scripts send.
      </p>

      <div className="mt-6">
        <ManagePool
          pool={row.poolAddress}
          symbol={row.symbol}
          quoteSymbol={quoteSymbol}
          launchPreset={row.curvePreset}
        />
      </div>
    </div>
  );
}
