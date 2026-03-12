ALTER TABLE "office_codes" DROP CONSTRAINT "office_codes_head_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "office_codes" ADD COLUMN "head_user" text;--> statement-breakpoint
ALTER TABLE "office_codes" DROP COLUMN "head_user_id";