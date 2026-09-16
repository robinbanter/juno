ALTER TYPE "public"."payment_deposit_status" ADD VALUE 'funding_pending' BEFORE 'succeeded';--> statement-breakpoint
ALTER TYPE "public"."payment_deposit_status" ADD VALUE 'funding_failed' BEFORE 'failed';
