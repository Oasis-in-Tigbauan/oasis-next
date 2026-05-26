CREATE TYPE "public"."lbac_budget_type" AS ENUM('ab', 'sb', 'rb');--> statement-breakpoint
ALTER TABLE "lbac_items" ADD COLUMN "budget_type" "lbac_budget_type";