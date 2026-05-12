import { aipMigration } from "@/lib/db/migrations/aip";
import { expenseCodesMigration } from "@/lib/db/migrations/expense-codes";
import { lbacMigration } from "@/lib/db/migrations/lbac";
import { roleMigration } from "@/lib/db/migrations/role";
import { officeCodesMigration } from "@/lib/db/migrations/office-code";
import { supplementalMigration } from "@/lib/db/migrations/supplemental";

export const migrations = [
  roleMigration,
  aipMigration,
  officeCodesMigration,
  expenseCodesMigration,
  lbacMigration,
  supplementalMigration,
];
