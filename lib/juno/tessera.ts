import "server-only";

import { Connection, PublicKey } from "@solana/web3.js";

import { ttlCache } from "./rpc";

/**
 * Tessera pre-IPO tokens, as a price reference.
 *
 * Juno already marks equity-shaped curves against Pyth. Pyth has no feed for a
 * company that has not listed, which is exactly the set of names this
 * hackathon is about — so for SpaceX, OpenAI and Kalshi the reference comes
 * from Tessera's own mark instead, through the same band the Pyth path uses.
 *
 * ## Why this is a reference and not a quote token
 *
 * The obvious integration — pair a Juno curve *against* a T-token — is
 * impossible, and it is worth writing down so nobody tries it again. Meteora's
 * DBC program rejects any quote mint with a live transfer fee:
 *
 * ```rust
 * require!(is_transfer_fee_zero(&mint, epoch)?, PoolError::QuoteMintHasNonZeroTransferFee);
 * ```
 *
 * All three T-tokens are Token-2022 with a 20 bps transfer fee, so
 * `create_config` aborts. The token-badge escape hatch does not help: the `?`
 * propagates the error before the badge branch is reached, and badge creation
 * calls the same predicate. DBC also always mints its own base token, so a
 * T-token cannot be the base either. `onChainFacts` below reads the fee from
 * the mint rather than repeating this from documentation — see `blocked`.
 *
 * ## Two endpoints, no key, no history
 *
 * The public API is `token-details` (the mark, holders, valuation) and
 * `tokens` (supply, metadata uri). There is no per-token filter — passing one
 * is ignored and returns the whole list — no OHLC, and no historical series of
 * any kind. Everything here is therefore a *current* reading, and anything
 * time-shaped that Juno shows about a T-token has to come from Juno's own
 * observations rather than from Tessera.
 */

const REST = "https://rest-api.tessera.pe/v1/public";

/** `navFeedId` values that mean "mark this against Tessera" rather than Pyth. */
export const TESSERA_PREFIX = "tessera:";

export type TesseraToken = {
  /** `T-OpenAI`, `T-Kalshi`, `T-SpaceX`. The id used in a `navFeedId`. */
  id: string;
  name: string;
  /** The `tOpenAI` form, which is what the token metadata actually carries. */
  code: string;
  sector: string;
  /** Mainnet mint. Token-2022. */
  mint: string;
  /** Tessera's own off-chain mark, in USD. There is no on-chain oracle for it. */
  markPrice: number;
  holders: number;
  /** Implied valuation of the underlying company, in USD. */
  markValuation: number;
  /**
   * Circulating supply in UI units, from `/tokens`. Null when that second
   * endpoint did not answer — the mark is still usable without it.
   */
  supply: number | null;
  /** Token metadata JSON on Tessera's CDN, when `/tokens` answered. */
  uri: string | null;
};

type DetailRow = {
  id: string;
  name: string;
  symbol: string;
  code: string;
  sector: string;
  mint: string;
  markPrice: number;
  holders: number;
  markValuation: number;
};

type TokenRow = {
  token: string;
  latest_supply: string;
  name: string;
  symbol: string;
  uri: string;
};

/*
 * Ninety seconds.
 *
 * Tessera's mark is an off-chain figure they publish; it does not tick like a
 * Pyth feed, and re-fetching it per request would put a third-party API in the
 * path of every coin page. Long enough to be cheap, short enough that a demo
 * never shows a number from a previous session.
 */
const marks = ttlCache<TesseraToken[]>(90_000);

