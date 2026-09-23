import { junoHandler, junoJson, junoOptions, readJson, requireString } from "@/lib/juno/api";
import { claimName, namesFor } from "@/lib/juno/profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = junoOptions;

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** `GET ?wallets=a,b,c` — names for up to 100 wallets. Wallets without one are absent. */
export async function GET(request: Request) {
  return junoHandler(async () => {
    const wallets = (new URL(request.url).searchParams.get("wallets") ?? "")
      .split(",")
      .filter((wallet) => BASE58.test(wallet))
      .slice(0, 100);
    return junoJson({ names: await namesFor(wallets) });
  });
}

/** `POST {wallet, name, issuedAt, signature}` — claim or change a name, signed by the wallet. */
export async function POST(request: Request) {
  return junoHandler(async () => {
    const body = await readJson<Record<string, unknown>>(request);
    const result = await claimName({
      wallet: requireString(body.wallet, "wallet"),
      name: requireString(body.name, "name"),
      issuedAt: requireString(body.issuedAt, "issuedAt"),
      signature: requireString(body.signature, "signature"),
    });
    return junoJson(result);
  });
}
