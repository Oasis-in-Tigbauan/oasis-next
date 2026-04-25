ALTER TABLE "office_codes" ADD COLUMN "office_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "office_codes" ADD COLUMN "head_user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "office_codes" ADD CONSTRAINT "office_codes_office_id_office_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."office"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "office_codes" ADD CONSTRAINT "office_codes_head_user_id_user_id_fk" FOREIGN KEY ("head_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "office_codes" DROP COLUMN "office";--> statement-breakpoint
ALTER TABLE "office_codes" DROP COLUMN "head_user";