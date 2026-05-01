CREATE TYPE "public"."disbursement_statuses" AS ENUM('PREPARATION', 'PROCESSING', 'ON HOLD', 'FOR RELEASE', 'PAID');--> statement-breakpoint
CREATE TYPE "public"."tax_types" AS ENUM('vat-g', 'vat-s', 'nvat-g', 'nvat-s');--> statement-breakpoint
CREATE TABLE "obr_disbursement_vouchers" (
	"id" text PRIMARY KEY NOT NULL,
	"disbursement_voucher_number" text NOT NULL,
	"payee" text NOT NULL,
	"address" text NOT NULL,
	"particulars" text NOT NULL,
	"pr_number" text,
	"gross_amount" numeric,
	"vatable_amount" numeric,
	"tax_type" "tax_types",
	"status" "disbursement_statuses",
	"reponsibility_center_id" text NOT NULL,
	"head_user_id" text NOT NULL,
	"head_name" text NOT NULL,
	"head_position_name" text NOT NULL,
	"accountant_user_id" text NOT NULL,
	"accountant_name" text NOT NULL,
	"accountant_position_name" text NOT NULL,
	"treasurer_user_id" text NOT NULL,
	"treasurer_name" text NOT NULL,
	"treasurer_position_name" text NOT NULL,
	"mayor_id" text NOT NULL,
	"mayor_name" text NOT NULL,
	"mayor_position_name" text NOT NULL,
	"fund_type_id" text,
	"request_id" text NOT NULL,
	"disbursed_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "obr_disbursement_vouchers" ADD CONSTRAINT "obr_disbursement_vouchers_reponsibility_center_id_office_codes_id_fk" FOREIGN KEY ("reponsibility_center_id") REFERENCES "public"."office_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obr_disbursement_vouchers" ADD CONSTRAINT "obr_disbursement_vouchers_head_user_id_user_id_fk" FOREIGN KEY ("head_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obr_disbursement_vouchers" ADD CONSTRAINT "obr_disbursement_vouchers_accountant_user_id_user_id_fk" FOREIGN KEY ("accountant_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obr_disbursement_vouchers" ADD CONSTRAINT "obr_disbursement_vouchers_treasurer_user_id_user_id_fk" FOREIGN KEY ("treasurer_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obr_disbursement_vouchers" ADD CONSTRAINT "obr_disbursement_vouchers_mayor_id_user_id_fk" FOREIGN KEY ("mayor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obr_disbursement_vouchers" ADD CONSTRAINT "obr_disbursement_vouchers_fund_type_id_fund_types_id_fk" FOREIGN KEY ("fund_type_id") REFERENCES "public"."fund_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obr_disbursement_vouchers" ADD CONSTRAINT "obr_disbursement_vouchers_request_id_obr_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."obr_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obr_disbursement_vouchers" ADD CONSTRAINT "obr_disbursement_vouchers_disbursed_by_user_id_fk" FOREIGN KEY ("disbursed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;