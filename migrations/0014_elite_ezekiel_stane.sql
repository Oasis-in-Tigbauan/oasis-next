CREATE TYPE "public"."obr_request_signing_status" AS ENUM('pending', 'approved', 'binned');--> statement-breakpoint
CREATE TYPE "public"."obr_request_type" AS ENUM('basic', 'advanced');--> statement-breakpoint
CREATE TABLE "obr_request_approvers" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"position_id" text NOT NULL,
	"signing_status" "obr_request_signing_status" NOT NULL,
	"reason" text,
	"acted_user_id" text,
	"acted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "obr_request_items" (
	"id" text PRIMARY KEY NOT NULL,
	"particulars" text NOT NULL,
	"amount" numeric NOT NULL,
	"request_id" text NOT NULL,
	"reponsibility_center_id" text NOT NULL,
	"expense_code_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "obr_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"request_number" text NOT NULL,
	"payee" text NOT NULL,
	"office_address" text NOT NULL,
	"obr_number" text,
	"pr_number" text,
	"request_type" "obr_request_type" NOT NULL,
	"publisher_id" text NOT NULL,
	"originating_office_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "obr_request_approvers" ADD CONSTRAINT "obr_request_approvers_request_id_obr_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."obr_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obr_request_approvers" ADD CONSTRAINT "obr_request_approvers_position_id_office_position_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."office_position"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obr_request_approvers" ADD CONSTRAINT "obr_request_approvers_acted_user_id_user_id_fk" FOREIGN KEY ("acted_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obr_request_items" ADD CONSTRAINT "obr_request_items_request_id_obr_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."obr_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obr_request_items" ADD CONSTRAINT "obr_request_items_reponsibility_center_id_office_codes_id_fk" FOREIGN KEY ("reponsibility_center_id") REFERENCES "public"."office_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obr_request_items" ADD CONSTRAINT "obr_request_items_expense_code_id_expense_classes_id_fk" FOREIGN KEY ("expense_code_id") REFERENCES "public"."expense_classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obr_requests" ADD CONSTRAINT "obr_requests_publisher_id_user_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obr_requests" ADD CONSTRAINT "obr_requests_originating_office_id_office_id_fk" FOREIGN KEY ("originating_office_id") REFERENCES "public"."office"("id") ON DELETE no action ON UPDATE no action;