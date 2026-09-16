# Hackathon Phases

## P0 - Pay-Gated Reveal

- Seed a feed with manually blurred previews and private originals.
- Let fans connect Tempo Wallet with an access key.
- Reveal the original through a short-lived signed Supabase Storage URL only after payment.

## P1 - Real MPP Unlock

- Make `/api/unlock` a real Machine Payments Protocol endpoint.
- Return an HTTP `402` Challenge on unpaid unlock requests.
- Let the payment-aware Tempo client retry with a Credential.
- Use `mppx` to verify amount, currency, recipient, memo binding, success, and replay protection.
- Attach a `Payment-Receipt` header to the signed URL response.

Required env:

- `MPP_SECRET_KEY`
- `NEXT_PUBLIC_PLATFORM_WALLET` or server-only `PLATFORM_WALLET`
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET`

## P2 - Judge-Ready Demo Polish

- Show the paid reveal animation and settlement timing clearly.
- Keep the proof chip focused on amount, latency, and zero-gas wallet UX.
- Seed enough demo posts to show repeated pay-per-tap behavior.
- Document required environment variables and setup.

## Post-Hackathon P0 - Auto-Blur Image PoC

- Start the Replicate image pipeline described in `docs/auto-blur/prd.md`.
- Keep auto-blur separate from the hackathon-critical MPP unlock path.
