ALTER TABLE "esre" ADD COLUMN "saaob_id" text;--> statement-breakpoint
ALTER TABLE "lbac_items" ADD COLUMN "saaob_id" text;--> statement-breakpoint
ALTER TABLE "obr_main_data" ADD COLUMN "saaob_id" text;--> statement-breakpoint
ALTER TABLE "saaob_entries" ADD COLUMN "remarks" text;--> statement-breakpoint
ALTER TABLE "esre" ADD CONSTRAINT "esre_saaob_id_saaob_entries_id_fk" FOREIGN KEY ("saaob_id") REFERENCES "public"."saaob_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lbac_items" ADD CONSTRAINT "lbac_items_saaob_id_saaob_entries_id_fk" FOREIGN KEY ("saaob_id") REFERENCES "public"."saaob_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obr_main_data" ADD CONSTRAINT "obr_main_data_saaob_id_saaob_entries_id_fk" FOREIGN KEY ("saaob_id") REFERENCES "public"."saaob_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esre" DROP COLUMN "charges";