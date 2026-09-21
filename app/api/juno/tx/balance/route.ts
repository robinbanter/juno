import { PublicKey } from "@solana/web3.js";

import { junoError, junoHandler, junoJson, junoOptions } from "@/lib/juno/api";
import { getConnection } from "@/lib/juno/dbc";
import { assertAddress } from "@/lib/juno/social-graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = junoOptions;

const WRAPPED_SOL = "So11111111111111111111111111111111111111112";

/**
 * What one wallet can spend of one token.
 *
 * The buy sheet calls its balance line "the number that decides whether any of
 * the rest is possible", and then showed a dash on every buy in the app,
 * because nothing ever read it. The portfolio endpoint knows coin balances but
 * not the *quote* side, which is the side a buy spends from.
 *
 * Native SOL is the lamport balance, not a token account: a wallet with 0.4 SOL
 * and no wrapped-SOL account can still buy, and reading it as an SPL balance
 * would report zero and stop them.
 *
 * `null` rather than `0` when the read fails, for the reason everything here
 * returns null: "we could not look" is not "you have nothing", and only one of
 * those should grey out the button.
 *
 * `GET ?wallet=&mint=`.
 */
export async function GET(request: Request) {
  return junoHandler(async () => {
    const url = new URL(request.url);
    const wallet = url.searchParams.get("wallet") ?? "";
    const mint = url.searchParams.get("mint") ?? "";
    if (!wallet) return junoError("A wallet is required");
    if (!mint) return junoError("A mint is required");
    assertAddress(wallet);
    assertAddress(mint, "mint");

    const connection = getConnection();
    const owner = new PublicKey(wallet);

    if (mint === WRAPPED_SOL) {
      const lamports = await connection.getBalance(owner).catch(() => null);
      return junoJson({
        wallet,
        mint,
        balance: lamports === null ? null : lamports / 1e9,
      });
    }

    const accounts = await connection
      .getParsedTokenAccountsByOwner(owner, { mint: new PublicKey(mint) })
      .catch(() => null);
    if (accounts === null) return junoJson({ wallet, mint, balance: null });

    // Several accounts for one mint is unusual but legal, and the spendable
    // total is their sum.
    const balance = accounts.value.reduce((sum, account) => {
      const amount = (
        account.account.data.parsed as { info?: { tokenAmount?: { uiAmount?: number | null } } }
      ).info?.tokenAmount?.uiAmount;
      return sum + (amount ?? 0);
    }, 0);

    return junoJson({ wallet, mint, balance });
  });
}
