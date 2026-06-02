CREATE TYPE "public"."saaob_statistic_groups" AS ENUM('budget', 'sum_per_sector');--> statement-breakpoint
CREATE TABLE "saaob_statistic_items" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "saaob_statistic_groups" NOT NULL,
	"is_group" boolean DEFAULT false NOT NULL,
	"parent_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saaob_statistic_selected_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"main_group_ref_id" text,
	"summary_of_account_ref_id" text,
	"ref_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "check_exclusive_arc" CHECK (("saaob_statistic_selected_groups"."main_group_ref_id" IS NOT NULL AND "saaob_statistic_selected_groups"."summary_of_account_ref_id" IS NULL) OR ("saaob_statistic_selected_groups"."main_group_ref_id" IS NULL AND "saaob_statistic_selected_groups"."summary_of_account_ref_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "saaob_statistic_items" ADD CONSTRAINT "saaob_statistic_items_parent_id_saaob_statistic_items_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."saaob_statistic_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saaob_statistic_selected_groups" ADD CONSTRAINT "saaob_statistic_selected_groups_main_group_ref_id_saaob_entry_group_id_fk" FOREIGN KEY ("main_group_ref_id") REFERENCES "public"."saaob_entry_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saaob_statistic_selected_groups" ADD CONSTRAINT "saaob_statistic_selected_groups_summary_of_account_ref_id_saaob_summary_of_accounts_id_fk" FOREIGN KEY ("summary_of_account_ref_id") REFERENCES "public"."saaob_summary_of_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saaob_statistic_selected_groups" ADD CONSTRAINT "saaob_statistic_selected_groups_ref_id_saaob_statistic_items_id_fk" FOREIGN KEY ("ref_id") REFERENCES "public"."saaob_statistic_items"("id") ON DELETE no action ON UPDATE no action;