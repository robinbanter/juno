import { describe, it, expect } from "vitest";
import algosdk from "algosdk";
import bs58 from "bs58";
import { solanaPubkeyToAlgorandAddress } from "@/lib/privyWallet";

/**
 * Privy provisions an embedded *Solana* wallet; Algorand accounts are the same
 * ed25519 keypairs, so the public key re-encodes into an Algorand address. This
 * conversion is what makes a Privy login usable as an Algorand wallet.
 */
describe("solanaPubkeyToAlgorandAddress", () => {
  it("re-encodes a Solana ed25519 pubkey to the identical Algorand address", () => {
    const account = algosdk.generateAccount();
    const pubkey = account.sk.slice(32, 64); // 32-byte ed25519 public key
    const base58 = bs58.encode(pubkey); // what Privy exposes as wallet.address
    expect(solanaPubkeyToAlgorandAddress(base58)).toBe(account.addr.toString());
  });

  it("produces a valid 58-char Algorand address", () => {
    const account = algosdk.generateAccount();
    const out = solanaPubkeyToAlgorandAddress(bs58.encode(account.sk.slice(32, 64)));
    expect(out).not.toBeNull();
    expect(out).toHaveLength(58);
    expect(algosdk.isValidAddress(out!)).toBe(true);
  });

  it("is deterministic", () => {
    const base58 = bs58.encode(algosdk.generateAccount().sk.slice(32, 64));
    expect(solanaPubkeyToAlgorandAddress(base58)).toBe(
      solanaPubkeyToAlgorandAddress(base58),
    );
  });

  it("returns null for a wrong-length key", () => {
    expect(solanaPubkeyToAlgorandAddress(bs58.encode(new Uint8Array(16)))).toBeNull();
    expect(solanaPubkeyToAlgorandAddress(bs58.encode(new Uint8Array(64)))).toBeNull();
  });

  it("returns null for invalid base58 / empty input", () => {
    expect(solanaPubkeyToAlgorandAddress("0OIl not base58!!")).toBeNull();
    expect(solanaPubkeyToAlgorandAddress("")).toBeNull();
  });
});
