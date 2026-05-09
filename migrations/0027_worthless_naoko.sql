ALTER TABLE "esre" DROP CONSTRAINT "esre_obr_item_id_obr_items_id_fk";
--> statement-breakpoint
ALTER TABLE "obr_main_data" ADD COLUMN "remarks" text;--> statement-breakpoint
ALTER TABLE "obr_main_data" ADD COLUMN "author_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "esre" ADD CONSTRAINT "esre_obr_item_id_obr_main_data_id_fk" FOREIGN KEY ("obr_item_id") REFERENCES "public"."obr_main_data"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obr_main_data" ADD CONSTRAINT "obr_main_data_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;