import { count, eq } from "drizzle-orm";
import fsp from "fs/promises";
import path from "path";
import { v7 as uuidv7 } from "uuid";

import type { MigratorFn } from "@/lib/db/types";
import {
  aipReferences,
  lbacGroups,
  lbacItems,
  lbacQuarterlyReport,
  officeCodes,
  officePosition,
  saaobEntries,
  user,
} from "@/lib/db/schema";

export const lbacMigration: MigratorFn = async (client): Promise<void> => {
  console.log("Migrating LBAC Data...");

  // Check if there are items. Skip if there are items.
  const [result] = await client
    .select({ count: count(lbacItems.id)})
    .from(lbacItems);
  if (Number(result.count) > 0) {
    console.log("-> Skipped due to LBAC items exists");
    return;
  }

  // Resolve system user (Heathcliff role)
  const [heathcliffRole] = await client
    .select({ id: officePosition.id })
    .from(officePosition)
    .where(eq(officePosition.name, "Heathcliff"));
  if (!heathcliffRole) {
    throw new Error("System Role cannot be found. This may be an error.");
  }

  const [systemUser] = await client
    .select({ id: user.id, officeId: user.officeId })
    .from(user)
    .where(eq(user.officePositionId, heathcliffRole.id))
    .limit(1);
  if (!systemUser) {
    throw new Error("System User cannot be found. This may be an error.");
  }

  // Fetch lookup tables
  const allOfficeCodes = await client.select({ id: officeCodes.id, aa: officeCodes.aa }).from(officeCodes);
  const allAipReferences = await client.select({ id: aipReferences.id, code: aipReferences.aipReferenceCode }).from(aipReferences);

  const officeCodeByAa = new Map(allOfficeCodes.map(r => [r.aa.trim().toLowerCase(), r.id]));
  const aipRefByCode = new Map(allAipReferences.map(r => [r.code.trim().toLowerCase(), r.id]));

  const allSaaobEntries = await client.select({ id: saaobEntries.id, refCode: saaobEntries.refCode, expenseCodeId: saaobEntries.expenseCodeId }).from(saaobEntries);
  const saaobByRefCode = new Map(
    allSaaobEntries
      .filter(r => r.refCode)
      .map(r => [r.refCode!.trim().toUpperCase(), r]),
  );

  // Parse source data
  const lbacObjects = await parseLbacEntries();

  // Flatten the entire tree into two lists, pre-generating all UUIDs
  const flatGroups: FlatGroup[] = [];
  const flatItems: FlatItem[] = [];

  for (const officeGroup of lbacObjects) {
    collectGroupsAndItems(
      officeGroup,
      null,
      systemUser.officeId,
      systemUser.id,
      aipRefByCode,
      flatGroups,
      flatItems,
    );
  }

  // Batch insert all groups in one call (parents are always before children)
  if (flatGroups.length > 0) {
    await client.insert(lbacGroups).values(
      flatGroups.map(g => ({
        id: g.id,
        name: g.name,
        parentId: g.parentId,
        aipRefCode: g.aipRefId,
        implementingUnitId: null,
        officeId: g.officeId,
        authorId: g.authorId,
      })),
    );
  }

  // Attach pre-generated quarterly report UUIDs to each item
  const flatItemsWithQrId = flatItems.map(fi => ({ ...fi, qrId: uuidv7() }));

  // Batch insert all quarterly reports in one call
  if (flatItemsWithQrId.length > 0) {
    await client.insert(lbacQuarterlyReport).values(
      flatItemsWithQrId.map(({ qrId, item }) => ({
        id: qrId,
        priorYearAccomplishments: item["Prior Year Accomplishments  (Actual 2025)"] || null,
        physicalTargetQ1: item["PHYSICAL TARGETS:1ST QUARTER"] || null,
        physicalTargetQ2: item["PHYSICAL TARGETS:2ND QUARTER"] || null,
        physicalTargetQ3: item["PHYSICAL TARGETS:3RD QUARTER"] || null,
        physicalTargetQ4: item["PHYSICAL TARGETS:4TH QUARTER"] || null,
        physicalTargetTotal: item["PHYSICAL TARGETS:TOTAL"] || null,
        actualPhysicalPerformanceQ1: item["ACTUAL PHYSICAL PERFORMANCE:1ST QUARTER"] || null,
        actualPhysicalPerformanceQ2: item["ACTUAL PHYSICAL PERFORMANCE:2ND QUARTER"] || null,
        actualPhysicalPerformanceQ3: item["ACTUAL PHYSICAL PERFORMANCE:3RD QUARTER"] || null,
        actualPhysicalPerformanceQ4: item["ACTUAL PHYSICAL PERFORMANCE:4TH QUARTER"] || null,
        actualPhysicalPerformanceTotal: item["ACTUAL PHYSICAL PERFORMANCE:TOTAL"] || null,
        variance: item["Variance as of (2)"] || null,
        accomplishmentPercentage: item["% of Accomplishment"] || null,
        remarks: item["Remarks (3)"] || null,
        targetForBudgetYear: item["Target for the Budget Year  (Quantity, Quality & Time)"] || null,
      })),
    );

    // Batch insert all lbac items in one call
    await client.insert(lbacItems).values(
      flatItemsWithQrId.map(({ qrId, item, groupId }) => {
        const aipRefCodeRaw = item["AIP REF CODE"]?.trim();
        const aipRefId = aipRefCodeRaw ? (aipRefByCode.get(aipRefCodeRaw.toLowerCase()) ?? null) : null;
        const implementingUnitRaw = item["Implementing Unit"]?.trim();
        const implementingUnitId = implementingUnitRaw
          ? (officeCodeByAa.get(implementingUnitRaw.toLowerCase()) ?? null)
          : null;

        return {
          aipRefCode: aipRefId,
          mfoPpa: item["MFO/ PPA"] || item["MFO/PPA"] || "",
          majorFinalOutput: item["Major Final Output"] || null,
          performanceOutputIndicator: item["Performance/Output Indicator"] || null,
          targetForBudgetYear: item["Target for the Budget Year  (Quantity, Quality & Time)"] || null,
          proposedBudgetPS: tryGetDecimal(item["Proposed Budget for the Budget Year:PS"]) ?? "0",
          proposedBudgetMOOE: tryGetDecimal(item["Proposed Budget for the Budget Year:MOOE"]) ?? "0",
          proposedBudgetFE: tryGetDecimal(item["Proposed Budget for the Budget Year:FE"]) ?? "0",
          proposedBudgetCO: tryGetDecimal(item["Proposed Budget for the Budget Year:CO"]) ?? "0",
          remarks: item["Remarks"] || null,
          gadable: (item["GADABLE"] || "").trim().toLowerCase() === "yes",
          tagging: item["TAGGING"] || null,
          amountAttributed: tryGetDecimal(item["AMOUNT ATTRIBUTED"]),
          implementingUnitId,
          expenseCodeId: saaobByRefCode.get((item["CHARGES"] ?? "").trim().toUpperCase())?.expenseCodeId ?? null,
          saaobId: saaobByRefCode.get((item["CHARGES"] ?? "").trim().toUpperCase())?.id ?? null,
          quarterlyReportId: qrId,
          parentId: groupId,
          authorId: systemUser.id,
          officeId: systemUser.officeId,
        };
      }),
    );
  }

  console.log(`LBAC migration complete: ${flatGroups.length} groups, ${flatItemsWithQrId.length} items inserted.`);
};

