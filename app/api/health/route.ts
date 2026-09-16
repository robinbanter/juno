import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { getAlgod, getPaymentAssetId, getPlatformAddress, isOptedIn } from "@/lib/algorand";
import { algoNetwork } from "@/lib/constants";
import { scanningEnabled } from "@/lib/moderation/scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Health check for uptime monitoring and deploy gates.
 *
 * Checks the dependencies whose failure silently breaks money rather than
 * throwing something visible: the database (balances, custodial keys), algod
 * (every payment), and whether the platform can still receive revenue at all.
 *
 * 200 = serving. 503 = degraded; the body says which dependency and monitors can
 * alert on it. Deliberately public and detail-light — it names *which* component
 * is down, never addresses, versions, or error internals.
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

async function checkChain(): Promise<Component> {
  try {
    const status = await getAlgod().status().do();
    return { ok: true, detail: `round ${status.lastRound}` };
  } catch {
    return { ok: false, detail: "algod unreachable" };
  }
}

/**
 * The platform must be opted in to USDC or every unlock fails to settle — a
 * failure mode that is otherwise invisible until revenue quietly stops.
 */
async function checkPlatform(): Promise<Component> {
  try {
    if (!process.env.DEPLOYER_MNEMONIC) return { ok: false, detail: "not configured" };
    const ready = await isOptedIn(getPlatformAddress(), getPaymentAssetId());
    return ready ? { ok: true } : { ok: false, detail: "not opted in to USDC" };
  } catch {
    return { ok: false, detail: "unavailable" };
  }
}

export async function GET() {
  const [db, chain, platform] = await Promise.all([checkDb(), checkChain(), checkPlatform()]);
  // Reported but NOT part of `ok`: scanning being off is a deployment decision,
  // not an outage, and flapping the health check would just get it ignored.
  // It's here so "are we scanning?" is answerable without reading the env.
  const scanning: Component = scanningEnabled()
    ? { ok: true }
    : { ok: false, detail: "no scanner configured — uploads publish unexamined" };
  const ok = db.ok && chain.ok && platform.ok;

  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      network: algoNetwork(),
      checks: { database: db, chain, platform, contentScanning: scanning },
    },
    {
      status: ok ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}
