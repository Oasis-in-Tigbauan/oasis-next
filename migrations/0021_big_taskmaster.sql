CREATE TYPE "public"."supplemental_type" AS ENUM('less', 'add');--> statement-breakpoint
CREATE TABLE "supplemental" (
	"id" text PRIMARY KEY NOT NULL,
	"supplemental_or_augmentation" text,
	"charges" text,
	"amount" numeric NOT NULL,
	"aip_code" text,
	"supplemental_type" "supplemental_type" NOT NULL,
	"author_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "supplemental" ADD CONSTRAINT "supplemental_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;