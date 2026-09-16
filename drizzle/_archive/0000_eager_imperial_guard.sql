CREATE TYPE "public"."blur_status" AS ENUM('uploaded', 'detecting', 'tracking', 'compositing', 'ready_for_review', 'approved', 'published', 'failed', 'manual_review');--> statement-breakpoint
CREATE TYPE "public"."custodial_ledger_type" AS ENUM('deposit', 'unlock_debit', 'withdrawal', 'refund');--> statement-breakpoint
CREATE TYPE "public"."custodial_wallet_status" AS ENUM('active', 'retired');--> statement-breakpoint
CREATE TYPE "public"."loyalty_event_type" AS ENUM('post_unlock', 'tip', 'streak_bonus');--> statement-breakpoint
CREATE TYPE "public"."media_type" AS ENUM('image', 'video');--> statement-breakpoint
CREATE TYPE "public"."message_kind" AS ENUM('text', 'ppv');--> statement-breakpoint
CREATE TYPE "public"."payment_deposit_status" AS ENUM('pending', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."platform_key_status" AS ENUM('active', 'retired');--> statement-breakpoint
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
	"address" varchar(42) NOT NULL,
	"encrypted_private_key" text NOT NULL,
	"iv" varchar(32) NOT NULL,
	"auth_tag" varchar(32) NOT NULL,
	"status" "custodial_wallet_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone,
	CONSTRAINT "custodial_wallets_address_unique" UNIQUE("address")
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
	"status" "payment_deposit_status" DEFAULT 'pending' NOT NULL,
	"amount" numeric(18, 8) NOT NULL,
	"currency" varchar(3) DEFAULT 'usd' NOT NULL,
	"credited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_deposits_provider_session_id_unique" UNIQUE("provider_session_id")
);
--> statement-breakpoint
CREATE TABLE "platform_signing_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key_id" varchar(64) NOT NULL,
	"address" varchar(42) NOT NULL,
	"encrypted_private_key" text NOT NULL,
	"iv" varchar(32) NOT NULL,
	"auth_tag" varchar(32) NOT NULL,
	"status" "platform_key_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone,
	CONSTRAINT "platform_signing_keys_key_id_unique" UNIQUE("key_id")
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
	"is_published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
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
	"wallet_address" varchar(42) NOT NULL,
	"clerk_id" varchar(128),
	"email" varchar(255),
	"display_name" varchar(255),
	"image_url" text,
	"tempo_virtual_address" varchar(42),
	"username" varchar(32),
	"avatar" text,
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
ALTER TABLE "custodial_ledger" ADD CONSTRAINT "custodial_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custodial_ledger" ADD CONSTRAINT "custodial_ledger_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custodial_wallets" ADD CONSTRAINT "custodial_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_ledger" ADD CONSTRAINT "loyalty_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_deposits" ADD CONSTRAINT "payment_deposits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_fan_id_users_id_fk" FOREIGN KEY ("fan_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unlocks" ADD CONSTRAINT "unlocks_fan_id_users_id_fk" FOREIGN KEY ("fan_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unlocks" ADD CONSTRAINT "unlocks_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_balances" ADD CONSTRAINT "user_balances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blur_cost_job_idx" ON "blur_cost_log" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "blur_jobs_creator_idx" ON "blur_jobs" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "blur_jobs_status_idx" ON "blur_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "custodial_ledger_user_idx" ON "custodial_ledger" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "custodial_ledger_reference_idx" ON "custodial_ledger" USING btree ("reference");--> statement-breakpoint
CREATE UNIQUE INDEX "custodial_wallets_user_idx" ON "custodial_wallets" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "custodial_wallets_address_idx" ON "custodial_wallets" USING btree ("address");--> statement-breakpoint
CREATE INDEX "custodial_wallets_status_idx" ON "custodial_wallets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "loyalty_user_idx" ON "loyalty_ledger" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "messages_thread_idx" ON "messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_deposits_user_idx" ON "payment_deposits" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_deposits_provider_session_idx" ON "payment_deposits" USING btree ("provider_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_signing_keys_key_id_idx" ON "platform_signing_keys" USING btree ("key_id");--> statement-breakpoint
CREATE INDEX "platform_signing_keys_status_idx" ON "platform_signing_keys" USING btree ("status");--> statement-breakpoint
CREATE INDEX "posts_creator_idx" ON "posts" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "posts_feed_idx" ON "posts" USING btree ("is_published","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "threads_pair_uniq" ON "threads" USING btree ("creator_id","fan_id");--> statement-breakpoint
CREATE INDEX "threads_creator_idx" ON "threads" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "threads_fan_idx" ON "threads" USING btree ("fan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unlocks_fan_post_uniq" ON "unlocks" USING btree ("fan_id","post_id");--> statement-breakpoint
CREATE INDEX "unlocks_fan_idx" ON "unlocks" USING btree ("fan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_wallet_idx" ON "users" USING btree ("wallet_address");--> statement-breakpoint
CREATE UNIQUE INDEX "users_clerk_idx" ON "users" USING btree ("clerk_id");