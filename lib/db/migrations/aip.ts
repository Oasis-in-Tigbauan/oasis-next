import fsp from 'fs/promises';
import path from 'path';

import {count} from 'drizzle-orm';

import * as schema from '@/lib/db/schema';
import type {MigratorFn} from '@/lib/db/types';

export const aipMigration: MigratorFn = async (client): Promise<void> => {
  console.log('Migrating AIP Codes...');

  // Check if there are items in the AIP. Skip if there are items.
  const [aips] = await client
    .select({count: count(schema.aipReferences.id)})
    .from(schema.aipReferences);
  if (Number(aips.count) > 0) {
    console.log('-> Skipped due to AIP codes exists');
    return;
  }

  // Read the TSV file.
  const file = path.join(__dirname, 'data/aip.tsv');
  const data = await fsp.readFile(file, {encoding: 'utf-8'});

  const rows = data
    .split(/\r?\n/)
    .slice(3)
    .map((line) => line.split('\t'))
    .filter((columns) => columns.some((column) => normalizeText(column) !== null));

  const records = rows
    .map(mapRowToAipItem)
    .filter((record): record is NonNullable<typeof record> => record !== null);

  if (records.length === 0) {
    console.log('No AIP rows found to migrate.');
    return;
  }

  await client.insert(schema.aipReferences).values(records);
  console.log(`Migrated ${records.length} AIP items.`);
};

const monthMap: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

function mapRowToAipItem(columns: string[]): typeof schema.aipReferences.$inferInsert | null {
  const aipReferenceCode = normalizeText(columns[3]);
  const description = normalizeText(columns[4]);

  if (!aipReferenceCode || !description) {
    return null;
  }

  return {
    type: 'item',
    sector: normalizeText(columns[0]),
    code: normalizeText(columns[1]),
    office: normalizeText(columns[2]),
    aipReferenceCode,
    description,
    implementingOffice: normalizeText(columns[5]),
    implementationStart: parseMonth(columns[6]),
    implementationCompletion: parseMonth(columns[7]),
    expectedOutputs: normalizeText(columns[8]),
    fundingSource: normalizeText(columns[9]),
    amountPS: normalizeDecimal(columns[10]),
    amountMOOE: normalizeDecimal(columns[11]),
    amountCO: normalizeDecimal(columns[12]),
    amountCCAdapt: normalizeDecimal(columns[18]),
    amountCCMitigate: normalizeDecimal(columns[19]),
    ccTopologyCode: normalizeText(columns[20]),
    gadable: parseYesNo(columns[21]),
    gadAmount: normalizeDecimal(columns[22]),
  };
}

function normalizeText(value?: string): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeDecimal(value?: string): string | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;

  const withoutCommas = normalized.replace(/,/g, '');
  return withoutCommas.length > 0 ? withoutCommas : null;
}

function parseMonth(value?: string): number | null {
  const normalized = normalizeText(value)?.toLowerCase();
  if (!normalized) return null;

  return monthMap[normalized] ?? null;
}

function parseYesNo(value?: string): boolean {
  const normalized = normalizeText(value)?.toLowerCase();
  return normalized === 'yes';
}
