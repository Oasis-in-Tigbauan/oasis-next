import { aipMigration } from "@/lib/db/migrations/aip";
import { expenseCodesMigration } from "@/lib/db/migrations/expense-codes";
import { lbacMigration } from "@/lib/db/migrations/lbac";
import { roleMigration } from "@/lib/db/migrations/role";
import { officeCodesMigration } from "@/lib/db/migrations/office-code";
import { saaobEntriesMigration } from "@/lib/db/migrations/saaob";
import { supplementalMigration } from "@/lib/db/migrations/supplemental";
import { MigratorFn } from "../types";

// Check for flags
const flags = new Set(process.argv.slice(2));

const migrations: MigratorFn[] = [
  roleMigration,
];

if (!flags.has("--critical-only")) {
  migrations.push(
    ...[
      aipMigration,
      officeCodesMigration,
      expenseCodesMigration,
      lbacMigration,
      supplementalMigration,
      saaobEntriesMigration,
    ],
  );
}

export { migrations };
