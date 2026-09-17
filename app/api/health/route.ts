import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { cluster, usingPublicRpc } from "@/lib/juno/cluster";
import { getConnection } from "@/lib/juno/dbc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Health check for uptime monitoring and deploy gates.
 *
 * Checks the two dependencies whose failure breaks the product quietly rather
 * than loudly: Postgres, which holds the pool registry, and the Solana RPC,
 * which supplies every number the app renders. Lose either and pages still
 * return 200 while showing nothing.
 *
 * 200 = serving. 503 = degraded; the body names which component so monitors
 * can alert on it. Deliberately detail-light — it names the component, never
 * endpoints, credentials or error internals.
 */

type Component = { ok: boolean; detail?: string };

async function checkDb(): Promise<Component> {
  try {
    await getDb().execute(sql`select 1`);
    return { ok: true };
  } catch {
    return { ok: false, detail: "unreachable" };
  }
}

async function checkRpc(): Promise<Component> {
  try {
    const slot = await getConnection().getSlot("confirmed");
    return { ok: true, detail: `slot ${slot}` };
  } catch {
    return { ok: false, detail: "rpc unreachable" };
  }
}

export async function GET() {
  const [database, rpc] = await Promise.all([checkDb(), checkRpc()]);

  // Reported but NOT part of `ok`: running on the public endpoint is a
  // deployment decision, not an outage. It belongs here because it is the
  // single biggest predictor of the swap indexer degrading to em-dashes, and
  // "are we on a dedicated RPC?" should be answerable without reading the env.
  const dedicatedRpc: Component = usingPublicRpc()
    ? { ok: false, detail: "public endpoint — per-method quota will throttle reads" }
    : { ok: true };

  const ok = database.ok && rpc.ok;

  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      cluster: cluster(),
      checks: { database, rpc, dedicatedRpc },
    },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
