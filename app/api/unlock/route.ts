import { NextRequest, NextResponse, after } from "next/server";
import { reportError } from "@/lib/observability";
import { getPost } from "@/lib/db/queries";
import { presignPrivateGet } from "@/lib/blob";
import {
  finalizeCustodialUnlockPaymentHash,
  rollbackCustodialUnlock,
  unlockWithCustodialBalance,
} from "@/lib/custodial";
import { POINTS_PER_UNLOCK } from "@/lib/constants";
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

async function settleCustodialUnlockInBackground({
  userId,
  postId,
  amount,
  txHash,
}: {
  userId: string;
  postId: string;
  amount: string;
  txHash: string;
}) {
  const settlement = await settleUnlockWithCustodialWallet({
    userId,
    amountUsd: amount,
    reference: txHash,
  });

  if (!settlement.ok) {
    await rollbackCustodialUnlock({
      userId,
      postId,
      amount,
      txHash,
    });
    // The likelier failure than a thrown error: the chain refused the transfer
    // (creator not opted in, wallet unfunded). The unlock is rolled back above,
    // so the fan isn't charged — but a creator who cannot be paid is still an
    // outage, and it must not be discoverable only by reading logs.
    reportError(new Error(settlement.reason), {
      category: "money",
      severity: "fatal",
      context: { path: "unlock.settle", reason: settlement.reason, userId, postId, amount },
    });
    return;
  }

  await finalizeCustodialUnlockPaymentHash({
    userId,
    postId,
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

export async function POST(req: NextRequest) {
  const {
    postId,
    paymentTxHash,
    walletAddress,
    settlementMs: providedSettlementMs,
    settlementStartedAt,
  } = (await req.json()) as {
    postId?: string;
    paymentTxHash?: string;
    walletAddress?: string;
    settlementMs?: number;
    settlementStartedAt?: number;
  };

  if (!postId) {
    return Response.json({ error: "Missing fields" }, { status: 400 });
  }

  let appUser;
  try {
    appUser = await requireCurrentAppUser();
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedJson();
    throw err;
  }

  // 1. Post must exist.
  const post = await getPost(postId);
  if (!post) return Response.json({ error: "Post not found" }, { status: 404 });

  // 2a. Legacy direct Tempo wallet payment remains disabled unless explicitly
  // enabled during the migration window.
  if (
    process.env.ENABLE_LEGACY_TEMPO_WALLET_UNLOCKS === "true" &&
    (paymentTxHash || walletAddress)
  ) {
    const [{ hasUnlocked, recordUnlock, upsertUser }, { verifyTempoPayment }] =
      await Promise.all([import("@/lib/db/queries"), import("@/lib/tempo-server")]);

    if (!paymentTxHash || !walletAddress) {
      return Response.json({ error: "Missing payment proof" }, { status: 400 });
    }

    const fan = await upsertUser(walletAddress);
    const alreadyUnlocked = await hasUnlocked(fan.id, postId);
    if (!alreadyUnlocked) {
      const payment = await verifyTempoPayment(
        paymentTxHash,
        post.unlockPrice,
        walletAddress,
      );
      if (!payment.ok) {
        return Response.json(
          { error: `Payment verification failed: ${payment.reason}` },
          { status: 402 },
        );
      }

      await recordUnlock(
        fan.id,
        postId,
        paymentTxHash,
        post.unlockPrice,
        providedSettlementMs ?? 0,
        String(POINTS_PER_UNLOCK),
      );
    }

    const ttl = post.mediaType === "video" ? 300 : 60;
    const signedUrl = await presignPrivateGet(post.privateMediaKey, ttl);
    return Response.json({
      signedUrl,
      settlementMs: providedSettlementMs ?? 0,
      alreadyUnlocked,
      paymentTxHash,
    });
  }

  if (paymentTxHash || walletAddress) {
    return Response.json({ error: "Legacy wallet unlocks are disabled" }, { status: 400 });
  }

  // 2b. Custodial app-balance path: Clerk identity owns the local ledger row.
  // The on-chain wallet is the spend authority — gate on its live balance.
  const isPaidUnlock = Number(post.unlockPrice) > 0;
  if (isPaidUnlock) {
    const check = await checkOnChainSpendable(appUser.id, post.unlockPrice);
    if (!check.ok) {
      return jsonWithAccountCookie(
        {
          error: "Insufficient balance",
          balance: check.balance,
          required: post.unlockPrice,
        },
        appUser.id,
        { status: 402 },
      );
    }
  }

  const settlementMs = settlementStartedAt ? Date.now() - settlementStartedAt : 0;
  // Read the chain here and hand it to the transaction: the real authorisation
  // happens under the balance-row lock inside unlockWithCustodialBalance. The
  // pre-check above is only a fast path for the common "obviously broke" case.
  const custodialAddress = await getTempoWalletAddress(appUser.id);
  const onChainUnits = custodialAddress
    ? await getAssetBalance(custodialAddress, getPaymentAssetId())
    : BigInt(0);

  const unlock = await unlockWithCustodialBalance({
    userId: appUser.id,
    postId,
    amount: post.unlockPrice,
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
    // `after`, not a bare `void`: the on-chain settlement runs once the response
    // is sent, and a serverless host is free to freeze or kill the function the
    // moment that happens. A dangling promise would simply never finish — the fan
    // keeps the media and the creator is never paid, silently. `after` is the
    // contract that keeps the invocation alive until this resolves.
    after(async () => {
      try {
        await settleCustodialUnlockInBackground({
          userId: appUser.id,
          postId,
          amount: post.unlockPrice,
          txHash: unlock.txHash,
        });
      } catch (err) {
        // fatal: the fan has the media and the creator has not been paid.
        reportError(err, {
          category: "money",
          severity: "fatal",
          context: { path: "unlock.settle", userId: appUser.id, postId, amount: post.unlockPrice },
        });
        try {
          await rollbackCustodialUnlock({
            userId: appUser.id,
            postId,
            amount: post.unlockPrice,
            txHash: unlock.txHash,
          });
        } catch (rollbackErr) {
          // Worse: settlement failed AND we couldn't undo the unlock, so the
          // ledger now disagrees with the chain.
          reportError(rollbackErr, {
            category: "money",
            severity: "fatal",
            context: { path: "unlock.rollback", userId: appUser.id, postId },
          });
        }
      }
    });
  }

  // 3. Issue a short-lived signed URL for the unblurred media.
  const ttl = post.mediaType === "video" ? 300 : 60;
  const signedUrl = await presignPrivateGet(post.privateMediaKey, ttl);

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
