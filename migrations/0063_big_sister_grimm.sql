CREATE TABLE "payroll_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"payroll_id" text NOT NULL,
	"serial_no" integer NOT NULL,
	"name" text NOT NULL,
	"position" text NOT NULL,
	"id_no" text,
	"amount" numeric NOT NULL,
	"signature_no" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payrolls" (
	"id" text PRIMARY KEY NOT NULL,
	"payroll_no" text NOT NULL,
	"payroll_month" text NOT NULL,
	"purpose" text NOT NULL,
	"period_covered" text NOT NULL,
	"lgu" text NOT NULL,
	"fund" text NOT NULL,
	"sheet_number" integer DEFAULT 1 NOT NULL,
	"total_sheets" integer DEFAULT 1 NOT NULL,
	"authorized_official" text NOT NULL,
	"head_of_accounting" text NOT NULL,
	"head_of_treasury" text NOT NULL,
	"local_chief_executive" text NOT NULL,
	"disbursing_officer" text NOT NULL,
	"cafao_no" text,
	"cafao_date" text,
	"created_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "payrolls_payroll_no_unique" UNIQUE("payroll_no")
);
--> statement-breakpoint
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_payroll_id_payrolls_id_fk" FOREIGN KEY ("payroll_id") REFERENCES "public"."payrolls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;