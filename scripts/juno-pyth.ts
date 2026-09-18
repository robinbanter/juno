/**
 * Read Pyth prices straight off Solana — the same path the coin page uses.
 *
 * For every feed Juno knows, derives the sponsored price-account PDAs
 * (shards 0 and 1), decodes them, and reports what the app would show:
 * `live` with a price, `stale` with only a publish time, or `unavailable`.
 *
 *   npm run juno:pyth
 *   npm run juno:pyth -- --clone-args   # `--clone` flags for a mainnet fork
 */
import { PYTH_FEEDS, pythConnection, readPythFeeds } from "../lib/juno/pyth";
import { PYTH_SHARDS, decodePriceUpdateV2, priceFeedAccount, scaled } from "../lib/juno/pyth-account";
import { cluster } from "../lib/juno/cluster";
import { pythSource } from "../lib/juno/pyth-source";

const names = Object.keys(PYTH_FEEDS) as Array<keyof typeof PYTH_FEEDS>;
const rows = names.flatMap((name) =>
  PYTH_SHARDS.map((shard) => ({ name, shard, address: priceFeedAccount(PYTH_FEEDS[name], shard) })),
);

async function main() {
  if (process.argv.includes("--clone-args")) {
    // Every account the reader may touch. Both shards: on mainnet the fresh
    // equity prices are on shard 1, the fresh crypto ones on shard 0.
    for (const row of rows) console.log(`--clone ${row.address.toBase58()}   # ${row.name} shard ${row.shard}`);
    return;
  }

  const source = pythSource();
  const now = Math.floor(Date.now() / 1000);
  console.log(
    `cluster ${cluster()}  pyth ${source.network} via ${source.rpc ?? "app RPC"}` +
      `  max age ${source.maxAgeSeconds}s  now ${new Date(now * 1000).toISOString()}\n`,
  );

  // Raw accounts, so every shard is visible, not just the one the app picks.
  const infos = await pythConnection().getMultipleAccountsInfo(rows.map((r) => r.address));
  rows.forEach((row, i) => {
    const info = infos[i];
    const label = `${row.name.padEnd(20)} shard ${row.shard}  ${row.address.toBase58().padEnd(44)}`;
    if (!info) return console.log(`${label}  no account`);
    const u = decodePriceUpdateV2(info.data);
    if (!u) return console.log(`${label}  not a PriceUpdateV2 (owner ${info.owner.toBase58()})`);
    console.log(
      `${label}  price=${u.price} conf=${u.conf} expo=${u.exponent} -> $${scaled(u.price, u.exponent)} ±${scaled(u.conf, u.exponent)}` +
        `  published ${new Date(u.publishTime * 1000).toISOString()} (${now - u.publishTime}s ago)  ${u.verification.level}`,
    );
  });

  console.log("\nWhat the app shows:");
  const readings = await readPythFeeds(names.map((n) => PYTH_FEEDS[n]));
  for (const name of names) {
    const r = readings[PYTH_FEEDS[name]];
    const detail =
      r.status === "live"
        ? `$${r.priceUsd} ±${r.confidence} @ ${r.publishedAt} from ${r.account}`
        : r.status === "stale"
          ? `last published ${r.publishedAt} at ${r.account}`
          : r.reason;
    console.log(`${name.padEnd(20)} ${r.status.padEnd(11)} ${detail}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
