ALTER TABLE "purchasing" ADD COLUMN "treasurer_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "purchasing" ADD COLUMN "requesting_user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "purchasing" ADD CONSTRAINT "purchasing_treasurer_id_user_id_fk" FOREIGN KEY ("treasurer_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchasing" ADD CONSTRAINT "purchasing_requesting_user_id_user_id_fk" FOREIGN KEY ("requesting_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;