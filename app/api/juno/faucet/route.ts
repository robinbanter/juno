import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

import { junoJson, junoOptions } from "@/lib/juno/api";
import { cluster } from "@/lib/juno/cluster";
import { getConnection } from "@/lib/juno/dbc";
import { check } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = junoOptions;

/** Enough for a launch (two transactions plus rent) and a few buys. */
const AMOUNT_SOL = 0.5;

/**
 * Devnet SOL for a new wallet.
 *
 * A wallet created on this device starts empty, and every action in Juno —
 * a buy, a launch — costs a fee. Without a way to fund it, a first-time user
 * could look at everything and do nothing.
 *
 * Two real sources, tried in order. Solana's public faucet
 * (`requestAirdrop`) first. If it refuses — it is rate-limited and often dry —
 * and the operator has set `JUNO_DEVNET_FAUCET_KEY` (a devnet keypair as a
 * JSON byte array), the SOL is sent from that key instead. With neither, the
 * answer is a readable refusal and the public faucet's address, never a fake
 * balance.
 *
 * Devnet only. On mainnet this route does not exist in any useful sense: it
 * refuses before touching the chain.
 */
export async function POST(request: Request) {
  if (cluster() !== "devnet") {
    return junoJson({ error: "The faucet only runs on devnet." }, { status: 404 });
  }

  let wallet: PublicKey;
  try {
    const body = (await request.json()) as { wallet?: unknown };
    wallet = new PublicKey(typeof body.wallet === "string" ? body.wallet : "");
  } catch {
    return junoJson({ error: "wallet is not an address" }, { status: 400 });
  }

  // Three tries per wallet per ten minutes. Attempts count, not successes, so
  // a dry public faucet still leaves room to try again once or twice.
  const limited = check(`faucet:${wallet.toBase58()}`, 3, 10 * 60_000);
  if (!limited.ok) {
    return junoJson(
      {
        error: `Too many faucet requests for this wallet. Try again in ${Math.ceil(limited.retryAfter / 60)} min.`,
        retryAfter: limited.retryAfter,
      },
      { status: 429 },
    );
  }

  const connection = getConnection();
  const lamports = Math.round(AMOUNT_SOL * LAMPORTS_PER_SOL);

  try {
    const signature = await connection.requestAirdrop(wallet, lamports);
    const latest = await connection.getLatestBlockhash();
    await connection.confirmTransaction({ signature, ...latest }, "confirmed");
    return junoJson({ signature, amount: AMOUNT_SOL, source: "public-faucet" });
  } catch (publicError) {
    const funder = faucetKey();
    if (funder) {
      try {
        const signature = await sendAndConfirmTransaction(
          connection,
          new Transaction().add(
            SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: wallet, lamports }),
          ),
          [funder],
          { commitment: "confirmed" },
        );
        return junoJson({ signature, amount: AMOUNT_SOL, source: "juno-faucet" });
      } catch (error) {
        return junoJson(
          { error: `The faucet could not send: ${error instanceof Error ? error.message : "unknown error"}` },
          { status: 502 },
        );
      }
    }
    return junoJson(
      {
        error:
          "Solana's public devnet faucet is refusing right now. Get devnet SOL at faucet.solana.com with your address, then pull to refresh.",
        faucetUrl: "https://faucet.solana.com",
        detail: publicError instanceof Error ? publicError.message : undefined,
      },
      { status: 503 },
    );
  }
}

function faucetKey(): Keypair | null {
  const raw = process.env.JUNO_DEVNET_FAUCET_KEY;
  if (!raw) return null;
  try {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw) as number[]));
  } catch {
    return null;
  }
}
