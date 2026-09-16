# Refactor Parity Checklist

Use this file before and after each behavior-preserving refactor pass. Public
routes, cookies, response shapes, DB schema, and script names should remain
stable unless a later task explicitly calls out a migration.

## Baseline Commands

- `git status --short`
- `rg --files -g '*.md' -g '!node_modules/**'`
- `npx tsc --noEmit --incremental false`
- `npm run build`

## Public Pages

- `/`
- `/connections`
- `/messages`
- `/messages/[id]`
- `/new`
- `/notifications`
- `/payment-cards`
- `/privacy`
- `/profile`
- `/search`
- `/sign-in`
- `/sso-callback`
- `/terms`

## Route Handlers

- `/api/account`
- `/api/account/deposit`
- `/api/account/deposit/mock`
- `/api/account/payments`
- `/api/blur/ingest`
- `/api/blur/jobs/[id]`
- `/api/blur/jobs/[id]/approve`
- `/api/blur/jobs/[id]/reject`
- `/api/blur/jobs/[id]/retry`
- `/api/blur/reconcile`
- `/api/blur/webhook`
- `/api/bookmarks`
- `/api/ccbill/webhook`
- `/api/collection`
- `/api/comments/[id]/like`
- `/api/dev/login`
- `/api/dev/logout`
- `/api/feed`
- `/api/follow`
- `/api/loyalty`
- `/api/messages`
- `/api/messages/[id]`
- `/api/messages/[id]/call`
- `/api/notifications`
- `/api/og/flex-card`
- `/api/posts`
- `/api/posts/[id]/comments`
- `/api/posts/[id]/like`
- `/api/posts/[id]/save`
- `/api/profile/connections`
- `/api/profile/stats`
- `/api/search`
- `/api/stripe/webhook`
- `/api/tip`
- `/api/unlock`
- `/api/unlock/region`
- `/api/user`

## Key User Flows

- Dev login sets `veil_dev_auth=default`; dev logout clears it.
- Anonymous account creation and account lookup keep using the `veil_account`
  cookie.
- Feed, search, bookmarks, follows, likes, comments, notifications, and profile
  stats keep their current JSON response fields.
- Creator upload keeps the same auto-blur and direct-publish branches.
- Blur job polling, approve, reject, retry, webhook, and reconcile routes keep
  their existing statuses and error strings.
- Full post unlock, partial region unlock, tips, card deposits, and paid calls
  keep their current balance and ledger semantics.
- Stripe and CCBill webhooks keep their verification behavior.

## Required Local Inputs

- `DATABASE_URL`
- `BLOB_READ_WRITE_TOKEN` or Supabase storage variables used by `lib/blob.ts`
- Clerk environment for real auth flows, or dev auth in development
- Tempo variables for onchain settlement paths
- `REPLICATE_API_TOKEN` and model version variables for auto-blur paths
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` for Stripe webhook checks
- CCBill variables when `TOPUP_PROVIDER=ccbill`
- `OPENAI_API_KEY` only when bot replies should be generated
