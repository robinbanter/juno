/**
 * Adopt drizzle migrations on a database that was built with `db:push`.
 *
 *   npm run db:baseline    # run ONCE, then use db:migrate forever after
 *
 * Why this exists: the live schema was created by `drizzle-kit push`, so the
 * `__drizzle_migrations` bookkeeping table never existed. Running `db:migrate`
 * against it would try to CREATE TABLE for objects that already exist and fail
 * on the first statement. This records the baseline migration as already applied
 * — writing only to the bookkeeping table, never touching your data — so
 * `db:migrate` starts from "the schema is current" and applies only what's new.
 *
 * Safe to re-run: it does nothing if the baseline is already recorded.
 *
 * `db:push` remains fine for local iteration. Do NOT point it at production: it
 * diffs against the live database and will drop columns to match, and one of
 * those tables holds the encrypted keys to users' custodial wallets.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

const MIGRATIONS_DIR = join(process.cwd(), "drizzle");

async function main() {
  const url =
    process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (files.length === 0) throw new Error("No migrations found — run `npm run db:generate` first");

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    // Exactly the shape drizzle's own migrator uses, so it recognises our rows.
    await client.query(`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )`);

    const { rows: existing } = await client.query(
      `SELECT hash FROM "drizzle"."__drizzle_migrations"`,
    );
    if (existing.length > 0) {
      console.log(`Already baselined — ${existing.length} migration(s) recorded. Nothing to do.`);
      console.log("Use `npm run db:migrate` from here on.");
      return;
    }

    const journal = JSON.parse(
      readFileSync(join(MIGRATIONS_DIR, "meta", "_journal.json"), "utf8"),
    ) as { entries: { tag: string; when: number }[] };

    for (const entry of journal.entries) {
      const sql = readFileSync(join(MIGRATIONS_DIR, `${entry.tag}.sql`), "utf8");
      // drizzle hashes the file contents to decide what has run.
      const hash = createHash("sha256").update(sql).digest("hex");
      await client.query(
        `INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`,
        [hash, entry.when],
      );
      console.log(`  recorded as applied: ${entry.tag}`);
    }

    console.log(`\n✅ Baselined ${journal.entries.length} migration(s). No schema was changed.`);
    console.log("   From now on: `npm run db:generate` then `npm run db:migrate`.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("baseline failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
