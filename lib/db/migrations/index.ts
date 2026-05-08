import { aipMigration } from "@/lib/db/migrations/aip";
import { roleMigration } from "@/lib/db/migrations/role";

export const migrations = [
  roleMigration,
  aipMigration,
];
