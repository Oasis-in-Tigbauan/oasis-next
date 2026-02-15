ALTER TABLE "office" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "office" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;