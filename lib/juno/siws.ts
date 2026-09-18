/**
 * Sign-in-with-Solana message format, shared by the browser that signs it and
 * the server that verifies it.
 *
 * Likes, comments and follows are keyed by wallet. Before this, the write
 * endpoints took the wallet as a plain string in the request body, so anyone
 * could like, comment or follow *as* any address. A signature over this
 * message is the proof of control that was missing; the server then issues a
 * session cookie so the wallet is asked to sign once, not on every like.
 *
 * Signing a message costs nothing and sends no transaction, and the text says
 * so — a wallet prompt that looks like a payment is one people rightly refuse.
 */

/** How long a signed message stays acceptable for exchange into a session. */
export const SIGN_IN_TTL_MS = 10 * 60 * 1000;

export function signInMessage(params: { domain: string; wallet: string; issuedAt: string }): string {
  return [
    `${params.domain} wants you to sign in to Juno with your Solana account:`,
    params.wallet,
    "",
    "Sign in to like, comment and follow. This is free: it sends no transaction and moves no funds.",
    "",
    `Issued At: ${params.issuedAt}`,
  ].join("\n");
}

/** The fields a message commits to, or null if it is not one of ours. */
export function parseSignInMessage(
  message: string,
): { domain: string; wallet: string; issuedAt: string } | null {
  const lines = message.split("\n");
  const head = lines[0]?.match(/^(.+) wants you to sign in to Juno with your Solana account:$/);
  const issued = lines[lines.length - 1]?.match(/^Issued At: (.+)$/);
  if (!head || !issued || !lines[1]) return null;
  const parsed = { domain: head[1], wallet: lines[1], issuedAt: issued[1] };
  // Reject anything that differs from the canonical text in any other line.
  return signInMessage(parsed) === message ? parsed : null;
}
