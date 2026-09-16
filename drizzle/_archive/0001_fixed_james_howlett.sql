ALTER TYPE "public"."payment_deposit_status" ADD VALUE 'authorized' BEFORE 'succeeded';--> statement-breakpoint
ALTER TYPE "public"."payment_deposit_status" ADD VALUE 'refunded';--> statement-breakpoint
ALTER TYPE "public"."payment_deposit_status" ADD VALUE 'chargeback';--> statement-breakpoint
ALTER TABLE "payment_deposits" ADD COLUMN "provider_transaction_id" varchar(255);--> statement-breakpoint
ALTER TABLE "payment_deposits" ADD COLUMN "provider_customer_id" varchar(255);--> statement-breakpoint
ALTER TABLE "payment_deposits" ADD COLUMN "provider_payment_method_id" varchar(255);--> statement-breakpoint
ALTER TABLE "payment_deposits" ADD COLUMN "destination_wallet_address" varchar(42);--> statement-breakpoint
ALTER TABLE "payment_deposits" ADD COLUMN "tempo_funding_tx_hash" varchar(66);--> statement-breakpoint
ALTER TABLE "payment_deposits" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_deposits" ADD COLUMN "refunded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_deposits" ADD COLUMN "chargeback_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_deposits_provider_tx_idx" ON "payment_deposits" USING btree ("provider_transaction_id");