import { count } from "drizzle-orm";
import fs from "fs/promises";
import path from "path";

import type { MigratorFn } from "@/lib/db/types";
import { aipReferences, lbacItems, lbacMonitoring } from "@/lib/db/schema";

export const lbacF6Migration: MigratorFn = async (client): Promise<void> => {
  console.log("Migrating LBAC F6 entries...");

  const [result] = await client
    .select({ count: count(lbacMonitoring.id) })
    .from(lbacMonitoring);
  if (Number(result.count) > 0) {
    console.log("-> Skipped due to LBAC F6 entries already exist.");
    return;
  }

  const rows = await read();

  // Build aipReferenceCode (upper) → F6 row lookup
  const f6ByAipCode = new Map<string, Record<string, string>>();
  for (const row of rows) {
    const code = (row["AIP Reference Code"] ?? "").trim().toUpperCase();
    if (code && !f6ByAipCode.has(code)) {
      f6ByAipCode.set(code, row);
    }
  }

  // Build aipReferences.id → aipReferenceCode (upper)
  const allAipRefs = await client
    .select({ id: aipReferences.id, aipReferenceCode: aipReferences.aipReferenceCode })
    .from(aipReferences);
  const aipCodeById = new Map(allAipRefs.map(r => [r.id, r.aipReferenceCode.trim().toUpperCase()]));

  // Load all lbacItems — one lbacMonitoring row per item
  const allItems = await client
    .select({ id: lbacItems.id, aipRefCode: lbacItems.aipRefCode })
    .from(lbacItems);

  const values = allItems.map(item => {
    const aipCode = item.aipRefCode ? aipCodeById.get(item.aipRefCode) : undefined;
    const f6 = aipCode ? f6ByAipCode.get(aipCode) : undefined;

    return {
      itemId: item.id,
      ab: f6?.["Target Output:AB"] || null,
      actualAccomplishment: f6?.["ActualAccomplishments"] || null,
      abEstimatedCost: sanitizeDecimal(f6?.["Estimated Cost:AB"]),
      actualExpenditure: sanitizeDecimal(f6?.["Actual Expenditure"]),
      remarks: f6?.["Remarks"] || null,
    };
  });

  if (values.length > 0) {
    await client.insert(lbacMonitoring).values(values);
  }
  console.log(`-> Inserted ${values.length} LBAC F6 entries (${f6ByAipCode.size} F6 rows matched by AIP code).`);
};

function sanitizeDecimal(raw: string | undefined): string | null {
  const cleaned = (raw ?? "").trim().replace(/,/g, "").replace(/[^0-9.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === "." || cleaned === "-.") return null;
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;
  return cleaned;
}

async function read(): Promise<Record<string, string>[]> {
  const filePath = path.join(__dirname, "./data/lbac-f6.tsv");
  const file = await fs.readFile(filePath, "utf8");

  const lines = file
    .split(/\r?\n/)
    .map(x => x.split("\t"))
    .slice(11);

  const head = [
    "Plan/ PPAs",
    "AIP Reference Code",
    "Implementing Office/ Department",
    "Target Output:AIP",
    "Target Output:AB",
    "ActualAccomplishments",
    "Estimated Cost:AIP",
    "Estimated Cost:AB",
    "Actual Expenditure",
    "Remarks",
    "AIP vs AB",
    "AB vs Exp",
  ];
  const projected: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const obj: Record<string, string> = {};
    for (let j = 0; j < head.length; j++) {
      obj[head[j]] = (lines[i][j])?.trim();
    }
    projected.push(obj);
  }

  return projected;
}

