CREATE TABLE "lbac_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"aip_ref_code" text,
	"string" text NOT NULL,
	"implementing_unit_id" text,
	"office_id" text NOT NULL,
	"parent_id" text,
	"author_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lbac_items" (
	"id" text PRIMARY KEY NOT NULL,
	"aip_ref_code" text,
	"mfo_ppa" text NOT NULL,
	"major_final_output" text,
	"performance_output_indicator" text,
	"target_for_budget_year" text,
	"proposed_budget_ps" numeric NOT NULL,
	"proposed_budget_mooe" numeric NOT NULL,
	"proposed_budget_co" numeric NOT NULL,
	"proposed_budget_total" numeric NOT NULL,
	"remarks" text,
	"remarks_for_allocations" text,
	"gadable" boolean DEFAULT false NOT NULL,
	"tagging" text,
	"ammount_attributed" numeric,
	"physical_targets" text,
	"prior_year_accomplishments" text,
	"remarks_for_other_metadata" text,
	"implementing_unit_id" text,
	"expense_code_id" text,
	"parent_id" text NOT NULL,
	"author_id" text NOT NULL,
	"office_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lbac_quarterly_report" (
	"id" text PRIMARY KEY NOT NULL,
	"lbac_target_id" text NOT NULL,
	"prior_year_accomplishments" text,
	"physical_target_q1" text,
	"physical_target_q2" text,
	"physical_target_q3" text,
	"physical_target_q4" text,
	"physical_target_total" text,
	"actual_physical_performance_q1" text,
	"actual_physical_performance_q2" text,
	"actual_physical_performance_q3" text,
	"actual_physical_performance_q4" text,
	"actual_physical_performance_total" text,
	"variance" text,
	"accomplishment_percentage" text,
	"remarks" text,
	"target_for_budget_year" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lbac_groups" ADD CONSTRAINT "lbac_groups_aip_ref_code_aip_references_id_fk" FOREIGN KEY ("aip_ref_code") REFERENCES "public"."aip_references"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lbac_groups" ADD CONSTRAINT "lbac_groups_implementing_unit_id_office_codes_id_fk" FOREIGN KEY ("implementing_unit_id") REFERENCES "public"."office_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lbac_groups" ADD CONSTRAINT "lbac_groups_office_id_office_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."office"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lbac_groups" ADD CONSTRAINT "lbac_groups_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lbac_groups" ADD CONSTRAINT "lbac_groups_parent_id_lbac_groups_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."lbac_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lbac_items" ADD CONSTRAINT "lbac_items_aip_ref_code_aip_references_id_fk" FOREIGN KEY ("aip_ref_code") REFERENCES "public"."aip_references"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lbac_items" ADD CONSTRAINT "lbac_items_implementing_unit_id_office_codes_id_fk" FOREIGN KEY ("implementing_unit_id") REFERENCES "public"."office_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lbac_items" ADD CONSTRAINT "lbac_items_expense_code_id_expense_classes_id_fk" FOREIGN KEY ("expense_code_id") REFERENCES "public"."expense_classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lbac_items" ADD CONSTRAINT "lbac_items_parent_id_lbac_groups_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."lbac_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lbac_items" ADD CONSTRAINT "lbac_items_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lbac_items" ADD CONSTRAINT "lbac_items_office_id_office_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."office"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lbac_quarterly_report" ADD CONSTRAINT "lbac_quarterly_report_lbac_target_id_lbac_items_id_fk" FOREIGN KEY ("lbac_target_id") REFERENCES "public"."lbac_items"("id") ON DELETE no action ON UPDATE no action;