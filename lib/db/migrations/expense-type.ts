import { count } from "drizzle-orm";

import type { MigratorFn } from "@/lib/db/types";
import * as schema from "@/lib/db/schema";

export const expenseTypesMigration: MigratorFn = async (client): Promise<void> => {
  console.log("Migrating Expense Types...");

  // Check if there are items. Skip if there are items.
  const [result] = await client
    .select({ count: count(schema.expenseType.id)})
    .from(schema.expenseType);
  if (Number(result.count) > 0) {
    console.log("-> Skipped due to expense types exists.");
    return;
  }

  const expenseTypesToSeed = [
    "PS",
    "MOOE",
    "CO",
    "FINEX",
    "DEPUTIZED REMITTANCE",
  ];

  await client.insert(schema.expenseType)
    .values(expenseTypesToSeed.map(x => ({
      name: x,
    })));
};
