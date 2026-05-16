CREATE TABLE "hr_agents" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"start_date" text NOT NULL,
	"subscription_status" text DEFAULT 'Trial' NOT NULL,
	"payout_method_type" text DEFAULT '',
	"payout_details" text DEFAULT '',
	"sofi_referral_status" text DEFAULT 'Not Invited' NOT NULL,
	"sofi_referral_link" text DEFAULT '',
	"performance_notes" text DEFAULT '',
	"crm_record_id" text DEFAULT '',
	"crm_pipeline_stage" text DEFAULT 'Applicant' NOT NULL,
	"onboarding_step" integer DEFAULT 1 NOT NULL,
	"onboarding_complete" boolean DEFAULT false NOT NULL,
	CONSTRAINT "hr_agents_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "hr_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" integer NOT NULL,
	"doc_type" text NOT NULL,
	"file_name" text NOT NULL,
	"file_url" text NOT NULL,
	"uploaded_at" text NOT NULL,
	"status" text DEFAULT 'Pending Review' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hr_ica_signatures" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" integer NOT NULL,
	"legal_name" text NOT NULL,
	"address" text NOT NULL,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"zip" text NOT NULL,
	"signature_data_url" text NOT NULL,
	"signed_at" text NOT NULL,
	"ip_address" text DEFAULT '',
	"agreed" boolean DEFAULT false NOT NULL,
	CONSTRAINT "hr_ica_signatures_agent_id_unique" UNIQUE("agent_id")
);
--> statement-breakpoint
CREATE TABLE "hr_onboarding_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" integer NOT NULL,
	"step_number" integer NOT NULL,
	"task_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"completed_at" text DEFAULT '',
	"notes" text DEFAULT ''
);
--> statement-breakpoint
CREATE TABLE "hr_training_progress" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" integer NOT NULL,
	"module_key" text NOT NULL,
	"module_name" text NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"completed_at" text DEFAULT ''
);
