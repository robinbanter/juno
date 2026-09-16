# ElevenLabs Paid Calls Implementation Plan

## Goal

Replace the current simulated paid-call sheet with real ElevenLabs in-browser voice calls while preserving MPP escrow billing by second.

The target experience:

1. A fan opens a DM thread and starts a paid call.
2. The app requests microphone access and connects to an ElevenLabs agent over WebRTC.
3. Billing starts only after the ElevenLabs session is connected.
4. The app reserves MPP escrow in small batches during the call.
5. On end, disconnect, error, or page close, the server settles the exact elapsed billable seconds once.

## Existing Foundation

- Call UI and timer live in `app/messages/[id]/page.tsx`.
- MPP reserve/settle endpoint lives in `app/api/messages/[id]/call/route.ts`.
- Custodial escrow helpers live in `lib/custodial.ts`.
- Tempo chain settlement lives in `lib/custodial-wallets.ts`.
- Database schema lives in `lib/db/schema.ts`.
- This repo uses Next.js `16.2.9`; App Router route handlers use named HTTP exports and async `params`.

## Recommended Architecture

Use ElevenLabs Conversational AI through the React SDK and WebRTC for browser calls.

Do not expose the ElevenLabs API key to the browser. Add a server route that verifies the app user and returns a short-lived conversation token from ElevenLabs:

```txt
browser -> /api/elevenlabs/conversation-token -> ElevenLabs API
browser -> ElevenLabs WebRTC session
browser/server -> /api/messages/[id]/call for MPP reserve and settle
```

Use Twilio only if the product needs real PSTN phone numbers. The current product surface is already an in-app DM call sheet, so WebRTC is the better first implementation.

## Environment Variables

Add these to local and deployment environments:

```txt
ELEVENLABS_API_KEY=
ELEVENLABS_AGENT_ID=
ELEVENLABS_SERVER_LOCATION=us
ELEVENLABS_ENVIRONMENT=production
```

Optional later:

```txt
ELEVENLABS_BRANCH_ID=
ELEVENLABS_MIN_START_BALANCE_SECONDS=10
ELEVENLABS_CALL_RESERVE_INTERVAL_SECONDS=5
```

## Data Model

Add a durable call session table so billing is not purely client-authoritative.

Suggested fields:

```txt
id
thread_id
fan_id
creator_id
eleven_conversation_id
status: created | connecting | connected | ending | settled | released | failed
started_at
connected_at
ended_at
last_reserved_second
settled_seconds
settled_amount
settlement_tx_hash
failure_reason
created_at
updated_at
```

Use `callId` as the public/session identifier if it already fits local conventions, but store it server-side and treat it as an idempotency key.

## API Plan

### `POST /api/messages/[id]/call`

Keep this route as the billing authority, but expand actions:

- `start`: authenticate fan, verify thread, create call session, optionally reserve a minimum balance.
- `connect`: record ElevenLabs `conversationId` and `connectedAt`; billing starts here.
- `reserve`: reserve seconds since the last reserved second, computed server-side.
- `settle`: compute exact elapsed seconds, reserve any remaining seconds, settle once.
- `release`: release escrow for calls that never connected or cannot settle.

Important rules:

- Server computes elapsed seconds from `connectedAt` and `endedAt`.
- Client-provided seconds are only hints for UI reconciliation.
- Use DB locks or idempotency keys to prevent double reserve/settle.
- Settlement must remain idempotent if the browser retries after a network failure.

### `GET /api/elevenlabs/conversation-token`

Responsibilities:

- Authenticate the app user.
- Verify the user is allowed to start an ElevenLabs call for the target thread.
- Check there is no active call for the same thread/fan.
- Call `GET https://api.elevenlabs.io/v1/convai/conversation/token`.
- Return only the token and non-sensitive call metadata.

Use Node.js runtime. Do not cache the response.

## UI Plan

Install `@elevenlabs/react` and wrap only the call UI subtree, or the app provider if that is cleaner.

Update `CallSheet`:

- Replace fake 2.4 second ringing with ElevenLabs `startSession`.
- Request microphone permission before token fetch/start.
- Start billing timer only on SDK connected state.
- Store the returned ElevenLabs `conversationId`.
- End both the ElevenLabs session and MPP call on explicit end.
- Attempt settlement on disconnect/error/unmount/page hidden.
- Add mute, connection status, and retry states.

