import { getLoyaltyBalance, getUserStats } from "@/lib/db/queries";
import {
  requireCurrentAppUser,
  unauthorizedJson,
  UnauthorizedError,
} from "@/lib/app-user";
import { ensureUserTempoWallet } from "@/lib/custodial-wallets";

export const runtime = "nodejs";

/**
 * Loyalty points balance for the signed-in user. Points live in the off-chain
 * ledger (`loyalty_ledger`); there is no on-chain rewards token on Algorand.
 *
 *   GET /api/loyalty
 */
export async function GET() {
  let user;
  try {
    user = await requireCurrentAppUser();
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedJson();
    throw err;
  }

  const points = await getLoyaltyBalance(user.id);
  const stats = await getUserStats(user.id);
  const tempoWallet = await ensureUserTempoWallet(user.id);

  return Response.json({
    wallet: user.walletAddress,
    // The user's custodial Algorand wallet.
    tempoWalletAddress: tempoWallet.address,
    points,
    stats,
  });
}
