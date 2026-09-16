/**
 * MainNet preflight — everything that must be true before real money moves.
 *
 *   npm run mainnet:preflight
 *
 * Read-only: it checks and reports, and never sends a transaction. Run it until
 * it's all green, then `npm run wallet:setup` to opt the platform in.
 *
 * The point is that "it worked on TestNet" proves almost nothing about MainNet:
 * different asset, different accounts, real gas, and secrets that were fine to
 * scribble on a test wallet are now guarding real funds.
 */
import algosdk from "algosdk";
import {
  recordsRequiredFor,
  scanProviderNameFor,
} from "../lib/moderation/policy";

const MAINNET_USDC = 31566704;
const MAINNET_CAIP2 = "algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=";
const ALGOD = "https://mainnet-api.algonode.cloud";

/**
 * Deployers whose mnemonic is known to have leaked (pasted into a chat log, a
 * ticket, a screenshot). They are fine on TestNet and must NEVER hold real money.
 * Add to this list rather than trusting memory.
 */
const BURNED_ADDRESSES = new Set([
  "ZYSPPTUOLP7VLN3WOJ2SZYXD24SLP2EY4GNUAYHRXOBVJ2GSFDBOZKRMIE", // dev/TestNet deployer
]);

// Enough ALGO to opt in (0.1 base + 0.1 asset + fees) and seed a few wallets.
const MIN_PLATFORM_ALGO = 2_000_000;
const SEED_PER_WALLET = 300_000;

type Check = { ok: boolean; label: string; detail: string; fatal: boolean };
const checks: Check[] = [];

function add(ok: boolean, label: string, detail: string, fatal = true) {
  checks.push({ ok, label, detail, fatal });
}

