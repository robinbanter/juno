CREATE TYPE "public"."scan_status" AS ENUM('skipped', 'pending', 'clean', 'flagged');--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "scan_status" "scan_status" DEFAULT 'skipped' NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "scan_detail" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "scanned_at" timestamp with time zone;