CREATE TABLE "saaob_summary_of_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"parent_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saaob_summary_of_accounts_group" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"parent_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saaob_summary_of_accounts_linked_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"group_ref_id" text NOT NULL,
	"entry_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saaob_summary_of_accounts" ADD CONSTRAINT "saaob_summary_of_accounts_parent_id_saaob_summary_of_accounts_group_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."saaob_summary_of_accounts_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saaob_summary_of_accounts_group" ADD CONSTRAINT "saaob_summary_of_accounts_group_parent_id_saaob_summary_of_accounts_group_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."saaob_summary_of_accounts_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saaob_summary_of_accounts_linked_groups" ADD CONSTRAINT "saaob_summary_of_accounts_linked_groups_group_ref_id_saaob_entry_group_id_fk" FOREIGN KEY ("group_ref_id") REFERENCES "public"."saaob_entry_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saaob_summary_of_accounts_linked_groups" ADD CONSTRAINT "saaob_summary_of_accounts_linked_groups_entry_id_saaob_summary_of_accounts_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."saaob_summary_of_accounts"("id") ON DELETE no action ON UPDATE no action;