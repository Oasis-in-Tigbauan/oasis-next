ALTER TABLE "obr_disbursement_vouchers" ALTER COLUMN "request_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "obr_disbursement_vouchers" ALTER COLUMN "request_item_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "obr_disbursement_vouchers" ADD COLUMN "with_cheque" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "obr_disbursement_vouchers" ADD COLUMN "disbursement_batch_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "obr_requests" DROP COLUMN "with_cheque";