Keep the current visual language. This is a functional bottom sheet, not a marketing surface.

## MPP Billing Plan

Billing should remain second-based, but network calls should be batched.

Recommended flow:

```txt
start call -> create server call session
connected -> record connectedAt
every 5 seconds -> reserve elapsed unreserved seconds into escrow
end/error/disconnect -> compute final elapsed seconds
settle -> charge exact seconds once
release -> refund escrow if the call never connected or settlement fails before external payment
```

Avoid one HTTP request per second. It increases retry noise and makes mobile sleep/network edges worse without improving fairness. The customer-facing unit can still be exactly one second.

## Content, Consent, and Safety

ElevenLabs does not appear to ban all adult/sensual audio, but the implementation should avoid risky cases:

- No minors or minor-coded sexual content.
- No non-consensual sexualization or impersonation.
- No sexual violence, exploitation, trafficking, or illegal sexual services.
- No cloned creator voice unless the creator has explicitly consented.

Product controls:

- Creator opt-in for AI voice calls.
- Store consent metadata for the selected voice.
- Show clear AI disclosure in the call UI.
- Provide a creator/admin kill switch for voice calls.
- Consider a mature-content setting before enabling sensual audio behavior.

## Rate Limits and Abuse Controls

Add server-side checks before issuing ElevenLabs tokens:

- Max one active call per fan/thread.
- Per-user token request rate limit.
- Per-user call start rate limit.
- Minimum balance for at least N seconds before start.
- Maximum call length.
- Optional global active-call cap based on the ElevenLabs plan.

ElevenLabs concurrency is not simply equal to active calls. Their docs say WebSocket/WebRTC generation only counts when audio is being generated, but the app should still track active sessions and degrade gracefully.

## Build Workstreams

### Agent A: Server and Billing

Owns:

- `app/api/messages/[id]/call/route.ts`
- `app/api/elevenlabs/conversation-token/route.ts`
- `lib/custodial.ts`
- call-session DB helpers and schema changes

Deliverables:

- Durable call session state.
- Server-authoritative elapsed seconds.
- ElevenLabs token endpoint with auth and no API-key leakage.
- Idempotent reserve/settle/release behavior.

### Agent B: Client Voice UI

Owns:

- `app/messages/[id]/page.tsx`
- `components/Providers.tsx` if a provider is needed
- `package.json` dependency addition

Deliverables:

- Real ElevenLabs WebRTC session lifecycle.
- Mic permission, mute, connection, error, and settlement states.
- Existing paid-call UX preserved.

### Agent C: Verification and Guardrails

Owns:

- Tests or focused verification scripts if the repo has a suitable pattern.
- Documentation updates in this file if implementation decisions change.
- Manual QA checklist.

Deliverables:

- Build/typecheck verification.
- Edge-case checklist for disconnects, retries, insufficient funds, and failed settlement.
- Policy/consent acceptance criteria reviewed against the implementation.

## Acceptance Criteria

- The app never exposes `ELEVENLABS_API_KEY` to the client bundle.
- Billing begins only after ElevenLabs reports the session connected.
- Ending a call settles once and returns a Tempo receipt if payment succeeds.
- Refreshing or closing the tab does not permanently strand reserved escrow.
- Insufficient funds stops or prevents the call with a `402` payment challenge.
- Repeated reserve/settle requests are idempotent.
- The UI clearly distinguishes connecting, connected, ending, ended, and failed states.
- The creator voice/agent is opt-in before adult/sensual behavior is enabled.
- The call UI clearly discloses that the caller is interacting with AI, not the human creator.
- Creator voice consent metadata exists before any cloned creator voice is assigned to an ElevenLabs agent.
- Adult/sensual agent behavior is blocked unless age/mature-content eligibility, creator opt-in, and voice consent checks all pass server-side.
- Token issuance and agent configuration prohibit minor-coded sexual content, illegal sexual services, sexual violence/exploitation/trafficking, and unauthorized sexualized impersonation.
- A creator/admin kill switch prevents new token issuance and ends or marks active sessions for release/settlement.

## Agent C Verification Notes

Last reviewed: 2026-06-19.

