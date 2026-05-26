CREATE TYPE "public"."aro_type" AS ENUM('ps', 'mooe', 'finex', 'capex');--> statement-breakpoint
ALTER TABLE "lbac_items" ADD COLUMN "aro_type" "aro_type";--> statement-breakpoint
ALTER TABLE "lbac_items" ADD COLUMN "aro_link" text;--> statement-breakpoint
ALTER TABLE "lbac_items" ADD CONSTRAINT "lbac_items_aro_link_aro_office_definitions_id_fk" FOREIGN KEY ("aro_link") REFERENCES "public"."aro_office_definitions"("id") ON DELETE no action ON UPDATE no action;