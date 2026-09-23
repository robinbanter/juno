-- Tables and columns that reached production through `drizzle-kit push` and
-- never had a migration, so `npm run db:migrate` on a fresh database built a
-- schema the app could not run against. Written idempotently: on a database
-- that already has them (production) every statement is a no-op.
DO $$ BEGIN
  CREATE TYPE "public"."juno_plan_cadence" AS ENUM('daily', 'weekly', 'monthly');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "juno_follows" (
	"follower_wallet" varchar(44) NOT NULL,
	"target_wallet" varchar(44) NOT NULL,
	"cluster" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "juno_follows_follower_wallet_target_wallet_cluster_pk" PRIMARY KEY("follower_wallet","target_wallet","cluster")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "juno_plans" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"wallet" varchar(44) NOT NULL,
	"base_mint" varchar(44) NOT NULL,
	"cluster" varchar(16) NOT NULL,
	"amount" double precision NOT NULL,
	"cadence" "juno_plan_cadence" NOT NULL,
	"target" double precision,
	"contributed" double precision DEFAULT 0 NOT NULL,
	"fills" integer DEFAULT 0 NOT NULL,
	"last_filled_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "juno_scanned" (
	"signature" varchar(96) PRIMARY KEY NOT NULL,
	"pool_address" varchar(44) NOT NULL,
	"cluster" varchar(16) NOT NULL,
	"scanned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "juno_swaps" (
	"signature" varchar(96) PRIMARY KEY NOT NULL,
	"pool_address" varchar(44) NOT NULL,
	"cluster" varchar(16) NOT NULL,
	"side" varchar(4) NOT NULL,
	"base_amount" double precision NOT NULL,
	"quote_amount" double precision NOT NULL,
	"price" double precision NOT NULL,
	"trader" varchar(44) NOT NULL,
	"slot" bigint NOT NULL,
	"block_time" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "juno_watchlist" (
	"wallet" varchar(44) NOT NULL,
	"base_mint" varchar(44) NOT NULL,
	"cluster" varchar(16) NOT NULL,
	"alert_price" double precision,
	"alert_set_at_price" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "juno_watchlist_wallet_base_mint_cluster_pk" PRIMARY KEY("wallet","base_mint","cluster")
);
--> statement-breakpoint
ALTER TABLE "juno_pools" ADD COLUMN IF NOT EXISTS "nav_units_per_token" double precision;--> statement-breakpoint
ALTER TABLE "juno_pools" ADD COLUMN IF NOT EXISTS "listed" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "juno_follows_target_idx" ON "juno_follows" USING btree ("cluster","target_wallet");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "juno_follows_follower_idx" ON "juno_follows" USING btree ("cluster","follower_wallet");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "juno_plans_wallet_idx" ON "juno_plans" USING btree ("cluster","wallet");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "juno_plans_mint_idx" ON "juno_plans" USING btree ("cluster","base_mint");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "juno_scanned_pool_idx" ON "juno_scanned" USING btree ("pool_address","cluster");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "juno_swaps_pool_slot_idx" ON "juno_swaps" USING btree ("pool_address","slot");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "juno_swaps_trader_idx" ON "juno_swaps" USING btree ("cluster","trader");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "juno_watchlist_wallet_idx" ON "juno_watchlist" USING btree ("cluster","wallet");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "juno_watchlist_mint_idx" ON "juno_watchlist" USING btree ("cluster","base_mint");