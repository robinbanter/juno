import { NextResponse } from "next/server";
import {
  requireCurrentAppUser,
  setAccountCookie,
  unauthorizedJson,
  UnauthorizedError,
} from "@/lib/app-user";
import {
  withdrawUsdcFromCustodialWallet,
  type WithdrawalErrorCode,
} from "@/lib/custodial-wallets";
import { getSpendableOnChainUsd } from "@/lib/onchain-balance";
import { algoTxUrl } from "@/lib/constants";
import { rateLimit, LIMITS } from "@/lib/rate-limit";
import { reportError } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Bad input is the user's mistake (400); a chain/relay failure is ours (502). */
const STATUS: Record<WithdrawalErrorCode, number> = {
  invalid_address: 400,
  invalid_amount: 400,
  insufficient_funds: 400,
  recipient_not_opted_in: 400,
  same_wallet: 400,
  failed: 502,
};

/**
 * Money OUT: send the user's USDC to a wallet they control.
 *
 * The custodial wallet holds real funds that belong to the user, so this exists
 * to make the platform a two-way door — without it, creators would earn USDC
 * they could never take out.
 *
 * Every guard lives in the engine (address validity, opt-in, escrow-aware cap);
 * this route only shapes the response.
 */
export async function POST(req: Request) {
  let userId: string | null = null;
  try {
    const user = await requireCurrentAppUser();
    userId = user.id;

    // Keyed by user, not IP: this is the endpoint that sends real funds to an
    // arbitrary address, so the identity that matters is the account being drained.
    const limited = rateLimit(`withdraw:${user.id}`, LIMITS.withdraw);
    if (limited) return limited;

    const body = (await req.json().catch(() => ({}))) as {
      to?: unknown;
      amount?: unknown;
    };

    const to = typeof body.to === "string" ? body.to.trim() : "";
    const amount = typeof body.amount === "string" ? body.amount.trim() : "";
    if (!to || !amount) {
      return setAccountCookie(
        NextResponse.json({ error: "Both a destination address and an amount are required" }, { status: 400 }),
        user.id,
      );
    }

    const result = await withdrawUsdcFromCustodialWallet({
      userId: user.id,
      to,
      amountUsd: amount,
    });
    if (!result.ok) {
      return setAccountCookie(
        NextResponse.json({ error: result.reason, code: result.code }, { status: STATUS[result.code] }),
        user.id,
      );
    }

    return setAccountCookie(
      NextResponse.json({
        txid: result.txHash,
        amount: result.amountUsd,
        to: result.to,
        explorerUrl: algoTxUrl(result.txHash),
        // The post-withdrawal balance, read back from the chain.
        availableBalance: await getSpendableOnChainUsd(user.id),
      }),
      user.id,
    );
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedJson();
    // fatal: the user is trying to get their own money out and cannot.
    reportError(err, {
      category: "money",
      severity: "fatal",
      context: { path: "withdraw", userId },
    });
    const res = NextResponse.json(
      { error: err instanceof Error ? err.message : "Withdrawal failed" },
      { status: 500 },
    );
    return userId ? setAccountCookie(res, userId) : res;
  }
}
