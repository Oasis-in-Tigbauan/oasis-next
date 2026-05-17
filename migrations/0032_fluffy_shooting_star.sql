CREATE TABLE "saaob_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"account_code" text,
	"annual_budget" numeric NOT NULL,
	"parent_id" text NOT NULL,
	"expense_code" text,
	"author_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saaob_entry_group" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"parent_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saaob_entries" ADD CONSTRAINT "saaob_entries_parent_id_saaob_entry_group_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."saaob_entry_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saaob_entries" ADD CONSTRAINT "saaob_entries_expense_code_expense_classes_id_fk" FOREIGN KEY ("expense_code") REFERENCES "public"."expense_classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saaob_entries" ADD CONSTRAINT "saaob_entries_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saaob_entry_group" ADD CONSTRAINT "saaob_entry_group_parent_id_saaob_entry_group_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."saaob_entry_group"("id") ON DELETE no action ON UPDATE no action;