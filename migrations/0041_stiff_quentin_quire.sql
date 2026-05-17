CREATE TYPE "public"."ppmp_project_type" AS ENUM('goods', 'infra', 'cons-serv');--> statement-breakpoint
CREATE TABLE "ppmp" (
	"id" text PRIMARY KEY NOT NULL,
	"general_description" text,
	"type_of_project" "ppmp_project_type" NOT NULL,
	"quantity_or_size" text NOT NULL,
	"recommended_mode_of_procurement" text,
	"eligible_for_conference" boolean DEFAULT false NOT NULL,
	"start_of_procurement_activity" timestamp with time zone NOT NULL,
	"end_of_procurement_activity" timestamp with time zone NOT NULL,
	"expected_delivery_period" timestamp with time zone NOT NULL,
	"saaob_id" text NOT NULL,
	"estimated_budget" numeric NOT NULL,
	"attached_supporting_documents" text,
	"remarks" text,
	"minor_group_id" text,
	"project_group_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ppmp_major_group" (
	"id" text PRIMARY KEY NOT NULL,
	"saaob_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ppmp_minor_group" (
	"id" text PRIMARY KEY NOT NULL,
	"lbac_id" text NOT NULL,
	"parent_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ppmp_project_group" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"parent_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ppmp" ADD CONSTRAINT "ppmp_saaob_id_saaob_entries_id_fk" FOREIGN KEY ("saaob_id") REFERENCES "public"."saaob_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppmp" ADD CONSTRAINT "ppmp_minor_group_id_ppmp_minor_group_id_fk" FOREIGN KEY ("minor_group_id") REFERENCES "public"."ppmp_minor_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppmp" ADD CONSTRAINT "ppmp_project_group_id_ppmp_project_group_id_fk" FOREIGN KEY ("project_group_id") REFERENCES "public"."ppmp_project_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppmp_major_group" ADD CONSTRAINT "ppmp_major_group_saaob_id_saaob_entries_id_fk" FOREIGN KEY ("saaob_id") REFERENCES "public"."saaob_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppmp_minor_group" ADD CONSTRAINT "ppmp_minor_group_lbac_id_lbac_items_id_fk" FOREIGN KEY ("lbac_id") REFERENCES "public"."lbac_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppmp_minor_group" ADD CONSTRAINT "ppmp_minor_group_parent_id_ppmp_major_group_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."ppmp_major_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppmp_project_group" ADD CONSTRAINT "ppmp_project_group_parent_id_ppmp_minor_group_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."ppmp_minor_group"("id") ON DELETE no action ON UPDATE no action;