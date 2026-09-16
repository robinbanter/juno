// Load .env.local so integration/e2e tests can reach Algorand + the app the
// same way the server does. Unit tests don't depend on any of it.
import { config } from "dotenv";

config({ path: ".env.local" });

// Sensible fallbacks so the Algorand integration tests still run on a machine
// without a populated .env.local.
process.env.ALGOD_SERVER ||= "https://testnet-api.algonode.cloud";
process.env.INDEXER_SERVER ||= "https://testnet-idx.algonode.cloud";
