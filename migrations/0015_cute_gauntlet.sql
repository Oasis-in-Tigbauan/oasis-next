CREATE TABLE "fund_types" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "obr_requests" ADD COLUMN "disbursement_id" text;--> statement-breakpoint
ALTER TABLE "obr_requests" ADD COLUMN "obr_id" text;