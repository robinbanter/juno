CREATE TABLE IF NOT EXISTS "juno_pool_txs" (
	"pool_address" varchar(44) NOT NULL,
	"signature" varchar(96) NOT NULL,
	"kind" varchar(8) NOT NULL,
	"side" varchar(4),
	"base_amount" double precision,
	"quote_amount" double precision,
	"price" double precision,
	"trader" varchar(44),
	"block_time" bigint,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "juno_pool_txs_pool_address_signature_pk" PRIMARY KEY("pool_address","signature")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "juno_pool_txs_pool_time_idx" ON "juno_pool_txs" USING btree ("pool_address","block_time");