### Current Implementation Snapshot

- `app/api/elevenlabs/conversation-token/route.ts` now issues server-side ElevenLabs WebRTC conversation tokens after auth, thread/fan authorization, active-call conflict checks, and minimum balance checks.
- `@elevenlabs/react` is installed and `app/messages/[id]/page.tsx` uses `ConversationProvider` / `useConversation` for the in-browser WebRTC session.
- The DM call UI no longer simulates ringing. It requests microphone permission, fetches a conversation token, posts `start`, calls `startSession`, posts `connect` from the SDK `onConnect`, and starts the timer only once connected.
- `app/api/messages/[id]/call/route.ts` now accepts `start`, `connect`, `reserve`, `settle`, and `release`, while preserving the legacy `reserve`/`settle` behavior for clients without durable sessions.
- `lib/db/schema.ts`, `lib/db/calls.ts`, and `drizzle/0007_call_sessions.sql` add durable `call_sessions` state, including server-recorded `connectedAt`, `endedAt`, `lastReservedSecond`, settlement status, and the ElevenLabs conversation id.
- Duplicate reserve is partially guarded by the ledger reference `mpp-call:{threadId}:{callId}:reserve:{tick}` plus a Postgres advisory transaction lock.
- Durable-session reserves are additionally guarded by `lastReservedSecond`; the server computes reserve deltas from `connectedAt` instead of trusting client seconds.
- Duplicate settle is partially guarded by `mpp-call:{threadId}:{callId}:settle|{paymentTxHash}` lookup, a call-session lock, and persisted `settlementTxHash` before local ledger settlement.
- Failed Tempo call settlement releases reserved call escrow and marks the session failed before returning `402`.
- Closing, unmounting, page hide, ElevenLabs disconnect, and ElevenLabs errors now attempt best-effort settle or release from the client.
- Microphone permission denial, missing ElevenLabs environment variables, ElevenLabs disconnect/error callbacks, mute, retry, active-call conflict checks, and minimum start-balance checks are now represented in code.
- Remaining hardening gap: if Tempo succeeds but the process fails before `recordCallSessionSettlementTx`, a retry may still initiate another external Tempo transfer. Persisting an explicit pre-transfer/in-flight settlement intent would close this final recovery hole.

### Non-Invasive Checks Run

- `rg --files -g 'AGENTS.md' -g 'docs/elevenlabs-paid-calls-plan.md'`: confirmed the local guidance and plan file.
- `sed -n '1,240p' node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`: confirmed Next.js 16 route handlers use named HTTP exports and async `params`.
- `rg -n "call_sessions|callSessions|conversation-token|ELEVENLABS|useConversation|startSession|endSession|navigator\\.mediaDevices|getUserMedia|microphone|mic|visibilitychange|beforeunload|pagehide|sendBeacon|creator.*opt|voice.*consent|AI disclosure|kill switch|active call" app lib components docs package.json -S`: used to audit which ElevenLabs and guardrail surfaces are wired after implementation.
- `npx tsc --noEmit --pretty false`: passed after the server, UI, and docs slices were combined.
- `node -e "const p=require('./package.json'); console.log(JSON.stringify({scripts:p.scripts, deps:Object.keys(p.dependencies||{}).filter(k=>/eleven|next|react|drizzle/.test(k)), devDeps:Object.keys(p.devDependencies||{}).filter(k=>/test|jest|vitest|playwright|eslint|typescript/.test(k))}, null, 2))"`: confirmed there is no obvious test script or test framework pattern.
- `npm run build`: passed with Next.js 16.2.9, including the TypeScript step.

No automated test harness was added because the repo does not currently expose a Jest/Vitest/Playwright pattern, and Agent A/B own the implementation files that would need mock seams.

### Edge-Case Verification Checklist

