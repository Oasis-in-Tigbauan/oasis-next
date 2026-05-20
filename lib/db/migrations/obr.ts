import { count } from "drizzle-orm";
import fs from "fs/promises";
import { DateTime } from "luxon";
import path from "path";

import type { MigratorFn } from "@/lib/db/types";
import { obrMainData, obrMainAipReferences, officeCodes, expenseClasses, saaobEntries, aipReferences } from "@/lib/db/schema";

export const obrEntriesMigration: MigratorFn = async (client, usr): Promise<void> => {
  console.log("Migrating OBR entries...");

  // Check if there are items. Skip if there are items.
  const [result] = await client
    .select({ count: count()})
    .from(obrMainData);
  if (Number(result.count) > 0) {
    console.log("-> Skipped due to obr entries exists");
    return;
  }

  const entries = await read();

  // Build lookup maps upfront for O(1) resolution per row
  const officeCodeRows = await client
    .select({ id: officeCodes.id, aa: officeCodes.aa })
    .from(officeCodes);
  const officeCodeByAa = new Map(officeCodeRows.map(r => [r.aa.trim().toUpperCase(), r.id]));

  const expenseRows = await client
    .select({ id: expenseClasses.id, accountName: expenseClasses.accountName })
    .from(expenseClasses);
  const expenseByName = new Map(expenseRows.map(r => [r.accountName.trim().toUpperCase(), r.id]));

  const saaobRows = await client
    .select({ id: saaobEntries.id, refCode: saaobEntries.refCode })
    .from(saaobEntries);
  const saaobByRefCode = new Map(
    saaobRows
      .filter(r => r.refCode)
      .map(r => [r.refCode!.trim().toUpperCase(), r.id]),
  );

  const aipRefRows = await client
    .select({
      id: aipReferences.id,
      aipReferenceCode: aipReferences.aipReferenceCode,
      description: aipReferences.description,
    })
    .from(aipReferences);
  const aipRefByCode = new Map(aipRefRows.map(r => [r.aipReferenceCode.trim(), r]));

  const sanitizeDecimal = (raw: string | undefined): string => {
    const cleaned = (raw ?? "").trim().replace(/,/g, "");
    return cleaned === "" || cleaned === "-" ? "0" : cleaned;
  };

  const valuePairs: { value: typeof obrValues[number], entry: Record<string, string> }[] = [];
  const obrValues: {
    obrNumber: string; alobs: string; payee: string; address: string;
    prNumber: string; particulars: string; obligated: string; prAmount: string | null;
    remarks: string; responsibilityCenterId: string; expenseCodeId: string;
    saaobId: string | null; authorId: string;
  }[] = [];
  for (const c of entries) {
    // Skip rows with falsy/empty/whitespace OBR number
    if (!c["OBR"]?.trim()) continue;

    const responsibilityCenterId = officeCodeByAa.get((c["Responsibility Center"] ?? "").trim().toUpperCase());
    if (!responsibilityCenterId) {
      console.warn(`-> Skipped OBR "${c["OBR"]}": no matching office code for Responsibility Center "${c["Responsibility Center"]}"`);
      continue;
    }

    const expenseNameRaw = (c["Expense Name"] ?? "").trim();
    if (!expenseNameRaw) {
      console.warn(`-> Skipped OBR "${c["OBR"]}": Expense Name is empty`);
      continue;
    }

    const expenseNameKey = expenseNameRaw.toUpperCase();
    let expenseCodeId = expenseByName.get(expenseNameKey);
    if (!expenseCodeId) {
      const [created] = await client
        .insert(expenseClasses)
        .values({ accountName: expenseNameRaw, class: "300" })
        .returning({ id: expenseClasses.id });
      expenseCodeId = created.id;
      expenseByName.set(expenseNameKey, expenseCodeId);
      console.log(`-> Created expense class "${expenseNameRaw}"`);
    }

    const value = {
      obrNumber: c["OBR"],
      alobs: c["ALOBS"],
      payee: c["PAYEE"],
      address: c["ADDRESS"],
      prNumber: c["PR #"],
      particulars: c["Particulars"],
      obligated: sanitizeDecimal(c["OBLIGATED"]),
      prAmount: (() => {
        const raw = (c["PR AMOUNT"] ?? "").trim().replace(/,/g, "");
        return raw === "" || raw === "-" ? null : raw;
      })(),
      remarks: c["REMARKS"],
      responsibilityCenterId,
      expenseCodeId,
      saaobId: saaobByRefCode.get((c["CHARGES"] ?? "").trim().toUpperCase()) ?? null,
      authorId: usr.id,
      createdAt: DateTime.fromFormat((c["DATE"] ?? "").trim(), "MM/dd/yyyy", { zone: "Asia/Manila" }).toUTC().toJSDate(),
    };
    obrValues.push(value);
    valuePairs.push({ value, entry: c });
  }

  if (obrValues.length > 0) {
    const inserted = await client.insert(obrMainData).values(obrValues).returning({ id: obrMainData.id });

    const aipSlotKeys = [
      { code: "AIP CODE",   desc: "AIP DESCRIPTION",   amount: "AMOUNT 1" },
      { code: "AIP CODE 2", desc: "AIP DESCRIPTION 2", amount: "AMOUNT 2" },
      { code: "AIP CODE 3", desc: "AIP DESCRIPTION 3", amount: "AMOUNT 3" },
      { code: "AIP CODE 4", desc: "AIP DESCRIPTION 4", amount: "AMOUNT 4" },
      { code: "AIP CODE 5", desc: "AIP DESCRIPTION 5", amount: "AMOUNT 5" },
    ];

    const aipRefValues = [];
    for (let i = 0; i < valuePairs.length; i++) {
      const obrId = inserted[i].id;
      const c = valuePairs[i].entry;
      let idx = 0;
      for (const slot of aipSlotKeys) {
        const codeRaw = (c[slot.code] ?? "").trim();
        if (!codeRaw) continue;
        const aipRef = aipRefByCode.get(codeRaw);
        if (!aipRef) continue;
        const amountRaw = (c[slot.amount] ?? "").trim().replace(/,/g, "");
        if (!amountRaw || amountRaw === "-" || isNaN(Number(amountRaw))) continue;
        aipRefValues.push({
          aipReferenceId: aipRef.id,
          aipReferenceCode: aipRef.aipReferenceCode,
          aipDescription: aipRef.description,
          amount: amountRaw,
          index: idx++,
          obrId,
        });
      }
    }

    if (aipRefValues.length > 0) {
      await client.insert(obrMainAipReferences).values(aipRefValues);
    }
  }
  console.log(`-> Inserted ${obrValues.length} of ${entries.length} OBR entries.`);
};

async function read(): Promise<Record<string, string>[]> {
  const filePath = path.join(__dirname, "./data/obr.tsv");
  const file = await fs.readFile(filePath, "utf8");

  const lines = file.split(/\r?\n/).map(x => x.split("\t"));

  const head = lines[0];
  head[44] = "Unknown";
  const projected: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const obj: Record<string, string> = {};
    for (let j = 0; j < head.length; j++) {
      obj[head[j]] = lines[i][j];
    }
    obj["YEAR"] = new Date(obj["DATE"]).getFullYear().toString();
    projected.push(obj);
  }

  return projected
    // Filter out the autogenerated stuff out.
    .filter(x => !x["PRIMARY KEY"]?.startsWith("--"));
}
