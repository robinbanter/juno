CREATE TABLE "juno_posts" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"author_wallet" varchar(44) NOT NULL,
	"cluster" varchar(16) NOT NULL,
	"body" text NOT NULL,
	"base_mint" varchar(44),
	"media_url" text,
	"media_mime" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "juno_posts_cluster_created_idx" ON "juno_posts" USING btree ("cluster","created_at");--> statement-breakpoint
CREATE INDEX "juno_posts_author_idx" ON "juno_posts" USING btree ("author_wallet");--> statement-breakpoint
CREATE INDEX "juno_posts_mint_idx" ON "juno_posts" USING btree ("base_mint");