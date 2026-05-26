CREATE TABLE "lbac_monitoring" (
	"id" text PRIMARY KEY NOT NULL,
	"ab" text,
	"actual_accomplishment" text,
	"ab_estimated_cost" numeric,
	"actual_expenditure" numeric,
	"remarks" text,
	"item_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lbac_monitoring" ADD CONSTRAINT "lbac_monitoring_item_id_lbac_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."lbac_items"("id") ON DELETE no action ON UPDATE no action;