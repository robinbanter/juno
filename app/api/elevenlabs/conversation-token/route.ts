import { NextRequest, NextResponse } from "next/server";
import { getCustodialAccount, normalizeMoney } from "@/lib/custodial";
import { getActiveCallSession } from "@/lib/db/calls";
import { getThreadFor } from "@/lib/db/messages";
import {
  requireCurrentAppUser,
  setAccountCookie,
  unauthorizedJson,
  UnauthorizedError,
} from "@/lib/app-user";
import { rateLimit, LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";

const CALL_RATE_PER_SECOND_USD = 0.05;
const DEFAULT_MIN_START_BALANCE_SECONDS = 10;
const DEFAULT_RESERVE_INTERVAL_SECONDS = 5;
const MAX_CALL_SECONDS = 60 * 60;

function noStoreJson(
  body: Record<string, unknown>,
  userId: string,
  init?: ResponseInit,
) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return setAccountCookie(NextResponse.json(body, { ...init, headers }), userId);
}

function minStartBalanceSeconds() {
  const value = Number(process.env.ELEVENLABS_MIN_START_BALANCE_SECONDS);
  return Number.isInteger(value) && value > 0
    ? value
    : DEFAULT_MIN_START_BALANCE_SECONDS;
}

function reserveIntervalSeconds() {
  const value = Number(process.env.ELEVENLABS_CALL_RESERVE_INTERVAL_SECONDS);
  return Number.isInteger(value) && value > 0
    ? value
    : DEFAULT_RESERVE_INTERVAL_SECONDS;
}

function callAmount(seconds: number) {
  return normalizeMoney((seconds * CALL_RATE_PER_SECOND_USD).toFixed(2));
}

/**
 * A 402 here means "your prepaid balance is short", not "here is a payment
 * protocol to satisfy": this endpoint is session-authenticated and spends the
 * caller's custodial balance, so the body's balance/required is the whole
 * contract. The machine-payable surface — where a 402 does carry actionable
 * signed payment requirements — is the x402 resource server (lib/x402.ts,
 * /api/x402/*).
 */
function paymentChallenge({
  amount,
  balance,
  required,
}: {
  amount: string;
  balance: string;
  required: string;
}) {
  return {
    error: "Insufficient balance",
    balance,
    required,
    mpp: {
      scheme: "Payment",
      intent: "session",
      status: "payment_required",
      currency: "USDC",
      amount,
      required,
    },
  };
}


function publicUserName(user: {
  username: string | null;
  displayName: string | null;
  walletAddress: string;
}) {
  return (
    user.username ??
    user.displayName ??
    `fan_${user.walletAddress.slice(2, 10).toLowerCase()}`
  );
}

function isValidCallId(value: string) {
  return /^[a-zA-Z0-9_-]{8,80}$/.test(value);
}

export async function GET(req: NextRequest) {
  let user;
  try {
    user = await requireCurrentAppUser();

    const limited = rateLimit(`voice:${user.id}`, LIMITS.voiceToken);
    if (limited) return limited;
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedJson();
    throw err;
  }

  const threadId = req.nextUrl.searchParams.get("threadId");
  const callId = req.nextUrl.searchParams.get("callId");
  if (!threadId) {
    return noStoreJson({ error: "threadId is required" }, user.id, {
      status: 400,
    });
  }
  if (callId && !isValidCallId(callId)) {
    return noStoreJson({ error: "Invalid callId" }, user.id, { status: 400 });
  }

  const thread = await getThreadFor(user.id, threadId);
  if (!thread) {
    return noStoreJson({ error: "Thread not found" }, user.id, { status: 404 });
  }
  if (thread.fanId !== user.id) {
    return noStoreJson(
      { error: "Only the fan can start paid voice calls" },
      user.id,
      { status: 403 },
    );
  }

  const activeCall = await getActiveCallSession({
    threadId: thread.id,
    fanId: thread.fanId,
  });
  if (activeCall && activeCall.id !== callId) {
    return noStoreJson(
      {
        error: "An active call already exists for this thread",
        call: {
          callId: activeCall.id,
          status: activeCall.status,
          connectedAt: activeCall.connectedAt?.toISOString() ?? null,
        },
      },
      user.id,
      { status: 409 },
    );
  }

  const required = callAmount(minStartBalanceSeconds());
  const account = await getCustodialAccount(user.id);
  const balance = account?.availableBalance ?? "0";
  if (Number(balance) < Number(required)) {
    return noStoreJson(
      paymentChallenge({ amount: required, balance, required }),
      user.id,
      { status: 402 },
    );
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  if (!apiKey || !agentId) {
    return noStoreJson(
      { error: "ElevenLabs voice calls are not configured" },
      user.id,
      { status: 503 },
    );
  }

  const url = new URL("https://api.elevenlabs.io/v1/convai/conversation/token");
  url.searchParams.set("agent_id", agentId);
  url.searchParams.set("participant_name", publicUserName(user));
  if (process.env.ELEVENLABS_BRANCH_ID) {
    url.searchParams.set("branch_id", process.env.ELEVENLABS_BRANCH_ID);
  }
  if (process.env.ELEVENLABS_ENVIRONMENT) {
    url.searchParams.set("environment", process.env.ELEVENLABS_ENVIRONMENT);
  }

  const signedUrl = new URL(
    "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url",
  );
  signedUrl.searchParams.set("agent_id", agentId);

  const [response, signedResponse] = await Promise.all([
    fetch(url, {
      method: "GET",
      headers: { "xi-api-key": apiKey },
      cache: "no-store",
    }),
    fetch(signedUrl, {
      method: "GET",
      headers: { "xi-api-key": apiKey },
      cache: "no-store",
    }),
  ]);

  if (!response.ok) {
    return noStoreJson(
      {
        error: "Could not create ElevenLabs conversation token",
        status: response.status,
      },
      user.id,
      { status: 502 },
    );
  }

  const payload = (await response.json().catch(() => ({}))) as {
    token?: string;
  };
  const signedPayload = (await signedResponse.json().catch(() => ({}))) as {
    signed_url?: string;
    signedUrl?: string;
  };
  if (!payload.token) {
    return noStoreJson(
      { error: "ElevenLabs did not return a conversation token" },
      user.id,
      { status: 502 },
    );
  }

  return noStoreJson(
    {
      token: payload.token,
      signedUrl: signedPayload.signed_url ?? signedPayload.signedUrl ?? null,
      call: {
        callId: activeCall?.id ?? callId ?? null,
        threadId: thread.id,
        agentId,
        ratePerSecondUsd: CALL_RATE_PER_SECOND_USD,
        currency: "USDC",
        reserveIntervalSeconds: reserveIntervalSeconds(),
        minStartBalanceSeconds: minStartBalanceSeconds(),
        maxSeconds: MAX_CALL_SECONDS,
      },
    },
    user.id,
  );
}