- **Missing ElevenLabs env:** unset `ELEVENLABS_API_KEY` and/or `ELEVENLABS_AGENT_ID`; token route must return a server error without leaking config names/secrets to the client bundle. Client should show a failed state and should not create/reserve a billable call session.
- **Mic denial:** deny browser microphone permission; UI should move to failed/retry without calling token issuance, `connect`, `reserve`, or `settle`.
- **Token issuance auth:** unauthenticated users, creators, and users outside the thread must not receive a token. Repeat token requests for the same fan/thread while a call is active must be rejected.
- **Insufficient funds before start:** with less than `ELEVENLABS_MIN_START_BALANCE_SECONDS * rate`, start/token issuance should fail with a `402` payment challenge before microphone/WebRTC connection begins.
- **Insufficient funds during call:** when a reserve batch returns `402`, the client must end the ElevenLabs session, stop further reserves, and call `settle` for already reserved seconds or `release` if no billable seconds connected.
- **Billing starts on connected only:** simulate slow token/WebRTC connection and cancellation during connecting; no seconds should be reserved and any created session should be released.
- **Disconnect/error:** force ElevenLabs disconnect after connection; client should call `settle` once, server should compute elapsed from stored `connectedAt`/`endedAt`, and UI should land in ended/failed with a receipt or actionable error.
- **Page hidden/refresh/close:** close or refresh while connected; server should settle via best-effort beacon/fetch where possible and a recovery/reconciler path should settle or release sessions left in `connecting`, `connected`, or `ending`.
- **Duplicate reserve:** replay the same `{ callId, tick }` request concurrently; fan available balance and escrow should change once, and the API should return `already_reserved` for duplicates.
- **Out-of-order reserve:** send tick 3 before tick 2 or send a lower tick after a higher tick; server should rely on `last_reserved_second`/session state rather than client tick order.
- **Duplicate settle:** replay `settle` concurrently and after success; only one Tempo transfer and one creator credit should exist, and all responses should return the same receipt.
- **Failed Tempo settlement:** mock `settleCallWithCustodialWallet` failure; reserved escrow should release exactly once, session should become `failed` or `released`, and retry behavior should not double-release or hide the failure.
- **Tempo success/local failure:** simulate failure after Tempo transfer but before local ledger settlement; retry must finalize from stored settlement state instead of sending a second Tempo transfer.
- **Max call length:** exceed configured maximum; server must end/settle based on server time and reject further reserves.
- **Rate limits/abuse:** exceed per-user token and start limits; route must reject before ElevenLabs token creation.
- **AI disclosure and consent:** UI must show an AI disclosure during the call. Token issuance must verify creator opt-in, voice consent metadata, mature-content eligibility, and kill-switch state server-side.

### Suggested Test Cases Once Implementation Lands

- Unit-test `reserve` idempotency with duplicate tick and concurrent promises against a test database transaction.
- Unit-test `settle` idempotency by mocking Tempo success and asserting a single `settleCallWithCustodialWallet` invocation for repeated requests.
- Unit-test Tempo success/local failure recovery by persisting the external tx hash before creator credit, then retrying settlement.
- Route-test `GET /api/elevenlabs/conversation-token` for missing env, unauthorized user, non-fan user, active-call conflict, low balance, kill switch, and successful response shape containing only token plus non-sensitive metadata.
- Component/integration-test `CallSheet` with mocked `useConversation`: mic denied, startSession rejects, connected then disconnects, reserve returns `402`, explicit end, close sheet, and unmount/pagehide.
- Browser QA with real ElevenLabs test agent: connect, mute/unmute, disconnect network, refresh during call, and verify Tempo receipt URL after settlement.

### Policy Sources Checked

- ElevenLabs Prohibited Use Policy, last updated 3 September 2025: child-safety restrictions, illegal goods/services including sexual services and trafficking, unauthorized sexualized impersonation, and AI-agent disclosure requirements.
- ElevenLabs WebRTC token docs: `GET /v1/convai/conversation/token` requires `agent_id` and returns `{ token }`.
- ElevenLabs React SDK docs: `startSession` can use `conversationToken`, returns a `conversationId`, and `endSession` disconnects the conversation.

## Reference Docs

- ElevenLabs React SDK: https://elevenlabs.io/docs/eleven-agents/libraries/react
- ElevenLabs WebRTC token endpoint: https://elevenlabs.io/docs/api-reference/conversations/get-webrtc-token
- ElevenLabs authentication guidance: https://elevenlabs.io/docs/eleven-agents/customization/authentication
- ElevenLabs concurrency guidance: https://elevenlabs.io/docs/overview/models
- ElevenLabs prohibited use policy: https://elevenlabs.io/use-policy
- Next.js route handlers: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`
