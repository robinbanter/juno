# Veil

Pay-per-tap, blur-to-reveal premium content. Clerk handles identity, the Drizzle/Postgres database stores local users and balances, and each registered user gets a server-custodial Tempo wallet backing their app balance.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 App Router, React 19, webpack build |
| Auth | Clerk custom sign-in with Google, X, email/password, and passkeys |
| Payments | Custodial app-balance ledger in Postgres backed by per-user Tempo wallets |
| Chain | Tempo Moderato testnet, viem, server-side AlphaUSD settlement |
| DB | Vercel/Neon-style Postgres `DATABASE_URL` with Drizzle ORM |
| Storage | Private Supabase Storage or Vercel Blob with signed URLs |
| PWA | Serwist service worker |

## Local Setup

Create `.env.local` with:

```bash
DATABASE_URL=
DATABASE_URL_UNPOOLED=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-in
BLOB_READ_WRITE_TOKEN=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=media
PLATFORM_WALLET_ADDRESS=
PLATFORM_PRIVATE_KEY=
CUSTODIAL_KEY_ENCRYPTION_SECRET=
USER_WALLET_FEE_RESERVE_USD=0.10
ENABLE_LEGACY_TEMPO_WALLET_UNLOCKS=false
TOPUP_PROVIDER=mock
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Use the pooled Postgres connection string for `DATABASE_URL`. Use the direct connection string for `DATABASE_URL_UNPOOLED` only if it resolves from your machine; otherwise leave it unset so Drizzle uses the pooled URL. If your database password contains URL-special characters, use the provider-copied URI or URL-encode the password.

For storage, either set `BLOB_READ_WRITE_TOKEN` for Vercel Blob or create a private Supabase bucket named `media` and provide the Supabase envs.

In the Clerk Dashboard, enable the auth strategies this UI exposes:

- Google social connection.
- X social connection using your X/Twitter developer credentials.
- Passkeys under sign-up/sign-in options.
- Email/password if you want the email form visible as-is.

## Run

```bash
npm install
npm run db:push
npm run tempo:wallets:migrate -- --backfill-wallets
npm run seed
npm run dev
```

Open `http://localhost:3000`.

## Scripts

```bash
npm run dev
npm run build
npm run db:push
npm run tempo:wallets:migrate -- --backfill-wallets
npm run tempo:wallets:migrate -- --reset-test-ledger
npm run seed
npm run token:create
```

## Notes

- `npm run db:push` creates the Supabase tables from `lib/db/schema.ts`.
- `npm run tempo:wallets:migrate -- --backfill-wallets` creates missing per-user Tempo wallets.
- `npm run tempo:wallets:migrate -- --reset-test-ledger` clears local/dev fake balances, deposits, unlocks, unlock loyalty rows, and custodial ledger rows.
- `npm run seed` uploads demo media to Supabase Storage and seeds demo posts, unlocks, loyalty, and messages.
- The active unlock UI posts only the post id to `/api/unlock`; the API derives the signed-in local user from Clerk and debits `user_balances`.
- `ENABLE_LEGACY_TEMPO_WALLET_UNLOCKS=true` temporarily re-enables the old direct wallet proof branch.
- Paid unlocks require funded per-user custodial wallets, `CUSTODIAL_KEY_ENCRYPTION_SECRET`, and platform Tempo wallet env vars.
- Hackathon build. Testnet only. Never commit real keys.
