-- Application draft storage for "Resume Application" feature.
-- Stores partial form data (as JSON string) so applicants can leave and come back later.
ALTER TABLE "hr_agents" ADD COLUMN IF NOT EXISTS "application_data" text DEFAULT '';
--> statement-breakpoint
ALTER TABLE "hr_agents" ADD COLUMN IF NOT EXISTS "application_updated_at" text DEFAULT '';
