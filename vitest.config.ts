import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // Integration/e2e tests hit Algorand TestNet + a local server.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // The e2e suites all drive the SAME dev user and therefore the same on-chain
    // wallet: withdrawing moves its balance, the call tests hold part of it in
    // escrow. Run files in parallel and those balances shift underneath each
    // other mid-assertion — a race that only surfaces once the wallet is funded
    // enough for the money tests to actually run. Correctness over wall-clock.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      // `server-only` throws when imported outside a React Server Component
      // graph. Stub it so server modules can be tested directly.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
      "@": path.resolve(__dirname),
    },
  },
});
