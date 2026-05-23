ALTER TABLE "lbac_groups" DROP CONSTRAINT "lbac_groups_office_id_office_id_fk";
--> statement-breakpoint
ALTER TABLE "lbac_items" DROP CONSTRAINT "lbac_items_office_id_office_id_fk";
--> statement-breakpoint
ALTER TABLE "lbac_groups" DROP COLUMN "office_id";--> statement-breakpoint
ALTER TABLE "lbac_items" DROP COLUMN "office_id";