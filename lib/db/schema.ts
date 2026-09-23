import {
  pgTable,
  text,
  varchar,
  decimal,
  numeric,
  integer,
  jsonb,
  timestamp,
  pgEnum,
  uuid,
  boolean,
  index,
  uniqueIndex,
  check,
  primaryKey,
  doublePrecision,
  bigint,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

export const mediaTypeEnum = pgEnum("media_type", ["image", "video"]);

// How a post is gated. "full" = the whole asset is locked behind one unlock
// (today's behaviour). "partial" = the blurred clip plays free and each blurred
// region is an independent micro-unlock. See docs/media-player-implementation.md.
export const accessModeEnum = pgEnum("access_mode", ["full", "partial"]);

/**
 * Automated safety-scan outcome for uploaded media.
 *  skipped  — no scanner configured (fine for dev; not for real users)
 *  pending  — awaiting a scanner; deliberately NOT servable
 *  clean    — scanner cleared it
 *  flagged  — scanner rejected it; quarantined and reported for human review
 */
export const scanStatusEnum = pgEnum("scan_status", [
  "skipped",
  "pending",
  "clean",
  "flagged",
]);

export const loyaltyEventTypeEnum = pgEnum("loyalty_event_type", [
  "post_unlock",
  "tip",
  "streak_bonus",
]);

// A DM is plain text, a pay-per-view card that points at a post, or a "call"
// event logged after a paid voice call ends (the connected duration in seconds
// lives in `body`). PPV reuses the existing posts/unlocks/Tempo path — see
// lib/db/messages.ts.
export const messageKindEnum = pgEnum("message_kind", ["text", "ppv", "call"]);

export const callSessionStatusEnum = pgEnum("call_session_status", [
  "created",
  "connecting",
  "connected",
  "ending",
  "settled",
  "released",
  "failed",
]);

export const custodialLedgerTypeEnum = pgEnum("custodial_ledger_type", [
  "deposit",
  "unlock_debit",
  "withdrawal",
  "refund",
  // A tip moves balance fan → creator: the fan is debited, the creator credited.
  "tip_debit",
  "tip_credit",
  "mpp_call_debit",
  "mpp_call_credit",
]);

export const platformKeyStatusEnum = pgEnum("platform_key_status", [
  "active",
  "retired",
]);

export const custodialWalletStatusEnum = pgEnum("custodial_wallet_status", [
  "active",
  "retired",
]);

export const paymentDepositStatusEnum = pgEnum("payment_deposit_status", [
  "pending",
  "authorized",
  "funding_pending",
  "succeeded",
  "funding_failed",
  "failed",
  "refunded",
  "chargeback",
]);

// ── users ────────────────────────────────────────────────────────────────────
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    walletAddress: varchar("wallet_address", { length: 58 }).unique().notNull(),
    clerkId: varchar("clerk_id", { length: 128 }).unique(),
    email: varchar("email", { length: 255 }),
    displayName: varchar("display_name", { length: 255 }),
    imageUrl: text("image_url"),
    // Tempo virtual address for per-user deposits
    tempoVirtualAddress: varchar("tempo_virtual_address", { length: 58 }).unique(),
    username: varchar("username", { length: 32 }).unique(),
    avatar: text("avatar"),
    bio: text("bio"),
    isCreator: boolean("is_creator").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("users_wallet_idx").on(t.walletAddress),
    uniqueIndex("users_clerk_idx").on(t.clerkId),
  ],
);

// ── posts ────────────────────────────────────────────────────────────────────
export const posts = pgTable(
  "posts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    // Public blurred preview — stored in Supabase Storage
    blurredPreviewUrl: text("blurred_preview_url").notNull(),
    // Private full media — stored in Supabase Storage (private), URL/key only
    privateMediaKey: text("private_media_key").notNull(),
    // Price in stablecoin USD units. e.g. "3.00" = $3. A full post unlocks once
    // for this price (~$2–5); a "partial" post charges it per region reveal
    // (~$1–2, no per-region price).
    unlockPrice: decimal("unlock_price", { precision: 18, scale: 8 }).notNull(),
    mediaType: mediaTypeEnum("media_type").notNull().default("image"),
    accessMode: accessModeEnum("access_mode").notNull().default("full"),
    // Blurred poster frame for video (private pathname; presigned for the feed).
    posterKey: text("poster_key"),
    durationMs: integer("duration_ms"), // video only — for the scrubber / preloading
    teaserFreeMs: integer("teaser_free_ms"), // video only — delay full-post gate overlay
    isPublished: boolean("is_published").default(true).notNull(),
    // Set when moderation removes the post. Distinct from `isPublished`, which
    // the creator controls: a takedown must not be reversible by the creator,
    // and we keep the row (not delete it) so the decision stays auditable.
    // Every read path must exclude these — see `visiblePosts` in db/queries.
    takenDownAt: timestamp("taken_down_at", { withTimezone: true }),
    takedownReason: varchar("takedown_reason", { length: 64 }),
    // Automated safety scan result. `pending` is NOT servable: content stays
    // quarantined until a scanner clears it, so the failure mode of a slow or
    // broken scanner is "nothing publishes", never "everything publishes".
    // `skipped` means no scanner is configured — the status quo, and the reason
    // `mainnet:preflight` warns about it.
    scanStatus: scanStatusEnum("scan_status").notNull().default("skipped"),
    scanDetail: text("scan_detail"),
    scannedAt: timestamp("scanned_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("posts_creator_idx").on(t.creatorId),
    index("posts_feed_idx").on(t.isPublished, t.createdAt),
    index("posts_takedown_idx").on(t.takenDownAt),
  ],
);