async function getJson<T>(path: string, timeoutMs = 8_000): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${REST}${path}`, {
      headers: { accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    // Null, never a fallback list. A hardcoded mark would be the one number in
    // this app that came from nowhere.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Every T-token Tessera publishes, merged from both endpoints.
 *
 * `token-details` is required — it carries the mark, and without a mark there
 * is no reference. `tokens` is optional: it only adds supply and the metadata
 * uri, so a failure there costs two fields rather than the whole read.
 */
export async function tesseraTokens(): Promise<TesseraToken[]> {
  return marks.get(
    "all",
    async () => {
      const details = await getJson<DetailRow[]>("/token-details");
      if (!Array.isArray(details) || details.length === 0) return [];

      const supplies = await getJson<TokenRow[]>("/tokens");
      const byMint = new Map(
        (Array.isArray(supplies) ? supplies : []).map((row) => [row.token, row]),
      );

      return details
        .filter((row) => typeof row.mint === "string" && Number.isFinite(row.markPrice))
        .map((row): TesseraToken => {
          const extra = byMint.get(row.mint);
          // `latest_supply` is a decimal *string* in UI units. Parsed rather
          // than trusted: a bad parse becomes null, not NaN leaking into a
          // valuation.
          const supply = extra ? Number(extra.latest_supply) : Number.NaN;
          return {
            id: row.id,
            name: row.name,
            code: row.code,
            sector: row.sector,
            mint: row.mint,
            markPrice: row.markPrice,
            holders: row.holders,
            markValuation: row.markValuation,
            supply: Number.isFinite(supply) ? supply : null,
            uri: extra?.uri ?? null,
          };
        });
    },
    // A read that came back empty is not worth holding for ninety seconds.
    (value) => (value.length === 0 ? 10_000 : 90_000),
  );
}

/** One token by its id, or null. Ids are `T-OpenAI` style and case-insensitive. */
export async function tesseraToken(id: string): Promise<TesseraToken | null> {
  const wanted = id.replace(TESSERA_PREFIX, "").trim().toLowerCase();
  const all = await tesseraTokens();
  return all.find((token) => token.id.toLowerCase() === wanted) ?? null;
}

/** True when a `navFeedId` names a Tessera token rather than a Pyth feed. */
export function isTesseraRef(feedId: string | null | undefined): boolean {
  return typeof feedId === "string" && feedId.startsWith(TESSERA_PREFIX);
}

/** The reference string stored in `juno_pools.nav_feed_id`. */
export function tesseraRef(id: string): string {
  return `${TESSERA_PREFIX}${id}`;
}

/* ------------------------------------------------------------------ */
/* On-chain facts                                                      */
/* ------------------------------------------------------------------ */

export type TesseraOnChain = {
  mint: string;
  /** `TokenzQd…` — every T-token is Token-2022, which is why the fee exists. */
  tokenProgram: string;
  decimals: number;
  /** Raw supply, as the mint reports it. Compare against the API's figure. */
  supplyRaw: string;
  /** Transfer fee in basis points, currently active for this epoch. */
  transferFeeBps: number | null;
  /** Still set, on all three, and not mentioned in Tessera's own docs. */
  freezeAuthority: string | null;
  mintAuthority: string | null;
  /** Token-2022 extensions present on the mint. */
  extensions: string[];
  /**
   * Why this mint cannot be a DBC quote token, or null when it could.
   *
   * Derived from what the mint says right now rather than from documentation,
   * so if Tessera ever sets the fee to zero this stops claiming otherwise.
   */
  blocked: string | null;
};

const MAINNET = "https://api.mainnet-beta.solana.com";

let chain: Connection | null = null;

/**
 * Mainnet, always.
 *
 * T-tokens exist on mainnet and nowhere else, so reading them from whichever
 * cluster Juno happens to be pointed at would return "account not found" on
 * devnet and quietly make a real token look fake. Same reasoning as the Pyth
 * reader, which is also pinned.
 */
function mainnet(): Connection {
  chain ??= new Connection(
    process.env.TESSERA_RPC_URL?.trim() ||
      process.env.PYTH_RPC_URL?.trim() ||
      MAINNET,
    { commitment: "confirmed", disableRetryOnRateLimit: true },
  );
  return chain;
}

const facts = ttlCache<TesseraOnChain | null>(10 * 60_000);

/**
 * What the mint itself says: program, decimals, authorities, transfer fee.
 *
 * This exists so the app's claims about a T-token are *read* rather than
 * repeated. The 20 bps fee, the live freeze authority and the un-renounced
 * mint authority are all material to someone deciding to hold one, and two of
 * the three are absent from Tessera's own documentation.
 */
export async function tesseraOnChain(mint: string): Promise<TesseraOnChain | null> {
  return facts.get(mint, async () => {
    const info = await mainnet()
      .getParsedAccountInfo(new PublicKey(mint), "confirmed")
      .catch(() => null);

    const value = info?.value;
    if (!value || !("parsed" in value.data)) return null;

    const parsed = value.data.parsed as {
      info?: {
        decimals?: number;
        supply?: string;
        mintAuthority?: string | null;
        freezeAuthority?: string | null;
        extensions?: Array<{ extension: string; state?: Record<string, unknown> }>;
      };
    };
    const details = parsed.info ?? {};
    const extensions = details.extensions ?? [];

    /*
     * The *currently active* fee, not the pending one.
     *
     * Token-2022 keeps two fee configs and switches at an epoch boundary.
     * Reading `newerTransferFee` unconditionally would report a rate that is
     * not yet charged; the program's own check uses the epoch, so this does
     * too.
     */
    const feeConfig = extensions.find((e) => e.extension === "transferFeeConfig")?.state as
      | {
          olderTransferFee?: { epoch?: number | string; transferFeeBasisPoints?: number };
          newerTransferFee?: { epoch?: number | string; transferFeeBasisPoints?: number };
        }
      | undefined;

    let transferFeeBps: number | null = null;
    if (feeConfig) {
      const epoch = await mainnet()
        .getEpochInfo()
        .then((e) => e.epoch)
        .catch(() => null);
      const newer = feeConfig.newerTransferFee;
      const older = feeConfig.olderTransferFee;
      const newerEpoch = Number(newer?.epoch ?? Number.POSITIVE_INFINITY);
      const active =
        epoch !== null && Number.isFinite(newerEpoch) && epoch >= newerEpoch ? newer : older;
      transferFeeBps = active?.transferFeeBasisPoints ?? newer?.transferFeeBasisPoints ?? null;
    }

    const names = extensions.map((e) => e.extension);
    const onlyMetadata = names.every(
      (name) => name === "metadataPointer" || name === "tokenMetadata",
    );

    return {
      mint,
      tokenProgram: value.owner.toBase58(),
      decimals: details.decimals ?? 0,
      supplyRaw: details.supply ?? "0",
      transferFeeBps,
      freezeAuthority: details.freezeAuthority ?? null,
      mintAuthority: details.mintAuthority ?? null,
      extensions: names,
      blocked:
        transferFeeBps !== null && transferFeeBps > 0
          ? `Meteora's DBC program refuses a quote mint with a live transfer fee, and this one charges ${transferFeeBps} bps.`
          : !onlyMetadata
            ? `DBC only accepts a quote mint whose Token-2022 extensions are metadata; this one also has ${names
                .filter((n) => n !== "metadataPointer" && n !== "tokenMetadata")
                .join(", ")}.`
            : null,
    };
  });
}
