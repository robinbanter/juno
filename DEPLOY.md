# Deploying Juno

Two surfaces. The **Next.js app** is deployed and serves both the web UI and the
API the mobile app talks to. The **Expo app** is not deployed — it runs on a
simulator or a device and points at the deployed API.

---

## 1. The web app and API (Vercel)

The production build is green as of `5444cf6`. What is left is authentication,
which cannot be done from inside the repo.

```bash
npx vercel login          # opens a browser; needs your account
npx vercel link           # pick or create the project
npx vercel --prod         # deploy
```

`juno-expo/` is listed in `.vercelignore`, so the Expo app is not uploaded and
cannot affect the build.

### Environment variables

Set these in the Vercel project (Settings → Environment Variables). Values are in
your local `.env.local` — **do not commit them**.

| Variable | Required | Why |
|---|---|---|
| `DATABASE_URL` | **yes** | Neon Postgres. The pool registry and `juno_posts` live here. |
| `PINATA_JWT` | **yes** | Pinning media and token metadata to IPFS. |
| `NEXT_PUBLIC_SOLANA_CLUSTER` | **yes** | `devnet`. Anything else must be a deliberate decision — pools are cluster-scoped and a mismatch hides every row. |
| `NEXT_PUBLIC_IPFS_GATEWAY` | recommended | First gateway tried by `/api/ipfs/[cid]`; it fails over to several others. |
| `MONGODB_URI`, `MONGODB_DB` | optional | Comments. Their absence degrades comments only — market data is unaffected, by design. |
| `NEXT_PUBLIC_SOLANA_RPC` | optional | A dedicated RPC. **Deliberately unset** (decision D13): the app is built to survive the public endpoint with caching, pacing and backoff. Setting it makes everything faster and nothing behave differently. |
| `PYTH_RPC_URL` | optional | Where Pyth price accounts are read. Defaults to Solana mainnet, because the push oracle does not publish to devnet — a devnet pool priced against a real mainnet mark is intended. |
| `SESSION_SECRET`, `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_SECRET` | legacy | Used by the inherited Algorand surface, not by Juno. |

### After deploying

```bash
curl https://<your-domain>/api/juno/coins?limit=3
curl https://<your-domain>/api/juno/feed?limit=5
```

Both should return JSON with `"cluster":"devnet"`. If `coins` is empty, the
deployment is pointed at a different cluster or a different database.

Then seed the feed so it is never blank in front of a judge:

```bash
NEXT_PUBLIC_SITE_URL=https://<your-domain> npm run juno:seed-posts
```

---

## 2. The mobile app (Expo)

### Point it at the deployed API

`juno-expo/.env`:

```
EXPO_PUBLIC_API_URL=https://<your-domain>
```

Without it the app infers the host Metro was served from, which is correct for
local development and wrong for anything else.

### Run it on the iOS Simulator

Xcode is installed on this machine but `xcode-select` points at the
command-line tools, so `simctl` is not on the path and no simulator can start.
One command fixes it, and it needs your password:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

Then:

```bash
cd juno-expo
npx expo start --ios
```

### Verifying without a simulator

`npx expo start --web` runs the same components through react-native-web. It
exercises the real API, the real signing path and the real screens — it is not
a mock. What it does not prove is iOS-specific layout, gestures and the video
player, which is why the simulator is still worth unblocking before filming.

---

## 3. What is deliberately not deployed

- **A mainnet pool.** Decision D12: devnet plus a mainnet-fork rehearsal, with
  real mainnet funded later. Nothing in the code prevents mainnet; switching
  `NEXT_PUBLIC_SOLANA_CLUSTER` and funding a key is the whole change.
- **The Expo app to a store.** The demo is a simulator recording.
