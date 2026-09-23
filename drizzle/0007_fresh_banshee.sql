ALTER TABLE "juno_posts" ADD COLUMN IF NOT EXISTS "parent_id" varchar(32);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "juno_posts_parent_idx" ON "juno_posts" USING btree ("parent_id");