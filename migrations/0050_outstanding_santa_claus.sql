CREATE TABLE "lbac_collection_performance_data" (
	"id" text PRIMARY KEY NOT NULL,
	"particulars" text NOT NULL,
	"account_code" text NOT NULL,
	"income_target" numeric NOT NULL,
	"group_id" text NOT NULL,
	"author_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lbac_collection_performance_group" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"parent_id" text,
	"author_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lbac_collection_performance_monthly_data" (
	"id" text PRIMARY KEY NOT NULL,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"quarter" integer NOT NULL,
	"value" numeric NOT NULL,
	"data_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lbac_collection_performance_data" ADD CONSTRAINT "lbac_collection_performance_data_group_id_lbac_collection_performance_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."lbac_collection_performance_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lbac_collection_performance_data" ADD CONSTRAINT "lbac_collection_performance_data_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lbac_collection_performance_group" ADD CONSTRAINT "lbac_collection_performance_group_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lbac_collection_performance_group" ADD CONSTRAINT "lbac_collection_performance_group_parent_id_lbac_collection_performance_group_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."lbac_collection_performance_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lbac_collection_performance_monthly_data" ADD CONSTRAINT "lbac_collection_performance_monthly_data_data_id_lbac_collection_performance_data_id_fk" FOREIGN KEY ("data_id") REFERENCES "public"."lbac_collection_performance_data"("id") ON DELETE no action ON UPDATE no action;