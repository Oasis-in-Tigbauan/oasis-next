ALTER TABLE "esre" ALTER COLUMN "payee" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "obr_disbursement_vouchers" ALTER COLUMN "payee" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "obr_items" ALTER COLUMN "payee" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "obr_main_data" ALTER COLUMN "payee" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "obr_requests" ALTER COLUMN "payee" DROP NOT NULL;