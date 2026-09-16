import { NextResponse } from "next/server";
import {
  requireCurrentAppUser,
  setAccountCookie,
  unauthorizedJson,
  UnauthorizedError,
} from "@/lib/app-user";
import { provisionCustodialWalletForDeposits } from "@/lib/custodial-wallets";
import { algoNetwork } from "@/lib/constants";
import { rateLimit, LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The money-IN path. Users fund themselves with their own USDC — there is no
 * treasury and nothing is minted here.
 *
 * POST (not GET) because this has a real side effect: it seeds the wallet with a
 * little ALGO for gas and opts it in to USDC. Both are required BEFORE the
 * address can receive a cent — an asset transfer to a non-opted-in account is
 * rejected on-chain, so handing out an unprovisioned address would bounce the
 * user's money.
 */
export async function POST() {
  let userId: string | null = null;
  try {
    const user = await requireCurrentAppUser();

    const limited = rateLimit(`deposit:${user.id}`, LIMITS.deposit);
    if (limited) return limited;
    userId = user.id;
    const wallet = await provisionCustodialWalletForDeposits(user.id);
    return setAccountCookie(
      NextResponse.json({
        address: wallet.address,
        assetId: wallet.assetId,
        asset: "USDC",
        decimals: 6,
        network: algoNetwork(),
        ready: wallet.ready,
        ...(wallet.reason ? { reason: wallet.reason } : {}),
      }),
      user.id,
    );
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedJson();
    const body = {
      error: err instanceof Error ? err.message : "Could not prepare deposit address",
    };
    const res = NextResponse.json(body, { status: 500 });
    return userId ? setAccountCookie(res, userId) : res;
  }
}
