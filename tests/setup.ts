// Load .env.local so tests that touch Postgres or the Solana RPC reach them the
// same way the server does. The unit suites do not depend on any of it.
import { config } from "dotenv";

config({ path: ".env.local" });

// Devnet unless told otherwise, so a machine without a populated .env.local
// never points a test at mainnet by accident.
process.env.NEXT_PUBLIC_SOLANA_CLUSTER ||= "devnet";
