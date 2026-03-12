CREATE TABLE "expense_classes" (
	"id" text PRIMARY KEY NOT NULL,
	"account_name" text NOT NULL,
	"fpp" text,
	"classification" text,
	"sub_classification" text,
	"group" text,
	"account_code" text,
	"class" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
