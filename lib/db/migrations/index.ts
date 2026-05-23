import { aipMigration } from "@/lib/db/migrations/aip";
import { expenseCodesMigration } from "@/lib/db/migrations/expense-codes";
import { expenseTypesMigration } from "@/lib/db/migrations/expense-type";
import { lbacMigration } from "@/lib/db/migrations/lbac";
import { obrEntriesMigration } from "@/lib/db/migrations/obr";
import { officeCodesMigration } from "@/lib/db/migrations/office-code";
import { procurementTypesMigration } from "@/lib/db/migrations/procurement-types";
import { saaobEntriesMigration } from "@/lib/db/migrations/saaob";
import { supplementalMigration } from "@/lib/db/migrations/supplemental";
import { MigratorFn } from "@/lib/db/types";

const migrations: MigratorFn[] = [
  aipMigration,
  officeCodesMigration,
  expenseCodesMigration,
  saaobEntriesMigration,
  lbacMigration,
  supplementalMigration,
  obrEntriesMigration,
  procurementTypesMigration,
  expenseTypesMigration,
];

export { migrations };