function tryGetDecimal(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/,/g, "").trim();
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;
  return num.toString();
}

function isLbacGroup(item: LbacGroup | LbacItem): item is LbacGroup {
  return (item as LbacGroup).$type === "group";
}

/**
 * Recursively walks an LbacGroup tree, pre-generating UUIDs for every group
 * and collecting flat lists of groups (in parent-before-child order) and items.
 * Supports arbitrary nesting depth.
 */
function collectGroupsAndItems(
  group: LbacGroup,
  parentId: string | null,
  officeId: string,
  authorId: string,
  aipRefByCode: Map<string, string>,
  flatGroups: FlatGroup[],
  flatItems: FlatItem[],
): void {
  const id = uuidv7();
  const aipRefCodeRaw = group["AIP REF CODE"]?.trim();
  const aipRefId = aipRefCodeRaw ? (aipRefByCode.get(aipRefCodeRaw.toLowerCase()) ?? null) : null;

  // Push this group before its children so parentId references are always valid
  flatGroups.push({ id, name: group["MFO/PPA"], parentId, aipRefId, officeId, authorId });

  for (const child of group.items) {
    if (isLbacGroup(child)) {
      collectGroupsAndItems(child, id, officeId, authorId, aipRefByCode, flatGroups, flatItems);
    } else {
      flatItems.push({ groupId: id, item: child });
    }
  }
}

