ALTER TABLE "obr_disbursement_vouchers" ALTER COLUMN "head_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "obr_disbursement_vouchers" ALTER COLUMN "head_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "obr_disbursement_vouchers" ALTER COLUMN "head_position_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "obr_disbursement_vouchers" ALTER COLUMN "accountant_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "obr_disbursement_vouchers" ALTER COLUMN "accountant_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "obr_disbursement_vouchers" ALTER COLUMN "accountant_position_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "obr_disbursement_vouchers" ALTER COLUMN "treasurer_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "obr_disbursement_vouchers" ALTER COLUMN "treasurer_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "obr_disbursement_vouchers" ALTER COLUMN "treasurer_position_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "obr_disbursement_vouchers" ALTER COLUMN "mayor_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "obr_disbursement_vouchers" ALTER COLUMN "mayor_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "obr_disbursement_vouchers" ALTER COLUMN "mayor_position_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "obr_disbursement_vouchers" ADD COLUMN "accountant_signing_status" "obr_request_signing_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "obr_disbursement_vouchers" ADD COLUMN "accountant_reason" text;--> statement-breakpoint
ALTER TABLE "obr_disbursement_vouchers" ADD COLUMN "accountant_acted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "obr_requests" ADD COLUMN "with_cheque" boolean DEFAULT true NOT NULL;