/**
 * Re-encrypt custodial wallet keys onto a new encryption key version.
 *
 *   npm run keys:rotate -- --dry-run    # report what would change
 *   npm run keys:rotate                 # do it
 *
 * Use when CUSTODIAL_KEY_ENCRYPTION_SECRET may have leaked, or on a schedule.
 *
 * Setup:
 *   1. Generate a new key:
 *        node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *   2. Add it as CUSTODIAL_KEY_ENCRYPTION_SECRET_V2 (keep the old one readable!)
 *   3. Set CUSTODIAL_KEY_VERSION=2
 *   4. Run this. Then, once every row reports version 2, retire the old secret.
 *
 * Safety: each wallet is re-sealed in its own transaction and immediately
 * verified by decrypting with the new key and checking the address still derives
 * to the same value. A wallet whose key can't be opened is reported and skipped,
 * never overwritten — losing one of these means losing that user's money, so the
 * bias is always toward leaving a row untouched.
 */
import algosdk from "algosdk";
import { eq } from "drizzle-orm";
import { getDb } from "../lib/db";
import { custodialWallets } from "../lib/db/schema";
import {
  currentKeyVersion,
  decryptSecretKey,
  encryptSecretKey,
  loadKeys,
} from "../lib/custodial-keys";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const target = currentKeyVersion();
  const readable = [...loadKeys().keys()].sort((a, b) => a - b);

  console.log(`Readable key versions : ${readable.join(", ")}`);
  console.log(`Target (current)      : ${target}`);
  console.log(dryRun ? "Mode                  : DRY RUN — nothing is written\n" : "");

  const db = getDb();
  const wallets = await db.select().from(custodialWallets);

  const stale = wallets.filter((w) => w.keyVersion !== target);
  console.log(`Wallets               : ${wallets.length} total, ${stale.length} to rotate\n`);

  if (stale.length === 0) {
    console.log("✅ Every wallet is already on the current key. Safe to retire older secrets.");
    return;
  }

  let rotated = 0;
  const failures: string[] = [];

  for (const wallet of stale) {
    try {
      // Open with whatever version this row was sealed with.
      const sk = decryptSecretKey({
        encryptedPrivateKey: wallet.encryptedPrivateKey,
        iv: wallet.iv,
        authTag: wallet.authTag,
        keyVersion: wallet.keyVersion,
      });

      // The key must still be the key: if the re-seal ever silently corrupted a
      // secret, the address would stop matching and the funds would be gone.
      const derived = algosdk.encodeAddress(sk.slice(32, 64));
      if (derived !== wallet.address) {
        failures.push(`${wallet.address}: decrypted key derives to ${derived}`);
        continue;
      }

      const sealed = encryptSecretKey(sk, target);

      // Verify the NEW ciphertext opens before committing it.
      const check = decryptSecretKey({ ...sealed });
      if (algosdk.encodeAddress(check.slice(32, 64)) !== wallet.address) {
        failures.push(`${wallet.address}: re-encrypted key failed verification`);
        continue;
      }

      if (!dryRun) {
        await db
          .update(custodialWallets)
          .set({
            encryptedPrivateKey: sealed.encryptedPrivateKey,
            iv: sealed.iv,
            authTag: sealed.authTag,
            keyVersion: sealed.keyVersion,
          })
          .where(eq(custodialWallets.id, wallet.id));
      }
      rotated++;
      console.log(`  ${dryRun ? "would rotate" : "rotated"} ${wallet.address}  v${wallet.keyVersion} -> v${target}`);
    } catch (err) {
      failures.push(`${wallet.address}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\n${dryRun ? "Would rotate" : "Rotated"}: ${rotated}/${stale.length}`);
  if (failures.length) {
    console.error(`\n❌ ${failures.length} wallet(s) could NOT be rotated — their rows are untouched:`);
    for (const f of failures) console.error(`   ${f}`);
    console.error("\nDo NOT retire the old secret: these wallets still need it.");
    process.exit(1);
  }
  if (!dryRun) {
    console.log("\n✅ All wallets are on the current key. The previous secret can now be retired.");
  }
}

main().catch((err) => {
  console.error("rotation failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