// ── moderation ───────────────────────────────────────────────────────────────
// An adult platform accepting user-uploaded media needs a way for anyone to
// report content and for an operator to act on it. This is the machinery, not
// the policy: automated scanning (CSAM/NSFW vendors), age/consent records
// (18 U.S.C. §2257) and a DMCA agent are decisions and contracts that sit on top.

export const reportReasonEnum = pgEnum("report_reason", [
  "csam", // highest priority: strict liability, must be escalated immediately
  "non_consensual",
  "underage",
  "violence",
  "copyright",
  "impersonation",
  "spam",
  "other",
]);

export const reportStatusEnum = pgEnum("report_status", [
  "open",
  "reviewing",
  "actioned", // content removed
  "dismissed", // reviewed, no violation
]);

// ── §2257 records ────────────────────────────────────────────────────────────
// 18 U.S.C. §2257 requires a producer of sexually explicit content to keep, for
// every performer, records proving they were an adult and consented, indexed and
// available for inspection, under a named custodian.
//
// This models and ENFORCES those records — publishing is gated on one existing.
// It is not the whole obligation: naming a custodian, the physical/retention
// process, and the public notice are operational and legal, not code.
//
// Note what is deliberately NOT stored: the ID document itself lives in private
// storage and only its key is here, and the DOB is kept because §2257 requires
// proving age — not because the app wants it. Treat this table as the most
// sensitive PII in the system.

export const performerRecordStatusEnum = pgEnum("performer_record_status", [
  "pending", // submitted, awaiting operator verification
  "verified", // an operator checked the ID against the claim
  "rejected",
]);

export const performerRecords = pgTable(
  "performer_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // The account that publishes the content.
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    // §2257 wants every legal/stage name a performer has used.
    legalName: varchar("legal_name", { length: 255 }).notNull(),
    stageNames: text("stage_names"),
    dateOfBirth: timestamp("date_of_birth", { withTimezone: false }).notNull(),
    // Private storage key only — never a public URL, never the bytes.
    idDocumentKey: text("id_document_key").notNull(),
    idDocumentType: varchar("id_document_type", { length: 32 }).notNull(),
    consentSignedAt: timestamp("consent_signed_at", { withTimezone: true }).notNull(),
    status: performerRecordStatusEnum("status").notNull().default("pending"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifierNote: text("verifier_note"),
    // Records must outlive the content. onDelete: "restrict" above is deliberate:
    // deleting a creator must not silently destroy the record proving their age.
    retainUntil: timestamp("retain_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("performer_records_creator_idx").on(t.creatorId),
    index("performer_records_status_idx").on(t.status),
  ],
);

export const contentReports = pgTable(
  "content_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    postId: uuid("post_id").references(() => posts.id, { onDelete: "cascade" }),
    // Nullable: a report may target a user rather than one post.
    reportedUserId: uuid("reported_user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    // Nullable on purpose — reporting must not require an account. Demanding a
    // login to report abuse suppresses exactly the reports that matter most.
    reporterId: uuid("reporter_id").references(() => users.id, { onDelete: "set null" }),
    reason: reportReasonEnum("reason").notNull(),
    detail: text("detail"),
    status: reportStatusEnum("status").notNull().default("open"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewerId: uuid("reviewer_id").references(() => users.id, { onDelete: "set null" }),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // The moderation queue: oldest open reports first, worst reasons first.
    index("content_reports_queue_idx").on(t.status, t.reason, t.createdAt),
    index("content_reports_post_idx").on(t.postId),
  ],
);

// ── unlocks ──────────────────────────────────────────────────────────────────
export const unlocks = pgTable(
  "unlocks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fanId: uuid("fan_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    // tx hash from Tempo receipt — proof of payment
    paymentTxHash: varchar("payment_tx_hash", { length: 66 }).notNull(),
    amountPaid: decimal("amount_paid", { precision: 18, scale: 8 }).notNull(),
    // how long settlement took in ms (for the "proof of magic" UI)
    settlementMs: integer("settlement_ms"),
    unlockedAt: timestamp("unlocked_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    // a fan can only unlock a given post once
    uniqueIndex("unlocks_fan_post_uniq").on(t.fanId, t.postId),
    index("unlocks_fan_idx").on(t.fanId),
  ],
);

// ── post_regions ──────────────────────────────────────────────────────────────
// One row per independently-priced blurred region on a "partial" post. The
// fully-blurred clip plays free; each region overlays a clean crop once unlocked.
// Price is NOT stored here — every region costs `posts.unlockPrice`.
export type RegionRect = { x: number; y: number; w: number; h: number }; // normalized 0..1
// One sample of a region's position over time: `t` seconds into the clip, `rect`
// normalized 0..1 of the source frame. A region's `track` is these sampled from
// the SAM2 mask so the player can make the tap-button follow the moving area.
export type RegionTrackPoint = { t: number; rect: RegionRect };

export const postRegions = pgTable(
  "post_regions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 64 }).notNull(), // server-side only; never shown raw
    // Union bbox across all frames, normalized 0..1 so it scales to any size.
    rect: jsonb("rect").$type<RegionRect>().notNull(),
    // Per-frame position track (from the SAM2 mask) so the player's tap-button
    // can follow the moving blurred area. Null on legacy/static regions.
    track: jsonb("track").$type<RegionTrackPoint[]>(),
    // Private clean crop of just this region. Presigned on unlock.
    patchMediaKey: text("patch_media_key").notNull(),
    position: integer("position").notNull().default(0), // stacking / button order
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("post_regions_post_idx").on(t.postId)],
);

// ── region_unlocks ──────────────────────────────────────────────────────────
// Per-region equivalent of `unlocks`. Separate table because `unlocks` is unique
// on (fanId, postId) and keeps meaning "owns the whole post".
export const regionUnlocks = pgTable(
  "region_unlocks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fanId: uuid("fan_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    postRegionId: uuid("post_region_id")
      .notNull()
      .references(() => postRegions.id, { onDelete: "cascade" }),
    paymentTxHash: varchar("payment_tx_hash", { length: 66 }).notNull(),
    amountPaid: decimal("amount_paid", { precision: 18, scale: 8 }).notNull(),
    settlementMs: integer("settlement_ms"),
    unlockedAt: timestamp("unlocked_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    // a fan can only unlock a given region once
    uniqueIndex("region_unlocks_fan_region_uniq").on(t.fanId, t.postRegionId),
    index("region_unlocks_fan_idx").on(t.fanId),
  ],
);

// ── loyalty_ledger ───────────────────────────────────────────────────────────
export const loyaltyLedger = pgTable(
  "loyalty_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Points (not USD). 1 unlock = POINTS_PER_UNLOCK points.
    amount: decimal("amount", { precision: 18, scale: 0 }).notNull(),
    eventType: loyaltyEventTypeEnum("event_type").notNull(),
    referenceId: uuid("reference_id"), // unlock.id
    txHash: varchar("tx_hash", { length: 66 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("loyalty_user_idx").on(t.userId)],
);

// ── threads (DM conversations) ────────────────────────────────────────────────
// A conversation is always fan ↔ creator. One row per pair; `lastMessageAt`
// drives the inbox ordering. See lib/db/messages.ts.
export const threads = pgTable(
  "threads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fanId: uuid("fan_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    // one conversation per (creator, fan) pair
    uniqueIndex("threads_pair_uniq").on(t.creatorId, t.fanId),
    index("threads_creator_idx").on(t.creatorId),
    index("threads_fan_idx").on(t.fanId),
  ],
);

// ── messages ──────────────────────────────────────────────────────────────────
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: messageKindEnum("kind").notNull().default("text"),
    // Text body, or the caption shown above a PPV card.
    body: text("body"),
    // PPV only — the locked post the recipient unlocks via the normal flow.
    postId: uuid("post_id").references(() => posts.id, { onDelete: "set null" }),
    // Set when the *recipient* has read it (sender's own message is never unread).
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("messages_thread_idx").on(t.threadId, t.createdAt)],
);

