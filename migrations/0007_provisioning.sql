-- Provisioning pipeline: career approval → IONOS email → CRM employee account.
-- Tracks per-request provisioning state for the "Approve & Provision" flow.

ALTER TABLE "hr_email_requests" ADD COLUMN IF NOT EXISTS "provisioning_error" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "hr_email_requests" ADD COLUMN IF NOT EXISTS "crm_user_id" integer;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_email_requests_crm_user_idx" ON "hr_email_requests" USING btree ("crm_user_id");
