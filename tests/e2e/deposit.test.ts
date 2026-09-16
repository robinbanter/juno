import { describe, it, expect } from "vitest";
import algosdk from "algosdk";
import { waitForServer, devCookie } from "../helpers/server";

/**
 * The money-IN path, end to end.
 *
 * Users fund themselves: there is no card and no treasury, so "deposit" means
 * provisioning the user's custodial wallet (seed ALGO for gas + opt in to USDC)
 * and handing back an address that can actually receive.
 *
 * The assertion that matters is the opt-in: an asset transfer to a non-opted-in
 * account is REJECTED on-chain, so if this endpoint ever returned an address
 * before opting it in, a real user's real USDC would bounce.
 *
 * Needs `npm run dev`.
 */
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";

const serverUp = await waitForServer(BASE);


const cookie = serverUp ? await devCookie(BASE) : null;

type DepositAddress = {
  address: string;
  assetId: number;
  asset: string;
  decimals: number;
  network: string;
  ready: boolean;
  reason?: string;
};

async function depositAddress(): Promise<{ status: number; body: DepositAddress }> {
  const r = await fetch(`${BASE}/api/account/deposit-address`, {
    method: "POST",
    headers: { cookie: cookie! },
  });
  return { status: r.status, body: await r.json() };
}

describe.skipIf(!serverUp || !cookie)("e2e: self-funded USDC deposits", () => {
  it("returns a real, opted-in Algorand address that can receive USDC", async () => {
    const { status, body } = await depositAddress();
    expect(status).toBe(200);

    // A valid Algorand address, and the real USDC asset for this network.
    expect(algosdk.isValidAddress(body.address)).toBe(true);
    expect(body.asset).toBe("USDC");
    expect(body.decimals).toBe(6);
    expect([10458941, 31566704]).toContain(body.assetId);
    expect(body.network === "mainnet" ? 31566704 : 10458941).toBe(body.assetId);

    // The whole point: it's ready to receive, i.e. actually opted in on-chain.
    expect(body.ready, body.reason ?? "wallet should be provisioned").toBe(true);

    const algod = new algosdk.Algodv2(
      "",
      body.network === "mainnet"
        ? "https://mainnet-api.algonode.cloud"
        : "https://testnet-api.algonode.cloud",
      443,
    );
    const info = await algod.accountInformation(body.address).do();
    const optedIn = (info.assets ?? []).some((a) => Number(a.assetId) === body.assetId);
    expect(optedIn, "wallet must be opted in to USDC or deposits bounce").toBe(true);
    // And it holds enough ALGO to pay fees / meet min-balance.
    expect(Number(info.amount)).toBeGreaterThanOrEqual(100_000);
  }, 180_000);

  it("is idempotent — the same wallet, no second opt-in", async () => {
    const first = await depositAddress();
    const second = await depositAddress();
    expect(second.status).toBe(200);
    expect(second.body.address).toBe(first.body.address);
    expect(second.body.ready).toBe(true);
  }, 120_000);

  it("matches the address the account endpoint reports", async () => {
    const { body } = await depositAddress();
    const r = await fetch(`${BASE}/api/account`, {
      headers: { cookie: cookie! },
      cache: "no-store",
    });
    const { account } = await r.json();
    // One wallet everywhere — the deposit address IS the balance address.
    expect(account.tempoWalletAddress).toBe(body.address);
  }, 60_000);

  it("lists on-chain deposit history for the wallet", async () => {
    const r = await fetch(`${BASE}/api/account/deposits`, {
      headers: { cookie: cookie! },
      cache: "no-store",
    });
    expect(r.status).toBe(200);
    const { deposits } = (await r.json()) as {
      deposits: { txid: string; amount: string; from: string; at: string | null }[];
    };
    expect(Array.isArray(deposits)).toBe(true);
    for (const d of deposits) {
      expect(d.txid).toMatch(/^[A-Z2-7]{52}$/);
      expect(Number(d.amount)).toBeGreaterThan(0); // opt-ins/self-sends filtered out
      expect(algosdk.isValidAddress(d.from)).toBe(true);
    }
  }, 60_000);

  it("requires auth", async () => {
    const r = await fetch(`${BASE}/api/account/deposit-address`, { method: "POST" });
    expect(r.status).toBe(401);
  }, 30_000);

  it("no longer exposes the mock card top-up", async () => {
    // The platform has no treasury to sell USDC out of; a mock card that funded
    // wallets from it would be free real money on MainNet.
    for (const path of ["/api/account/deposit", "/api/account/deposit/mock"]) {
      const r = await fetch(`${BASE}${path}`, {
        method: "POST",
        headers: { cookie: cookie!, "content-type": "application/json" },
        body: JSON.stringify({ amount: "5" }),
      });
      expect(r.status, `${path} should be gone`).toBe(404);
    }
  }, 60_000);
});
