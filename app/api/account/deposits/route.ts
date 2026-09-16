import { NextResponse } from "next/server";
import {
  requireCurrentAppUser,
  setAccountCookie,
  UnauthorizedError,
} from "@/lib/app-user";
import { getTempoWalletAddress } from "@/lib/custodial-wallets";
import {
  ASSET_DECIMALS,
  getPaymentAssetId,
  listIncomingAssetTransfers,
} from "@/lib/algorand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Base units (6dp) → a plain USD string, without float rounding. */
function unitsToUsd(units: bigint): string {
  const base = BigInt(10) ** BigInt(ASSET_DECIMALS);
  const whole = units / base;
  const fraction = (units % base).toString().padStart(ASSET_DECIMALS, "0");
  return `${whole}.${fraction}`;
}

/**
 * Deposit history, read from the chain rather than a ledger table: every USDC
 * transfer into the user's custodial wallet. Since users fund themselves, the
 * chain IS the record — there's no card processor to reconcile against.
 */
export async function GET() {
  try {
    const user = await requireCurrentAppUser();
    const address = await getTempoWalletAddress(user.id);
    if (!address) {
      return setAccountCookie(NextResponse.json({ deposits: [] }), user.id);
    }

    const transfers = await listIncomingAssetTransfers(address, getPaymentAssetId());
    const deposits = transfers.map((t) => ({
      txid: t.txid,
      amount: unitsToUsd(t.amount),
      from: t.sender,
      at: t.roundTime != null ? new Date(t.roundTime * 1000).toISOString() : null,
    }));
    return setAccountCookie(NextResponse.json({ deposits }), user.id);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ deposits: [] });
    }
    // An indexer hiccup shouldn't blank the page the user is standing on.
    return NextResponse.json(
      { deposits: [], error: err instanceof Error ? err.message : "Could not load deposits" },
      { status: 502 },
    );
  }
}
