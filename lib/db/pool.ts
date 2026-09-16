import { Pool, type PoolConfig } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __veilPgPool: Pool | undefined;
}

function databaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

function sslConfig(url: string): PoolConfig["ssl"] {
  if (process.env.DATABASE_SSL === "disable") return undefined;
  if (process.env.DATABASE_SSL === "require") return { rejectUnauthorized: false };

  const normalized = url.toLowerCase();
  if (
    normalized.includes("sslmode=require") ||
    normalized.includes("supabase.") ||
    normalized.includes("pooler.supabase.com")
  ) {
    return { rejectUnauthorized: false };
  }

  return undefined;
}

export function getPgPool() {
  const connectionString = databaseUrl();

  if (!globalThis.__veilPgPool) {
    globalThis.__veilPgPool = new Pool({
      connectionString,
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      ssl: sslConfig(connectionString),
    });
  }

  return globalThis.__veilPgPool;
}
