ALTER TABLE "juno_posts" ADD COLUMN "parent_id" varchar(32);--> statement-breakpoint
CREATE INDEX "juno_posts_parent_idx" ON "juno_posts" USING btree ("parent_id");