import { describe, it, expect } from "vitest";
import {
  signSession,
  verifySession,
  encodeClientUser,
  decodeClientUser,
  SESSION_COOKIE,
  CLIENT_USER_COOKIE,
  sessionCookieOptions,
  clientUserCookieOptions,
  type SessionPayload,
} from "@/lib/privy-session";

const payload: SessionPayload = {
  sub: "did:privy:abc123",
  addr: "I4H7PGX6LPG3HJCZKTPE6QVHKW5N25P44FTE5ONWS5HYLLDCFTM5W3DN2Q",
  name: "Test User",
  email: "test@example.com",
  img: null,
  iat: 1_700_000_000_000,
};

describe("privy-session: signing", () => {
  it("round-trips a signed session", async () => {
    const token = await signSession(payload);
    expect(token).toContain(".");
    await expect(verifySession(token)).resolves.toEqual(payload);
  });

  it("rejects a tampered payload (signature no longer matches)", async () => {
    const original = await signSession(payload);
    const sig = original.slice(original.indexOf(".") + 1);
    const forged = await signSession({ ...payload, sub: "did:privy:attacker" });
    const forgedPayload = forged.slice(0, forged.indexOf("."));
    // attacker swaps in their payload but keeps the victim's signature
    await expect(verifySession(`${forgedPayload}.${sig}`)).resolves.toBeNull();
  });

  it("rejects a tampered signature", async () => {
    const token = await signSession(payload);
    const body = token.slice(0, token.indexOf("."));
    await expect(verifySession(`${body}.AAAAAAAA`)).resolves.toBeNull();
  });

  it("rejects missing / malformed input", async () => {
    await expect(verifySession(undefined)).resolves.toBeNull();
    await expect(verifySession(null)).resolves.toBeNull();
    await expect(verifySession("")).resolves.toBeNull();
    await expect(verifySession("no-dot-here")).resolves.toBeNull();
    await expect(verifySession(".only-signature")).resolves.toBeNull();
    await expect(verifySession("!!!.!!!")).resolves.toBeNull();
  });

  it("produces a different signature for a different payload", async () => {
    const a = await signSession(payload);
    const b = await signSession({ ...payload, sub: "did:privy:other" });
    expect(a).not.toBe(b);
  });
});

describe("privy-session: readable client user", () => {
  it("round-trips name/email/addr", () => {
    const encoded = encodeClientUser(payload);
    expect(decodeClientUser(encoded)).toEqual({
      name: payload.name,
      email: payload.email,
      addr: payload.addr,
    });
  });

  it("never leaks the DID into the client cookie", () => {
    const decoded = decodeClientUser(encodeClientUser(payload));
    expect(JSON.stringify(decoded)).not.toContain(payload.sub);
  });

  it("returns null on garbage", () => {
    expect(decodeClientUser("!!!not-base64!!!")).toBeNull();
    expect(decodeClientUser(null)).toBeNull();
    expect(decodeClientUser(undefined)).toBeNull();
    expect(decodeClientUser("")).toBeNull();
  });
});

describe("privy-session: cookie contract", () => {
  it("uses stable cookie names", () => {
    expect(SESSION_COOKIE).toBe("zorr_session");
    expect(CLIENT_USER_COOKIE).toBe("zorr_user");
  });

  it("keeps the server session httpOnly and the client one readable", () => {
    expect(sessionCookieOptions().httpOnly).toBe(true);
    expect(clientUserCookieOptions().httpOnly).toBe(false);
    expect(sessionCookieOptions().sameSite).toBe("lax");
    expect(sessionCookieOptions().path).toBe("/");
  });
});
