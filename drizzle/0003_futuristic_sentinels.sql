CREATE TYPE "public"."performer_record_status" AS ENUM('pending', 'verified', 'rejected');--> statement-breakpoint
CREATE TABLE "performer_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"legal_name" varchar(255) NOT NULL,
	"stage_names" text,
	"date_of_birth" timestamp NOT NULL,
	"id_document_key" text NOT NULL,
	"id_document_type" varchar(32) NOT NULL,
	"consent_signed_at" timestamp with time zone NOT NULL,
	"status" "performer_record_status" DEFAULT 'pending' NOT NULL,
	"verified_at" timestamp with time zone,
	"verifier_note" text,
	"retain_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "performer_records" ADD CONSTRAINT "performer_records_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "performer_records_creator_idx" ON "performer_records" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "performer_records_status_idx" ON "performer_records" USING btree ("status");