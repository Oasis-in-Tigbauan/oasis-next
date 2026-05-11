import { aipMigration } from "@/lib/db/migrations/aip";
import { expenseCodesMigration } from "@/lib/db/migrations/expense-codes";
import { roleMigration } from "@/lib/db/migrations/role";
import { officeCodesMigration } from "@/lib/db/migrations/office-code";

export const migrations = [
  roleMigration,
  aipMigration,
  officeCodesMigration,
  expenseCodesMigration,
];
