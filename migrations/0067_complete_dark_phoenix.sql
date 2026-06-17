ALTER TABLE "obr_disbursement_vouchers" ADD COLUMN "explanation" text;--> statement-breakpoint
ALTER TABLE "obr_disbursement_vouchers" ADD COLUMN "is_one_for_all" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "obr_requests" ADD COLUMN "submitted_for_approval" boolean DEFAULT false NOT NULL;