// ── call_sessions ────────────────────────────────────────────────────────────
// Durable in-browser paid call lifecycle. Billing time is server-authoritative:
// connectedAt starts the meter, endedAt stops it, lastReservedSecond prevents
// duplicate escrow reservation.
export const callSessions = pgTable(
  "call_sessions",
  {
    id: varchar("id", { length: 80 }).primaryKey(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    fanId: uuid("fan_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    elevenConversationId: varchar("eleven_conversation_id", { length: 255 }),
    status: callSessionStatusEnum("status").notNull().default("created"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    lastReservedSecond: integer("last_reserved_second").notNull().default(0),
    settledSeconds: integer("settled_seconds"),
    settledAmount: decimal("settled_amount", { precision: 18, scale: 8 }),
    settlementTxHash: varchar("settlement_tx_hash", { length: 66 }),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("call_sessions_thread_idx").on(t.threadId, t.createdAt),
    index("call_sessions_fan_active_idx").on(t.fanId, t.threadId, t.status),
    index("call_sessions_eleven_conversation_idx").on(t.elevenConversationId),
  ],
);

// ── blur_jobs (auto-blur pipeline) ────────────────────────────────────────────
// One row per asset moving through the detect → (track) → composite → review
// state machine. Mirrors docs/auto-blur/implementation.md §4. Reuses the existing
// `media_type` enum rather than defining a duplicate.
export const blurStatusEnum = pgEnum("blur_status", [
  "uploaded",
  "detecting",
  "tracking",
  "compositing",
  "ready_for_review",
  "approved",
  "published",
  "failed",
  "manual_review",
]);

// Shared shape for a detected region (used for the review overlay).
export type DetectedRegion = {
  label: string;
  box: [number, number, number, number]; // [x1, y1, x2, y2]
  confidence: number;
  frame?: number; // video only
};

// A per-region clean crop produced during tracking, consumed by publishJob when
// the creator picks "partial". `rect` is the crop's normalized 0..1 position in
// the source frame and MUST match the crop exactly so overlays align.
export type RegionPatch = {
  label: string;
  rect: RegionRect;
  patchKey: string; // private pathname of the cropped clean clip
  track?: RegionTrackPoint[]; // per-frame box track for the moving tap-button
};

export const blurJobs = pgTable(
  "blur_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    postId: uuid("post_id").references(() => posts.id, { onDelete: "set null" }),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mediaType: mediaTypeEnum("media_type").notNull(),
    status: blurStatusEnum("status").notNull().default("uploaded"),

    rawBlobKey: text("raw_blob_key").notNull(), // private — the upload
    blurredBlobUrl: text("blurred_blob_url"), // public — set on success
    originalBlobKey: text("original_blob_key"), // private — set on success

    // Draft post metadata captured at upload; publishJob() uses these at approve
    // (the approve request may still override them). See app/api/posts/route.ts.
    draftTitle: text("draft_title"),
    draftPrice: decimal("draft_price", { precision: 18, scale: 8 }),

    // One Replicate prediction id per stage, e.g. { detect, track, composite }.
    predictionIds: jsonb("prediction_ids")
      .$type<Record<string, string>>()
      .default({}),
    detectionConfidence: numeric("detection_confidence"), // drives fail-closed routing
    regions: jsonb("regions").$type<DetectedRegion[]>().default([]),
    // Per-region clean crops for optional partial-reveal publishing (video only).
    regionPatches: jsonb("region_patches").$type<RegionPatch[]>().default([]),
    sourceFps: integer("source_fps"), // video only — so the mask track matches

    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("blur_jobs_creator_idx").on(t.creatorId),
    index("blur_jobs_status_idx").on(t.status),
  ],
);

// Idempotency ledger for Replicate webhook events — a retried/duplicate event
// (same `event.id`) must never advance the state machine twice (PRD §12.6).
export const blurWebhookEvents = pgTable("blur_webhook_events", {
  id: text("id").primaryKey(), // Replicate/svix event id
  jobId: uuid("job_id"),
  processedAt: timestamp("processed_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Per-stage cost/observability log — record Replicate's reported predict_time
// on every completed stage so spend is observed, not estimated (PRD §14).
export const blurCostLog = pgTable(
  "blur_cost_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id"),
    stage: text("stage").notNull(),
    predictTime: numeric("predict_time"), // seconds of GPU/CPU, from event.metrics
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("blur_cost_job_idx").on(t.jobId)],
);

// ── user_balances ────────────────────────────────────────────────────────────
export const userBalances = pgTable(
  "user_balances",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    // An audit mirror, NOT a spendable figure: a fan is only ever debited here
    // (their money arrives as an on-chain deposit, which never credits this), so
    // it drifts permanently negative by design. Creators are credited their
    // earnings. Spendable is always computed from the chain — see
    // lib/onchain-balance.ts. This column may go negative; escrow may not.
    availableBalance: decimal("available_balance", {
      precision: 18,
      scale: 8,
    })
      .default("0")
      .notNull(),
    escrowedBalance: decimal("escrowed_balance", { precision: 18, scale: 8 })
      .default("0")
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    /**
     * Escrow may never go negative — the database is the last line.
     *
     * Spendable is `on-chain − escrow`, so a negative escrow does not merely
     * look wrong: it ADDS to what the wallet is allowed to spend, inventing
     * money that was never deposited. A −$1 escrow hands the fan a dollar that
     * does not exist.
     *
     * This is not hypothetical. Releasing an already-settled call escrow drove
     * it to −1 (fixed), and every `escrow - amount` in the codebase is one
     * missing guard away from repeating it. Clamping each site individually
     * treats the instance; this refuses the state itself, so the next such bug
     * fails loudly here instead of quietly minting balance.
     */
    check("user_balances_escrow_non_negative", sql`${t.escrowedBalance} >= 0`),
  ],
);

// ── custodial_ledger ────────────────────────────────────────────────────────
export const custodialLedger = pgTable(
  "custodial_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventType: custodialLedgerTypeEnum("event_type").notNull(),
    amount: decimal("amount", { precision: 18, scale: 8 }).notNull(),
    balanceAfter: decimal("balance_after", {
      precision: 18,
      scale: 8,
    }).notNull(),
    postId: uuid("post_id").references(() => posts.id, { onDelete: "set null" }),
    reference: varchar("reference", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("custodial_ledger_user_idx").on(t.userId, t.createdAt),
    uniqueIndex("custodial_ledger_reference_idx").on(t.reference),
  ],
);

// ── payment_deposits ────────────────────────────────────────────────────────
export const paymentDeposits = pgTable(
  "payment_deposits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 32 }).default("stripe").notNull(),
    providerSessionId: varchar("provider_session_id", { length: 255 })
      .unique()
      .notNull(),
    providerPaymentIntentId: varchar("provider_payment_intent_id", {
      length: 255,
    }),
    providerTransactionId: varchar("provider_transaction_id", { length: 255 }),
    providerCustomerId: varchar("provider_customer_id", { length: 255 }),
    providerPaymentMethodId: varchar("provider_payment_method_id", {
      length: 255,
    }),
    status: paymentDepositStatusEnum("status").default("pending").notNull(),
    amount: decimal("amount", { precision: 18, scale: 8 }).notNull(),
    currency: varchar("currency", { length: 3 }).default("usd").notNull(),
    destinationWalletAddress: varchar("destination_wallet_address", {
      length: 58,
    }),
    tempoFundingTxHash: varchar("tempo_funding_tx_hash", { length: 66 }),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    creditedAt: timestamp("credited_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    chargebackAt: timestamp("chargeback_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("payment_deposits_user_idx").on(t.userId, t.createdAt),
    uniqueIndex("payment_deposits_provider_session_idx").on(t.providerSessionId),
    uniqueIndex("payment_deposits_provider_tx_idx").on(t.providerTransactionId),
  ],
);

// ── platform_signing_keys ───────────────────────────────────────────────────
export const platformSigningKeys = pgTable(
  "platform_signing_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    keyId: varchar("key_id", { length: 64 }).unique().notNull(),
    address: varchar("address", { length: 58 }).notNull(),
    encryptedPrivateKey: text("encrypted_private_key").notNull(),
    iv: varchar("iv", { length: 32 }).notNull(),
    authTag: varchar("auth_tag", { length: 32 }).notNull(),
    status: platformKeyStatusEnum("status").default("active").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("platform_signing_keys_key_id_idx").on(t.keyId),
    index("platform_signing_keys_status_idx").on(t.status),
  ],
);

// ── custodial_wallets ────────────────────────────────────────────────────────
export const custodialWallets = pgTable(
  "custodial_wallets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    address: varchar("address", { length: 58 }).unique().notNull(),
    encryptedPrivateKey: text("encrypted_private_key").notNull(),
    iv: varchar("iv", { length: 32 }).notNull(),
    authTag: varchar("auth_tag", { length: 32 }).notNull(),
    // Which encryption key this row was sealed with. Without it, rotating
    // CUSTODIAL_KEY_ENCRYPTION_SECRET is impossible: you cannot tell which rows
    // use which secret, so a compromised key can never be retired without
    // re-encrypting everything blind. Version 1 is the original single-secret
    // era; see `lib/custodial-keys.ts` and `npm run keys:rotate`.
    keyVersion: integer("key_version").default(1).notNull(),
    status: custodialWalletStatusEnum("status").default("active").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("custodial_wallets_user_idx").on(t.userId),
    uniqueIndex("custodial_wallets_address_idx").on(t.address),
    index("custodial_wallets_status_idx").on(t.status),
  ],
);

