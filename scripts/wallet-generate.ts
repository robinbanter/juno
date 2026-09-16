/**
 * Generate a fresh Algorand account for MainNet.
 *
 * `mainnet:preflight` blocks on the platform key, because the TestNet deployer's
 * mnemonic has been pasted in plaintext — into chat logs, terminals, and this
 * repo's history. A key that has been shown to anyone is public forever; there
 * is no un-leaking it, and it must never hold real money.
 *
 * This prints a NEW keypair and nothing else. It does not write .env.local, does
 * not phone home, and keeps no copy: whoever runs it is the only one who ever
 * sees the mnemonic, which is the entire point. Store it in a password manager
 * or a hardware-backed secret store before you close the terminal — it cannot be
 * recovered, and funds sent to an address whose mnemonic you lost are gone.
 *
 *   npm run wallet:generate
 *
 * Then set DEPLOYER_MNEMONIC / DEPLOYER_ADDRESS in your production secret store
 * (not in a file that git can see), fund the address with ALGO for fees, and run
 * `npm run wallet:setup` to opt it into USDC.
 */
import algosdk from "algosdk";

const account = algosdk.generateAccount();
const mnemonic = algosdk.secretKeyToMnemonic(account.sk);
const address = account.addr.toString();

const line = "─".repeat(74);
console.log(`\n${line}`);
console.log("  A NEW ALGORAND ACCOUNT — this is the only time it will be shown");
console.log(line);
console.log(`\n  DEPLOYER_ADDRESS=${address}\n`);
console.log(`  DEPLOYER_MNEMONIC="${mnemonic}"\n`);
console.log(line);
console.log(`
  This mnemonic IS the money. Anyone who reads it can move every asset the
  account holds, instantly and irreversibly.

    · Put it in a password manager or a secret store — now, before this
      scrolls away. It cannot be regenerated.
    · Do NOT paste it into chat, a ticket, a commit, or .env.local if that
      file is ever shared. That is exactly how the old key was burned.
    · Do NOT reuse the TestNet deployer. A leaked key stays leaked.

  Next:
    1. Store the mnemonic in your production secret store.
    2. Fund ${address.slice(0, 8)}… with ALGO for transaction fees.
    3. npm run wallet:setup     (opts the account into USDC)
    4. npm run mainnet:preflight
`);
console.log(`${line}\n`);
