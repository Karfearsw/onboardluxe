-- Repair: ensure application_data columns exist on hr_agents.
-- Migration 0005 may be marked applied in the Drizzle journal without the
-- columns actually existing (journal-only success). This is idempotent and
-- safe to run even if 0005 did apply.
ALTER TABLE "hr_agents" ADD COLUMN IF NOT EXISTS "application_data" text DEFAULT '';
--> statement-breakpoint
ALTER TABLE "hr_agents" ADD COLUMN IF NOT EXISTS "application_updated_at" text DEFAULT '';