// ── post_likes ────────────────────────────────────────────────────────────────
// One row per (post, user) like. Counts are derived, not denormalized.
export const postLikes = pgTable(
  "post_likes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("post_likes_post_user_uniq").on(t.postId, t.userId),
    index("post_likes_post_idx").on(t.postId),
  ],
);

// ── post_saves (bookmarks) ────────────────────────────────────────────────────
export const postSaves = pgTable(
  "post_saves",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("post_saves_post_user_uniq").on(t.postId, t.userId),
    index("post_saves_user_idx").on(t.userId),
  ],
);

// ── comments ──────────────────────────────────────────────────────────────────
// Single-level threading: a reply carries `parentId` pointing at the top-level
// comment it answers. `isPinned` surfaces a creator-pinned comment first.
export const comments = pgTable(
  "comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"), // self-ref; null for top-level comments
    body: text("body").notNull(),
    isPinned: boolean("is_pinned").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("comments_post_idx").on(t.postId, t.createdAt),
    index("comments_parent_idx").on(t.parentId),
  ],
);

// ── comment_likes ─────────────────────────────────────────────────────────────
export const commentLikes = pgTable(
  "comment_likes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    commentId: uuid("comment_id")
      .notNull()
      .references(() => comments.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("comment_likes_comment_user_uniq").on(t.commentId, t.userId),
    index("comment_likes_comment_idx").on(t.commentId),
  ],
);

