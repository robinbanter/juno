// Stub for the `server-only` package. The real module throws when imported
// outside a React Server Component graph; under Vitest we just want a no-op so
// server modules (lib/algorand, lib/app-user, …) can be imported and tested.
export {};
