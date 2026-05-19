CREATE TYPE "public"."travel_order_category" AS ENUM('official', 'personal');--> statement-breakpoint
CREATE TYPE "public"."travel_order_status" AS ENUM('co-hr', 'filed', 'missing', 'cancelled');--> statement-breakpoint
CREATE TABLE "travel_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"ref_number" serial NOT NULL,
	"travel_order_status" "travel_order_status" NOT NULL,
	"travel_order_category" "travel_order_category" NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone,
	"location" text NOT NULL,
	"purpose" text NOT NULL,
	"subject_to_claims" boolean DEFAULT true NOT NULL,
	"notes" text,
	"requestor_id" text NOT NULL,
	"requestor_office_id" text NOT NULL,
	"requestor_office_position" text NOT NULL,
	"approver_id" text,
	"approver_office_position" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "travel_orders_ref_number_unique" UNIQUE("ref_number")
);
--> statement-breakpoint
ALTER TABLE "travel_orders" ADD CONSTRAINT "travel_orders_requestor_id_user_id_fk" FOREIGN KEY ("requestor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_orders" ADD CONSTRAINT "travel_orders_requestor_office_id_office_id_fk" FOREIGN KEY ("requestor_office_id") REFERENCES "public"."office"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_orders" ADD CONSTRAINT "travel_orders_requestor_office_position_office_position_id_fk" FOREIGN KEY ("requestor_office_position") REFERENCES "public"."office_position"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_orders" ADD CONSTRAINT "travel_orders_approver_id_user_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_orders" ADD CONSTRAINT "travel_orders_approver_office_position_office_position_id_fk" FOREIGN KEY ("approver_office_position") REFERENCES "public"."office_position"("id") ON DELETE no action ON UPDATE no action;