// ── follows ───────────────────────────────────────────────────────────────────
// `followerId` follows `followingId`. A fan's "Following" count and a creator's
// "Fans" count both derive from this table.
export const follows = pgTable(
  "follows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    followerId: uuid("follower_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    followingId: uuid("following_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("follows_pair_uniq").on(t.followerId, t.followingId),
    index("follows_following_idx").on(t.followingId),
  ],
);

// ── tips ──────────────────────────────────────────────────────────────────────
// A direct fan → creator payment outside the unlock flow. Settled against the
// custodial balance ledger (tip_debit / tip_credit). `postId` is the post the
// tip was sent from, when applicable.
export const tips = pgTable(
  "tips",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fanId: uuid("fan_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    postId: uuid("post_id").references(() => posts.id, { onDelete: "set null" }),
    amount: decimal("amount", { precision: 18, scale: 8 }).notNull(),
    message: text("message"),
    paymentTxHash: varchar("payment_tx_hash", { length: 66 }).notNull(),
    settlementMs: integer("settlement_ms"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("tips_creator_idx").on(t.creatorId, t.createdAt),
    index("tips_fan_idx").on(t.fanId),
  ],
);

// ── Relations ────────────────────────────────────────────────────────────────
export const usersRelations = relations(users, ({ one, many }) => ({
  posts: many(posts),
  unlocks: many(unlocks),
  loyaltyEntries: many(loyaltyLedger),
  blurJobs: many(blurJobs),
  sentMessages: many(messages),
  fanCallSessions: many(callSessions, { relationName: "fan_call_sessions" }),
  creatorCallSessions: many(callSessions, {
    relationName: "creator_call_sessions",
  }),
  custodialLedgerEntries: many(custodialLedger),
  paymentDeposits: many(paymentDeposits),
  custodialWallet: one(custodialWallets, {
    fields: [users.id],
    references: [custodialWallets.userId],
  }),
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
  creator: one(users, { fields: [posts.creatorId], references: [users.id] }),
  unlocks: many(unlocks),
  blurJobs: many(blurJobs),
  regions: many(postRegions),
}));

export const postRegionsRelations = relations(postRegions, ({ one, many }) => ({
  post: one(posts, { fields: [postRegions.postId], references: [posts.id] }),
  unlocks: many(regionUnlocks),
}));

export const regionUnlocksRelations = relations(regionUnlocks, ({ one }) => ({
  fan: one(users, { fields: [regionUnlocks.fanId], references: [users.id] }),
  region: one(postRegions, {
    fields: [regionUnlocks.postRegionId],
    references: [postRegions.id],
  }),
}));

export const threadsRelations = relations(threads, ({ one, many }) => ({
  creator: one(users, { fields: [threads.creatorId], references: [users.id] }),
  fan: one(users, { fields: [threads.fanId], references: [users.id] }),
  messages: many(messages),
  callSessions: many(callSessions),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  thread: one(threads, { fields: [messages.threadId], references: [threads.id] }),
  sender: one(users, { fields: [messages.senderId], references: [users.id] }),
  post: one(posts, { fields: [messages.postId], references: [posts.id] }),
}));

export const callSessionsRelations = relations(callSessions, ({ one }) => ({
  thread: one(threads, {
    fields: [callSessions.threadId],
    references: [threads.id],
  }),
  fan: one(users, {
    fields: [callSessions.fanId],
    references: [users.id],
    relationName: "fan_call_sessions",
  }),
  creator: one(users, {
    fields: [callSessions.creatorId],
    references: [users.id],
    relationName: "creator_call_sessions",
  }),
}));

export const blurJobsRelations = relations(blurJobs, ({ one }) => ({
  creator: one(users, { fields: [blurJobs.creatorId], references: [users.id] }),
  post: one(posts, { fields: [blurJobs.postId], references: [posts.id] }),
}));

export const unlocksRelations = relations(unlocks, ({ one }) => ({
  fan: one(users, { fields: [unlocks.fanId], references: [users.id] }),
  post: one(posts, { fields: [unlocks.postId], references: [posts.id] }),
}));

export const loyaltyLedgerRelations = relations(loyaltyLedger, ({ one }) => ({
  user: one(users, { fields: [loyaltyLedger.userId], references: [users.id] }),
}));

export const userBalancesRelations = relations(userBalances, ({ one }) => ({
  user: one(users, { fields: [userBalances.userId], references: [users.id] }),
}));

export const custodialLedgerRelations = relations(custodialLedger, ({ one }) => ({
  user: one(users, { fields: [custodialLedger.userId], references: [users.id] }),
  post: one(posts, { fields: [custodialLedger.postId], references: [posts.id] }),
}));

export const paymentDepositsRelations = relations(paymentDeposits, ({ one }) => ({
  user: one(users, { fields: [paymentDeposits.userId], references: [users.id] }),
}));

export const custodialWalletsRelations = relations(custodialWallets, ({ one }) => ({
  user: one(users, { fields: [custodialWallets.userId], references: [users.id] }),
}));

export const commentsRelations = relations(comments, ({ one, many }) => ({
  post: one(posts, { fields: [comments.postId], references: [posts.id] }),
  author: one(users, { fields: [comments.userId], references: [users.id] }),
  parent: one(comments, {
    fields: [comments.parentId],
    references: [comments.id],
    relationName: "comment_replies",
  }),
  replies: many(comments, { relationName: "comment_replies" }),
  likes: many(commentLikes),
}));

export const commentLikesRelations = relations(commentLikes, ({ one }) => ({
  comment: one(comments, {
    fields: [commentLikes.commentId],
    references: [comments.id],
  }),
  user: one(users, { fields: [commentLikes.userId], references: [users.id] }),
}));

export const tipsRelations = relations(tips, ({ one }) => ({
  fan: one(users, { fields: [tips.fanId], references: [users.id] }),
  creator: one(users, { fields: [tips.creatorId], references: [users.id] }),
  post: one(posts, { fields: [tips.postId], references: [posts.id] }),
}));

export const followsRelations = relations(follows, ({ one }) => ({
  follower: one(users, { fields: [follows.followerId], references: [users.id] }),
  following: one(users, {
    fields: [follows.followingId],
    references: [users.id],
  }),
}));

/* ==================================================================
   Juno — the index of pools this app launched.
   ==================================================================
   The Dynamic Bonding Curve program is the source of truth for every
   number that moves: price, reserves, curve progress, graduation. None
   of that is duplicated here, because a cached copy of a live market is
   a cache that is always wrong.

   What the chain cannot tell us is which of the many thousands of DBC
   pools belong to Juno, or what a creator typed when they launched one.
   That is what this table holds: identity and provenance, not state.
   ================================================================== */
export const junoCoinFormatEnum = pgEnum("juno_coin_format", ["post", "reel"]);

/** How often a recurring buy comes due. */
export const junoPlanCadenceEnum = pgEnum("juno_plan_cadence", [
  "daily",
  "weekly",
  "monthly",
]);

export const junoPools = pgTable(
  "juno_pools",
  {
    /** The base mint. Canonical id everywhere in the app and in URLs. */
    baseMint: varchar("base_mint", { length: 44 }).primaryKey(),
    poolAddress: varchar("pool_address", { length: 44 }).notNull(),
    configAddress: varchar("config_address", { length: 44 }).notNull(),
    quoteMint: varchar("quote_mint", { length: 44 }).notNull(),
    creatorWallet: varchar("creator_wallet", { length: 44 }).notNull(),

    /** Which cluster this pool lives on — devnet rows must not leak to mainnet. */
    cluster: varchar("cluster", { length: 16 }).notNull(),

    name: text("name").notNull(),
    symbol: varchar("symbol", { length: 16 }).notNull(),
    description: text("description"),
    format: junoCoinFormatEnum("format").notNull().default("post"),
    /** Which `lib/juno/curves.ts` preset it was launched with. */
    curvePreset: varchar("curve_preset", { length: 32 }).notNull(),

    mediaUrl: text("media_url"),
    posterUrl: text("poster_url"),
    /** What kind of file the media is. URLs on IPFS carry no extension, so
        image-vs-video cannot be sniffed from the address. */
    mediaMime: text("media_mime"),
    mediaWidth: integer("media_width"),
    mediaHeight: integer("media_height"),

    /**
     * What this curve is marked against: a Pyth feed id, or `tessera:T-OpenAI`
     * for a pre-IPO name Pyth has no feed for.
     */
    navFeedId: text("nav_feed_id"),

    /**
     * How many units of the reference one token stands for.
     *
     * Without this the NAV band was nonsense. A curve token costs a hundredth
     * of a cent and a share of NVDA costs $224, so comparing the two directly
     * reported every tracker as "-100.00%, outside the band" — a true
     * subtraction of two numbers that are not the same kind of thing.
     *
     * Set at launch from the reference's own price, so a tracker starts at
     * parity by construction and the band then measures what it is actually
     * for: drift *relative to* the underlying. Null for coins that track
     * nothing, and null on anything launched before this existed — which
     * yields no deviation rather than a fabricated one.
     */
    navUnitsPerToken: doublePrecision("nav_units_per_token"),

    /** The launch signature — the receipt a judge clicks. */
    createSignature: varchar("create_signature", { length: 96 }).notNull(),
    /**
     * Whether the coin appears in public lists — the feed, reels, Trade.
     *
     * A launch is permanent on-chain and cannot be undone, but a rehearsal
     * or a test launch should not be the first thing a visitor scrolls past.
     * Unlisting hides it from browsing and nothing else: its page still
     * opens, holders still see it in their portfolio, the indexer still
     * reads it. Nothing is deleted.
     */
    listed: boolean("listed").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("juno_pools_cluster_created_idx").on(table.cluster, table.createdAt),
    index("juno_pools_creator_idx").on(table.creatorWallet),
    uniqueIndex("juno_pools_pool_address_idx").on(table.poolAddress),
  ],
);

/**
 * Creator posts — the non-trade half of the social feed.
 *
 * Juno's feed mixes two kinds of item. Trades are read from chain and are never
 * stored; a post is something a person wrote, which has nowhere else to live.
 * A post may reference a coin (`base_mint`) or stand alone, so a creator can
 * talk about a launch without every message having to be one.
 *
 * Cluster-scoped for the same reason pools are: a devnet demo must not surface
 * in a mainnet feed.
 */
export const junoPosts = pgTable(
  "juno_posts",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    authorWallet: varchar("author_wallet", { length: 44 }).notNull(),
    cluster: varchar("cluster", { length: 16 }).notNull(),

    body: text("body").notNull(),
    /** Optional: the coin this post is about. */
    baseMint: varchar("base_mint", { length: 44 }),

    mediaUrl: text("media_url"),
    mediaMime: text("media_mime"),

    /**
     * The post this one replies to.
     *
     * A comment is a post with a parent rather than its own table: it has the
     * same author, body, timestamp and cluster scoping, and giving it a second
     * schema would mean two of every query. Null for a top-level post, which is
     * also what the feed filters on.
     */
    parentId: varchar("parent_id", { length: 32 }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("juno_posts_cluster_created_idx").on(table.cluster, table.createdAt),
    index("juno_posts_author_idx").on(table.authorWallet),
    index("juno_posts_mint_idx").on(table.baseMint),
    index("juno_posts_parent_idx").on(table.parentId),
  ],
);

/**
 * Who follows whom.
 *
 * The app had no social graph at all, which is why it was a launchpad with a
 * feed rather than a social trading app: nothing connected one wallet's
 * decisions to another's attention. A follow is the smallest primitive that
 * changes that, and every social-trading feature above it — a filtered feed, a
 * copied position, a follower count — is a query against this table.
 *
 * Cluster-scoped like everything else here: a devnet demo must not surface a
 * mainnet relationship. The primary key is the pair, so following twice is a
 * no-op rather than a duplicate row.
 */
/**
 * Decoded swaps, kept.
 *
 * Juno has no indexer and does not want one: a fill's side and size come out
 * of the pool's own vault deltas, which is a better source than anybody's API.
 * But *re-deriving* them on every read is what broke the app. A chart, a
 * portfolio, a leaderboard and the feed all walk the same pools, each walk is
 * a signature listing plus paced pages of parsed transactions, and the public
 * endpoint answers that with refusals — so a coin with four trades routinely
 * rendered as "No trades yet".
 *
 * So a swap is decoded once and written down. The chain stays the source of
 * truth; this is a record of what was already read from it, keyed by the
 * signature that proves it. Nothing here is ever computed — every column is
 * something the transaction said.
 */
export const junoSwaps = pgTable(
  "juno_swaps",
  {
    /** The transaction signature. Unique per fill, and its own proof. */
    signature: varchar("signature", { length: 96 }).primaryKey(),
    poolAddress: varchar("pool_address", { length: 44 }).notNull(),
    cluster: varchar("cluster", { length: 16 }).notNull(),
    /** Decoded from vault deltas: base out + quote in is a buy. */
    side: varchar("side", { length: 4 }).notNull(),
    baseAmount: doublePrecision("base_amount").notNull(),
    quoteAmount: doublePrecision("quote_amount").notNull(),
    /** Realised price of this fill, in quote per base. */
    price: doublePrecision("price").notNull(),
    /** Whoever signed it. */
    trader: varchar("trader", { length: 44 }).notNull(),
    slot: bigint("slot", { mode: "number" }).notNull(),
    blockTime: timestamp("block_time", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("juno_swaps_pool_slot_idx").on(table.poolAddress, table.slot),
    index("juno_swaps_trader_idx").on(table.cluster, table.trader),
  ],
);

/**
 * Signatures Juno has already looked at and found not to be swaps.
 *
 * Every pool's history contains its own launch transactions, and most pools
 * contain nothing else. Remembering only the *fills* meant those launch
 * transactions were fetched and parsed on every read forever — a permanent
 * toll on the exact pools that have no trades to show, which is why the same
 * seven came back short on pass after pass.
 *
 * A signature is immutable: if it was not a swap when it confirmed, it never
 * will be. So examining one is worth writing down even when the answer is no.
 */
export const junoScanned = pgTable(
  "juno_scanned",
  {
    signature: varchar("signature", { length: 96 }).primaryKey(),
    poolAddress: varchar("pool_address", { length: 44 }).notNull(),
    cluster: varchar("cluster", { length: 16 }).notNull(),
    scannedAt: timestamp("scanned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("juno_scanned_pool_idx").on(table.poolAddress, table.cluster)],
);

export const junoFollows = pgTable(
  "juno_follows",
  {
    followerWallet: varchar("follower_wallet", { length: 44 }).notNull(),
    targetWallet: varchar("target_wallet", { length: 44 }).notNull(),
    cluster: varchar("cluster", { length: 16 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.followerWallet, table.targetWallet, table.cluster] }),
    index("juno_follows_target_idx").on(table.cluster, table.targetWallet),
    index("juno_follows_follower_idx").on(table.cluster, table.followerWallet),
  ],
);

/**
 * Coins a wallet is keeping an eye on.
 *
 * Separate from a follow because the objects are different: you follow a
 * person for their decisions and watch a coin for its price. Collapsing them
 * into one "saved things" table would make every query filter on a discriminator
 * and would stop either from carrying its own fields — a watch has a price
 * alert, a follow does not.
 */
export const junoWatchlist = pgTable(
  "juno_watchlist",
  {
    wallet: varchar("wallet", { length: 44 }).notNull(),
    baseMint: varchar("base_mint", { length: 44 }).notNull(),
    cluster: varchar("cluster", { length: 16 }).notNull(),

    /**
     * Alert when the coin's price crosses this, in the coin's own quote terms.
     *
     * Null means watching without an alert, which is the common case. The
     * direction is not stored: it is derived from the price when the alert was
     * set, so "tell me at $0.0005" means up if it is below that now and down if
     * it is above.
     */
    alertPrice: doublePrecision("alert_price"),
    /** The price when the alert was set, so the crossing direction is knowable. */
    alertSetAtPrice: doublePrecision("alert_set_at_price"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.wallet, table.baseMint, table.cluster] }),
    index("juno_watchlist_wallet_idx").on(table.cluster, table.wallet),
    index("juno_watchlist_mint_idx").on(table.cluster, table.baseMint),
  ],
);

/**
 * A recurring buy someone has committed to.
 *
 * This is the savings half of the product and it is deliberately not a bot.
 * Executing a swap on someone's behalf needs a delegate or a session key with
 * spending authority, which this project does not have and should not fake —
 * so the plan stores the *intent* (what, how much, how often) and the app tells
 * you when it is due. The buy itself is the same server-built, device-signed
 * transaction as any other, which is the only honest version of this feature.
 *
 * `contributed` and `fills` are written after a swap confirms, so the progress
 * bar is a record of real transactions rather than of intentions.
 */
export const junoPlans = pgTable(
  "juno_plans",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    wallet: varchar("wallet", { length: 44 }).notNull(),
    baseMint: varchar("base_mint", { length: 44 }).notNull(),
    cluster: varchar("cluster", { length: 16 }).notNull(),

    /** Quote-token amount per contribution. */
    amount: doublePrecision("amount").notNull(),
    /** How often it comes due. */
    cadence: junoPlanCadenceEnum("cadence").notNull(),
    /** Optional target, so progress means something. Quote terms. */
    target: doublePrecision("target"),

    /** Sum of contributions that actually confirmed on chain. */
    contributed: doublePrecision("contributed").notNull().default(0),
    /** How many confirmed. */
    fills: integer("fills").notNull().default(0),
    lastFilledAt: timestamp("last_filled_at", { withTimezone: true }),

    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("juno_plans_wallet_idx").on(table.cluster, table.wallet),
    index("juno_plans_mint_idx").on(table.cluster, table.baseMint),
  ],
);
