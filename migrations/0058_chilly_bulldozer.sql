CREATE TABLE "lbac_statement_of_expenditures" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_id" text,
	"particulars" text NOT NULL,
	"account_code" text,
	"estimate" numeric,
	"actual" numeric,
	"remarks" text,
	"for_fiscal_year" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lbac_statement_of_expenditures" ADD CONSTRAINT "lbac_statement_of_expenditures_parent_id_lbac_statement_of_expenditures_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."lbac_statement_of_expenditures"("id") ON DELETE no action ON UPDATE no action;