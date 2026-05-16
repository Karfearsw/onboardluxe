CREATE TABLE "hr_agent_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" integer NOT NULL,
	"token" text NOT NULL,
	"expires_at" text NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "hr_agent_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "hr_status_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" integer NOT NULL,
	"event_type" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text DEFAULT '' NOT NULL,
	"old_value" text DEFAULT '',
	"new_value" text DEFAULT '',
	"metadata_json" text DEFAULT '',
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "hr_agent_sessions_agent_idx" ON "hr_agent_sessions" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "hr_agent_sessions_expires_idx" ON "hr_agent_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "hr_status_events_agent_idx" ON "hr_status_events" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "hr_status_events_created_idx" ON "hr_status_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "hr_agents_email_idx" ON "hr_agents" USING btree ("email");--> statement-breakpoint
CREATE INDEX "hr_documents_agent_idx" ON "hr_documents" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "hr_onboarding_tasks_agent_idx" ON "hr_onboarding_tasks" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "hr_training_progress_agent_idx" ON "hr_training_progress" USING btree ("agent_id");