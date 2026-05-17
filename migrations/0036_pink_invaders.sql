ALTER TABLE "obr_main_data" ALTER COLUMN "request_source_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "supplemental" ADD COLUMN "saaob_id" text;--> statement-breakpoint
ALTER TABLE "supplemental" ADD CONSTRAINT "supplemental_saaob_id_saaob_entries_id_fk" FOREIGN KEY ("saaob_id") REFERENCES "public"."saaob_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplemental" DROP COLUMN "charges";