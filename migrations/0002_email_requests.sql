CREATE TABLE "hr_email_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" integer NOT NULL,
	"requested_email" text NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"temp_password_ciphertext" text DEFAULT '' NOT NULL,
	"temp_password_created_at" text DEFAULT '' NOT NULL,
	"temp_password_revealed_at" text DEFAULT '' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	CONSTRAINT "hr_email_requests_requested_email_unique" UNIQUE("requested_email")
);
--> statement-breakpoint
CREATE INDEX "hr_email_requests_agent_idx" ON "hr_email_requests" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "hr_email_requests_status_idx" ON "hr_email_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "hr_email_requests_created_idx" ON "hr_email_requests" USING btree ("created_at");
