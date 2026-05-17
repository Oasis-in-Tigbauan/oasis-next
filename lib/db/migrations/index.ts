import { aipMigration } from "@/lib/db/migrations/aip";
import { expenseCodesMigration } from "@/lib/db/migrations/expense-codes";
import { lbacMigration } from "@/lib/db/migrations/lbac";
import { roleMigration } from "@/lib/db/migrations/role";
import { obrEntriesMigration } from "@/lib/db/migrations/obr";
import { officeCodesMigration } from "@/lib/db/migrations/office-code";
import { procurementTypesMigration } from "@/lib/db/migrations/procurement-types";
import { saaobEntriesMigration } from "@/lib/db/migrations/saaob";
import { supplementalMigration } from "@/lib/db/migrations/supplemental";
import { MigratorFn } from "@/lib/db/types";

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
      saaobEntriesMigration,
      lbacMigration,
      supplementalMigration,
      obrEntriesMigration,
      procurementTypesMigration,
    ],
  );
}

export { migrations };