async function main() {
  const network = (
    process.env.NEXT_PUBLIC_ALGO_NETWORK ?? process.env.ALGO_NETWORK ?? "testnet"
  ).toLowerCase();

  add(network === "mainnet", "Network is mainnet", `NEXT_PUBLIC_ALGO_NETWORK=${network}`);

  // An override silently redirects the payment asset — catastrophic on MainNet.
  const override = process.env.USDC_ASSET_ID_OVERRIDE?.trim();
  add(!override, "No sandbox asset override", override ? `USDC_ASSET_ID_OVERRIDE=${override} — payments would use the WRONG token` : "unset");

  const algod = new algosdk.Algodv2(process.env.ALGOD_TOKEN ?? "", process.env.ALGOD_SERVER ?? ALGOD, 443);

  // A stale ALGOD_SERVER pinned to testnet beats the network switch.
  const server = process.env.ALGOD_SERVER;
  add(!server || server.includes("mainnet"), "algod points at mainnet", server ?? `${ALGOD} (default)`);

  // The asset really is Circle's USDC — verified against the chain, not trusted.
  try {
    const asset = await algod.getAssetByID(MAINNET_USDC).do();
    add(
      asset.params?.unitName === "USDC" && Number(asset.params?.decimals) === 6,
      "Asset 31566704 is real USDC",
      `${asset.params?.name} / ${asset.params?.unitName}, ${asset.params?.decimals}dp`,
    );
  } catch (e) {
    add(false, "Asset 31566704 is real USDC", `lookup failed: ${e instanceof Error ? e.message : e}`);
  }

  // The facilitator must settle MainNet Algorand, or every 402 is unpayable.
  const facilitator = process.env.X402_FACILITATOR_URL?.trim() || "https://facilitator.goplausible.xyz";
  try {
    const res = await fetch(`${facilitator}/supported`, { signal: AbortSignal.timeout(15_000) });
    const kinds = (await res.json()).kinds ?? [];
    const mn = kinds.find((k: { network: string }) => k.network === MAINNET_CAIP2);
    add(!!mn, "Facilitator settles MainNet Algorand", mn ? `${facilitator} (feePayer ${String(mn.extra?.feePayer ?? "none").slice(0, 10)}…)` : `${facilitator} does NOT support MainNet Algorand`);
  } catch (e) {
    add(false, "Facilitator settles MainNet Algorand", `unreachable: ${e instanceof Error ? e.message : e}`);
  }

  // The platform account.
  const mnemonic = process.env.DEPLOYER_MNEMONIC;
  if (!mnemonic) {
    add(false, "Platform wallet configured", "DEPLOYER_MNEMONIC is not set");
  } else {
    const account = algosdk.mnemonicToSecretKey(mnemonic.trim());
    const addr = account.addr.toString();

    add(
      !BURNED_ADDRESSES.has(addr),
      "Platform key is not a leaked TestNet key",
      BURNED_ADDRESSES.has(addr)
        ? `${addr} — this mnemonic has been exposed in plaintext. Generate a fresh account for MainNet.`
        : addr,
    );

    try {
      const info = await algod.accountInformation(addr).do();
      const micro = Number(info.amount);
      add(
        micro >= MIN_PLATFORM_ALGO,
        "Platform holds ALGO for gas",
        `${(micro / 1e6).toFixed(4)} ALGO — pays fees + seeds ~${Math.max(Math.floor((micro - 250_000) / SEED_PER_WALLET), 0)} wallets`,
      );
      add(
        (info.assets ?? []).some((a) => Number(a.assetId) === MAINNET_USDC),
        "Platform opted in to USDC",
        (info.assets ?? []).some((a) => Number(a.assetId) === MAINNET_USDC)
          ? "can receive unlock revenue"
          : "run `npm run wallet:setup` (it cannot receive revenue until then)",
      );
    } catch {
      add(false, "Platform holds ALGO for gas", `${addr} does not exist on MainNet — it has never been funded`);
      add(false, "Platform opted in to USDC", "account not funded yet");
    }
  }

  // Safety, not money — but the one that carries criminal liability rather than
  // financial. Blocking: an adult platform taking public uploads with no scanner
  // is not a thing you ship, whatever the payment code looks like.
  // Ask the REAL gates, evaluated as production — not a copy of their parsing.
  // This script used to re-implement both, so it could disagree with the code it
  // guards, and did the moment the defaults changed. And it must ask "what will
  // PRODUCTION do", not "what does this local script see": passing the mode
  // explicitly is the only way to answer that from here.
  const scanner = scanProviderNameFor(process.env.CONTENT_SCAN_PROVIDER);
  add(
    scanner !== "none",
    "Automated content scanning is on",
    scanner === "none"
      ? "CONTENT_SCAN_PROVIDER=none — every upload will QUARANTINE (production fails closed), so nothing can publish. Wire up a scanner."
      : `provider: ${scanner}`,
  );
  const records = recordsRequiredFor("production", process.env.REQUIRE_2257_RECORDS);
  add(
    records,
    "§2257 records are enforced",
    records
      ? "creators must have a verified age/consent record to publish"
      : "REQUIRE_2257_RECORDS=false explicitly disables the age/consent gate — production defaults it ON, so this is off on purpose. Remove the override.",
  );
  add(
    !!process.env.MODERATION_SECRET && process.env.MODERATION_SECRET.length >= 16,
    "Moderation queue is reachable",
    process.env.MODERATION_SECRET
      ? "operator secret set"
      : "MODERATION_SECRET unset — reports can be filed but nobody can action them",
  );

  // The notices a platform hosting user-uploaded adult content must publish.
  add(
    !!process.env.DMCA_AGENT_NAME?.trim() && !!process.env.DMCA_AGENT_EMAIL?.trim(),
    "DMCA agent is published",
    process.env.DMCA_AGENT_EMAIL?.trim()
      ? `${process.env.DMCA_AGENT_NAME} <${process.env.DMCA_AGENT_EMAIL}>`
      : "unset — /legal/compliance says so. §512(c) safe harbour needs a registered agent.",
  );
  add(
    !!process.env.RECORDS_CUSTODIAN_NAME?.trim(),
    "§2257 custodian is published",
    process.env.RECORDS_CUSTODIAN_NAME?.trim() ?? "unset — /legal/compliance says so",
  );

  // Not fatal, but the difference between "we knew in 30 seconds" and "a creator
  // told us a week later".
  add(
    !!process.env.ALERT_WEBHOOK_URL?.trim(),
    "Money failures page a human",
    process.env.ALERT_WEBHOOK_URL?.trim()
      ? "ALERT_WEBHOOK_URL set"
      : "unset — settlement/withdrawal failures only reach the logs",
    false,
  );

  // Secrets that were fine for a demo are now guarding real money.
  const session = process.env.SESSION_SECRET ?? "";
  add(session.length >= 32, "SESSION_SECRET is strong", session ? `${session.length} chars` : "unset — sessions would be forgeable", false);
  add(!!process.env.CUSTODIAL_KEY_ENCRYPTION_SECRET, "Custodial key encryption secret set", "encrypts user wallet keys at rest");

  // Report.
  const pad = Math.max(...checks.map((c) => c.label.length));
  console.log(`\nMainNet preflight\n${"─".repeat(pad + 34)}`);
  for (const c of checks) {
    console.log(`  ${c.ok ? "✅" : c.fatal ? "❌" : "⚠️ "} ${c.label.padEnd(pad)}  ${c.detail}`);
  }

  const blocking = checks.filter((c) => !c.ok && c.fatal);
  console.log();
  if (blocking.length) {
    console.log(`❌ NOT ready for MainNet — ${blocking.length} blocking issue(s).\n`);
    process.exit(1);
  }
  console.log("✅ Ready for MainNet. Real money will move from here on.\n");
  console.log("   Reminder: this platform is custodial — it holds the keys to");
  console.log("   wallets containing users' real USDC. That is a security and");
  console.log("   regulatory posture, not just a technical one.\n");
}

main().catch((err) => {
  console.error("preflight failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
