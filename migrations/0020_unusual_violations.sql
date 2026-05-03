CREATE TYPE "public"."check_status_enum" AS ENUM('PAID', 'FOR RELEASE', 'ON HOLD', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "esre" (
	"id" text PRIMARY KEY NOT NULL,
	"check_number" text,
	"funding_source_id" text NOT NULL,
	"dv_or_payroll_number" text,
	"obr_item_id" text,
	"payee" text NOT NULL,
	"nature_of_payment" text NOT NULL,
	"amount" numeric NOT NULL,
	"check_status" "check_status_enum",
	"charges" text,
	"remarks" text,
	"expense_type_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "esre" ADD CONSTRAINT "esre_funding_source_id_fund_types_id_fk" FOREIGN KEY ("funding_source_id") REFERENCES "public"."fund_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esre" ADD CONSTRAINT "esre_obr_item_id_obr_items_id_fk" FOREIGN KEY ("obr_item_id") REFERENCES "public"."obr_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esre" ADD CONSTRAINT "esre_expense_type_id_expense_type_id_fk" FOREIGN KEY ("expense_type_id") REFERENCES "public"."expense_type"("id") ON DELETE no action ON UPDATE no action;