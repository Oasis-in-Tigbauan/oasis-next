ALTER TABLE "lbac_items" ADD COLUMN "proposed_budget_fe" numeric NOT NULL;--> statement-breakpoint
ALTER TABLE "supplemental" ADD COLUMN "aip_ref_code" text;--> statement-breakpoint
ALTER TABLE "supplemental" ADD CONSTRAINT "supplemental_aip_ref_code_aip_references_id_fk" FOREIGN KEY ("aip_ref_code") REFERENCES "public"."aip_references"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lbac_items" DROP COLUMN "proposed_budget_total";--> statement-breakpoint
ALTER TABLE "supplemental" DROP COLUMN "aip_code";