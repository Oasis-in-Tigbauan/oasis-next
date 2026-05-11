ALTER TABLE "lbac_quarterly_report" DROP CONSTRAINT "lbac_quarterly_report_lbac_target_id_lbac_items_id_fk";
--> statement-breakpoint
ALTER TABLE "lbac_items" ADD COLUMN "lbac_quarterly_report" text NOT NULL;--> statement-breakpoint
ALTER TABLE "lbac_items" ADD CONSTRAINT "lbac_items_lbac_quarterly_report_lbac_quarterly_report_id_fk" FOREIGN KEY ("lbac_quarterly_report") REFERENCES "public"."lbac_quarterly_report"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lbac_quarterly_report" DROP COLUMN "lbac_target_id";