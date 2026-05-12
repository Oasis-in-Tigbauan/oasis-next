import { count } from "drizzle-orm";
import fs from "fs/promises";
import path from "path";

import type { MigratorFn } from "@/lib/db/types";
import { expenseClasses } from "@/lib/db/schema";

export const expenseCodesMigration: MigratorFn = async (client): Promise<void> => {
  console.log("Migrating Expense Codes...");

  // Check if there are items. Skip if there are items.
  const [result] = await client
    .select({ count: count(expenseClasses.id )})
    .from(expenseClasses);
  if (Number(result.count) > 0) {
    console.log("-> Skipped due to expense codes exists.");
    return;
  }

  // Create migrations
  const codes = await read();
  await client
    .insert(expenseClasses)
    .values(codes.map(c => ({
      accountName: c["account_name"],
      fpp: c["fpp"],
      classification: c["classification"],
      subClassification: c["sub_classification"],
      group: c["group"],
      accountCode: c["account_code"],
      expenseClass: c["expense_class"],
    })));
};

async function read(): Promise<Record<string, string>[]> {
  const filePath = path.join(__dirname, "./data/expense-codes.tsv");
  const file = await fs.readFile(filePath, "utf8");

  // Read lines
  const lines = file.split(/\r?\n/).map(x => x.split("\t"));

  const projected: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const obj: Record<string, string> = {};
    obj["account_name"] = lines[i][0];
    obj["fpp"] = lines[i][1];
    obj["classification"] = lines[i][2];
    obj["sub_classification"] = lines[i][3];
    obj["group"] = lines[i][4];
    obj["description"] = lines[i][5];
    obj["account_code"] = lines[i][6];
    obj["expense_class"] = lines[i][7];

    projected.push(obj);
  }

  return projected;
}
