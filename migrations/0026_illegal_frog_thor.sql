CREATE TABLE "obr_main_aip_references" (
	"id" text PRIMARY KEY NOT NULL,
	"aip_reference_id" text,
	"aip_reference_code" text,
	"amount" numeric,
	"idx" integer NOT NULL,
	"obr_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "obr_main_data" ADD COLUMN "request_source_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "obr_main_aip_references" ADD CONSTRAINT "obr_main_aip_references_aip_reference_id_aip_references_id_fk" FOREIGN KEY ("aip_reference_id") REFERENCES "public"."aip_references"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obr_main_aip_references" ADD CONSTRAINT "obr_main_aip_references_obr_id_obr_main_data_id_fk" FOREIGN KEY ("obr_id") REFERENCES "public"."obr_main_data"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obr_main_data" ADD CONSTRAINT "obr_main_data_request_source_id_obr_requests_id_fk" FOREIGN KEY ("request_source_id") REFERENCES "public"."obr_requests"("id") ON DELETE no action ON UPDATE no action;