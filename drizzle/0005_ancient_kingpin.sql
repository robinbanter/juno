CREATE TYPE "public"."juno_coin_format" AS ENUM('post', 'reel');--> statement-breakpoint
CREATE TABLE "juno_pools" (
	"base_mint" varchar(44) PRIMARY KEY NOT NULL,
	"pool_address" varchar(44) NOT NULL,
	"config_address" varchar(44) NOT NULL,
	"quote_mint" varchar(44) NOT NULL,
	"creator_wallet" varchar(44) NOT NULL,
	"cluster" varchar(16) NOT NULL,
	"name" text NOT NULL,
	"symbol" varchar(16) NOT NULL,
	"description" text,
	"format" "juno_coin_format" DEFAULT 'post' NOT NULL,
	"curve_preset" varchar(32) NOT NULL,
	"media_url" text,
	"poster_url" text,
	"media_mime" text,
	"media_width" integer,
	"media_height" integer,
	"nav_feed_id" text,
	"create_signature" varchar(96) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "juno_pools_cluster_created_idx" ON "juno_pools" USING btree ("cluster","created_at");--> statement-breakpoint
CREATE INDEX "juno_pools_creator_idx" ON "juno_pools" USING btree ("creator_wallet");--> statement-breakpoint
CREATE UNIQUE INDEX "juno_pools_pool_address_idx" ON "juno_pools" USING btree ("pool_address");