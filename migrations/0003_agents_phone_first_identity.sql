ALTER TABLE "hr_agents" ADD COLUMN "personal_email" text;
--> statement-breakpoint
ALTER TABLE "hr_agents" ADD COLUMN "company_email" text;
--> statement-breakpoint
ALTER TABLE "hr_agents" ADD COLUMN "phone_normalized" text;
--> statement-breakpoint
UPDATE "hr_agents" SET "personal_email" = "email" WHERE "personal_email" IS NULL AND "email" IS NOT NULL;
--> statement-breakpoint
UPDATE "hr_agents" SET "phone_normalized" = NULLIF(regexp_replace("phone", '\D', '', 'g'), '') WHERE "phone_normalized" IS NULL;
--> statement-breakpoint
ALTER TABLE "hr_agents" ALTER COLUMN "email" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "hr_agents" DROP CONSTRAINT IF EXISTS "hr_agents_email_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "hr_agents_phone_normalized_unique" ON "hr_agents" USING btree ("phone_normalized");
--> statement-breakpoint
CREATE UNIQUE INDEX "hr_agents_company_email_unique" ON "hr_agents" USING btree ("company_email");
