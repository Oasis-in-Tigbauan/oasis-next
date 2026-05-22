CREATE TYPE "public"."template_type" AS ENUM('header', 'footer');--> statement-breakpoint
CREATE TABLE "template_bucket" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"template_path" text NOT NULL,
	"template_type" "template_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
