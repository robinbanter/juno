DO $$ BEGIN
 CREATE TYPE "public"."call_session_status" AS ENUM('created', 'connecting', 'connected', 'ending', 'settled', 'released', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "call_sessions" (
	"id" varchar(80) PRIMARY KEY NOT NULL,
	"thread_id" uuid NOT NULL,
	"fan_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"eleven_conversation_id" varchar(255),
	"status" "call_session_status" DEFAULT 'created' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"connected_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"last_reserved_second" integer DEFAULT 0 NOT NULL,
	"settled_seconds" integer,
	"settled_amount" numeric(18, 8),
	"settlement_tx_hash" varchar(66),
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_fan_id_users_id_fk" FOREIGN KEY ("fan_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "call_sessions_thread_idx" ON "call_sessions" USING btree ("thread_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "call_sessions_fan_active_idx" ON "call_sessions" USING btree ("fan_id","thread_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "call_sessions_eleven_conversation_idx" ON "call_sessions" USING btree ("eleven_conversation_id");
