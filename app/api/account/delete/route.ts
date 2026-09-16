import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import {
  requireCurrentAppUser,
  unauthorizedJson,
  UnauthorizedError,
} from "@/lib/app-user";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getSpendableOnChainUsd } from "@/lib/onchain-balance";
import { getTempoWalletAddress } from "@/lib/custodial-wallets";
import { getAssetBalance, getPaymentAssetId } from "@/lib/algorand";
import { SESSION_COOKIE, CLIENT_USER_COOKIE } from "@/lib/privy-session";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Delete the account and its data.
 *
 * The privacy policy promises this, so it has to exist. The hard part isn't the
 * delete — it's the money. Deleting the user cascades the custodial wallet row,
 * and that row holds the ONLY copy of the wallet's key. Once it's gone the
 * address is permanently unspendable: any USDC still in it, or later sent to it,
 * is unrecoverable by anyone including us.
 *
 * So this refuses while the wallet still holds anything, and tells the user to
 * withdraw first. Silently burning someone's balance to honour a delete request
 * would be a worse failure than not honouring it.
 */
export async function DELETE() {
  let userId: string | null = null;
  try {
    const user = await requireCurrentAppUser();
    userId = user.id;

    const limited = rateLimit(`delete:${user.id}`, { limit: 3, windowMs: 60_000 });
    if (limited) return limited;

    // Check the chain, not the ledger: the chain is what actually holds funds.
    const address = await getTempoWalletAddress(user.id);
    if (address) {
      const onChain = await getAssetBalance(address, getPaymentAssetId());
      if (onChain > BigInt(0)) {
        return NextResponse.json(
          {
            error:
              "Withdraw your USDC before deleting your account — deleting destroys the wallet key, and any balance left behind is unrecoverable.",
            code: "balance_remaining",
            balance: (Number(onChain) / 1e6).toFixed(2),
            withdrawAt: "/withdraw",
          },
          { status: 409 },
        );
      }
    }

    // Escrow means a call is mid-flight and is about to claim funds.
    const spendable = await getSpendableOnChainUsd(user.id);
    if (Number(spendable) < 0) {
      return NextResponse.json(
        { error: "A payment is still settling — try again in a moment.", code: "settling" },
        { status: 409 },
      );
    }

    // 22 of the 25 tables referencing users cascade; reports deliberately
    // `set null` instead, so a moderation record survives the reporter or the
    // reported user deleting their account. That evidence must outlive them.
    await getDb().delete(users).where(eq(users.id, user.id));

    const res = NextResponse.json({ ok: true, deleted: true });
    // Kill the session on the way out — the account it names no longer exists.
    res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
    res.cookies.set(CLIENT_USER_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedJson();
    console.error(`[account] delete failed for ${userId}:`, err);
    return NextResponse.json({ error: "Could not delete the account" }, { status: 500 });
  }
}
