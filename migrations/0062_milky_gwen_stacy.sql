CREATE TYPE "public"."leave_commutation" AS ENUM('not-requested', 'requested');--> statement-breakpoint
CREATE TABLE "leave_applications" (
	"id" text PRIMARY KEY NOT NULL,
	"ref_number" serial NOT NULL,
	"last_name" text NOT NULL,
	"first_name" text NOT NULL,
	"middle_name" text,
	"date_of_filing" text NOT NULL,
	"position" text NOT NULL,
	"monthly_salary" numeric NOT NULL,
	"leave_types" text[] NOT NULL,
	"other_leave_description" text,
	"vacation_location" text,
	"vacation_location_details" text,
	"sick_location" text,
	"illness_details" text,
	"study_purpose" text,
	"other_purposes" text[] NOT NULL,
	"working_days" text NOT NULL,
	"leave_start_date" text NOT NULL,
	"commutation" "leave_commutation" NOT NULL,
	"approved_by" text,
	"approved_by_position" text,
	"requestor_id" text NOT NULL,
	"requestor_office_id" text NOT NULL,
	"requestor_office_position" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "leave_applications_ref_number_unique" UNIQUE("ref_number")
);
--> statement-breakpoint
ALTER TABLE "leave_applications" ADD CONSTRAINT "leave_applications_requestor_id_user_id_fk" FOREIGN KEY ("requestor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_applications" ADD CONSTRAINT "leave_applications_requestor_office_id_office_id_fk" FOREIGN KEY ("requestor_office_id") REFERENCES "public"."office"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_applications" ADD CONSTRAINT "leave_applications_requestor_office_position_office_position_id_fk" FOREIGN KEY ("requestor_office_position") REFERENCES "public"."office_position"("id") ON DELETE no action ON UPDATE no action;