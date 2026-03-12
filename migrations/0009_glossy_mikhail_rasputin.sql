CREATE TABLE "office_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"aa" text NOT NULL,
	"code" text,
	"sector" text,
	"function" text,
	"lift_office" text,
	"sub_office" text,
	"office" text,
	"head_user_name" text,
	"head_user_position" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
DROP TABLE "esre" CASCADE;