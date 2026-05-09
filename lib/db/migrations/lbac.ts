import fsp from "fs/promises";
import path from "path";

import type { MigratorFn } from "@/lib/db/types";

export const lbacMigration: MigratorFn = async (): Promise<void> => {
  console.log("Migrating LBAC Data...");

  const lbacObjects = await parseLbacEntries();
};

export async function parseLbacEntries(): Promise<LbacGroup[]> {
  const sourceFile = path.join(__dirname, "data/lbac.tsv");

  const rows = (await fsp.readFile(sourceFile, "utf-8"))
    .split(/\r?\n/)
    .map(line => line.split("\t"))
    .slice(4)
    .filter(row => row.some(column => normalizeText(column) !== null));

  const schemaKeys = buildSchemaKeys(rows[0], rows[1]);

  const entries = rows.slice(2);

  return groupOfficeBlocks(entries)
    .map(block => mapOfficeBlock(schemaKeys, block))
    .filter((group): group is LbacGroup => group !== null);
}

function buildSchemaKeys(primaryHeader: string[], secondaryHeader: string[]): Array<string | null> {
  const schemaKeys: Array<string | null> = [];
  const seenKeys = new Map<string, number>();
  let currentPrimary: string | null = null;

  for (let index = 0; index < Math.max(primaryHeader.length, secondaryHeader.length); index++) {
    const primaryKey = normalizeText(primaryHeader[index]);
    const secondaryKey = normalizeText(secondaryHeader[index]);

    if (primaryKey) {
      currentPrimary = primaryKey;
    }

    let key: string | null;
    if (primaryKey && secondaryKey) {
      key = `${primaryKey}:${secondaryKey}`;
    } else if (secondaryKey && currentPrimary) {
      key = `${currentPrimary}:${secondaryKey}`;
    } else if (secondaryKey) {
      key = secondaryKey;
    } else if (primaryKey) {
      key = primaryKey;
    } else {
      key = null;
    }

    schemaKeys.push(makeUniqueKey(key, seenKeys));
  }

  return schemaKeys;
}

function groupOfficeBlocks(entries: string[][]): string[][][] {
  const blocks: string[][][] = [];
  let currentBlock: string[][] = [];
  let currentOfficeCode: string | null = null;

  for (const row of entries) {
    const officeCode = getOfficeCode(row);
    if (!officeCode) {
      continue;
    }

    if (currentOfficeCode === null || officeCode === currentOfficeCode) {
      currentBlock.push(row);
      currentOfficeCode = officeCode;
      continue;
    }

    if (currentBlock.length > 0) {
      blocks.push(currentBlock);
    }

    currentBlock = [row];
    currentOfficeCode = officeCode;
  }

  if (currentBlock.length > 0) {
    blocks.push(currentBlock);
  }

  return blocks;
}

function mapOfficeBlock(schemaKeys: Array<string | null>, block: string[][]): LbacGroup | null {
  const officeCode = block.map(getOfficeCode).find((value): value is string => value !== null);
  const officeName = block.map(getOfficeName).find((value): value is string => value !== null);

  if (!officeCode || !officeName) {
    return null;
  }

  const officeGroup: LbacGroup = {
    $type: "group",
    "AIP REF CODE": officeCode,
    "MFO/PPA": officeName,
    items: [],
  };

  let currentSection: LbacGroup | null = null;

  for (const row of block) {
    if (isGrandTotalRow(row)) {
      currentSection = pushSection(officeGroup, currentSection);
      continue;
    }

    if (isTotalRow(row)) {
      currentSection = pushSection(officeGroup, currentSection);
      continue;
    }

    if (isItemRow(row)) {
      currentSection ??= {
        $type: "group",
        "MFO/PPA": inferItemSectionName(row) ?? officeName,
        items: [],
      };

      currentSection.items.push(mapEntry(schemaKeys, row));
      continue;
    }

    const sectionTitle = inferSectionTitle(row);
    if (!sectionTitle) {
      continue;
    }

    if (currentSection && currentSection.items.length === 0) {
      currentSection["MFO/PPA"] = sectionTitle;
      continue;
    }

    currentSection = pushSection(officeGroup, currentSection);
    currentSection = {
      $type: "group",
      "MFO/PPA": sectionTitle,
      items: [],
    };
  }

  pushSection(officeGroup, currentSection);

  return officeGroup.items.length > 0 ? officeGroup : null;
}

function pushSection(parent: LbacGroup, section: LbacGroup | null): null {
  if (section && section.items.length > 0) {
    parent.items.push(section);
  }

  return null;
}

function mapEntry(schemaKeys: Array<string | null>, row: string[]): LbacItem {
  const item: LbacItem = {};

  for (let index = 0; index < row.length; index++) {
    const key = schemaKeys[index];
    if (!key) {
      continue;
    }

    item[key] = row[index] ?? "";
  }

  return item;
}

function makeUniqueKey(key: string | null, seenKeys: Map<string, number>): string | null {
  if (!key) {
    return null;
  }

  const count = (seenKeys.get(key) ?? 0) + 1;
  seenKeys.set(key, count);

  if (count === 1) {
    return key;
  }

  return `${key} (${count})`;
}

function normalizeText(value?: string): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function getOfficeCode(row: string[]): string | null {
  return normalizeText(row[5]);
}

function getOfficeName(row: string[]): string | null {
  return normalizeText(row[3]);
}

function getDescription(row: string[]): string | null {
  return normalizeText(row[12]);
}

function isGrandTotalRow(row: string[]): boolean {
  return (getDescription(row) ?? "").startsWith("GRAND TOTAL");
}

function isTotalRow(row: string[]): boolean {
  return (getDescription(row) ?? "").startsWith("TOTAL");
}

function isItemRow(row: string[]): boolean {
  const value = normalizeText(row[2]);
  return value !== null && value !== "-0";
}

function inferSectionTitle(row: string[]): string | null {
  return pickFirstText(row[12], row[10], row[4]);
}

function inferItemSectionName(row: string[]): string | null {
  return pickFirstText(row[4], row[12], row[3]);
}

function pickFirstText(...values: Array<string | undefined>): string | null {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized && normalized !== "-0") {
      return normalized;
    }
  }

  return null;
}

type LbacItem = Record<string, string>;

type LbacGroup = {
  $type: "group";
  "AIP REF CODE"?: string;
  "MFO/PPA": string;
  items: Array<LbacGroup | LbacItem>;
};
