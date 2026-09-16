import { describe, it, expect } from "vitest";
import algosdk from "algosdk";
import { waitForServer } from "../helpers/server";

/**
 * The x402 resource server: Norr content as a machine-payable API.
 *
 * These assert the protocol itself — that an unpaid request produces a real,
 * well-formed x402 402 with payment requirements a client can actually act on,
 * rather than a bare "402 insufficient funds" status that only looks the part.
 *
 * A full paid round-trip (client signs -> facilitator verifies -> settles
 * on-chain) is exercised by `npm run x402:buy`; it needs a funded buyer wallet,
 * so it isn't asserted here.
 *
 * Needs `npm run dev`.
 */
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";

const serverUp = await waitForServer(BASE);

type Discovery = {
  x402Version: number;
  network: string;
  asset: { id: string; symbol: string; decimals: number };
  facilitator: string;
  resources: { id: string; title: string; price: string; url: string }[];
};

const catalog: Discovery | null = serverUp
  ? await fetch(`${BASE}/api/x402/posts`).then((r) => r.json())
  : null;

const paid = catalog?.resources.find((r) => Number(r.price.replace("$", "")) > 0) ?? null;

/**
 * Probe once: can the server currently sell anything?
 *
 * A 503 means the platform isn't provisioned for this network (no gas to seed
 * the creator's wallet) — a legitimate reason to skip, and exactly what
 * `npm run mainnet:preflight` exists to report. Deliberately narrow: ONLY a 503
 * skips, so a 402 that breaks any other way (500, or worse, a 200 handing out
 * media for free) still fails loudly rather than vanishing from the run.
 */
const probeStatus = paid ? (await fetch(paid.url)).status : 0;
const platformNotProvisioned = probeStatus === 503;

/** x402 sends payment requirements as a base64 JSON header. */
function decodePaymentRequired(header: string) {
  return JSON.parse(Buffer.from(header, "base64").toString());
}

describe.skipIf(!serverUp)("e2e: x402 discovery", () => {
  it("advertises the protocol version, network and asset for free", async () => {
    const res = await fetch(`${BASE}/api/x402/posts`);
    expect(res.status).toBe(200); // discovery must not itself be paywalled
    const body = (await res.json()) as Discovery;

    expect(body.x402Version).toBe(2);
    expect(body.network).toMatch(/^algorand:/); // CAIP-2
    expect(body.asset.decimals).toBe(6);
    expect(body.facilitator).toMatch(/^https:\/\//);
    expect(Array.isArray(body.resources)).toBe(true);
  });

  it("never leaks the private media key it is selling", async () => {
    const raw = await fetch(`${BASE}/api/x402/posts`).then((r) => r.text());
    expect(raw).not.toContain("privateMediaKey");
    expect(raw).not.toContain("signedUrl");
  });

  it("404s an unknown post instead of quoting a price for it", async () => {
    const res = await fetch(`${BASE}/api/x402/posts/00000000-0000-0000-0000-000000000000`);
    expect(res.status).toBe(404);
  }, 30_000);
});

describe.skipIf(!serverUp || !paid)("e2e: x402 error surface", () => {
  it("never exposes platform internals to an anonymous caller", async () => {
    // The price/payTo callbacks fail with raw algod errors naming the platform's
    // own address. Those belong in the log; a buyer gets a plain reason and a
    // status telling them whether to retry.
    const res = await fetch(paid!.url);
    expect([200, 402, 503]).toContain(res.status);
    const body = await res.text();
    for (const leak of ["overspend", "MicroAlgos", "TransactionPool", "DEPLOYER"]) {
      expect(body, `must not leak "${leak}"`).not.toContain(leak);
    }
  }, 60_000);
});

describe.skipIf(!serverUp || !paid || platformNotProvisioned)("e2e: x402 payment requirements", () => {
  it("answers an unpaid request with a real x402 402", async () => {
    const res = await fetch(paid!.url);
    expect(res.status).toBe(402);

    // The requirements ride in a header, not just a status code.
    const header = res.headers.get("payment-required");
    expect(header, "402 must carry payment-required").toBeTruthy();

    const body = decodePaymentRequired(header!);
    expect(body.x402Version).toBe(2);
    expect(Array.isArray(body.accepts)).toBe(true);
    expect(body.accepts.length).toBeGreaterThan(0);
  }, 60_000);

  it("quotes this post's own price, in atomic units of the advertised asset", async () => {
    const res = await fetch(paid!.url);
    const accepts = decodePaymentRequired(res.headers.get("payment-required")!).accepts[0];

    expect(accepts.scheme).toBe("exact");
    expect(accepts.network).toBe(catalog!.network);
    // Discovery and the 402 must name the same token, or a client buys the wrong one.
    expect(accepts.asset).toBe(catalog!.asset.id);

    const expected = Math.round(Number(paid!.price.replace("$", "")) * 1e6);
    expect(Number(accepts.amount)).toBe(expected);
    expect(accepts.extra?.decimals).toBe(6);
  }, 60_000);

  it("pays the creator's real on-chain address, not a synthetic id", async () => {
    const res = await fetch(paid!.url);
    const accepts = decodePaymentRequired(res.headers.get("payment-required")!).accepts[0];

    // `users.wallet_address` is a synthetic "0x…" id — paying that would burn funds.
    expect(accepts.payTo).not.toMatch(/^0x/);
    expect(algosdk.isValidAddress(accepts.payTo)).toBe(true);
  }, 60_000);

  it("names the specific post as the resource, not the collection", async () => {
    const res = await fetch(paid!.url);
    const body = decodePaymentRequired(res.headers.get("payment-required")!);
    expect(body.resource.url).toContain(paid!.id);
  }, 60_000);

  it("offers facilitator-sponsored fees, so a payer needs no ALGO", async () => {
    const res = await fetch(paid!.url);
    const accepts = decodePaymentRequired(res.headers.get("payment-required")!).accepts[0];
    // The feePayer comes from the live facilitator's /supported — its presence
    // means we actually synced with it rather than guessing.
    expect(accepts.extra?.feePayer).toBeTruthy();
    expect(algosdk.isValidAddress(accepts.extra.feePayer)).toBe(true);
  }, 60_000);

  it("does not serve the media without payment", async () => {
    const res = await fetch(paid!.url);
    expect(res.status).toBe(402);
    expect(await res.text()).not.toContain("signedUrl");
  }, 60_000);

  it("rejects a forged payment signature rather than trusting it", async () => {
    const res = await fetch(paid!.url, {
      headers: { "PAYMENT-SIGNATURE": Buffer.from('{"nice":"try"}').toString("base64") },
    });
    // Never 200: an unverifiable payment must not unlock content.
    expect(res.status).not.toBe(200);
    expect(await res.text()).not.toContain("signedUrl");
  }, 60_000);
});
