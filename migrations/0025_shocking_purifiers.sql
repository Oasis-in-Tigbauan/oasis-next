CREATE TABLE "expense_classes_office_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"expense_name_id" text NOT NULL,
	"office_code_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expense_names" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "expense_names_office_codes" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "expense_names" CASCADE;--> statement-breakpoint
DROP TABLE "expense_names_office_codes" CASCADE;--> statement-breakpoint
ALTER TABLE "expense_classes" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "obr_main_data" ADD COLUMN "pr_number" text;--> statement-breakpoint
ALTER TABLE "obr_main_data" ADD COLUMN "particulars" text NOT NULL;--> statement-breakpoint
ALTER TABLE "obr_main_data" ADD COLUMN "obligated" numeric NOT NULL;--> statement-breakpoint
ALTER TABLE "obr_main_data" ADD COLUMN "pr_amount" numeric;--> statement-breakpoint
ALTER TABLE "obr_main_data" ADD COLUMN "expense_code_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "expense_classes_office_codes" ADD CONSTRAINT "expense_classes_office_codes_expense_name_id_expense_classes_id_fk" FOREIGN KEY ("expense_name_id") REFERENCES "public"."expense_classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_classes_office_codes" ADD CONSTRAINT "expense_classes_office_codes_office_code_id_office_codes_id_fk" FOREIGN KEY ("office_code_id") REFERENCES "public"."office_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "expense_names_office_codes_unique" ON "expense_classes_office_codes" USING btree ("expense_name_id","office_code_id");--> statement-breakpoint
ALTER TABLE "obr_main_data" ADD CONSTRAINT "obr_main_data_expense_code_id_expense_classes_id_fk" FOREIGN KEY ("expense_code_id") REFERENCES "public"."expense_classes"("id") ON DELETE no action ON UPDATE no action;