import { NextRequest, NextResponse, after } from "next/server";
import { reportError } from "@/lib/observability";
import { getPostRegion } from "@/lib/db/queries";
import { presignPrivateGet } from "@/lib/blob";
import {
  finalizeCustodialRegionUnlockPaymentHash,
  rollbackCustodialRegionUnlock,
  unlockRegionWithCustodialBalance,
} from "@/lib/custodial";
import {
  requireCurrentAppUser,
  setAccountCookie,
  unauthorizedJson,
  UnauthorizedError,
} from "@/lib/app-user";
import {
  getTempoWalletAddress,
  settleUnlockWithCustodialWallet,
} from "@/lib/custodial-wallets";
import { getAssetBalance, getPaymentAssetId } from "@/lib/algorand";
import {
  checkOnChainSpendable,
  getSpendableOnChainUsd,
} from "@/lib/onchain-balance";

// Postgres + Supabase Storage signing need the Node.js runtime.
export const runtime = "nodejs";

async function settleCustodialRegionUnlockInBackground({
  userId,
  postRegionId,
  amount,
  txHash,
}: {
  userId: string;
  postRegionId: string;
  amount: string;
  txHash: string;
}) {
  const settlement = await settleUnlockWithCustodialWallet({
    userId,
    amountUsd: amount,
    reference: txHash,
  });

  if (!settlement.ok) {
    await rollbackCustodialRegionUnlock({
      userId,
      postRegionId,
      amount,
      txHash,
    });
    reportError(new Error(settlement.reason), {
      category: "money",
      severity: "fatal",
      context: { path: "region-unlock.settle", reason: settlement.reason, userId, postRegionId, amount },
    });
    return;
  }

  await finalizeCustodialRegionUnlockPaymentHash({
    userId,
    postRegionId,
    internalTxHash: txHash,
    paymentTxHash: settlement.txHash,
  });
}

function jsonWithAccountCookie(
  body: Record<string, unknown>,
  userId: string,
  init?: ResponseInit,
) {
  return setAccountCookie(NextResponse.json(body, init), userId);
}

/**
 * Reveal a single blurred region on a "partial" post. Mirrors /api/unlock but
 * charges the post's single price for ONE region and returns a signed URL for
 * that region's clean crop. Idempotent per (fan, region).
 */
export async function POST(req: NextRequest) {
  const { postId, regionId, settlementStartedAt } = (await req.json()) as {
    postId?: string;
    regionId?: string;
    settlementStartedAt?: number;
  };

  if (!postId || !regionId) {
    return Response.json({ error: "Missing fields" }, { status: 400 });
  }

  let appUser;
  try {
    appUser = await requireCurrentAppUser();
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedJson();
    throw err;
  }

  // Region must exist and belong to the named post.
  const region = await getPostRegion(regionId);
  if (!region || region.postId !== postId) {
    return Response.json({ error: "Region not found" }, { status: 404 });
  }

  // The single post price is charged for each region.
  const price = region.post.unlockPrice;
  const settlementMs = settlementStartedAt ? Date.now() - settlementStartedAt : 0;

  // The on-chain wallet is the spend authority — gate on its live balance.
  const isPaidUnlock = Number(price) > 0;
  if (isPaidUnlock) {
    const check = await checkOnChainSpendable(appUser.id, price);
    if (!check.ok) {
      return jsonWithAccountCookie(
        { error: "Insufficient balance", balance: check.balance, required: price },
        appUser.id,
        { status: 402 },
      );
    }
  }

  // The chain figure the lock-held check authorises against — see /api/unlock.
  const custodialAddress = await getTempoWalletAddress(appUser.id);
  const onChainUnits = custodialAddress
    ? await getAssetBalance(custodialAddress, getPaymentAssetId())
    : BigInt(0);

  const unlock = await unlockRegionWithCustodialBalance({
    userId: appUser.id,
    postId,
    postRegionId: regionId,
    amount: price,
    settlementMs,
    onChainUnits,
  });

  if (unlock.status === "insufficient_funds") {
    return jsonWithAccountCookie(
      {
        error: "Insufficient balance",
        balance: unlock.balance,
        required: unlock.required,
      },
      appUser.id,
      { status: 402 },
    );
  }

  if (unlock.status === "unlocked" && isPaidUnlock) {
    // See /api/unlock: `after` keeps the invocation alive until the on-chain
    // settlement resolves. A bare `void` promise can be killed the instant the
    // response is sent, paying the creator nothing.
    after(async () => {
      try {
        await settleCustodialRegionUnlockInBackground({
          userId: appUser.id,
          postRegionId: regionId,
          amount: price,
          txHash: unlock.txHash,
        });
      } catch (err) {
        reportError(err, {
          category: "money",
          severity: "fatal",
          context: { path: "region-unlock.settle", userId: appUser.id, regionId, amount: price },
        });
        try {
          await rollbackCustodialRegionUnlock({
            userId: appUser.id,
            postRegionId: regionId,
            amount: price,
            txHash: unlock.txHash,
          });
        } catch (rollbackErr) {
          reportError(rollbackErr, {
            category: "money",
            severity: "fatal",
            context: { path: "region-unlock.rollback", userId: appUser.id, regionId },
          });
        }
      }
    });
  }

  // Short-lived signed URL for this region's clean crop.
  const signedUrl = await presignPrivateGet(region.patchMediaKey, 300);

  const balance =
    unlock.status === "unlocked"
      ? await getSpendableOnChainUsd(appUser.id)
      : undefined;

  return jsonWithAccountCookie(
    {
      signedUrl,
      settlementMs,
      settlementStatus:
        unlock.status === "unlocked" && isPaidUnlock ? "pending" : "complete",
      alreadyUnlocked: unlock.status === "already_unlocked",
      balance,
      paymentTxHash: unlock.txHash,
    },
    appUser.id,
  );
}
