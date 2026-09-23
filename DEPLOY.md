# Deploying Juno

Two surfaces, both live:

| | Where | URL |
|---|---|---|
| **API** (the Next.js app) | Railway, service `juno-web` | https://juno-web-production-bd2e.up.railway.app |
| **App** (the Expo app, web build) | Vercel, project `juno-app` | https://juno-app-chi.vercel.app |

The Expo app also runs on a simulator or a device against the same API.

**Redeploying the API** is an upload from this machine, not a git push —
Railway is not connected to the repo:

```bash
railway up --service juno-web --detach
```

**Redeploying the app** exports the web build and uploads it. The API URL is
compiled in from `juno-expo/.env` at export time, and `vercel.web.json` is the
single-page rewrite that lets a deep link like `/trade?sort=stocks` load:

```bash
cd juno-expo
npm run export:web        # export + title/description/share tags + SPA rewrite
cd dist
npx vercel link --yes --project juno-app --scope nicolas-projects-f497bb7f
npx vercel deploy --prod --yes
```

`dist/` is rebuilt on every export, so it is linked each time — to `juno-app`
by name, so the deploy lands on the project that owns the
`juno-app-chi.vercel.app` alias rather than on a new project called `dist`.

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

**One Railway variable matters beyond the secrets:** `JUNO_APP_URL`
(`https://juno-app-chi.vercel.app`). With it set, every non-API page on the
Railway domain redirects to the app — without it, the domain's home page is
the legacy Norr site.

**The faucet funds itself from its own key.** `GET /api/juno/faucet` returns
the address of a devnet key the server generated and sealed in Mongo; send
devnet SOL to that address and *Get devnet SOL* works for everyone. No private
key is ever pasted anywhere.

## 1b. iOS and Android releases

`eas.json` has three profiles. `preview` and `production` bake in the Railway
API and the Vercel app URL.

| Goal | Command | Needs |
|---|---|---|
| Android APK anyone can install | `eas build -p android --profile preview` | An Expo account (`eas login`) |
| Android on Play internal testing | `eas build -p android --profile production` then `eas submit -p android` | Google Play Console ($25 once), an app created there, a service-account key |
| iOS on TestFlight | `eas build -p ios --profile production` then `eas submit -p ios` | Apple Developer Program ($99/yr), an App Store Connect app for `fun.juno.app` |

Without EAS, a local Android release APK builds from this machine:

```bash
cd juno-expo
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease   # android/app/build/outputs/apk/release/
```

It is signed with the debug key — installable by anyone, not uploadable to
Play. A Play upload needs a release keystore, which `eas credentials` creates
and stores.

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
