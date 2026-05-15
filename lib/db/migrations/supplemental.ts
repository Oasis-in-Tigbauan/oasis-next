import { count, eq } from "drizzle-orm";
import fs from "fs/promises";
import path from "path";
import { DateTime } from "luxon";

import type { MigratorFn } from "@/lib/db/types";
import { aipReferences, officePosition, supplemental, saaobEntries, user } from "@/lib/db/schema";
import { castToDecimal } from "@/lib/types/casts";

export const supplementalMigration: MigratorFn = async (client): Promise<void> => {
  console.log("Migrating Supplemental...");

  // Check if there are items. Skip if there are items.
  const [result] = await client
    .select({ count: count(supplemental.id)})
    .from(supplemental);
  if (Number(result.count) > 0) {
    console.log("-> Skipped due to items present in supplemental.");
    return;
  }

  // Get the heathcliff user
  const [heathcliffRole] = await client
    .select({
      id: officePosition.id,
    })
    .from(officePosition)
    .where(eq(officePosition.name, "Heathcliff"));
  if (!heathcliffRole) {
    throw new Error("System Role cannot be found. This may be an error.");
  }

  const [systemUser] = await client
    .select({
      id: user.id,
      officeId: user.officeId,
    })
    .from(user)
    .where(eq(user.officePositionId, heathcliffRole.id))
    .limit(1);
  if (!systemUser) {
    throw new Error("System User cannot be found. This may be an error.");
  }

  const codes = await read();
  if (codes.length === 0) {
    console.log("No supplemental rows found to migrate.");
    return;
  }

  const aipRows = await client
    .select({
      id: aipReferences.id,
      code: aipReferences.aipReferenceCode,
    })
    .from(aipReferences);
  const aipRefByCode = new Map(aipRows.map(row => [row.code.trim().toLowerCase(), row.id]));

  const saaobRows = await client
    .select({ id: saaobEntries.id, refCode: saaobEntries.refCode })
    .from(saaobEntries);
  const saaobByRefCode = new Map(
    saaobRows
      .filter(r => r.refCode)
      .map(r => [r.refCode!.trim().toUpperCase(), r.id]),
  );

  const records: Array<typeof supplemental.$inferInsert> = [];

  for (const row of codes) {
    const lessRaw = normalizeText(row["Less: Source of Funds"]);
    const addRaw = normalizeText(row["Add: Object of Expenditures"]);

    const supplementalType = lessRaw ? "less" : addRaw ? "add" : null;
    const rawAmount = lessRaw ?? addRaw;
    if (!supplementalType || !rawAmount) {
      continue;
    }

    const amount = normalizeAmount(rawAmount);
    if (!amount) {
      continue;
    }

    const createdAt = parseDateUtcFromUtc8(row.DATE);
    if (!createdAt) {
      continue;
    }

    const aipCodeRaw = normalizeText(row["AIP CODE"]);
    const aipRefCode = aipCodeRaw
      ? (aipRefByCode.get(aipCodeRaw.toLowerCase()) ?? null)
      : null;

    records.push({
      supplementalOrAugmentation: normalizeText(row["SUPPLEMENTAL/ AUGMENTATION"]),
      amount,
      supplementalType,
      aipRefCode,
      saaobId: saaobByRefCode.get((row["CHARGES"] ?? "").trim().toUpperCase()) ?? null,
      author: systemUser.id,
      createdAt,
      updatedAt: createdAt,
    });
  }

  if (records.length === 0) {
    console.log("No valid supplemental rows to migrate after normalization.");
    return;
  }

  await client.insert(supplemental).values(records);
  console.log(`Migrated ${records.length} supplemental rows.`);
};

async function read(): Promise<Record<string, string>[]> {
  const filePath = path.join(__dirname, "./data/supplemental.tsv");
  const file = await fs.readFile(filePath, "utf8");

  const lines: Array<Array<string>> = file.split(/\r?\n/)
    .filter(line => line.trim().length > 0)
    .map(line => line.split("\t"));

  const head: Array<string> = [...lines[0]];
  const projected: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    // skip -0
    if (lines[i][0].startsWith("-")) {
      continue;
    }

    const obj: Record<string, string> = {};
    for (let j = 0; j < lines[i].length; j++) {
      obj[head[j]] = lines[i][j];
    }

    projected.push(obj);
  }

  return projected;
}

function normalizeText(value: Optional<string>): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeAmount(value: string): string | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;

  // Keep only decimal-significant characters and drop separators/symbols.
  const cleaned = normalized.replace(/,/g, "").replace(/[^0-9.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === "." || cleaned === "-.") {
    return null;
  }

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return castToDecimal(cleaned);
}

function parseDateUtcFromUtc8(value: Optional<string>): Date | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;

  const parsed = DateTime
    .fromFormat(normalized, "MM/dd/yyyy", { zone: "Asia/Manila" })
    .startOf("day");
  if (!parsed.isValid) {
    return null;
  }

  return parsed.toUTC().toJSDate();
}
