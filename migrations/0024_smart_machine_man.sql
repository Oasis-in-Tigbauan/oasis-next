CREATE TABLE "expense_names" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_names_office_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"expense_name_id" text NOT NULL,
	"office_code_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "obr_main_data" (
	"id" text PRIMARY KEY NOT NULL,
	"obr_number" text NOT NULL,
	"alobs" text NOT NULL,
	"payee" text NOT NULL,
	"address" text NOT NULL,
	"responsibility_center_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expense_names_office_codes" ADD CONSTRAINT "expense_names_office_codes_expense_name_id_expense_names_id_fk" FOREIGN KEY ("expense_name_id") REFERENCES "public"."expense_names"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_names_office_codes" ADD CONSTRAINT "expense_names_office_codes_office_code_id_office_codes_id_fk" FOREIGN KEY ("office_code_id") REFERENCES "public"."office_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obr_main_data" ADD CONSTRAINT "obr_main_data_responsibility_center_id_office_codes_id_fk" FOREIGN KEY ("responsibility_center_id") REFERENCES "public"."office_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "expense_names_office_codes_unique" ON "expense_names_office_codes" USING btree ("expense_name_id","office_code_id");