export async function parseLbacEntries(): Promise<LbacGroup[]> {
  const rows = await readTsvRows(path.join(__dirname, "data/lbac.tsv"));
  const quarterlyRows = await readTsvRows(path.join(__dirname, "data/lbac-quarterly.tsv"));

  const schemaKeys = buildSchemaKeys(rows[0], rows[1]);
  const quarterlySchemaKeys = buildSchemaKeys(quarterlyRows[0], quarterlyRows[1]);

  const entries = rows.slice(2);
  const quarterlyEntries = quarterlyRows.slice(2);
  const quarterlyLookup = buildQuarterlyLookup(quarterlyEntries, quarterlySchemaKeys);

  return groupOfficeBlocks(entries)
    .map(block => mapOfficeBlock(schemaKeys, block, quarterlyLookup))
    .filter((group): group is LbacGroup => group !== null);
}

async function readTsvRows(filePath: string): Promise<string[][]> {
  return (await fsp.readFile(filePath, "utf-8"))
    .split(/\r?\n/)
    .map(line => line.split("\t"))
    .slice(4)
    .filter(row => row.some(column => normalizeText(column) !== null));
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

function mapOfficeBlock(
  schemaKeys: Array<string | null>,
  block: string[][],
  quarterlyLookup: QuarterlyLookup,
): LbacGroup | null {
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

      currentSection.items.push(mapEntry(schemaKeys, row, quarterlyLookup));
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

function mapEntry(
  schemaKeys: Array<string | null>,
  row: string[],
  quarterlyLookup?: QuarterlyLookup,
): LbacItem {
  const item: LbacItem = {};

  for (let index = 0; index < row.length; index++) {
    const key = schemaKeys[index];
    if (!key) {
      continue;
    }

    item[key] = row[index] ?? "";
  }

  if (quarterlyLookup) {
    applyQuarterlyOverlay(item, quarterlyLookup);
  }

  normalizeCanonicalFields(item);

  return item;
}

function normalizeCanonicalFields(item: LbacItem): void {
  const priorYearValue = pickFirstNonEmpty(
    item["Prior Year Accomplishments  (Actual 2025)"],
    item["Prior Year Accomplishments  (Actual 2024)"],
    item["ACCOUNT CODE:Prior Year Accomplishments  (Actual 2025)"],
    item["ACCOUNT CODE:Prior Year Accomplishments  (Actual 2024)"],
  );

  item["Prior Year Accomplishments  (Actual 2025)"] = priorYearValue ?? "";
}

function buildQuarterlyLookup(
  quarterlyEntries: string[][],
  quarterlySchemaKeys: Array<string | null>,
): QuarterlyLookup {
  const lookup: QuarterlyLookup = new Map();

  for (const row of quarterlyEntries) {
    const baseItem = mapEntry(quarterlySchemaKeys, row);
    const joinKeys = buildJoinKeys(baseItem);
    if (joinKeys.length === 0) {
      continue;
    }

    const overlay: QuarterlyOverlay = new Map();
    for (let index = QUARTERLY_OVERLAY_START_INDEX; index < row.length; index++) {
      const key = quarterlySchemaKeys[index];
      const value = normalizeText(row[index]);

      if (!key || !value) {
        continue;
      }

      overlay.set(canonicalizeKey(key), value);
    }

    if (overlay.size === 0) {
      continue;
    }

    for (const joinKey of joinKeys) {
      const existing = lookup.get(joinKey);
      if (!existing) {
        lookup.set(joinKey, new Map(overlay));
        continue;
      }

      for (const [key, value] of overlay) {
        existing.set(key, value);
      }
    }
  }

  return lookup;
}

function applyQuarterlyOverlay(item: LbacItem, quarterlyLookup: QuarterlyLookup): void {
  const overlay = buildJoinKeys(item)
    .map(joinKey => quarterlyLookup.get(joinKey))
    .find(candidate => candidate !== undefined);

  if (!overlay) {
    return;
  }

  const canonicalToTargetKeys = new Map<string, string[]>();
  for (const key of Object.keys(item)) {
    const canonical = canonicalizeKey(key);
    const bucket = canonicalToTargetKeys.get(canonical) ?? [];
    bucket.push(key);
    canonicalToTargetKeys.set(canonical, bucket);
  }

  for (const [canonicalKey, value] of overlay) {
    const candidates = canonicalToTargetKeys.get(canonicalKey) ?? [];
    const targetKey = selectTargetKey(canonicalKey, candidates);
    if (!targetKey) {
      continue;
    }

    item[targetKey] = value;
  }
}

function buildJoinKeys(item: LbacItem): string[] {
  const values = QUARTERLY_JOIN_KEYS.map(key => normalizeJoinValue(item[key]));

  const aip = values[0];
  const mfo = values[1];
  const implementingUnit = values[2];
  if (!aip) {
    return [];
  }

  const keys: string[] = [];

  if (mfo && implementingUnit) {
    keys.push([aip, mfo, implementingUnit, ...values.slice(3)].join("|"));
    keys.push([aip, mfo, implementingUnit].join("|"));
  }

  if (mfo) {
    keys.push([aip, mfo].join("|"));
  }

  keys.push(aip);

  return Array.from(new Set(keys));
}

function normalizeJoinValue(value?: string): string {
  const normalized = normalizeText(value);
  return normalized ? normalized.toLowerCase() : "";
}

function canonicalizeKey(key: string): string {
  return key
    .replace(/\b20\d{2}\b/g, "")
    .replace(/\s*\(\d+\)\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function selectTargetKey(canonicalKey: string, candidates: string[]): string | null {
  if (candidates.length === 0) {
    return null;
  }

  if (canonicalKey === "REMARKS") {
    return candidates.find(key => key === "Remarks (3)")
      ?? candidates.find(key => key === "Remarks (2)")
      ?? candidates.find(key => key === "Remarks")
      ?? candidates[candidates.length - 1];
  }

  if (canonicalKey === "VARIANCE AS OF") {
    return candidates.find(key => key === "Variance as of (2)")
      ?? candidates.find(key => key === "Variance as of")
      ?? candidates[candidates.length - 1];
  }

  return candidates[0];
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

function pickFirstNonEmpty(...values: Array<string | undefined>): string | null {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
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

type FlatGroup = {
  id: string;
  name: string;
  parentId: string | null;
  aipRefId: string | null;
  officeId: string;
  authorId: string;
};

type FlatItem = {
  groupId: string;
  item: LbacItem;
};

type LbacItem = Record<string, string>;

type QuarterlyOverlay = Map<string, string>;
type QuarterlyLookup = Map<string, QuarterlyOverlay>;

const QUARTERLY_OVERLAY_START_INDEX = 8;
const QUARTERLY_JOIN_KEYS = [
  "AIP REF CODE",
  "MFO/ PPA",
  "Implementing Unit",
  "Appropriation:Continuing/ Supplemental/ Augmentation",
  "Appropriation:Current",
  "Appropriation:TOTAL",
  "OBLIGATION:As of the cut-off month",
  "BALANCE",
] as const;

type LbacGroup = {
  $type: "group";
  "AIP REF CODE"?: string;
  "MFO/PPA": string;
  items: Array<LbacGroup | LbacItem>;
};
