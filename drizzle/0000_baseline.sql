CREATE TYPE "public"."access_mode" AS ENUM('full', 'partial');--> statement-breakpoint
CREATE TYPE "public"."blur_status" AS ENUM('uploaded', 'detecting', 'tracking', 'compositing', 'ready_for_review', 'approved', 'published', 'failed', 'manual_review');--> statement-breakpoint
CREATE TYPE "public"."call_session_status" AS ENUM('created', 'connecting', 'connected', 'ending', 'settled', 'released', 'failed');--> statement-breakpoint
CREATE TYPE "public"."custodial_ledger_type" AS ENUM('deposit', 'unlock_debit', 'withdrawal', 'refund', 'tip_debit', 'tip_credit', 'mpp_call_debit', 'mpp_call_credit');--> statement-breakpoint
CREATE TYPE "public"."custodial_wallet_status" AS ENUM('active', 'retired');--> statement-breakpoint
CREATE TYPE "public"."loyalty_event_type" AS ENUM('post_unlock', 'tip', 'streak_bonus');--> statement-breakpoint
CREATE TYPE "public"."media_type" AS ENUM('image', 'video');--> statement-breakpoint
CREATE TYPE "public"."message_kind" AS ENUM('text', 'ppv', 'call');--> statement-breakpoint
CREATE TYPE "public"."payment_deposit_status" AS ENUM('pending', 'authorized', 'funding_pending', 'succeeded', 'funding_failed', 'failed', 'refunded', 'chargeback');--> statement-breakpoint
CREATE TYPE "public"."platform_key_status" AS ENUM('active', 'retired');--> statement-breakpoint
CREATE TYPE "public"."report_reason" AS ENUM('csam', 'non_consensual', 'underage', 'violence', 'copyright', 'impersonation', 'spam', 'other');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'reviewing', 'actioned', 'dismissed');--> statement-breakpoint
CREATE TABLE "blur_cost_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid,
	"stage" text NOT NULL,
	"predict_time" numeric,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blur_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid,
	"creator_id" uuid NOT NULL,
	"media_type" "media_type" NOT NULL,
	"status" "blur_status" DEFAULT 'uploaded' NOT NULL,
	"raw_blob_key" text NOT NULL,
	"blurred_blob_url" text,
	"original_blob_key" text,
	"draft_title" text,
	"draft_price" numeric(18, 8),
	"prediction_ids" jsonb DEFAULT '{}'::jsonb,
	"detection_confidence" numeric,
	"regions" jsonb DEFAULT '[]'::jsonb,
	"region_patches" jsonb DEFAULT '[]'::jsonb,
	"source_fps" integer,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blur_webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" uuid,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_sessions" (
	"id" varchar(80) PRIMARY KEY NOT NULL,
	"thread_id" uuid NOT NULL,
	"fan_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"eleven_conversation_id" varchar(255),
	"status" "call_session_status" DEFAULT 'created' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"connected_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"last_reserved_second" integer DEFAULT 0 NOT NULL,
	"settled_seconds" integer,
	"settled_amount" numeric(18, 8),
	"settlement_tx_hash" varchar(66),
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment_likes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"parent_id" uuid,
	"body" text NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid,
	"reported_user_id" uuid,
	"reporter_id" uuid,
	"reason" "report_reason" NOT NULL,
	"detail" text,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewer_id" uuid,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custodial_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event_type" "custodial_ledger_type" NOT NULL,
	"amount" numeric(18, 8) NOT NULL,
	"balance_after" numeric(18, 8) NOT NULL,
	"post_id" uuid,
	"reference" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custodial_wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"address" varchar(58) NOT NULL,
	"encrypted_private_key" text NOT NULL,
	"iv" varchar(32) NOT NULL,
	"auth_tag" varchar(32) NOT NULL,
	"status" "custodial_wallet_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone,
	CONSTRAINT "custodial_wallets_address_unique" UNIQUE("address")
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"follower_id" uuid NOT NULL,
	"following_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" numeric(18, 0) NOT NULL,
	"event_type" "loyalty_event_type" NOT NULL,
	"reference_id" uuid,
	"tx_hash" varchar(66),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"kind" "message_kind" DEFAULT 'text' NOT NULL,
	"body" text,
	"post_id" uuid,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_deposits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(32) DEFAULT 'stripe' NOT NULL,
	"provider_session_id" varchar(255) NOT NULL,
	"provider_payment_intent_id" varchar(255),
	"provider_transaction_id" varchar(255),
	"provider_customer_id" varchar(255),
	"provider_payment_method_id" varchar(255),
	"status" "payment_deposit_status" DEFAULT 'pending' NOT NULL,
	"amount" numeric(18, 8) NOT NULL,
	"currency" varchar(3) DEFAULT 'usd' NOT NULL,
	"destination_wallet_address" varchar(58),
	"tempo_funding_tx_hash" varchar(66),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"credited_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"chargeback_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_deposits_provider_session_id_unique" UNIQUE("provider_session_id")
);
--> statement-breakpoint
CREATE TABLE "platform_signing_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key_id" varchar(64) NOT NULL,
	"address" varchar(58) NOT NULL,
	"encrypted_private_key" text NOT NULL,
	"iv" varchar(32) NOT NULL,
	"auth_tag" varchar(32) NOT NULL,
	"status" "platform_key_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone,
	CONSTRAINT "platform_signing_keys_key_id_unique" UNIQUE("key_id")
);
--> statement-breakpoint
CREATE TABLE "post_likes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_regions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"label" varchar(64) NOT NULL,
	"rect" jsonb NOT NULL,
	"track" jsonb,
	"patch_media_key" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_saves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"blurred_preview_url" text NOT NULL,
	"private_media_key" text NOT NULL,
	"unlock_price" numeric(18, 8) NOT NULL,
	"media_type" "media_type" DEFAULT 'image' NOT NULL,
	"access_mode" "access_mode" DEFAULT 'full' NOT NULL,
	"poster_key" text,
	"duration_ms" integer,
	"teaser_free_ms" integer,
	"is_published" boolean DEFAULT true NOT NULL,
	"taken_down_at" timestamp with time zone,
	"takedown_reason" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "region_unlocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fan_id" uuid NOT NULL,
	"post_region_id" uuid NOT NULL,
	"payment_tx_hash" varchar(66) NOT NULL,
	"amount_paid" numeric(18, 8) NOT NULL,
	"settlement_ms" integer,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"fan_id" uuid NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fan_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"post_id" uuid,
	"amount" numeric(18, 8) NOT NULL,
	"message" text,
	"payment_tx_hash" varchar(66) NOT NULL,
	"settlement_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unlocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fan_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"payment_tx_hash" varchar(66) NOT NULL,
	"amount_paid" numeric(18, 8) NOT NULL,
	"settlement_ms" integer,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_balances" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"available_balance" numeric(18, 8) DEFAULT '0' NOT NULL,
	"escrowed_balance" numeric(18, 8) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_address" varchar(58) NOT NULL,
	"clerk_id" varchar(128),
	"email" varchar(255),
	"display_name" varchar(255),
	"image_url" text,
	"tempo_virtual_address" varchar(58),
	"username" varchar(32),
	"avatar" text,
	"bio" text,
	"is_creator" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_wallet_address_unique" UNIQUE("wallet_address"),
	CONSTRAINT "users_clerk_id_unique" UNIQUE("clerk_id"),
	CONSTRAINT "users_tempo_virtual_address_unique" UNIQUE("tempo_virtual_address"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "blur_jobs" ADD CONSTRAINT "blur_jobs_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blur_jobs" ADD CONSTRAINT "blur_jobs_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_fan_id_users_id_fk" FOREIGN KEY ("fan_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_likes" ADD CONSTRAINT "comment_likes_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_likes" ADD CONSTRAINT "comment_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_reported_user_id_users_id_fk" FOREIGN KEY ("reported_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custodial_ledger" ADD CONSTRAINT "custodial_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custodial_ledger" ADD CONSTRAINT "custodial_ledger_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custodial_wallets" ADD CONSTRAINT "custodial_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_following_id_users_id_fk" FOREIGN KEY ("following_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_ledger" ADD CONSTRAINT "loyalty_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_deposits" ADD CONSTRAINT "payment_deposits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_regions" ADD CONSTRAINT "post_regions_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_saves" ADD CONSTRAINT "post_saves_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_saves" ADD CONSTRAINT "post_saves_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region_unlocks" ADD CONSTRAINT "region_unlocks_fan_id_users_id_fk" FOREIGN KEY ("fan_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region_unlocks" ADD CONSTRAINT "region_unlocks_post_region_id_post_regions_id_fk" FOREIGN KEY ("post_region_id") REFERENCES "public"."post_regions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_fan_id_users_id_fk" FOREIGN KEY ("fan_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tips" ADD CONSTRAINT "tips_fan_id_users_id_fk" FOREIGN KEY ("fan_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tips" ADD CONSTRAINT "tips_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tips" ADD CONSTRAINT "tips_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unlocks" ADD CONSTRAINT "unlocks_fan_id_users_id_fk" FOREIGN KEY ("fan_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unlocks" ADD CONSTRAINT "unlocks_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_balances" ADD CONSTRAINT "user_balances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blur_cost_job_idx" ON "blur_cost_log" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "blur_jobs_creator_idx" ON "blur_jobs" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "blur_jobs_status_idx" ON "blur_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "call_sessions_thread_idx" ON "call_sessions" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "call_sessions_fan_active_idx" ON "call_sessions" USING btree ("fan_id","thread_id","status");--> statement-breakpoint
CREATE INDEX "call_sessions_eleven_conversation_idx" ON "call_sessions" USING btree ("eleven_conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "comment_likes_comment_user_uniq" ON "comment_likes" USING btree ("comment_id","user_id");--> statement-breakpoint
CREATE INDEX "comment_likes_comment_idx" ON "comment_likes" USING btree ("comment_id");--> statement-breakpoint
CREATE INDEX "comments_post_idx" ON "comments" USING btree ("post_id","created_at");--> statement-breakpoint
CREATE INDEX "comments_parent_idx" ON "comments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "content_reports_queue_idx" ON "content_reports" USING btree ("status","reason","created_at");--> statement-breakpoint
CREATE INDEX "content_reports_post_idx" ON "content_reports" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "custodial_ledger_user_idx" ON "custodial_ledger" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "custodial_ledger_reference_idx" ON "custodial_ledger" USING btree ("reference");--> statement-breakpoint
CREATE UNIQUE INDEX "custodial_wallets_user_idx" ON "custodial_wallets" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "custodial_wallets_address_idx" ON "custodial_wallets" USING btree ("address");--> statement-breakpoint
CREATE INDEX "custodial_wallets_status_idx" ON "custodial_wallets" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "follows_pair_uniq" ON "follows" USING btree ("follower_id","following_id");--> statement-breakpoint
CREATE INDEX "follows_following_idx" ON "follows" USING btree ("following_id");--> statement-breakpoint
CREATE INDEX "loyalty_user_idx" ON "loyalty_ledger" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "messages_thread_idx" ON "messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_deposits_user_idx" ON "payment_deposits" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_deposits_provider_session_idx" ON "payment_deposits" USING btree ("provider_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_deposits_provider_tx_idx" ON "payment_deposits" USING btree ("provider_transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_signing_keys_key_id_idx" ON "platform_signing_keys" USING btree ("key_id");--> statement-breakpoint
CREATE INDEX "platform_signing_keys_status_idx" ON "platform_signing_keys" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "post_likes_post_user_uniq" ON "post_likes" USING btree ("post_id","user_id");--> statement-breakpoint
CREATE INDEX "post_likes_post_idx" ON "post_likes" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "post_regions_post_idx" ON "post_regions" USING btree ("post_id");--> statement-breakpoint
CREATE UNIQUE INDEX "post_saves_post_user_uniq" ON "post_saves" USING btree ("post_id","user_id");--> statement-breakpoint
CREATE INDEX "post_saves_user_idx" ON "post_saves" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "posts_creator_idx" ON "posts" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "posts_feed_idx" ON "posts" USING btree ("is_published","created_at");--> statement-breakpoint
CREATE INDEX "posts_takedown_idx" ON "posts" USING btree ("taken_down_at");--> statement-breakpoint
CREATE UNIQUE INDEX "region_unlocks_fan_region_uniq" ON "region_unlocks" USING btree ("fan_id","post_region_id");--> statement-breakpoint
CREATE INDEX "region_unlocks_fan_idx" ON "region_unlocks" USING btree ("fan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "threads_pair_uniq" ON "threads" USING btree ("creator_id","fan_id");--> statement-breakpoint
CREATE INDEX "threads_creator_idx" ON "threads" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "threads_fan_idx" ON "threads" USING btree ("fan_id");--> statement-breakpoint
CREATE INDEX "tips_creator_idx" ON "tips" USING btree ("creator_id","created_at");--> statement-breakpoint
CREATE INDEX "tips_fan_idx" ON "tips" USING btree ("fan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unlocks_fan_post_uniq" ON "unlocks" USING btree ("fan_id","post_id");--> statement-breakpoint
CREATE INDEX "unlocks_fan_idx" ON "unlocks" USING btree ("fan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_wallet_idx" ON "users" USING btree ("wallet_address");--> statement-breakpoint
CREATE UNIQUE INDEX "users_clerk_idx" ON "users" USING btree ("clerk_id");