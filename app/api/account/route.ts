import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  CUSTODIAL_ACCOUNT_COOKIE,
  getOrCreateCustodialAccount,
} from "@/lib/custodial";
import {
  requireCurrentAppUser,
  setAccountCookie,
  unauthorizedJson,
  UnauthorizedError,
} from "@/lib/app-user";
import { ensureUserTempoWallet } from "@/lib/custodial-wallets";
import { getSpendableOnChainUsd } from "@/lib/onchain-balance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonWithAccountCookie(
  body: Record<string, unknown>,
  userId: string,
  init?: ResponseInit,
) {
  return setAccountCookie(NextResponse.json(body, init), userId);
}

export async function GET() {
  try {
    const user = await requireCurrentAppUser();
    const account = await getOrCreateCustodialAccount(user.id);
    const tempoWalletAddress = await getAccountWalletAddress(user.id);
    const availableBalance = await getSpendableOnChainUsd(user.id);
    return jsonWithAccountCookie(
      { account: { ...account, availableBalance, tempoWalletAddress } },
      user.id,
    );
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      const cookieStore = await cookies();
      const account = await getOrCreateCustodialAccount(
        cookieStore.get(CUSTODIAL_ACCOUNT_COOKIE)?.value,
      );
      const tempoWalletAddress = await getAccountWalletAddress(account.userId);
      const availableBalance = await getSpendableOnChainUsd(account.userId);
      return jsonWithAccountCookie(
        { account: { ...account, availableBalance, tempoWalletAddress } },
        account.userId,
      );
    }
    throw err;
  }
}

async function getAccountWalletAddress(userId: string) {
  // The user's custodial Algorand wallet — the account that holds the balance.
  const tempoWallet = await ensureUserTempoWallet(userId);
  return tempoWallet.address;
}

export async function POST() {
  try {
    const user = await requireCurrentAppUser();
    // Balances aren't credited by an API — they're real USDC. To add funds, send
    // USDC to the wallet from POST /api/account/deposit-address.
    return jsonWithAccountCookie(
      { error: "Balances are on-chain USDC — deposit to your wallet address to add funds" },
      user.id,
      { status: 410 },
    );
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedJson();
    throw err;
  }
}
