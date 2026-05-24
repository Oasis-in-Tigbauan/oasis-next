CREATE TABLE "app_notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"scope" text NOT NULL,
	"entity_id" text,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"href" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_notifications" ADD CONSTRAINT "app_notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_notifications_user_idx" ON "app_notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "app_notifications_scope_idx" ON "app_notifications" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "app_notifications_created_idx" ON "app_notifications" USING btree ("created_at");