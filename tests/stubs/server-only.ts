// Stub for the `server-only` package. The real module throws when imported
// outside a React Server Component graph; under Vitest we just want a no-op so
// server modules (lib/juno/registry, lib/juno/social, …) can be imported and
// tested without spinning up Next.
export {};
