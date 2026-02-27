CREATE TYPE "public"."esre_states" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TABLE "esre" (
	"id" text PRIMARY KEY NOT NULL,
	"check_request_date" timestamp with time zone NOT NULL,
	"main_data" text NOT NULL,
	"check_number" text,
	"funding_source" text,
	"dv_or_payroll_number" text,
	"ors_or_burs_number" text,
	"expense_class" text,
	"office" text,
	"expense_name" text,
	"account_code" text,
	"payee" text,
	"nature_of_payment" text,
	"amount" numeric NOT NULL,
	"check_status" text,
	"check_test" boolean DEFAULT false NOT NULL,
	"aa" text,
	"expense_type" text,
	"unknown" text,
	"check_issue_date" timestamp with time zone,
	"state" "esre_states" DEFAULT 'active' NOT NULL,
	"author_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "esre" ADD CONSTRAINT "esre_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;