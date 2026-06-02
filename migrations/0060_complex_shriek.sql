ALTER TABLE "saaob_statistic_selected_groups" DROP CONSTRAINT "saaob_statistic_selected_groups_ref_id_saaob_statistic_items_id_fk";
--> statement-breakpoint
ALTER TABLE "saaob_statistic_selected_groups" ADD CONSTRAINT "saaob_statistic_selected_groups_ref_id_saaob_statistic_items_id_fk" FOREIGN KEY ("ref_id") REFERENCES "public"."saaob_statistic_items"("id") ON DELETE cascade ON UPDATE no action;