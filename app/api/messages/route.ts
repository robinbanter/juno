import { NextRequest } from "next/server";
import { upsertCreator } from "@/lib/db/queries";
import { listThreads, getOrCreateThread } from "@/lib/db/messages";
import { getOrCreateBotThreadForUser, getOrCreateBotUser } from "@/lib/bot";
import { jsonError, requireAppUserForRoute } from "@/lib/api/route";

export const runtime = "nodejs";

const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;

function handleFor(u: {
  username: string | null;
  walletAddress: string;
}): string {
  return u.username ?? `@${u.walletAddress.slice(2, 8).toLowerCase()}`;
}

/** GET /api/messages — the signed-in user's inbox. */
export async function GET() {
  const auth = await requireAppUserForRoute();
  if (auth.response) return auth.response;

  const bot = await getOrCreateBotUser();
  await getOrCreateBotThreadForUser(auth.user.id);

  const rows = await listThreads(auth.user.id);
  const threads = rows
    .map((t) => ({
      id: t.id,
      name: handleFor(t.other),
      avatar: t.other.avatar,
      preview: t.preview,
      at: t.lastMessageAt,
      unread: t.unread,
      isBot: t.other.id === bot.id,
    }))
    .sort((a, b) => Number(b.isBot) - Number(a.isBot));
  return Response.json({ threads });
}

/**
 * POST /api/messages — open (or reuse) a conversation with a creator.
 * Body: { creatorWallet }. The target is marked a creator; the caller
 * is the fan. Returns the thread id to navigate to.
 */
export async function POST(req: NextRequest) {
  const { creatorWallet } = (await req.json()) as {
    creatorWallet?: string;
  };

  if (!creatorWallet || !WALLET_RE.test(creatorWallet)) {
    return jsonError("Invalid creator", 400);
  }

  const auth = await requireAppUserForRoute();
  if (auth.response) return auth.response;
  const { user: fan } = auth;

  if (fan.walletAddress.toLowerCase() === creatorWallet.toLowerCase()) {
    return jsonError("Cannot message yourself", 400);
  }

  const creator = await upsertCreator(creatorWallet);

  const thread = await getOrCreateThread(creator.id, fan.id);
  return Response.json({ threadId: thread.id });
}
