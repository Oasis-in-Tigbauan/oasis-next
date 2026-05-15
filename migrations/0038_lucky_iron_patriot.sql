CREATE TABLE "mode_of_procurements" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "purchasing" (
	"id" text PRIMARY KEY NOT NULL,
	"pr_number" text NOT NULL,
	"purchse_order_number" text,
	"supplier" text,
	"address" text,
	"tin_number" text,
	"place_of_delivery" text,
	"date_of_delivery" timestamp with time zone,
	"delivery_term" text,
	"payment_term" text,
	"unit" text NOT NULL,
	"item_description" text NOT NULL,
	"quantity" numeric NOT NULL,
	"unit_cost" numeric NOT NULL,
	"purpose" text NOT NULL,
	"requesting_office_id" text NOT NULL,
	"head_of_office_id" text NOT NULL,
	"head_of_office_name" text NOT NULL,
	"head_of_office_position" text NOT NULL,
	"procurement_id" text,
	"approver_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchasing_aip" (
	"id" text PRIMARY KEY NOT NULL,
	"lbac_reference_id" text NOT NULL,
	"aip_code" text NOT NULL,
	"ppa" text NOT NULL,
	"source_of_fund" text,
	"amount_charged" numeric
);
--> statement-breakpoint
ALTER TABLE "purchasing" ADD CONSTRAINT "purchasing_requesting_office_id_office_id_fk" FOREIGN KEY ("requesting_office_id") REFERENCES "public"."office"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing" ADD CONSTRAINT "purchasing_head_of_office_id_user_id_fk" FOREIGN KEY ("head_of_office_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing" ADD CONSTRAINT "purchasing_procurement_id_mode_of_procurements_id_fk" FOREIGN KEY ("procurement_id") REFERENCES "public"."mode_of_procurements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing" ADD CONSTRAINT "purchasing_approver_id_user_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing_aip" ADD CONSTRAINT "purchasing_aip_lbac_reference_id_lbac_items_id_fk" FOREIGN KEY ("lbac_reference_id") REFERENCES "public"."lbac_items"("id") ON DELETE no action ON UPDATE no action;