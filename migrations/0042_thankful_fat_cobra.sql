CREATE TABLE "obr_disbursement_electronic" (
	"id" text PRIMARY KEY NOT NULL,
	"voucher_id" text NOT NULL,
	"billing_name" text NOT NULL,
	"meter_serial" text NOT NULL,
	"account" text NOT NULL,
	"gross" numeric NOT NULL,
	"vatable_sales" numeric NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "obr_disbursement_electronic" ADD CONSTRAINT "obr_disbursement_electronic_voucher_id_obr_disbursement_vouchers_id_fk" FOREIGN KEY ("voucher_id") REFERENCES "public"."obr_disbursement_vouchers"("id") ON DELETE no action ON UPDATE no action;