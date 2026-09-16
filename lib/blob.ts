import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  del as deleteBlob,
  issueSignedToken,
  presignUrl,
  put,
  type PutBlobResult,
} from "@vercel/blob";

type SupabaseUploadBody = Parameters<
  ReturnType<SupabaseClient["storage"]["from"]>["upload"]
>[1];
type BlobUploadBody = Parameters<typeof put>[1];
type UploadBody = SupabaseUploadBody | BlobUploadBody;

export type StorageUploadResult = {
  pathname: string;
};

let supabaseAdmin: SupabaseClient | null = null;

function requireEnv(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function bucketName() {
  // `||`, not `??`: SUPABASE_STORAGE_BUCKET= in a .env is an empty string, and
  // `?? "media"` would keep it — every upload would then target bucket "".
  return process.env.SUPABASE_STORAGE_BUCKET?.trim() || "media";
}

function hasSupabaseStorage() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function requireBlobToken() {
  return requireEnv("BLOB_READ_WRITE_TOKEN", process.env.BLOB_READ_WRITE_TOKEN);
}

function storage() {
  if (!supabaseAdmin) {
    supabaseAdmin = createClient(
      requireEnv("SUPABASE_URL", process.env.SUPABASE_URL),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
      {
        auth: { persistSession: false },
      },
    );
  }

  return supabaseAdmin.storage.from(bucketName());
}

function normalizePath(pathname: string) {
  return pathname.replace(/^\/+/, "");
}

/**
 * Upload a private object to Supabase Storage. The DB stores only the object
 * path; callers presign it on demand.
 */
export async function uploadPrivate(
  pathname: string,
  body: UploadBody,
  options: { contentType?: string; upsert?: boolean } = {},
): Promise<StorageUploadResult> {
  const normalized = normalizePath(pathname);

  if (!hasSupabaseStorage()) {
    requireBlobToken();
    const blob = await put(normalized, body as BlobUploadBody, {
      access: "private",
      allowOverwrite: options.upsert ?? true,
      contentType: options.contentType,
    });
    return { pathname: blob.pathname };
  }

  const { data, error } = await storage().upload(normalized, body as SupabaseUploadBody, {
    contentType: options.contentType,
    upsert: options.upsert ?? true,
  });

  if (error) throw error;
  return { pathname: data.path };
}

/**
 * Snap a signed-URL expiry UP to the next `cacheWindowSeconds` boundary so that
 * repeated presigns of the same object within a window produce an IDENTICAL URL.
 * That stable URL lets the CDN and the next/image optimizer cache the result
 * instead of re-fetching/re-optimizing on every request. Effective lifetime is
 * in [ttlSeconds, ttlSeconds + cacheWindowSeconds).
 *
 * Use ONLY for non-sensitive assets (e.g. blurred teasers). Paid/revealed media
 * must stay on the default short-lived, per-request URL.
 */
function signedExpiry(ttlSeconds: number, cacheWindowSeconds?: number): number {
  const base = Date.now() + ttlSeconds * 1000;
  if (!cacheWindowSeconds) return base;
  const windowMs = cacheWindowSeconds * 1000;
  return Math.ceil(base / windowMs) * windowMs;
}

// In-memory cache of windowed (stable) presigned URLs, keyed by object + window
// boundary. issueSignedToken() is a network round-trip to the Blob API, so the
// 20-post feed would otherwise fire ~20 signing calls on every render. Only
// windowed presigns are cached here — sensitive, short-lived URLs never are.
const presignCache = new Map<string, { url: string; expiresAt: number }>();

function prunePresignCache() {
  if (presignCache.size < 256) return;
  const now = Date.now();
  for (const [key, value] of presignCache) {
    if (value.expiresAt <= now) presignCache.delete(key);
  }
}

/**
 * Mint a short-lived signed GET URL for a private storage object.
 *
 * @param pathname object path, e.g. "media/<postId>/original.jpg"
 * @param ttlSeconds URL lifetime — 60s for images, 300s for video.
 * @param options.cacheWindowSeconds quantize the expiry so the URL is stable
 *   (CDN/optimizer-cacheable) within each window. Vercel Blob only; safe only
 *   for non-sensitive assets.
 */
export async function presignPrivateGet(
  pathname: string,
  ttlSeconds = 60,
  options: { cacheWindowSeconds?: number } = {},
): Promise<string> {
  if (!hasSupabaseStorage()) {
    const validUntil = signedExpiry(ttlSeconds, options.cacheWindowSeconds);
    const normalized = normalizePath(pathname);

    // A windowed expiry is stable across requests, so the signed URL is too —
    // serve it from cache and skip the Blob signing round-trip.
    const cacheKey = options.cacheWindowSeconds
      ? `${normalized}@${validUntil}`
      : null;
    if (cacheKey) {
      const hit = presignCache.get(cacheKey);
      if (hit && hit.expiresAt > Date.now()) return hit.url;
    }

    const signed = await issueSignedToken({
      pathname: normalized,
      operations: ["get"],
      validUntil,
      token: requireBlobToken(),
    });

    const { presignedUrl } = await presignUrl(signed, {
      operation: "get",
      pathname: normalized,
      validUntil,
      access: "private",
    });

    if (cacheKey) {
      prunePresignCache();
      presignCache.set(cacheKey, { url: presignedUrl, expiresAt: validUntil });
    }
    return presignedUrl;
  }

  const { data, error } = await storage().createSignedUrl(
    normalizePath(pathname),
    ttlSeconds,
  );

  if (error) throw error;
  if (!data?.signedUrl) throw new Error("Supabase did not return a signed URL");
  return data.signedUrl;
}

export async function deletePrivate(pathname: string | string[]) {
  const paths = (Array.isArray(pathname) ? pathname : [pathname]).map(normalizePath);
  if (!hasSupabaseStorage()) {
    requireBlobToken();
    await deleteBlob(paths);
    return;
  }
  const { error } = await storage().remove(paths);
  if (error) throw error;
}

/** The stored key for private storage is its pathname (stable; presign on demand). */
export function privateKeyFromPut(result: StorageUploadResult | PutBlobResult): string {
  return result.pathname;
}
