import { count } from "drizzle-orm";
import fs from "fs/promises";
import path from "path";

import type { MigratorFn } from "@/lib/db/types";
import { aroOfficeDefinitions } from "@/lib/db/schema";

export const aroMigration: MigratorFn = async (client, user): Promise<void> => {
  console.log("Migrating ARO Office Definitions...");

  const [result] = await client
    .select({ count: count(aroOfficeDefinitions.id) })
    .from(aroOfficeDefinitions);
  if (Number(result.count) > 0) {
    console.log("-> Skipped due to ARO office definitions already exist.");
    return;
  }

  const rows = await read();
  if (rows.length === 0) {
    console.log("-> No ARO rows found to migrate.");
    return;
  }

  await client.insert(aroOfficeDefinitions).values(rows.map(x => ({
    ...x,
    leadUserId: user.id,
  })));
  console.log(`-> Inserted ${rows.length} ARO office definitions.`);
};

async function read(): Promise<{ name: string; code: string; description: string }[]> {
  const filePath = path.join(__dirname, "./data/aro.csv");
  const text = await fs.readFile(filePath, "utf8");

  // Parse CSV with quoted-field support
  const parsed: string[][] = [];
  let row: string[] = [];
  let current = "";
  let insideQuote = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === "\"") {
      if (insideQuote && next === "\"") {
        current += "\"";
        i++;
      } else {
        insideQuote = !insideQuote;
      }
    } else if (char === "," && !insideQuote) {
      row.push(current);
      current = "";
    } else if ((char === "\r" || char === "\n") && !insideQuote) {
      if (char === "\r" && next === "\n") i++;
      row.push(current);
      if (row.some(c => c.trim())) parsed.push(row);
      row = [];
      current = "";
    } else {
      current += char;
    }
  }
  if (current || row.length > 0) {
    row.push(current);
    if (row.some(c => c.trim())) parsed.push(row);
  }

  return parsed
    .filter(r => r.length >= 3 && r[0].trim())
    .map(r => ({
      name: r[0].trim(),
      code: r[1].trim(),
      description: r[2].trim(),
    }));
}
