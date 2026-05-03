CREATE TABLE "obr_items" (
	"id" text PRIMARY KEY NOT NULL,
	"payee" text NOT NULL,
	"address" text NOT NULL,
	"particulars" text NOT NULL,
	"requesting_official_id" text NOT NULL,
	"disbursement_ref_id" text NOT NULL,
	"disbursed_by" text NOT NULL,
	"request_id" text NOT NULL,
	"request_item_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "obr_office_item" (
	"id" text PRIMARY KEY NOT NULL,
	"amount" numeric NOT NULL,
	"reponsibility_center_id" text NOT NULL,
	"expense_code_id" text NOT NULL,
	"item_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "obr_disbursement_vouchers" ADD COLUMN "request_item_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "obr_items" ADD CONSTRAINT "obr_items_requesting_official_id_user_id_fk" FOREIGN KEY ("requesting_official_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obr_items" ADD CONSTRAINT "obr_items_disbursement_ref_id_obr_disbursement_vouchers_id_fk" FOREIGN KEY ("disbursement_ref_id") REFERENCES "public"."obr_disbursement_vouchers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obr_items" ADD CONSTRAINT "obr_items_disbursed_by_user_id_fk" FOREIGN KEY ("disbursed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obr_items" ADD CONSTRAINT "obr_items_request_id_obr_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."obr_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obr_items" ADD CONSTRAINT "obr_items_request_item_id_obr_request_items_id_fk" FOREIGN KEY ("request_item_id") REFERENCES "public"."obr_request_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obr_office_item" ADD CONSTRAINT "obr_office_item_reponsibility_center_id_office_codes_id_fk" FOREIGN KEY ("reponsibility_center_id") REFERENCES "public"."office_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obr_office_item" ADD CONSTRAINT "obr_office_item_expense_code_id_expense_classes_id_fk" FOREIGN KEY ("expense_code_id") REFERENCES "public"."expense_classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obr_office_item" ADD CONSTRAINT "obr_office_item_item_id_obr_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."obr_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obr_disbursement_vouchers" ADD CONSTRAINT "obr_disbursement_vouchers_request_item_id_obr_request_items_id_fk" FOREIGN KEY ("request_item_id") REFERENCES "public"."obr_request_items"("id") ON DELETE no action ON UPDATE no action;