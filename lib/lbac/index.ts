import { and, asc, eq, ilike, inArray, or } from "drizzle-orm";
import { DateTime } from "luxon";
import { Decimal } from "decimal.js";

import * as templateBucket from "@/lib/buckets/templates";
import type { TemplateBucketItem } from "@/lib/buckets/templates";
import {
  buildMainDataHeaderLayout,
  buildQuarterlyHeaderLayout,
  flattenLbacMainForExport,
  flattenLbacQuarterlyForExport,
  getMainDataCellValue,
  getQuarterlyCellValue,
  LBAC_GROUP_DEPTH_CHILD_COLOR,
  LBAC_GROUP_DEPTH_ROOT_COLOR,
  LBAC_TOTAL_CHILD_COLOR,
  LBAC_TOTAL_ROOT_COLOR,
  resolveMainExportColumns,
  resolveQuarterlyExportColumns,
  type LbacMainExportColDef,
  type LbacMainExportColumnKey,
  type LbacMainExportFlatRow,
  type LbacQuarterlyExportColDef,
  type LbacQuarterlyExportColumnKey,
  type LbacQuarterlyExportFlatRow,
} from "@/lib/lbac/export-layout";
import {
  buildCollPerfHeaderLayout,
  COLL_PERF_GROUP_DEPTH_CHILD_COLOR,
  COLL_PERF_GROUP_DEPTH_ROOT_COLOR,
  collPerfTotalRowColor,
  flattenCollPerfForExport,
  getCollPerfCellValue,
  quarterEndingLabel,
  resolveCollPerfExportColumns,
  type CollPerfExportColDef,
  type CollPerfExportColumnKey,
  type CollPerfExportFlatRow,
} from "@/lib/lbac/coll-perf-export-layout";
import * as casts from "@/lib/types/casts";
import { db } from "@/lib/db";
import { ErrorCodes, Failure, Result, Success } from "@/lib/one-of";
import {
  aipReferences,
  expenseClasses,
  lbacCollectionPerformanceData,
  lbacCollectionPerformanceGroup,
  lbacCollectionPerformanceMonthlyData,
  lbacGroups,
  lbacItems,
  lbacQuarterlyReport,
  obrMainAipReferences,
  obrMainData,
  officeCodes,
  saaobEntries,
  supplemental,
} from "@/lib/db/schema";
import { type User } from "@/lib/accounts";

export const LBAC_MAIN_DATA_TEMPLATE_IDENTIFIER = "lbac.main-data";
export const LBAC_QUARTERLY_TEMPLATE_IDENTIFIER = "lbac.quarterly";
export const LBAC_COLL_PERF_TEMPLATE_IDENTIFIER = "lbac.coll-perf";

/** ExcelTS numeric number format for monetary amounts. */
const _NUM_FMT_AMOUNT = "#,##0.00";
/** ExcelTS number format for percentages stored as 0-100. */
const _NUM_FMT_PCT = "0.00";

const _THIN_BORDER = {
  top: { style: "thin" as const },
  left: { style: "thin" as const },
  bottom: { style: "thin" as const },
  right: { style: "thin" as const },
};

const _HEADER_FILL = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFFFF2CC" } };
const _MERGE_CELL_TYPE = 1;

/**
 * Searches LBAC items by mfoPpa or AIP reference code and returns a trimmed group tree
 * containing only matching items and their ancestor groups.
 *
 * @async
 * @function searchLbacItems
 * @param {string} query - The search string (case-insensitive substring match).
 * @returns {Promise<Result<LbacSearchResult>>} A result containing the matching group/item tree on success,
 *                                              or a failure result on error.
 */
export async function searchLbacItems(query: string): Promise<Result<LbacSearchResult>> {
  try {
    const pattern = `%${query}%`;

    const rows = await db
      .select({
        id: lbacItems.id,
        mfoPpa: lbacItems.mfoPpa,
        aipRefId: aipReferences.id,
        aipReferenceCode: aipReferences.aipReferenceCode,
        aipDescription: aipReferences.description,
        expenseCodeId: expenseClasses.id,
        expenseAccountName: expenseClasses.accountName,
        expenseAccountCode: expenseClasses.accountCode,
        parentId: lbacItems.parentId,
      })
      .from(lbacItems)
      .leftJoin(aipReferences, eq(aipReferences.id, lbacItems.aipRefCode))
      .leftJoin(expenseClasses, eq(expenseClasses.id, lbacItems.expenseCodeId))
      .where(
        or(
          ilike(lbacItems.mfoPpa, pattern),
          ilike(aipReferences.aipReferenceCode, pattern),
        ),
      )
      .orderBy(asc(lbacItems.createdAt));

    if (rows.length === 0) return new Success([]);

    const allGroups = await _fetchGroups();
    const groupMap = new Map(allGroups.map((g) => [g.id, g]));

    // Collect every ancestor group ID for each matching item
    const relevantGroupIds = new Set<string>();
    for (const row of rows) {
      let currentId: string | null = row.parentId;
      while (currentId) {
        if (relevantGroupIds.has(currentId)) break;
        relevantGroupIds.add(currentId);
        currentId = groupMap.get(currentId)?.parentId ?? null;
      }
    }

    // Group items by their direct parent
    const itemsByGroup = new Map<string, LbacSearchResultItem[]>();
    for (const row of rows) {
      const item: LbacSearchResultItem = {
        id: row.id,
        mfoPpa: row.mfoPpa,
        aipRefCode: row.aipRefId
          ? { id: row.aipRefId, aipReferenceCode: row.aipReferenceCode!, description: row.aipDescription! }
          : null,
        other: {
          expenseCode: row.expenseCodeId
            ? { id: row.expenseCodeId, accountName: row.expenseAccountName!, accountCode: row.expenseAccountCode }
            : null,
        },
      };
      const existing = itemsByGroup.get(row.parentId) ?? [];
      existing.push(item);
      itemsByGroup.set(row.parentId, existing);
    }

    // Build the trimmed tree (same map-based approach as _buildGroupTree)
    const nodeMap = new Map<string, LbacSearchGroupItem>();
    for (const g of allGroups) {
      if (!relevantGroupIds.has(g.id)) continue;
      nodeMap.set(g.id, { id: g.id, name: g.name, children: [] });
    }

    const roots: LbacSearchGroupItem[] = [];
    for (const g of allGroups) {
      if (!relevantGroupIds.has(g.id)) continue;
      const node = nodeMap.get(g.id)!;
      node.children.push(...(itemsByGroup.get(g.id) ?? []));

      if (g.parentId === null || !nodeMap.has(g.parentId)) {
        roots.push(node);
      } else {
        nodeMap.get(g.parentId)!.children.push(node);
      }
    }

    return new Success(roots);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to search LBAC items.", { query }, e);
  }
}

/**
 * Returns all LBAC items and groups in a nested tree structure, including full financial computation
 * and quarterly report data for each item.
 *
 * @async
 * @function getAllItems
 * @param {number} [year] - The year to compute calculations for. Defaults to the current UTC+8 year.
 * @param {number} [quarter] - The quarter (1窶・) to compute calculations for. Defaults to the current UTC+8 quarter.
 * @returns {Promise<Result<LbacGroupObject[]>>} A result containing the full LBAC group/item tree on success,
 *                                               or a failure result on error.
 */
export async function getAllItems(year?: number, quarter?: number): Promise<Result<LbacGroupObject[]>> {
  try {
    const resolvedYear = year ?? _getCurrentYearUtc8();
    const resolvedQuarter = quarter ?? _getCurrentQuarterUtc8();

    const [groups, items] = await Promise.all([_fetchGroups(), _fetchItems()]);

    const reportIds = items.map((i) => i.quarterlyReportId);
    const aipRefIds = [
      ...new Set([
        ...items.filter((i) => i.aipRefId).map((i) => i.aipRefId!),
      ]),
    ];

    const [reports, supplementals, obrAmounts] = await Promise.all([
      _fetchQuarterlyReports(reportIds),
      _fetchSupplementalByAipRef(aipRefIds),
      _fetchObrAipAmounts(aipRefIds),
    ]);

    const reportMap = new Map(reports.map((r) => [r.id, r]));

    const itemsByGroup = new Map<string, LbacObject[]>();
    for (const item of items) {
      const obj = _buildLbacItemObject(item, reportMap.get(item.quarterlyReportId), supplementals, obrAmounts, resolvedYear, resolvedQuarter);
      const existing = itemsByGroup.get(item.parentId) ?? [];
      existing.push(obj);
      itemsByGroup.set(item.parentId, existing);
    }

    const tree = _buildGroupTree(groups, itemsByGroup);
    return new Success(tree);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to retrieve LBAC items.", {}, e);
  }
}

/**
 * Returns all LBAC quarterly report data in a nested tree structure.
 * Shows partial item information (mfoPpa, appropriation, asCutOffMonth) and full quarterly report fields.
 *
 * @async
 * @function getAllQuarterlyReports
 * @param {number} [year] - The year to compute calculations for. Defaults to the current UTC+8 year.
 * @param {number} [quarter] - The quarter (1窶・) to compute calculations for. Defaults to the current UTC+8 quarter.
 * @returns {Promise<Result<LbacQuarterlyGroupObject[]>>} A result containing the quarterly report tree on success,
 *                                                        or a failure result on error.
 */
export async function getAllQuarterlyReports(year?: number, quarter?: number): Promise<Result<LbacQuarterlyGroupObject[]>> {
  try {
    const resolvedYear = year ?? _getCurrentYearUtc8();
    const resolvedQuarter = quarter ?? _getCurrentQuarterUtc8();

    const [groups, items] = await Promise.all([
      _fetchGroups(),
      _fetchItems(),
    ]);

    const reportIds = items.map((i) => i.quarterlyReportId);
    const aipRefIds = [
      ...new Set(items.filter((i) => i.aipRefId).map((i) => i.aipRefId!)),
    ];

    const [reports, supplementals, obrAmounts] = await Promise.all([
      _fetchQuarterlyReports(reportIds),
      _fetchSupplementalByAipRef(aipRefIds),
      _fetchObrAipAmounts(aipRefIds),
    ]);

    const reportMap = new Map(reports.map((r) => [r.id, r]));

    const itemsByGroup = new Map<string, LbacQuarterlyObject[]>();
    for (const item of items) {
      const obj = _buildLbacQuarterlyObject(item, reportMap.get(item.quarterlyReportId), supplementals, obrAmounts, resolvedYear, resolvedQuarter);
      const existing = itemsByGroup.get(item.parentId) ?? [];
      existing.push(obj);
      itemsByGroup.set(item.parentId, existing);
    }

    const tree = _buildQuarterlyGroupTree(groups, itemsByGroup);
    return new Success(tree);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to retrieve LBAC quarterly reports.", {}, e);
  }
}

/**
 * Returns all LBAC items in a nested tree for office viewer access (read-only subset of fields).
 *
 * @async
 * @function getAllViewerItems
 * @param {number} [year] - The year to compute calculations for. Defaults to the current UTC+8 year.
 * @param {number} [quarter] - The quarter (1窶・) to compute calculations for. Defaults to the current UTC+8 quarter.
 * @returns {Promise<Result<LbacViewerGroupObject[]>>} A result containing the viewer group/item tree on success,
 *                                                    or a failure result on error.
 */
export async function getAllViewerItems(year?: number, quarter?: number): Promise<Result<LbacViewerGroupObject[]>> {
  try {
    const resolvedYear = year ?? _getCurrentYearUtc8();
    const resolvedQuarter = quarter ?? _getCurrentQuarterUtc8();

    const [groups, items] = await Promise.all([_fetchGroups(), _fetchItems()]);

    const reportIds = items.map((i) => i.quarterlyReportId);
    const aipRefIds = [
      ...new Set(items.filter((i) => i.aipRefId).map((i) => i.aipRefId!)),
    ];

    const [reports, supplementals, obrAmounts] = await Promise.all([
      _fetchQuarterlyReports(reportIds),
      _fetchSupplementalByAipRef(aipRefIds),
      _fetchObrAipAmounts(aipRefIds),
    ]);

    const reportMap = new Map(reports.map((r) => [r.id, r]));

    const itemsByGroup = new Map<string, LbacViewerObject[]>();
    for (const item of items) {
      const obj = _buildLbacViewerObject(
        item,
        reportMap.get(item.quarterlyReportId),
        supplementals,
        obrAmounts,
        resolvedYear,
        resolvedQuarter,
      );
      const existing = itemsByGroup.get(item.parentId) ?? [];
      existing.push(obj);
      itemsByGroup.set(item.parentId, existing);
    }

    const tree = _buildViewerGroupTree(groups, itemsByGroup);
    return new Success(tree);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to retrieve LBAC viewer items.", {}, e);
  }
}

/**
 * Creates a new LBAC item in the specified group, along with an empty linked quarterly report.
 *
 * @async
 * @function createLbacItem
 * @param {string} groupId - The ID of the lbacGroups entry to place the item in.
 * @param {CreateLbacItemPayload} payload - The data for the new LBAC item.
 * @param {User} user - The authenticated user creating the item.
 * @returns {Promise<Result<LbacObject>>} A result containing the created and fully computed LBAC item on success,
 *                                        or a failure result on error.
 *
 * @remarks
 * - Creates a lbacQuarterlyReport record first (all fields null) then creates lbacItems referencing it.
 * - Returns a ValidationFailure if groupId, aipRefCode, implementingUnitId, or expenseCodeId do not exist.
 */
export async function createLbacItem(
  groupId: string,
  payload: CreateLbacItemPayload,
  user: User,
): Promise<Result<LbacObject>> {
  try {
    // Validate parent group exists
    const [groupRow] = await db.select({ id: lbacGroups.id })
      .from(lbacGroups).where(eq(lbacGroups.id, groupId)).limit(1);
    if (!groupRow) {
      return new Failure(ErrorCodes.ValidationFailure, "The specified group does not exist.", { groupId });
    }

    // Validate optional FKs
    if (payload.aipRefCode) {
      const [ref] = await db.select({ id: aipReferences.id }).from(aipReferences)
        .where(eq(aipReferences.id, payload.aipRefCode)).limit(1);
      if (!ref) {
        return new Failure(ErrorCodes.ValidationFailure, "The specified AIP reference does not exist.", { aipRefCode: payload.aipRefCode });
      }
    }
    if (payload.implementingUnitId) {
      const [unit] = await db.select({ id: officeCodes.id }).from(officeCodes)
        .where(eq(officeCodes.id, payload.implementingUnitId)).limit(1);
      if (!unit) {
        return new Failure(ErrorCodes.ValidationFailure, "The specified implementing unit does not exist.", { implementingUnitId: payload.implementingUnitId });
      }
    }
    if (payload.expenseCodeId) {
      const [expCode] = await db.select({ id: expenseClasses.id }).from(expenseClasses)
        .where(eq(expenseClasses.id, payload.expenseCodeId)).limit(1);
      if (!expCode) {
        return new Failure(ErrorCodes.ValidationFailure, "The specified expense code does not exist.", { expenseCodeId: payload.expenseCodeId });
      }
    }
    if (payload.saaobId) {
      const [saaob] = await db.select({ id: saaobEntries.id }).from(saaobEntries)
        .where(eq(saaobEntries.id, payload.saaobId)).limit(1);
      if (!saaob) {
        return new Failure(ErrorCodes.ValidationFailure, "The specified SAAOB entry does not exist.", { saaobId: payload.saaobId });
      }
    }

    const newItemId = await db.transaction(async (tx) => {
      const [qr] = await tx.insert(lbacQuarterlyReport).values({}).returning({ id: lbacQuarterlyReport.id });

      const [newItem] = await tx.insert(lbacItems).values({
        aipRefCode: payload.aipRefCode ?? null,
        mfoPpa: payload.mfoPpa,
        majorFinalOutput: payload.majorFinalOutput ?? null,
        performanceOutputIndicator: payload.performanceOutputIndicator ?? null,
        targetForBudgetYear: payload.targetForBudgetYear ?? null,
        proposedBudgetPS: casts.castToDecimal(payload.proposedBudgetPS ?? "0"),
        proposedBudgetMOOE: casts.castToDecimal(payload.proposedBudgetMOOE ?? "0"),
        proposedBudgetFE: casts.castToDecimal(payload.proposedBudgetFE ?? "0"),
        proposedBudgetCO: casts.castToDecimal(payload.proposedBudgetCO ?? "0"),
        remarks: payload.remarks ?? null,
        remarksForAllocation: payload.remarksForAllocation ?? null,
        gadable: payload.gadable ?? false,
        tagging: payload.tagging ?? null,
        amountAttributed: payload.amountAttributed ? casts.castToDecimal(payload.amountAttributed) : null,
        physicalTargets: payload.physicalTargets ?? null,
        priorYearAccomplishments: payload.priorYearAccomplishments ?? null,
        remarksForOtherMetadata: payload.remarksForOtherMetadata ?? null,
        implementingUnitId: payload.implementingUnitId ?? null,
        expenseCodeId: payload.expenseCodeId ?? null,
        saaobId: payload.saaobId ?? null,
        quarterlyReportId: qr.id,
        parentId: groupId,
        authorId: user.id,
      }).returning({ id: lbacItems.id });

      return newItem.id;
    });

    const fetchedItems = await _fetchItems().then((all) => all.filter((i) => i.id === newItemId));
    const item = fetchedItems[0];
    if (!item) {
      return new Failure(ErrorCodes.Fatal, "Unable to retrieve created LBAC item.", { newItemId });
    }

    const aipRefIds = item.aipRefId ? [item.aipRefId] : [];
    const [reports, supplementals, obrAmounts] = await Promise.all([
      _fetchQuarterlyReports([item.quarterlyReportId]),
      _fetchSupplementalByAipRef(aipRefIds),
      _fetchObrAipAmounts(aipRefIds),
    ]);
    const obj = _buildLbacItemObject(item, reports[0], supplementals, obrAmounts, _getCurrentYearUtc8(), _getCurrentQuarterUtc8());

    return new Success(obj);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to create LBAC item.", { groupId, userId: user.id }, e);
  }
}

/**
 * Creates a new LBAC group, optionally nested inside an existing group.
 *
 * @async
 * @function createLbacGroup
 * @param {User} user - The authenticated user creating the group.
 * @param {CreateLbacGroupPayload} payload - The data for the new group.
 * @param {string} [groupId] - Optional parent group ID. If omitted, the group is created at root level.
 * @returns {Promise<Result<BaseLbacGroupObject>>} A result containing the created group on success,
 *                                                  or a failure result on error.
 *
 * @remarks
 * - Returns ValidationFailure if groupId does not exist.
 * - Returns ValidationFailure if aipRefCode or implementingUnitId do not exist.
 */
export async function createLbacGroup(
  user: User,
  payload: CreateLbacGroupPayload,
  groupId?: string,
): Promise<Result<BaseLbacGroupObject>> {
  try {
    if (groupId) {
      const [parentGroup] = await db.select({ id: lbacGroups.id })
        .from(lbacGroups).where(eq(lbacGroups.id, groupId)).limit(1);
      if (!parentGroup) {
        return new Failure(ErrorCodes.ValidationFailure, "The specified parent group does not exist.", { groupId });
      }
    }

    if (payload.aipRefCode) {
      const [ref] = await db.select({ id: aipReferences.id }).from(aipReferences)
        .where(eq(aipReferences.id, payload.aipRefCode)).limit(1);
      if (!ref) {
        return new Failure(ErrorCodes.ValidationFailure, "The specified AIP reference does not exist.", { aipRefCode: payload.aipRefCode });
      }
    }

    if (payload.implementingUnitId) {
      const [unit] = await db.select({ id: officeCodes.id }).from(officeCodes)
        .where(eq(officeCodes.id, payload.implementingUnitId)).limit(1);
      if (!unit) {
        return new Failure(ErrorCodes.ValidationFailure, "The specified implementing unit does not exist.", { implementingUnitId: payload.implementingUnitId });
      }
    }

    const [newGroup] = await db.insert(lbacGroups).values({
      name: payload.name,
      aipRefCode: payload.aipRefCode ?? null,
      implementingUnitId: payload.implementingUnitId ?? null,
      parentId: groupId ?? null,
      authorId: user.id,
    }).returning({ id: lbacGroups.id });

    const fetchedGroups = await _fetchGroups().then((all) =>
      all.filter((g) => g.id === newGroup.id),
    );
    const fetchedGroup = fetchedGroups[0];
    if (!fetchedGroup) {
      return new Failure(ErrorCodes.Fatal, "Unable to retrieve created LBAC group.", { newGroupId: newGroup.id });
    }

    return new Success(_buildBaseLbacGroupObject(fetchedGroup));
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to create LBAC group.", { userId: user.id }, e);
  }
}

/**
 * Updates an existing LBAC item with the provided partial payload.
 *
 * @async
 * @function updateLbacItem
 * @param {string} lbacId - The ID of the lbacItems record to update.
 * @param {UpdateLbacItemPayload} payload - The fields to update (all optional).
 * @returns {Promise<Result<LbacObject>>} A result containing the updated and fully computed item on success,
 *                                        or a failure result on error.
 *
 * @remarks
 * - Returns ResourceNotFound if the item does not exist.
 * - Validates aipRefCode, implementingUnitId, and expenseCodeId if they are provided.
 */
export async function updateLbacItem(
  lbacId: string,
  payload: UpdateLbacItemPayload,
): Promise<Result<LbacObject>> {
  try {
    const [existingCheck] = await db.select({ id: lbacItems.id }).from(lbacItems)
      .where(eq(lbacItems.id, lbacId)).limit(1);
    if (!existingCheck) {
      return new Failure(ErrorCodes.ResourceNotFound, "LBAC item not found.", { lbacId });
    }

    if (payload.aipRefCode) {
      const [ref] = await db.select({ id: aipReferences.id }).from(aipReferences)
        .where(eq(aipReferences.id, payload.aipRefCode)).limit(1);
      if (!ref) {
        return new Failure(ErrorCodes.ValidationFailure, "The specified AIP reference does not exist.", { aipRefCode: payload.aipRefCode });
      }
    }
    if (payload.implementingUnitId) {
      const [unit] = await db.select({ id: officeCodes.id }).from(officeCodes)
        .where(eq(officeCodes.id, payload.implementingUnitId)).limit(1);
      if (!unit) {
        return new Failure(ErrorCodes.ValidationFailure, "The specified implementing unit does not exist.", { implementingUnitId: payload.implementingUnitId });
      }
    }
    if (payload.expenseCodeId) {
      const [expCode] = await db.select({ id: expenseClasses.id }).from(expenseClasses)
        .where(eq(expenseClasses.id, payload.expenseCodeId)).limit(1);
      if (!expCode) {
        return new Failure(ErrorCodes.ValidationFailure, "The specified expense code does not exist.", { expenseCodeId: payload.expenseCodeId });
      }
    }
    if (payload.saaobId) {
      const [saaob] = await db.select({ id: saaobEntries.id }).from(saaobEntries)
        .where(eq(saaobEntries.id, payload.saaobId)).limit(1);
      if (!saaob) {
        return new Failure(ErrorCodes.ValidationFailure, "The specified SAAOB entry does not exist.", { saaobId: payload.saaobId });
      }
    }

    const updateValues: Record<string, unknown> = {};
    if (payload.aipRefCode !== undefined) updateValues.aipRefCode = payload.aipRefCode;
    if (payload.mfoPpa !== undefined) updateValues.mfoPpa = payload.mfoPpa;
    if (payload.majorFinalOutput !== undefined) updateValues.majorFinalOutput = payload.majorFinalOutput;
    if (payload.performanceOutputIndicator !== undefined) updateValues.performanceOutputIndicator = payload.performanceOutputIndicator;
    if (payload.targetForBudgetYear !== undefined) updateValues.targetForBudgetYear = payload.targetForBudgetYear;
    if (payload.proposedBudgetPS !== undefined) updateValues.proposedBudgetPS = casts.castToDecimal(payload.proposedBudgetPS);
    if (payload.proposedBudgetMOOE !== undefined) updateValues.proposedBudgetMOOE = casts.castToDecimal(payload.proposedBudgetMOOE);
    if (payload.proposedBudgetFE !== undefined) updateValues.proposedBudgetFE = casts.castToDecimal(payload.proposedBudgetFE);
    if (payload.proposedBudgetCO !== undefined) updateValues.proposedBudgetCO = casts.castToDecimal(payload.proposedBudgetCO);
    if (payload.remarks !== undefined) updateValues.remarks = payload.remarks;
    if (payload.remarksForAllocation !== undefined) updateValues.remarksForAllocation = payload.remarksForAllocation;
    if (payload.gadable !== undefined) updateValues.gadable = payload.gadable;
    if (payload.tagging !== undefined) updateValues.tagging = payload.tagging;
    if (payload.amountAttributed !== undefined) updateValues.amountAttributed = payload.amountAttributed ? casts.castToDecimal(payload.amountAttributed) : null;
    if (payload.physicalTargets !== undefined) updateValues.physicalTargets = payload.physicalTargets;
    if (payload.priorYearAccomplishments !== undefined) updateValues.priorYearAccomplishments = payload.priorYearAccomplishments;
    if (payload.remarksForOtherMetadata !== undefined) updateValues.remarksForOtherMetadata = payload.remarksForOtherMetadata;
    if (payload.implementingUnitId !== undefined) updateValues.implementingUnitId = payload.implementingUnitId;
    if (payload.expenseCodeId !== undefined) updateValues.expenseCodeId = payload.expenseCodeId;
    if (payload.saaobId !== undefined) updateValues.saaobId = payload.saaobId;

    if (Object.keys(updateValues).length > 0) {
      await db.update(lbacItems).set(updateValues).where(eq(lbacItems.id, lbacId));
    }

    const updatedItems = await _fetchItems().then((all) => all.filter((i) => i.id === lbacId));
    const updatedItem = updatedItems[0];
    if (!updatedItem) {
      return new Failure(ErrorCodes.Fatal, "Unable to retrieve updated LBAC item.", { lbacId });
    }

    const aipRefIds = updatedItem.aipRefId ? [updatedItem.aipRefId] : [];
    const [reports, supplementals, obrAmounts] = await Promise.all([
      _fetchQuarterlyReports([updatedItem.quarterlyReportId]),
      _fetchSupplementalByAipRef(aipRefIds),
      _fetchObrAipAmounts(aipRefIds),
    ]);

    const obj = _buildLbacItemObject(updatedItem, reports[0], supplementals, obrAmounts, _getCurrentYearUtc8(), _getCurrentQuarterUtc8());
    return new Success(obj);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to update LBAC item.", { lbacId }, e);
  }
}

/**
 * Updates the quarterly report linked to the LBAC item identified by lbacId.
 *
 * @async
 * @function updateLbacQuarterlyReport
 * @param {string} lbacId - The ID of the lbacItems record whose quarterly report should be updated.
 * @param {UpdateLbacQuarterlyPayload} payload - The fields to update on the quarterly report (all optional).
 * @returns {Promise<Result<LbacQuarterlyObject>>} A result containing the updated LbacQuarterlyObject on success,
 *                                                  or a failure result on error.
 *
 * @remarks
 * - Returns ResourceNotFound if the lbacItems record does not exist.
 */
export async function updateLbacQuarterlyReport(
  lbacId: string,
  payload: UpdateLbacQuarterlyPayload,
): Promise<Result<LbacQuarterlyObject>> {
  try {
    const [item] = await db.select({ id: lbacItems.id, quarterlyReportId: lbacItems.quarterlyReportId })
      .from(lbacItems).where(eq(lbacItems.id, lbacId)).limit(1);
    if (!item) {
      return new Failure(ErrorCodes.ResourceNotFound, "LBAC item not found.", { lbacId });
    }

    const updateValues: Record<string, unknown> = {};
    if (payload.priorYearAccomplishments !== undefined) updateValues.priorYearAccomplishments = payload.priorYearAccomplishments;
    if (payload.physicalTargetQ1 !== undefined) updateValues.physicalTargetQ1 = payload.physicalTargetQ1;
    if (payload.physicalTargetQ2 !== undefined) updateValues.physicalTargetQ2 = payload.physicalTargetQ2;
    if (payload.physicalTargetQ3 !== undefined) updateValues.physicalTargetQ3 = payload.physicalTargetQ3;
    if (payload.physicalTargetQ4 !== undefined) updateValues.physicalTargetQ4 = payload.physicalTargetQ4;
    if (payload.physicalTargetTotal !== undefined) updateValues.physicalTargetTotal = payload.physicalTargetTotal;
    if (payload.actualPhysicalPerformanceQ1 !== undefined) updateValues.actualPhysicalPerformanceQ1 = payload.actualPhysicalPerformanceQ1;
    if (payload.actualPhysicalPerformanceQ2 !== undefined) updateValues.actualPhysicalPerformanceQ2 = payload.actualPhysicalPerformanceQ2;
    if (payload.actualPhysicalPerformanceQ3 !== undefined) updateValues.actualPhysicalPerformanceQ3 = payload.actualPhysicalPerformanceQ3;
    if (payload.actualPhysicalPerformanceQ4 !== undefined) updateValues.actualPhysicalPerformanceQ4 = payload.actualPhysicalPerformanceQ4;
    if (payload.variance !== undefined) updateValues.variance = payload.variance;
    if (payload.accomplishmentPercentage !== undefined) updateValues.accomplishmentPercentage = payload.accomplishmentPercentage;
    if (payload.remarks !== undefined) updateValues.remarks = payload.remarks;
    if (payload.targetForBudgetYear !== undefined) updateValues.targetForBudgetYear = payload.targetForBudgetYear;

    if (Object.keys(updateValues).length > 0) {
      await db.update(lbacQuarterlyReport)
        .set(updateValues)
        .where(eq(lbacQuarterlyReport.id, item.quarterlyReportId));
    }

    const fetchedItems = await _fetchItems().then((all) => all.filter((i) => i.id === lbacId));
    const fetchedItem = fetchedItems[0];
    if (!fetchedItem) {
      return new Failure(ErrorCodes.Fatal, "Unable to retrieve LBAC item after quarterly report update.", { lbacId });
    }

    const aipRefIds = fetchedItem.aipRefId ? [fetchedItem.aipRefId] : [];
    const [reports, supplementals, obrAmounts] = await Promise.all([
      _fetchQuarterlyReports([fetchedItem.quarterlyReportId]),
      _fetchSupplementalByAipRef(aipRefIds),
      _fetchObrAipAmounts(aipRefIds),
    ]);

    const obj = _buildLbacQuarterlyObject(fetchedItem, reports[0], supplementals, obrAmounts, _getCurrentYearUtc8(), _getCurrentQuarterUtc8());
    return new Success(obj);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to update LBAC quarterly report.", { lbacId }, e);
  }
}

/**
 * Updates an existing LBAC group with the provided partial payload.
 *
 * @async
 * @function updateLbacGroup
 * @param {string} lbacGroupId - The ID of the lbacGroups record to update.
 * @param {UpdateLbacGroupPayload} payload - The fields to update (all optional).
 * @returns {Promise<Result<BaseLbacGroupObject>>} A result containing the updated group on success,
 *                                                  or a failure result on error.
 *
 * @remarks
 * - Returns ResourceNotFound if the group does not exist.
 * - Validates aipRefCode and implementingUnitId if provided.
 */
export async function updateLbacGroup(
  lbacGroupId: string,
  payload: UpdateLbacGroupPayload,
): Promise<Result<BaseLbacGroupObject>> {
  try {
    const [existing] = await db.select({ id: lbacGroups.id }).from(lbacGroups)
      .where(eq(lbacGroups.id, lbacGroupId)).limit(1);
    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "LBAC group not found.", { lbacGroupId });
    }

    if (payload.aipRefCode) {
      const [ref] = await db.select({ id: aipReferences.id }).from(aipReferences)
        .where(eq(aipReferences.id, payload.aipRefCode)).limit(1);
      if (!ref) {
        return new Failure(ErrorCodes.ValidationFailure, "The specified AIP reference does not exist.", { aipRefCode: payload.aipRefCode });
      }
    }
    if (payload.implementingUnitId) {
      const [unit] = await db.select({ id: officeCodes.id }).from(officeCodes)
        .where(eq(officeCodes.id, payload.implementingUnitId)).limit(1);
      if (!unit) {
        return new Failure(ErrorCodes.ValidationFailure, "The specified implementing unit does not exist.", { implementingUnitId: payload.implementingUnitId });
      }
    }

    const updateValues: Record<string, unknown> = {};
    if (payload.name !== undefined) updateValues.name = payload.name;
    if (payload.aipRefCode !== undefined) updateValues.aipRefCode = payload.aipRefCode;
    if (payload.implementingUnitId !== undefined) updateValues.implementingUnitId = payload.implementingUnitId;

    if (Object.keys(updateValues).length > 0) {
      await db.update(lbacGroups).set(updateValues).where(eq(lbacGroups.id, lbacGroupId));
    }

    const fetchedGroups = await _fetchGroups().then((all) => all.filter((g) => g.id === lbacGroupId));
    const fetchedGroup = fetchedGroups[0];
    if (!fetchedGroup) {
      return new Failure(ErrorCodes.Fatal, "Unable to retrieve updated LBAC group.", { lbacGroupId });
    }

    return new Success(_buildBaseLbacGroupObject(fetchedGroup));
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to update LBAC group.", { lbacGroupId }, e);
  }
}

/**
 * Moves a LBAC group to a different parent group, or to root level when targetLbacGroup is null.
 *
 * @async
 * @function moveLbacGroup
 * @param {string} lbacGroupId - The ID of the group to move.
 * @param {string | null} targetLbacGroup - The target parent group ID, or null to move to root.
 * @returns {Promise<Result<string>>} A result containing the lbacGroupId on success,
 *                                     or a failure result on error.
 *
 * @remarks
 * - Returns ResourceNotFound if the group to move does not exist.
 * - Returns ValidationFailure if targetLbacGroup does not exist.
 * - Returns ValidationFailure if targetLbacGroup is a descendant of lbacGroupId (would create a cycle).
 */
export async function moveLbacGroup(
  lbacGroupId: string,
  targetLbacGroup: string | null,
): Promise<Result<string>> {
  try {
    const allGroups = await _fetchGroups();

    const existing = allGroups.find((g) => g.id === lbacGroupId);
    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "LBAC group not found.", { lbacGroupId });
    }

    if (targetLbacGroup !== null) {
      const target = allGroups.find((g) => g.id === targetLbacGroup);
      if (!target) {
        return new Failure(ErrorCodes.ValidationFailure, "Target group does not exist.", { targetLbacGroup });
      }

      // Prevent cycles: targetLbacGroup must not be a descendant of lbacGroupId
      const descendants = _collectDescendantGroupIds(lbacGroupId, allGroups);
      if (descendants.includes(targetLbacGroup)) {
        return new Failure(ErrorCodes.ValidationFailure, "Cannot move a group into one of its own descendants.", { lbacGroupId, targetLbacGroup });
      }
    }

    await db.update(lbacGroups)
      .set({ parentId: targetLbacGroup })
      .where(eq(lbacGroups.id, lbacGroupId));

    return new Success(lbacGroupId);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to move LBAC group.", { lbacGroupId, targetLbacGroup }, e);
  }
}

/**
 * Moves a LBAC item to a different group.
 *
 * @async
 * @function moveLbacItem
 * @param {string} lbacItemId - The ID of the lbacItems record to move.
 * @param {string} targetLbacGroup - The target group ID. Must be a valid lbacGroups ID.
 * @returns {Promise<Result<string>>} A result containing the lbacItemId on success,
 *                                     or a failure result on error.
 *
 * @remarks
 * - Returns ResourceNotFound if the item does not exist.
 * - Returns ValidationFailure if targetLbacGroup does not exist.
 */
export async function moveLbacItem(
  lbacItemId: string,
  targetLbacGroup: string,
): Promise<Result<string>> {
  try {
    const [item] = await db.select({ id: lbacItems.id }).from(lbacItems)
      .where(eq(lbacItems.id, lbacItemId)).limit(1);
    if (!item) {
      return new Failure(ErrorCodes.ResourceNotFound, "LBAC item not found.", { lbacItemId });
    }

    const [targetGroup] = await db.select({ id: lbacGroups.id }).from(lbacGroups)
      .where(eq(lbacGroups.id, targetLbacGroup)).limit(1);
    if (!targetGroup) {
      return new Failure(ErrorCodes.ValidationFailure, "Target group does not exist.", { targetLbacGroup });
    }

    await db.update(lbacItems).set({ parentId: targetLbacGroup }).where(eq(lbacItems.id, lbacItemId));

    return new Success(lbacItemId);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to move LBAC item.", { lbacItemId, targetLbacGroup }, e);
  }
}

/**
 * Deletes a specific LBAC item along with its linked quarterly report.
 *
 * @async
 * @function deleteLbacItem
 * @param {string} lbacItemId - The ID of the lbacItems record to delete.
 * @returns {Promise<Result<null>>} A result containing null on success, or a failure result on error.
 *
 * @remarks
 * - Returns ResourceNotFound if the item does not exist.
 * - Deletes both the lbacItems row and the linked lbacQuarterlyReport row in a transaction.
 */
export async function deleteLbacItem(lbacItemId: string): Promise<Result<null>> {
  try {
    const [item] = await db
      .select({ id: lbacItems.id, quarterlyReportId: lbacItems.quarterlyReportId })
      .from(lbacItems)
      .where(eq(lbacItems.id, lbacItemId))
      .limit(1);
    if (!item) {
      return new Failure(ErrorCodes.ResourceNotFound, "LBAC item not found.", { lbacItemId });
    }

    await db.transaction(async (tx) => {
      await tx.delete(lbacItems).where(eq(lbacItems.id, lbacItemId));
      await tx.delete(lbacQuarterlyReport).where(eq(lbacQuarterlyReport.id, item.quarterlyReportId));
    });

    return new Success(null);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to delete LBAC item.", { lbacItemId }, e);
  }
}

/**
 * Deletes a specific LBAC group. The group must be completely empty 窶・no lbacItems may exist
 * in the group or any of its descendant groups.
 *
 * @async
 * @function deleteLbacGroup
 * @param {string} lbacGroupId - The ID of the lbacGroups record to delete.
 * @returns {Promise<Result<null>>} A result containing null on success, or a failure result on error.
 *
 * @remarks
 * - Returns ResourceNotFound if the group does not exist.
 * - Returns ValidationFailure if any lbacItems exist within the group or its descendants.
 * - Deletes all descendant groups after confirming they are empty.
 */
export async function deleteLbacGroup(lbacGroupId: string): Promise<Result<null>> {
  try {
    const allGroups = await _fetchGroups();

    const existing = allGroups.find((g) => g.id === lbacGroupId);
    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "LBAC group not found.", { lbacGroupId });
    }

    const descendants = _collectDescendantGroupIds(lbacGroupId, allGroups);
    const allGroupIds = [lbacGroupId, ...descendants];

    // Check for any items in this group or descendants
    const itemsInGroup = await db
      .select({ id: lbacItems.id })
      .from(lbacItems)
      .where(inArray(lbacItems.parentId, allGroupIds))
      .limit(1);

    if (itemsInGroup.length > 0) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "Cannot delete a group that still contains LBAC items. Remove all items first.",
        { lbacGroupId },
      );
    }

    // Delete from deepest descendants up to avoid FK constraint violations
    const groupsByDepth = new Map<string, number>();
    const _computeDepth = (id: string, depth: number) => {
      groupsByDepth.set(id, depth);
      const children = allGroups.filter((g) => g.parentId === id);
      for (const child of children) {
        _computeDepth(child.id, depth + 1);
      }
    };
    _computeDepth(lbacGroupId, 0);

    const sortedIds = [...allGroupIds].sort((a, b) => (groupsByDepth.get(b) ?? 0) - (groupsByDepth.get(a) ?? 0));

    await db.transaction(async (tx) => {
      for (const id of sortedIds) {
        await tx.delete(lbacGroups).where(eq(lbacGroups.id, id));
      }
    });

    return new Success(null);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to delete LBAC group.", { lbacGroupId }, e);
  }
}

// ============================================================
// Collection performance
// ============================================================

/**
 * Fetches the full collection performance hierarchy for the current UTC+8 year.
 *
 * @description
 * Returns all groups and items as a nested tree. Monthly values are filtered to the
 * current calendar year in UTC+8; derived quarterly totals and performance metrics are
 * computed per item. Each group includes rolled-up totals for all numeric fields across
 * its items and nested subgroups (text fields such as particulars and account code are excluded).
 *
 * @async
 * @function collGetAll
 * @returns {Promise<Result<CollPerfGroupObject[]>>} The root group tree on success, or a failure result on error.
 */
export async function collGetAll(): Promise<Result<CollPerfGroupObject[]>> {
  try {
    const currentYear = getCollPerfCurrentYear();
    const [allGroups, allData, allMonthly] = await Promise.all([
      fetchCollPerfGroups(),
      db
        .select({
          id: lbacCollectionPerformanceData.id,
          particulars: lbacCollectionPerformanceData.particulars,
          accountCode: lbacCollectionPerformanceData.accountCode,
          incomeTarget: lbacCollectionPerformanceData.incomeTarget,
          groupId: lbacCollectionPerformanceData.groupId,
        })
        .from(lbacCollectionPerformanceData),
      db
        .select({
          id: lbacCollectionPerformanceMonthlyData.id,
          month: lbacCollectionPerformanceMonthlyData.month,
          year: lbacCollectionPerformanceMonthlyData.year,
          quarter: lbacCollectionPerformanceMonthlyData.quarter,
          value: lbacCollectionPerformanceMonthlyData.value,
          dataId: lbacCollectionPerformanceMonthlyData.dataId,
        })
        .from(lbacCollectionPerformanceMonthlyData)
        .where(eq(lbacCollectionPerformanceMonthlyData.year, currentYear)),
    ]);

    const monthlyByDataId = new Map<string, CollPerfMonthlyRow[]>();
    for (const m of allMonthly) {
      const row: CollPerfMonthlyRow = { ...m, value: String(m.value) };
      const list = monthlyByDataId.get(m.dataId) ?? [];
      list.push(row);
      monthlyByDataId.set(m.dataId, list);
    }

    const itemsByGroup = new Map<string, CollPerfItemObject[]>();
    for (const d of allData) {
      const dataRow: CollPerfDataRow = {
        ...d,
        incomeTarget: String(d.incomeTarget),
      };
      const item = buildCollPerfItemObject(dataRow, monthlyByDataId.get(d.id) ?? []);
      const list = itemsByGroup.get(d.groupId) ?? [];
      list.push(item);
      itemsByGroup.set(d.groupId, list);
    }

    return new Success(buildCollPerfTree(allGroups, itemsByGroup));
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to fetch collection performance data.", undefined, e);
  }
}

/**
 * Creates a collection performance group, optionally nested under a parent group.
 *
 * @description
 * Inserts a new group row. When parentId is provided, the parent must exist.
 *
 * @async
 * @function collCreateGroup
 * @param {User} user - The authenticated user creating the group.
 * @param {string} name - Display name for the group.
 * @param {string} [parentId] - Optional parent group id; omit for root level.
 * @returns {Promise<Result<{ id: string; name: string; parentId: string | null }>>} The created group on success, or a failure result on error.
 *
 * @remarks
 * - Returns ValidationFailure when parentId does not reference an existing group.
 */
export async function collCreateGroup(
  user: User,
  name: string,
  parentId?: string,
): Promise<Result<{ id: string; name: string; parentId: string | null }>> {
  try {
    if (parentId) {
      const [parent] = await db
        .select({ id: lbacCollectionPerformanceGroup.id })
        .from(lbacCollectionPerformanceGroup)
        .where(eq(lbacCollectionPerformanceGroup.id, parentId))
        .limit(1);
      if (!parent) {
        return new Failure(ErrorCodes.ValidationFailure, "The specified parent group does not exist.", { parentId });
      }
    }

    const [created] = await db
      .insert(lbacCollectionPerformanceGroup)
      .values({
        name,
        parentId: parentId ?? null,
        authorId: user.id,
      })
      .returning({
        id: lbacCollectionPerformanceGroup.id,
        name: lbacCollectionPerformanceGroup.name,
        parentId: lbacCollectionPerformanceGroup.parentId,
      });

    return new Success(created);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to create collection performance group.", { userId: user.id }, e);
  }
}

/**
 * Updates the name of a collection performance group.
 *
 * @async
 * @function collModifyGroup
 * @param {string} id - The group id to update.
 * @param {string} name - The new group name.
 * @returns {Promise<Result<{ id: string; name: string }>>} The updated group on success, or a failure result on error.
 *
 * @remarks
 * - Returns ResourceNotFound when the group does not exist.
 */
export async function collModifyGroup(
  id: string,
  name: string,
): Promise<Result<{ id: string; name: string }>> {
  try {
    const [existing] = await db
      .select({ id: lbacCollectionPerformanceGroup.id })
      .from(lbacCollectionPerformanceGroup)
      .where(eq(lbacCollectionPerformanceGroup.id, id))
      .limit(1);
    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "Collection performance group not found.", { id });
    }

    await db
      .update(lbacCollectionPerformanceGroup)
      .set({ name })
      .where(eq(lbacCollectionPerformanceGroup.id, id));

    return new Success({ id, name });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to update collection performance group.", { id }, e);
  }
}

/**
 * Deletes a collection performance group when it has no child groups or data items.
 *
 * @async
 * @function collDeleteGroup
 * @param {string} id - The group id to delete.
 * @returns {Promise<Result<{ id: string }>>} The deleted group id on success, or a failure result on error.
 *
 * @remarks
 * - Returns ResourceNotFound when the group does not exist.
 * - Returns ValidationFailure when the group or any descendant still contains items or child groups with items.
 * - Deletes empty descendant groups deepest-first before removing the target group.
 */
export async function collDeleteGroup(id: string): Promise<Result<{ id: string }>> {
  try {
    const allGroups = await fetchCollPerfGroups();
    const existing = allGroups.find((g) => g.id === id);
    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "Collection performance group not found.", { id });
    }

    const descendants = collectCollPerfDescendantGroupIds(id, allGroups);
    const allGroupIds = [id, ...descendants];

    const itemsInTree = await db
      .select({ id: lbacCollectionPerformanceData.id })
      .from(lbacCollectionPerformanceData)
      .where(inArray(lbacCollectionPerformanceData.groupId, allGroupIds))
      .limit(1);

    if (itemsInTree.length > 0) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "Cannot delete a group that still contains collection performance items. Remove all items first.",
        { id },
      );
    }

    const groupsByDepth = new Map<string, number>();
    const computeDepth = (groupId: string, depth: number) => {
      groupsByDepth.set(groupId, depth);
      const children = allGroups.filter((g) => g.parentId === groupId);
      for (const child of children) {
        computeDepth(child.id, depth + 1);
      }
    };
    computeDepth(id, 0);

    const sortedIds = [...allGroupIds].sort(
      (a, b) => (groupsByDepth.get(b) ?? 0) - (groupsByDepth.get(a) ?? 0),
    );

    await db.transaction(async (tx) => {
      for (const groupId of sortedIds) {
        await tx
          .delete(lbacCollectionPerformanceGroup)
          .where(eq(lbacCollectionPerformanceGroup.id, groupId));
      }
    });

    return new Success({ id });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to delete collection performance group.", { id }, e);
  }
}

/**
 * Moves a collection performance group to a new parent or to the root level.
 *
 * @async
 * @function collMoveGroup
 * @param {string} id - The group id to move.
 * @param {string} [parentId] - Target parent group id, or omit/null for root.
 * @returns {Promise<Result<{ id: string; parentId: string | null }>>} The moved group on success, or a failure result on error.
 *
 * @remarks
 * - Returns ResourceNotFound when the group to move does not exist.
 * - Returns ValidationFailure when parentId does not exist or would create a cycle.
 */
export async function collMoveGroup(
  id: string,
  parentId?: string,
): Promise<Result<{ id: string; parentId: string | null }>> {
  try {
    const allGroups = await fetchCollPerfGroups();
    const existing = allGroups.find((g) => g.id === id);
    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "Collection performance group not found.", { id });
    }

    const targetParentId = parentId ?? null;

    if (targetParentId !== null) {
      const target = allGroups.find((g) => g.id === targetParentId);
      if (!target) {
        return new Failure(ErrorCodes.ValidationFailure, "Target group does not exist.", { parentId: targetParentId });
      }

      const descendants = collectCollPerfDescendantGroupIds(id, allGroups);
      if (descendants.includes(targetParentId) || targetParentId === id) {
        return new Failure(
          ErrorCodes.ValidationFailure,
          "Cannot move a group into itself or one of its descendants.",
          { id, parentId: targetParentId },
        );
      }
    }

    await db
      .update(lbacCollectionPerformanceGroup)
      .set({ parentId: targetParentId })
      .where(eq(lbacCollectionPerformanceGroup.id, id));

    return new Success({ id, parentId: targetParentId });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to move collection performance group.", { id, parentId }, e);
  }
}

/**
 * Creates a collection performance data item under a group.
 *
 * @description
 * Inserts the data row and optionally upserts monthly values. Monthly entries with the same
 * month and year update existing rows instead of creating duplicates.
 *
 * @async
 * @function collCreateItem
 * @param {User} user - The authenticated user creating the item.
 * @param {string} parentId - The parent group id.
 * @param {CreateCollPerfDataPayload} payload - Item fields and optional monthly data.
 * @returns {Promise<Result<CollPerfData>>} The created item with derived fields on success, or a failure result on error.
 *
 * @remarks
 * - Returns ValidationFailure when parentId does not reference an existing group.
 */
export async function collCreateItem(
  user: User,
  parentId: string,
  payload: CreateCollPerfDataPayload,
): Promise<Result<CollPerfData>> {
  try {
    const [parent] = await db
      .select({ id: lbacCollectionPerformanceGroup.id })
      .from(lbacCollectionPerformanceGroup)
      .where(eq(lbacCollectionPerformanceGroup.id, parentId))
      .limit(1);
    if (!parent) {
      return new Failure(ErrorCodes.ValidationFailure, "The specified parent group does not exist.", { parentId });
    }

    const [created] = await db
      .insert(lbacCollectionPerformanceData)
      .values({
        particulars: payload.particulars,
        accountCode: payload.accountCode ?? null,
        incomeTarget: casts.castToDecimal(payload.incomeTarget),
        groupId: parentId,
        authorId: user.id,
      })
      .returning({ id: lbacCollectionPerformanceData.id });

    if (payload.monthlyData && payload.monthlyData.length > 0) {
      await upsertCollPerfMonthlyData(created.id, payload.monthlyData);
    }

    const item = await fetchCollPerfItemById(created.id);
    if (!item) {
      return new Failure(ErrorCodes.Fatal, "Unable to retrieve created collection performance item.", { id: created.id });
    }

    return new Success(toCollPerfData(item));
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to create collection performance item.", { parentId, userId: user.id }, e);
  }
}

/**
 * Updates a collection performance data item and optionally upserts monthly values.
 *
 * @description
 * Applies partial updates to scalar fields. Monthly entries with matching month and year
 * update existing rows; non-matching entries are inserted.
 *
 * @async
 * @function collModifyItem
 * @param {string} id - The data item id.
 * @param {Partial<CreateCollPerfDataPayload>} payload - Fields to update (all optional).
 * @returns {Promise<Result<CollPerfData>>} The updated item with derived fields on success, or a failure result on error.
 *
 * @remarks
 * - Returns ResourceNotFound when the item does not exist.
 */
export async function collModifyItem(
  id: string,
  payload: Partial<CreateCollPerfDataPayload>,
): Promise<Result<CollPerfData>> {
  try {
    const [existing] = await db
      .select({ id: lbacCollectionPerformanceData.id })
      .from(lbacCollectionPerformanceData)
      .where(eq(lbacCollectionPerformanceData.id, id))
      .limit(1);
    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "Collection performance item not found.", { id });
    }

    const updateValues: Record<string, unknown> = {};
    if (payload.particulars !== undefined) updateValues.particulars = payload.particulars;
    if (payload.accountCode !== undefined) updateValues.accountCode = payload.accountCode;
    if (payload.incomeTarget !== undefined) updateValues.incomeTarget = casts.castToDecimal(payload.incomeTarget);

    if (Object.keys(updateValues).length > 0) {
      await db
        .update(lbacCollectionPerformanceData)
        .set(updateValues)
        .where(eq(lbacCollectionPerformanceData.id, id));
    }

    if (payload.monthlyData && payload.monthlyData.length > 0) {
      await upsertCollPerfMonthlyData(id, payload.monthlyData);
    }

    const item = await fetchCollPerfItemById(id);
    if (!item) {
      return new Failure(ErrorCodes.Fatal, "Unable to retrieve updated collection performance item.", { id });
    }

    return new Success(toCollPerfData(item));
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to update collection performance item.", { id }, e);
  }
}

/**
 * Deletes a collection performance data item and its monthly rows.
 *
 * @async
 * @function collDeleteItem
 * @param {string} id - The data item id.
 * @returns {Promise<Result<{ id: string }>>} The deleted item id on success, or a failure result on error.
 *
 * @remarks
 * - Returns ResourceNotFound when the item does not exist.
 */
export async function collDeleteItem(id: string): Promise<Result<{ id: string }>> {
  try {
    const [existing] = await db
      .select({ id: lbacCollectionPerformanceData.id })
      .from(lbacCollectionPerformanceData)
      .where(eq(lbacCollectionPerformanceData.id, id))
      .limit(1);
    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "Collection performance item not found.", { id });
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(lbacCollectionPerformanceMonthlyData)
        .where(eq(lbacCollectionPerformanceMonthlyData.dataId, id));
      await tx.delete(lbacCollectionPerformanceData).where(eq(lbacCollectionPerformanceData.id, id));
    });

    return new Success({ id });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to delete collection performance item.", { id }, e);
  }
}

/**
 * Moves a collection performance data item to another group.
 *
 * @async
 * @function collMoveItem
 * @param {string} id - The data item id.
 * @param {string} parentId - The target group id.
 * @returns {Promise<Result<{ id: string; parentId: string }>>} The moved item reference on success, or a failure result on error.
 *
 * @remarks
 * - Returns ResourceNotFound when the item does not exist.
 * - Returns ValidationFailure when parentId does not reference an existing group.
 */
export async function collMoveItem(
  id: string,
  parentId: string,
): Promise<Result<{ id: string; parentId: string }>> {
  try {
    const [existing] = await db
      .select({ id: lbacCollectionPerformanceData.id })
      .from(lbacCollectionPerformanceData)
      .where(eq(lbacCollectionPerformanceData.id, id))
      .limit(1);
    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "Collection performance item not found.", { id });
    }

    const [target] = await db
      .select({ id: lbacCollectionPerformanceGroup.id })
      .from(lbacCollectionPerformanceGroup)
      .where(eq(lbacCollectionPerformanceGroup.id, parentId))
      .limit(1);
    if (!target) {
      return new Failure(ErrorCodes.ValidationFailure, "Target group does not exist.", { parentId });
    }

    await db
      .update(lbacCollectionPerformanceData)
      .set({ groupId: parentId })
      .where(eq(lbacCollectionPerformanceData.id, id));

    return new Success({ id, parentId });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to move collection performance item.", { id, parentId }, e);
  }
}

/**
 * Validates a LBAC template type from client input.
 *
 * @param {unknown} type - Raw template type.
 * @returns {Result<LbacTemplateType>} Parsed type or validation failure.
 */
export function parseLbacTemplateType(type: unknown): Result<LbacTemplateType> {
  if (type !== "header" && type !== "footer") {
    return new Failure(
      ErrorCodes.ValidationFailure,
      "Invalid template type. Must be 'header' or 'footer'.",
    );
  }
  return new Success(type);
}

/**
 * Returns header and footer templates for LBAC main data export.
 *
 * @async
 * @function getMainDataTemplates
 * @returns {Promise<Result<LbacTemplatesBundle>>} Combined header/footer metadata or failure.
 */
export async function getMainDataTemplates(): Promise<Result<LbacTemplatesBundle>> {
  return _fetchLbacTemplatesBundle(LBAC_MAIN_DATA_TEMPLATE_IDENTIFIER);
}

/**
 * Uploads a new header or footer template for LBAC main data export.
 *
 * @async
 * @function uploadMainDataTemplate
 * @param {LbacTemplateUploadInput} input - Template type, file buffer, and filename.
 * @returns {Promise<Result<LbacTemplateInfo>>} Template metadata on success.
 */
export async function uploadMainDataTemplate(
  input: LbacTemplateUploadInput,
): Promise<Result<LbacTemplateInfo>> {
  const result = await templateBucket.upload({
    identifier: LBAC_MAIN_DATA_TEMPLATE_IDENTIFIER,
    type: input.type,
    file: input.file,
    filename: input.filename,
  });
  if (result instanceof Success) {
    return new Success(_mapLbacTemplate(result.value));
  }
  return result;
}

/**
 * Replaces an existing header or footer template for LBAC main data export.
 *
 * @async
 * @function modifyMainDataTemplate
 * @param {LbacTemplateUploadInput} input - Template type, file buffer, and filename.
 * @returns {Promise<Result<LbacTemplateInfo>>} Updated template metadata on success.
 */
export async function modifyMainDataTemplate(
  input: LbacTemplateUploadInput,
): Promise<Result<LbacTemplateInfo>> {
  const result = await templateBucket.modify({
    identifier: LBAC_MAIN_DATA_TEMPLATE_IDENTIFIER,
    type: input.type,
    file: input.file,
    filename: input.filename,
  });
  if (result instanceof Success) {
    return new Success(_mapLbacTemplate(result.value));
  }
  return result;
}

/**
 * Removes a header or footer template for LBAC main data export.
 *
 * @async
 * @function removeMainDataTemplate
 * @param {LbacTemplateType} type - Template type to delete.
 * @returns {Promise<Result<void>>} Void success or failure.
 */
export async function removeMainDataTemplate(type: LbacTemplateType): Promise<Result<void>> {
  return templateBucket.remove({
    identifier: LBAC_MAIN_DATA_TEMPLATE_IDENTIFIER,
    type,
  });
}

/**
 * Returns header and footer templates for LBAC quarterly export.
 *
 * @async
 * @function getQuarterlyTemplates
 * @returns {Promise<Result<LbacTemplatesBundle>>} Combined header/footer metadata or failure.
 */
export async function getQuarterlyTemplates(): Promise<Result<LbacTemplatesBundle>> {
  return _fetchLbacTemplatesBundle(LBAC_QUARTERLY_TEMPLATE_IDENTIFIER);
}

/**
 * Uploads a new header or footer template for LBAC quarterly export.
 *
 * @async
 * @function uploadQuarterlyTemplate
 * @param {LbacTemplateUploadInput} input - Template type, file buffer, and filename.
 * @returns {Promise<Result<LbacTemplateInfo>>} Template metadata on success.
 */
export async function uploadQuarterlyTemplate(
  input: LbacTemplateUploadInput,
): Promise<Result<LbacTemplateInfo>> {
  const result = await templateBucket.upload({
    identifier: LBAC_QUARTERLY_TEMPLATE_IDENTIFIER,
    type: input.type,
    file: input.file,
    filename: input.filename,
  });
  if (result instanceof Success) {
    return new Success(_mapLbacTemplate(result.value));
  }
  return result;
}

/**
 * Replaces an existing header or footer template for LBAC quarterly export.
 *
 * @async
 * @function modifyQuarterlyTemplate
 * @param {LbacTemplateUploadInput} input - Template type, file buffer, and filename.
 * @returns {Promise<Result<LbacTemplateInfo>>} Updated template metadata on success.
 */
export async function modifyQuarterlyTemplate(
  input: LbacTemplateUploadInput,
): Promise<Result<LbacTemplateInfo>> {
  const result = await templateBucket.modify({
    identifier: LBAC_QUARTERLY_TEMPLATE_IDENTIFIER,
    type: input.type,
    file: input.file,
    filename: input.filename,
  });
  if (result instanceof Success) {
    return new Success(_mapLbacTemplate(result.value));
  }
  return result;
}

/**
 * Removes a header or footer template for LBAC quarterly export.
 *
 * @async
 * @function removeQuarterlyTemplate
 * @param {LbacTemplateType} type - Template type to delete.
 * @returns {Promise<Result<void>>} Void success or failure.
 */
export async function removeQuarterlyTemplate(type: LbacTemplateType): Promise<Result<void>> {
  return templateBucket.remove({
    identifier: LBAC_QUARTERLY_TEMPLATE_IDENTIFIER,
    type,
  });
}

/**
 * Returns header and footer templates for collection performance export.
 *
 * @async
 * @function getCollPerfTemplates
 * @returns {Promise<Result<LbacTemplatesBundle>>} Combined header/footer metadata or failure.
 */
export async function getCollPerfTemplates(): Promise<Result<LbacTemplatesBundle>> {
  return _fetchLbacTemplatesBundle(LBAC_COLL_PERF_TEMPLATE_IDENTIFIER);
}

/**
 * Uploads a new header or footer template for collection performance export.
 *
 * @async
 * @function uploadCollPerfTemplate
 * @param {LbacTemplateUploadInput} input - Template type, file buffer, and filename.
 * @returns {Promise<Result<LbacTemplateInfo>>} Template metadata on success.
 */
export async function uploadCollPerfTemplate(
  input: LbacTemplateUploadInput,
): Promise<Result<LbacTemplateInfo>> {
  const result = await templateBucket.upload({
    identifier: LBAC_COLL_PERF_TEMPLATE_IDENTIFIER,
    type: input.type,
    file: input.file,
    filename: input.filename,
  });
  if (result instanceof Success) {
    return new Success(_mapLbacTemplate(result.value));
  }
  return result;
}

/**
 * Replaces an existing header or footer template for collection performance export.
 *
 * @async
 * @function modifyCollPerfTemplate
 * @param {LbacTemplateUploadInput} input - Template type, file buffer, and filename.
 * @returns {Promise<Result<LbacTemplateInfo>>} Updated template metadata on success.
 */
export async function modifyCollPerfTemplate(
  input: LbacTemplateUploadInput,
): Promise<Result<LbacTemplateInfo>> {
  const result = await templateBucket.modify({
    identifier: LBAC_COLL_PERF_TEMPLATE_IDENTIFIER,
    type: input.type,
    file: input.file,
    filename: input.filename,
  });
  if (result instanceof Success) {
    return new Success(_mapLbacTemplate(result.value));
  }
  return result;
}

/**
 * Removes a header or footer template for collection performance export.
 *
 * @async
 * @function removeCollPerfTemplate
 * @param {LbacTemplateType} type - Template type to delete.
 * @returns {Promise<Result<void>>} Void success or failure.
 */
export async function removeCollPerfTemplate(type: LbacTemplateType): Promise<Result<void>> {
  return templateBucket.remove({
    identifier: LBAC_COLL_PERF_TEMPLATE_IDENTIFIER,
    type,
  });
}

/**
 * Exports LBAC main data for the given year/quarter to an XLSX buffer.
 *
 * @description
 * Calls {@link getAllItems} with year/quarter, then builds a formatted Excel workbook.
 * Header/footer templates under {@link LBAC_MAIN_DATA_TEMPLATE_IDENTIFIER} are included when present.
 *
 * @async
 * @function exportMainDataToBuffer
 * @param {LbacMainExportOptions} options - Year, quarter, and selected columns.
 * @returns {Promise<Result<Buffer>>} XLSX buffer on success, or failure.
 */
export async function exportMainDataToBuffer(
  options: LbacMainExportOptions,
): Promise<Result<Buffer>> {
  try {
    const dataResult = await getAllItems(options.year, options.quarter);
    if (dataResult instanceof Failure) return dataResult;

    const [headerResult, footerResult] = await Promise.all([
      templateBucket.get({ identifier: LBAC_MAIN_DATA_TEMPLATE_IDENTIFIER, type: "header" }),
      templateBucket.get({ identifier: LBAC_MAIN_DATA_TEMPLATE_IDENTIFIER, type: "footer" }),
    ]);
    const headerPath = headerResult instanceof Success ? headerResult.value.templatePath : null;
    const footerPath = footerResult instanceof Success ? footerResult.value.templatePath : null;

    const buffer = await _buildLbacExcelBuffer(
      dataResult.value,
      options.year,
      options.quarter,
      options.columns,
      headerPath,
      footerPath,
    );
    return new Success(buffer);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to export LBAC main data.", {}, e);
  }
}

/**
 * Exports LBAC quarterly report data for the given year/quarter to an XLSX buffer.
 *
 * @description
 * Calls {@link getAllQuarterlyReports} with year/quarter, then builds a formatted Excel workbook.
 * Header/footer templates under {@link LBAC_QUARTERLY_TEMPLATE_IDENTIFIER} are included when present.
 *
 * @async
 * @function exportQuarterlyToBuffer
 * @param {LbacQuarterlyExportOptions} options - Year, quarter, and selected columns.
 * @returns {Promise<Result<Buffer>>} XLSX buffer on success, or failure.
 */
export async function exportQuarterlyToBuffer(
  options: LbacQuarterlyExportOptions,
): Promise<Result<Buffer>> {
  try {
    const dataResult = await getAllQuarterlyReports(options.year, options.quarter);
    if (dataResult instanceof Failure) return dataResult;

    const [headerResult, footerResult] = await Promise.all([
      templateBucket.get({ identifier: LBAC_QUARTERLY_TEMPLATE_IDENTIFIER, type: "header" }),
      templateBucket.get({ identifier: LBAC_QUARTERLY_TEMPLATE_IDENTIFIER, type: "footer" }),
    ]);
    const headerPath = headerResult instanceof Success ? headerResult.value.templatePath : null;
    const footerPath = footerResult instanceof Success ? footerResult.value.templatePath : null;

    const buffer = await _buildLbacQuarterlyExcelBuffer(
      dataResult.value,
      options.year,
      options.quarter,
      options.columns,
      headerPath,
      footerPath,
    );
    return new Success(buffer);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to export LBAC quarterly data.", {}, e);
  }
}

/**
 * Exports collection performance data for the given year/quarter to an XLSX buffer (LBac Form No. 1).
 *
 * @description
 * Calls {@link collGetAll}, then builds a formatted Excel workbook with hierarchical rows and
 * quarter-specific estimated/actual income columns. A footer template under
 * {@link LBAC_COLL_PERF_TEMPLATE_IDENTIFIER} is appended when present.
 *
 * @async
 * @function exportCollPerfToBuffer
 * @param {CollPerfExportOptions} options - Year, quarter, and selected columns.
 * @returns {Promise<Result<Buffer>>} XLSX buffer on success, or failure.
 */
export async function exportCollPerfToBuffer(
  options: CollPerfExportOptions,
): Promise<Result<Buffer>> {
  try {
    const dataResult = await collGetAll();
    if (dataResult instanceof Failure) return dataResult;

    const footerResult = await templateBucket.get({
      identifier: LBAC_COLL_PERF_TEMPLATE_IDENTIFIER,
      type: "footer",
    });
    const footerPath = footerResult instanceof Success ? footerResult.value.templatePath : null;

    const buffer = await _buildCollPerfExcelBuffer(
      dataResult.value,
      options.year,
      options.quarter,
      options.columns,
      footerPath,
    );
    return new Success(buffer);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to export collection performance data.", {}, e);
  }
}

/**
 * Returns the current year in UTC+8.
 */
function _getCurrentYearUtc8(): number {
  return DateTime.now().setZone("UTC+8").year;
}

/**
 * Returns the current quarter (1窶・) in UTC+8.
 */
function _getCurrentQuarterUtc8(): number {
  return DateTime.now().setZone("UTC+8").quarter;
}

/**
 * Returns the inclusive start and exclusive end Date boundaries for a given quarter in UTC+8,
 * expressed as UTC Date objects suitable for database timestamp comparisons.
 *
 * @param {number} year - The calendar year.
 * @param {number} quarter - Quarter number (1窶・).
 * @returns {{ start: Date; end: Date }} The start (inclusive) and end (exclusive) boundaries.
 */
function _getQuarterBoundsUtc8(year: number, quarter: number): { start: Date; end: Date } {
  const startMonth = (quarter - 1) * 3 + 1;
  const start = DateTime.fromObject({ year, month: startMonth, day: 1 }, { zone: "UTC+8" }).toUTC().toJSDate();
  const endMonth = startMonth + 3;
  const endYear = endMonth > 12 ? year + 1 : year;
  const normalizedEndMonth = endMonth > 12 ? 1 : endMonth;
  const end = DateTime.fromObject({ year: endYear, month: normalizedEndMonth, day: 1 }, { zone: "UTC+8" }).toUTC().toJSDate();
  return { start, end };
}

/**
 * Returns the start of the current month in UTC+8, expressed as a UTC Date for database comparisons.
 *
 * @returns {Date} The start of the current month (UTC).
 */
function _getCurrentMonthStartUtc8(): Date {
  const now = DateTime.now().setZone("UTC+8");
  return DateTime.fromObject({ year: now.year, month: now.month, day: 1 }, { zone: "UTC+8" }).toUTC().toJSDate();
}

/**
 * Returns the appropriate cut-off date boundary for OBR obligation sums when viewing a specific quarter.
 *
 * - For the current year/quarter: returns the start of the current month (partial-month cut-off).
 * - For any other year/quarter: returns the exclusive end of the specified quarter (first day of
 *   the following quarter), so all obligations within the historical quarter are included.
 *
 * @param {number} year - The year to view.
 * @param {number} quarter - The quarter to view (1窶・).
 * @returns {Date} The cut-off boundary as a UTC Date.
 */
function _getMonthStartForQuarterView(year: number, quarter: number): Date {
  if (year === _getCurrentYearUtc8() && quarter === _getCurrentQuarterUtc8()) {
    return _getCurrentMonthStartUtc8();
  }
  return _getQuarterBoundsUtc8(year, quarter).end;
}

/**
 * Fetches all supplemental records whose aipRefCode matches any of the given IDs.
 * Returns entries annotated with their quarter, year, and sign-adjusted amount string.
 *
 * @async
 * @param {string[]} aipRefIds - List of aipReferences IDs to match against.
 * @returns {Promise<SupplementalEntry[]>} Supplemental entries with quarter and amount info.
 */
async function _fetchSupplementalByAipRef(aipRefIds: string[]): Promise<SupplementalEntry[]> {
  if (aipRefIds.length === 0) return [];

  const rows = await db
    .select({
      aipRefCode: supplemental.aipRefCode,
      amount: supplemental.amount,
      supplementalType: supplemental.supplementalType,
      createdAt: supplemental.createdAt,
    })
    .from(supplemental)
    .where(inArray(supplemental.aipRefCode, aipRefIds));

  return rows
    .filter((r): r is typeof r & { aipRefCode: string } => r.aipRefCode !== null)
    .map((r) => {
      const dt = DateTime.fromJSDate(r.createdAt as unknown as Date, { zone: "utc" }).setZone("UTC+8");
      return {
        aipRefId: r.aipRefCode,
        amount: r.amount,
        supplementalType: r.supplementalType,
        quarter: dt.quarter,
        year: dt.year,
      } satisfies SupplementalEntry;
    });
}

/**
 * Fetches all OBR AIP reference amounts for the given aipReferences IDs.
 * Each entry is annotated with the quarter and year of the parent OBR record's creation date (UTC+8).
 *
 * @async
 * @param {string[]} aipRefIds - List of aipReferences IDs to match against obrMainAipReferences.
 * @returns {Promise<ObrAipEntry[]>} OBR AIP entries with quarter, year, and amount info.
 */
async function _fetchObrAipAmounts(aipRefIds: string[]): Promise<ObrAipEntry[]> {
  if (aipRefIds.length === 0) return [];

  const rows = await db
    .select({
      aipReferenceId: obrMainAipReferences.aipReferenceId,
      amount: obrMainAipReferences.amount,
      createdAt: obrMainData.createdAt,
    })
    .from(obrMainAipReferences)
    .innerJoin(obrMainData, eq(obrMainData.id, obrMainAipReferences.obrId))
    .where(inArray(obrMainAipReferences.aipReferenceId, aipRefIds));

  return rows
    .filter((r): r is typeof r & { aipReferenceId: string; amount: string } =>
      r.aipReferenceId !== null && r.amount !== null,
    )
    .map((r) => {
      const dt = DateTime.fromJSDate(r.createdAt as unknown as Date, { zone: "utc" }).setZone("UTC+8");
      return {
        aipReferenceId: r.aipReferenceId,
        amount: r.amount,
        quarter: dt.quarter,
        year: dt.year,
        createdAt: r.createdAt as unknown as Date,
      } satisfies ObrAipEntry;
    });
}

/**
 * Sums an array of Decimal-compatible strings. Returns "0" if the array is empty.
 *
 * @param {string[]} amounts - Array of decimal string amounts.
 * @returns {string} The sum as a decimal string.
 */
function _sumAmounts(amounts: string[]): string {
  if (amounts.length === 0) return "0";
  return amounts.reduce((acc, a) => acc.plus(casts.castFromDecimal(a)), new Decimal(0)).toString();
}

/**
 * Computes the net supplemental/augmentation amount for a given aipRef ID and optional quarter filter.
 * Returns negative for "less" types and positive for "add" types.
 *
 * @param {SupplementalEntry[]} supplementals - All supplemental entries (pre-filtered to relevant aipRefIds).
 * @param {string} aipRefId - The aipReferences ID to compute supplementals for.
 * @param {number} [quarterFilter] - If provided, only include entries from this quarter.
 * @param {number} [yearFilter] - If provided, only include entries from this year.
 * @returns {Decimal} The net supplemental amount.
 */
function _computeSupplementalAmount(
  supplementals: SupplementalEntry[],
  aipRefId: string,
  quarterFilter?: number,
  yearFilter?: number,
  maxQuarter?: number,
): Decimal {
  const currentYear = yearFilter ?? _getCurrentYearUtc8();
  const relevant = supplementals.filter(
    (s) =>
      s.aipRefId === aipRefId &&
      s.year === currentYear &&
      (quarterFilter === undefined || s.quarter === quarterFilter) &&
      (maxQuarter === undefined || s.quarter <= maxQuarter),
  );
  return relevant.reduce((acc, s) => {
    const amt = casts.castFromDecimal(s.amount);
    return s.supplementalType === "less" ? acc.minus(amt) : acc.plus(amt);
  }, new Decimal(0));
}

/**
 * Computes the sum of OBR AIP amounts for a given aipRef ID filtered to a specific year and quarter.
 *
 * @param {ObrAipEntry[]} obrAmounts - All OBR AIP entries.
 * @param {string} aipRefId - The aipReferences ID to aggregate.
 * @param {number} year - The year to filter by (UTC+8).
 * @param {number} quarter - The quarter to filter by (1窶・).
 * @returns {string} The sum as a decimal string.
 */
function _obrSumForQuarter(obrAmounts: ObrAipEntry[], aipRefId: string, year: number, quarter: number): string {
  return _sumAmounts(
    obrAmounts
      .filter((e) => e.aipReferenceId === aipRefId && e.year === year && e.quarter === quarter)
      .map((e) => e.amount),
  );
}

/**
 * Computes the sum of OBR AIP amounts for a given aipRef ID where the record's creation date (UTC+8)
 * is before the specified date boundary.
 *
 * @param {ObrAipEntry[]} obrAmounts - All OBR AIP entries.
 * @param {string} aipRefId - The aipReferences ID to aggregate.
 * @param {Date} before - Exclusive upper boundary (UTC).
 * @returns {string} The sum as a decimal string.
 */
function _obrSumBefore(obrAmounts: ObrAipEntry[], aipRefId: string, before: Date): string {
  return _sumAmounts(
    obrAmounts
      .filter((e) => e.aipReferenceId === aipRefId && e.createdAt < before)
      .map((e) => e.amount),
  );
}

/**
 * Fetches all lbac_groups rows with left-joined aipReferences and officeCodes.
 *
 * @async
 * @returns {Promise<LbacGroupRow[]>} Flat list of group rows.
 */
async function _fetchGroups(): Promise<LbacGroupRow[]> {
  return db
    .select({
      id: lbacGroups.id,
      name: lbacGroups.name,
      parentId: lbacGroups.parentId,
      aipRefId: aipReferences.id,
      aipReferenceCode: aipReferences.aipReferenceCode,
      aipDescription: aipReferences.description,
      implementingUnitId: officeCodes.id,
      implementingUnitName: officeCodes.aa,
    })
    .from(lbacGroups)
    .leftJoin(aipReferences, eq(aipReferences.id, lbacGroups.aipRefCode))
    .leftJoin(officeCodes, eq(officeCodes.id, lbacGroups.implementingUnitId))
    .orderBy(asc(lbacGroups.createdAt));
}

/**
 * Fetches all lbac_items rows with left-joined aipReferences, officeCodes, and expenseClasses.
 *
 * @async
 * @returns {Promise<LbacItemRow[]>} Flat list of item rows.
 */
async function _fetchItems(): Promise<LbacItemRow[]> {
  return db
    .select({
      id: lbacItems.id,
      mfoPpa: lbacItems.mfoPpa,
      majorFinalOutput: lbacItems.majorFinalOutput,
      performanceOutputIndicator: lbacItems.performanceOutputIndicator,
      targetForBudgetYear: lbacItems.targetForBudgetYear,
      proposedBudgetPS: lbacItems.proposedBudgetPS,
      proposedBudgetMOOE: lbacItems.proposedBudgetMOOE,
      proposedBudgetFE: lbacItems.proposedBudgetFE,
      proposedBudgetCO: lbacItems.proposedBudgetCO,
      remarks: lbacItems.remarks,
      gadable: lbacItems.gadable,
      tagging: lbacItems.tagging,
      amountAttributed: lbacItems.amountAttributed,
      physicalTargets: lbacItems.physicalTargets,
      priorYearAccomplishments: lbacItems.priorYearAccomplishments,
      remarksForOtherMetadata: lbacItems.remarksForOtherMetadata,
      aipRefId: aipReferences.id,
      aipReferenceCode: aipReferences.aipReferenceCode,
      aipDescription: aipReferences.description,
      implementingUnitId: officeCodes.id,
      implementingUnitName: officeCodes.aa,
      expenseCodeId: expenseClasses.id,
      expenseAccountName: expenseClasses.accountName,
      expenseAccountCode: expenseClasses.accountCode,
      saaobId: saaobEntries.id,
      saaobName: saaobEntries.name,
      saaobAccountCode: saaobEntries.accountCode,
      quarterlyReportId: lbacItems.quarterlyReportId,
      parentId: lbacItems.parentId,
    })
    .from(lbacItems)
    .leftJoin(aipReferences, eq(aipReferences.id, lbacItems.aipRefCode))
    .leftJoin(officeCodes, eq(officeCodes.id, lbacItems.implementingUnitId))
    .leftJoin(expenseClasses, eq(expenseClasses.id, lbacItems.expenseCodeId))
    .leftJoin(saaobEntries, eq(saaobEntries.id, lbacItems.saaobId))
    .orderBy(asc(lbacItems.createdAt));
}

/**
 * Fetches all lbac_quarterly_report rows for the given list of quarterly report IDs.
 *
 * @async
 * @param {string[]} reportIds - List of lbacQuarterlyReport IDs to fetch.
 * @returns {Promise<QuarterlyReportRow[]>} Flat list of quarterly report rows.
 */
async function _fetchQuarterlyReports(reportIds: string[]): Promise<QuarterlyReportRow[]> {
  if (reportIds.length === 0) return [];
  return db
    .select({
      id: lbacQuarterlyReport.id,
      priorYearAccomplishments: lbacQuarterlyReport.priorYearAccomplishments,
      physicalTargetQ1: lbacQuarterlyReport.physicalTargetQ1,
      physicalTargetQ2: lbacQuarterlyReport.physicalTargetQ2,
      physicalTargetQ3: lbacQuarterlyReport.physicalTargetQ3,
      physicalTargetQ4: lbacQuarterlyReport.physicalTargetQ4,
      physicalTargetTotal: lbacQuarterlyReport.physicalTargetTotal,
      actualPhysicalPerformanceQ1: lbacQuarterlyReport.actualPhysicalPerformanceQ1,
      actualPhysicalPerformanceQ2: lbacQuarterlyReport.actualPhysicalPerformanceQ2,
      actualPhysicalPerformanceQ3: lbacQuarterlyReport.actualPhysicalPerformanceQ3,
      actualPhysicalPerformanceQ4: lbacQuarterlyReport.actualPhysicalPerformanceQ4,
      actualPhysicalPerformanceTotal: lbacQuarterlyReport.actualPhysicalPerformanceTotal,
      variance: lbacQuarterlyReport.variance,
      accomplishmentPercentage: lbacQuarterlyReport.accomplishmentPercentage,
      remarks: lbacQuarterlyReport.remarks,
      targetForBudgetYear: lbacQuarterlyReport.targetForBudgetYear,
    })
    .from(lbacQuarterlyReport)
    .where(inArray(lbacQuarterlyReport.id, reportIds));
}

/**
 * Maps a single lbac_items row with all related data into a full LbacObject,
 * computing all financial fields using Decimal arithmetic.
 *
 * @param {LbacItemRow} item - The LBAC item row.
 * @param {QuarterlyReportRow | undefined} report - The associated quarterly report.
 * @param {SupplementalEntry[]} supplementals - All relevant supplemental entries.
 * @param {ObrAipEntry[]} obrAmounts - All relevant OBR AIP amount entries.
 * @param {number} year - The year to compute calculations for.
 * @param {number} quarter - The quarter (1窶・) to compute calculations for.
 * @returns {LbacObject} The fully computed LBAC item object.
 */
function _buildLbacItemObject(
  item: LbacItemRow,
  report: QuarterlyReportRow | undefined,
  supplementals: SupplementalEntry[],
  obrAmounts: ObrAipEntry[],
  year: number,
  quarter: number,
): LbacObject {
  const currentYear = year;
  const currentQuarter = quarter;
  const monthStart = _getMonthStartForQuarterView(year, quarter);

  // Proposed budget totals
  const ps = casts.castFromDecimal(item.proposedBudgetPS);
  const mooe = casts.castFromDecimal(item.proposedBudgetMOOE);
  const fe = casts.castFromDecimal(item.proposedBudgetFE);
  const co = casts.castFromDecimal(item.proposedBudgetCO);
  const proposedBudgetTotal = ps.plus(mooe).plus(fe).plus(co);

  // Appropriation
  const contOrSupplemental = item.aipRefId
    ? _computeSupplementalAmount(supplementals, item.aipRefId, undefined, undefined, currentQuarter)
    : new Decimal(0);
  const appropriationCurrent = proposedBudgetTotal;
  const appropriationTotal = appropriationCurrent.plus(contOrSupplemental);

  // Allotment released
  const quarterlyAllotment = appropriationTotal.div(4);
  const previousAllotment = quarterlyAllotment.mul(currentQuarter - 1);
  const allotmentTotal = previousAllotment.plus(quarterlyAllotment);

  // Balance of appropriation
  const balanceOfAppropriation = appropriationTotal.minus(allotmentTotal);

  // Obligations
  const currentQBounds = _getQuarterBoundsUtc8(currentYear, currentQuarter);
  const obligationsPrev = item.aipRefId
    ? casts.castFromDecimal(_obrSumBefore(obrAmounts, item.aipRefId, currentQBounds.start))
    : new Decimal(0);
  const obligationsThis = item.aipRefId
    ? casts.castFromDecimal(
      _sumAmounts(
        obrAmounts
          .filter(
            (e) =>
              e.aipReferenceId === item.aipRefId &&
              e.createdAt >= currentQBounds.start &&
              e.createdAt < currentQBounds.end,
          )
          .map((e) => e.amount),
      ),
    )
    : new Decimal(0);
  const obligationsTotal = obligationsPrev.plus(obligationsThis);
  const unobligatedAmount = appropriationTotal.minus(obligationsTotal);

  // As cut-off month
  const cutOffObligation = item.aipRefId
    ? casts.castFromDecimal(_obrSumBefore(obrAmounts, item.aipRefId, monthStart))
    : new Decimal(0);
  const cutOffBalance = appropriationTotal.minus(cutOffObligation);
  const cutOffPercentage = appropriationTotal.isZero()
    ? new Decimal(0)
    : cutOffObligation.div(appropriationTotal).mul(100);

  // Financial allocation per quarter
  const _financialAllocationQ = (q: number): Decimal => {
    const suppAmt = item.aipRefId
      ? _computeSupplementalAmount(supplementals, item.aipRefId, q, currentYear)
      : new Decimal(0);
    return suppAmt.plus(appropriationCurrent.div(4));
  };
  const faQ1 = _financialAllocationQ(1);
  const faQ2 = _financialAllocationQ(2);
  const faQ3 = _financialAllocationQ(3);
  const faQ4 = _financialAllocationQ(4);
  const faTotal = faQ1.plus(faQ2).plus(faQ3).plus(faQ4);

  // Actual financial performance per quarter
  const _afpQ = (q: number): Decimal =>
    item.aipRefId
      ? casts.castFromDecimal(_obrSumForQuarter(obrAmounts, item.aipRefId, currentYear, q))
      : new Decimal(0);
  const afpQ1 = _afpQ(1);
  const afpQ2 = _afpQ(2);
  const afpQ3 = _afpQ(3);
  const afpQ4 = _afpQ(4);
  const afpTotal = afpQ1.plus(afpQ2).plus(afpQ3).plus(afpQ4);

  const variance = faTotal.minus(afpTotal);

  const qr = report;

  return {
    id: item.id,
    type: LbacObjectType.Item,
    mfoPpa: item.mfoPpa,
    majorFinalOutput: item.majorFinalOutput,
    performanceOutputIndicator: item.performanceOutputIndicator,
    targetForBudgetYear: item.targetForBudgetYear,
    proposedBudgetPS: item.proposedBudgetPS,
    proposedBudgetMOOE: item.proposedBudgetMOOE,
    proposedBudgetFE: item.proposedBudgetFE,
    proposedBudgetCO: item.proposedBudgetCO,
    proposedBudgetTotal: proposedBudgetTotal.toString(),
    aipRefCode: item.aipRefId
      ? { id: item.aipRefId, aipReferenceCode: item.aipReferenceCode!, description: item.aipDescription! }
      : null,
    implementingUnit: item.implementingUnitId
      ? { id: item.implementingUnitId, name: item.implementingUnitName! }
      : null,
    appropriation: {
      contOrSupplementalAugmentation: contOrSupplemental.toString(),
      current: appropriationCurrent.toString(),
      total: appropriationTotal.toString(),
    },
    allotmentReleased: {
      previousQuarters: previousAllotment.toString(),
      thisQuarter: quarterlyAllotment.toString(),
      total: allotmentTotal.toString(),
    },
    balanceOfAppropriation: balanceOfAppropriation.toString(),
    obligations: {
      previousQuarters: obligationsPrev.toString(),
      thisQuarter: obligationsThis.toString(),
      total: obligationsTotal.toString(),
    },
    unobligatedAmount: unobligatedAmount.toString(),
    remarks: item.remarks,
    asCutOffMonth: {
      obligation: cutOffObligation.toString(),
      balance: cutOffBalance.toString(),
      percentage: cutOffPercentage.toString(),
    },
    other: {
      gadable: item.gadable,
      tagging: item.tagging,
      amountAttributed: item.amountAttributed,
      expenseCode: item.expenseCodeId
        ? {
          id: item.expenseCodeId,
          accountName: item.expenseAccountName!,
          accountCode: item.expenseAccountCode,
        }
        : null,
      saaob: item.saaobId
        ? {
          id: item.saaobId,
          name: item.saaobName!,
          accountCode: item.saaobAccountCode,
        }
        : null,
      priorYearAccomplishments: item.priorYearAccomplishments,
      physicalTargets: item.physicalTargets,
      remarks: item.remarksForOtherMetadata,
    },
    financialAllocation: {
      Q1: faQ1.toString(),
      Q2: faQ2.toString(),
      Q3: faQ3.toString(),
      Q4: faQ4.toString(),
      total: faTotal.toString(),
    },
    actualFinancialPerformance: {
      Q1: afpQ1.toString(),
      Q2: afpQ2.toString(),
      Q3: afpQ3.toString(),
      Q4: afpQ4.toString(),
      total: afpTotal.toString(),
    },
    variance: variance.toString(),
    quarterlyReport: {
      physicalTargets: {
        Q1: qr?.physicalTargetQ1 ?? null,
        Q2: qr?.physicalTargetQ2 ?? null,
        Q3: qr?.physicalTargetQ3 ?? null,
        Q4: qr?.physicalTargetQ4 ?? null,
        total: qr?.physicalTargetTotal ?? null,
      },
      actualPhysicalPerformance: {
        Q1: qr?.actualPhysicalPerformanceQ1 ?? null,
        Q2: qr?.actualPhysicalPerformanceQ2 ?? null,
        Q3: qr?.actualPhysicalPerformanceQ3 ?? null,
        Q4: qr?.actualPhysicalPerformanceQ4 ?? null,
        total: qr?.actualPhysicalPerformanceTotal ?? null,
      },
      variance: qr?.variance ?? null,
      accomplishment: qr?.accomplishmentPercentage ?? null,
      remarks: qr?.remarks ?? null,
    },
  } satisfies LbacObject;
}

/**
 * Maps a single lbac_items row into a LbacViewerObject with the office-viewer field subset.
 *
 * @param {LbacItemRow} item - The LBAC item row.
 * @param {QuarterlyReportRow | undefined} report - The associated quarterly report.
 * @param {SupplementalEntry[]} supplementals - All relevant supplemental entries.
 * @param {ObrAipEntry[]} obrAmounts - All relevant OBR AIP amount entries.
 * @param {number} year - The year to compute calculations for.
 * @param {number} quarter - The quarter (1窶・) to compute calculations for.
 * @returns {LbacViewerObject} The LBAC viewer item object.
 */
function _buildLbacViewerObject(
  item: LbacItemRow,
  report: QuarterlyReportRow | undefined,
  supplementals: SupplementalEntry[],
  obrAmounts: ObrAipEntry[],
  year: number,
  quarter: number,
): LbacViewerObject {
  const full = _buildLbacItemObject(item, report, supplementals, obrAmounts, year, quarter);
  return {
    id: full.id,
    type: full.type,
    aipRefCode: full.aipRefCode,
    mfoPpa: full.mfoPpa,
    implementingUnit: full.implementingUnit,
    proposedBudgetTotal: full.proposedBudgetTotal,
    asCutOffMonth: full.asCutOffMonth,
    other: {
      expenseCode: full.other.expenseCode,
    },
  } satisfies LbacViewerObject;
}

/**
 * Maps a single lbac_items row into a LbacQuarterlyObject with partial financial fields,
 * suitable for office-level quarterly report access.
 *
 * @param {LbacItemRow} item - The LBAC item row.
 * @param {QuarterlyReportRow | undefined} report - The associated quarterly report.
 * @param {SupplementalEntry[]} supplementals - All relevant supplemental entries.
 * @param {ObrAipEntry[]} obrAmounts - All relevant OBR AIP amount entries.
 * @param {number} year - The year to compute calculations for.
 * @param {number} quarter - The quarter (1窶・) to compute calculations for.
 * @returns {LbacQuarterlyObject} The LBAC quarterly object.
 */
function _buildLbacQuarterlyObject(
  item: LbacItemRow,
  report: QuarterlyReportRow | undefined,
  supplementals: SupplementalEntry[],
  obrAmounts: ObrAipEntry[],
  year: number,
  quarter: number,
): LbacQuarterlyObject {
  const currentQuarter = quarter;
  const monthStart = _getMonthStartForQuarterView(year, quarter);

  const ps = casts.castFromDecimal(item.proposedBudgetPS);
  const mooe = casts.castFromDecimal(item.proposedBudgetMOOE);
  const fe = casts.castFromDecimal(item.proposedBudgetFE);
  const co = casts.castFromDecimal(item.proposedBudgetCO);
  const appropriationCurrent = ps.plus(mooe).plus(fe).plus(co);

  const contOrSupplemental = item.aipRefId
    ? _computeSupplementalAmount(supplementals, item.aipRefId, undefined, undefined, currentQuarter)
    : new Decimal(0);
  const appropriationTotal = appropriationCurrent.plus(contOrSupplemental);

  const cutOffObligation = item.aipRefId
    ? casts.castFromDecimal(_obrSumBefore(obrAmounts, item.aipRefId, monthStart))
    : new Decimal(0);
  const cutOffBalance = appropriationTotal.minus(cutOffObligation);

  const qr = report;

  return {
    id: item.id,
    type: LbacObjectType.Item,
    mfoPpa: item.mfoPpa,
    aipRefCode: item.aipRefId
      ? { id: item.aipRefId, aipReferenceCode: item.aipReferenceCode!, description: item.aipDescription! }
      : null,
    implementingUnit: item.implementingUnitId
      ? { id: item.implementingUnitId, name: item.implementingUnitName! }
      : null,
    appropriation: {
      contOrSupplementalAugmentation: contOrSupplemental.toString(),
      current: appropriationCurrent.toString(),
      total: appropriationTotal.toString(),
    },
    asCutOffMonth: {
      obligation: cutOffObligation.toString(),
      balance: cutOffBalance.toString(),
    },
    priorYearAccomplishments: qr?.priorYearAccomplishments ?? null,
    physicalTargets: {
      Q1: qr?.physicalTargetQ1 ?? null,
      Q2: qr?.physicalTargetQ2 ?? null,
      Q3: qr?.physicalTargetQ3 ?? null,
      Q4: qr?.physicalTargetQ4 ?? null,
      total: qr?.physicalTargetTotal ?? null,
    },
    actualPhysicalPerformance: {
      Q1: qr?.actualPhysicalPerformanceQ1 ?? null,
      Q2: qr?.actualPhysicalPerformanceQ2 ?? null,
      Q3: qr?.actualPhysicalPerformanceQ3 ?? null,
      Q4: qr?.actualPhysicalPerformanceQ4 ?? null,
      total: qr?.actualPhysicalPerformanceTotal ?? null,
    },
    variance: qr?.variance ?? null,
    accomplishment: qr?.accomplishmentPercentage ?? null,
    remarks: qr?.remarks ?? null,
    targetForBudgetYear: qr?.targetForBudgetYear ?? null,
  } satisfies LbacQuarterlyObject;
}

/**
 * Maps a LbacGroupRow into a BaseLbacGroupObject.
 *
 * @param {LbacGroupRow} group - The group row from the database.
 * @returns {BaseLbacGroupObject} The base group object.
 */
function _buildBaseLbacGroupObject(group: LbacGroupRow): BaseLbacGroupObject {
  return {
    id: group.id,
    type: LbacObjectType.Group,
    name: group.name,
    aipRefCode: group.aipRefId
      ? { id: group.aipRefId, aipReferenceCode: group.aipReferenceCode!, description: group.aipDescription! }
      : null,
    implementingUnit: group.implementingUnitId
      ? { id: group.implementingUnitId, name: group.implementingUnitName! }
      : null,
  } satisfies BaseLbacGroupObject;
}

function _zeroLbacGroupTotals(): LbacGroupTotals {
  const z = "0";
  return {
    proposedBudgetPS: z, proposedBudgetMOOE: z, proposedBudgetFE: z, proposedBudgetCO: z, proposedBudgetTotal: z,
    appropriation: { contOrSupplementalAugmentation: z, current: z, total: z },
    allotmentReleased: { previousQuarters: z, thisQuarter: z, total: z },
    balanceOfAppropriation: z,
    obligations: { previousQuarters: z, thisQuarter: z, total: z },
    unobligatedAmount: z,
    asCutOffMonth: { obligation: z, balance: z, percentage: z },
    other: { amountAttributed: z },
    financialAllocation: { Q1: z, Q2: z, Q3: z, Q4: z, total: z },
    actualFinancialPerformance: { Q1: z, Q2: z, Q3: z, Q4: z, total: z },
    variance: z,
  };
}

function _zeroLbacQuarterlyGroupTotals(): LbacQuarterlyGroupTotals {
  const z = "0";
  return {
    appropriation: { contOrSupplementalAugmentation: z, current: z, total: z },
    asCutOffMonth: { obligation: z, balance: z },
  };
}

function _zeroLbacViewerGroupTotals(): LbacViewerGroupTotals {
  const z = "0";
  return {
    proposedBudgetTotal: z,
    asCutOffMonth: { obligation: z, balance: z, percentage: z },
  };
}

function _collectAllItems(group: LbacGroupObject): LbacObject[] {
  const items: LbacObject[] = [];
  for (const child of group.children) {
    if (child.type === LbacObjectType.Item) {
      items.push(child);
    } else {
      items.push(..._collectAllItems(child as LbacGroupObject));
    }
  }
  return items;
}

function _collectAllQuarterlyItems(group: LbacQuarterlyGroupObject): LbacQuarterlyObject[] {
  const items: LbacQuarterlyObject[] = [];
  for (const child of group.children) {
    if (child.type === LbacObjectType.Item) {
      items.push(child);
    } else {
      items.push(..._collectAllQuarterlyItems(child as LbacQuarterlyGroupObject));
    }
  }
  return items;
}

function _collectAllViewerItems(group: LbacViewerGroupObject): LbacViewerObject[] {
  const items: LbacViewerObject[] = [];
  for (const child of group.children) {
    if (child.type === LbacObjectType.Item) {
      items.push(child);
    } else {
      items.push(..._collectAllViewerItems(child as LbacViewerGroupObject));
    }
  }
  return items;
}

function _computeLbacGroupTotals(items: LbacObject[]): LbacGroupTotals {
  let ps = new Decimal(0), mooe = new Decimal(0), fe = new Decimal(0), co = new Decimal(0), propTotal = new Decimal(0);
  let appCsa = new Decimal(0), appCurrent = new Decimal(0), appTotal = new Decimal(0);
  let allPrev = new Decimal(0), allThis = new Decimal(0), allTotal = new Decimal(0);
  let balApp = new Decimal(0);
  let obPrev = new Decimal(0), obThis = new Decimal(0), obTotal = new Decimal(0);
  let unob = new Decimal(0);
  let cutObligation = new Decimal(0), cutBalance = new Decimal(0), cutPct = new Decimal(0);
  let amtAttributed = new Decimal(0);
  let fa1 = new Decimal(0), fa2 = new Decimal(0), fa3 = new Decimal(0), fa4 = new Decimal(0), faTotal = new Decimal(0);
  let afp1 = new Decimal(0), afp2 = new Decimal(0), afp3 = new Decimal(0), afp4 = new Decimal(0), afpTotal = new Decimal(0);
  let variance = new Decimal(0);

  for (const item of items) {
    ps = ps.plus(casts.castFromDecimal(item.proposedBudgetPS));
    mooe = mooe.plus(casts.castFromDecimal(item.proposedBudgetMOOE));
    fe = fe.plus(casts.castFromDecimal(item.proposedBudgetFE));
    co = co.plus(casts.castFromDecimal(item.proposedBudgetCO));
    propTotal = propTotal.plus(casts.castFromDecimal(item.proposedBudgetTotal));
    appCsa = appCsa.plus(casts.castFromDecimal(item.appropriation.contOrSupplementalAugmentation));
    appCurrent = appCurrent.plus(casts.castFromDecimal(item.appropriation.current));
    appTotal = appTotal.plus(casts.castFromDecimal(item.appropriation.total));
    allPrev = allPrev.plus(casts.castFromDecimal(item.allotmentReleased.previousQuarters));
    allThis = allThis.plus(casts.castFromDecimal(item.allotmentReleased.thisQuarter));
    allTotal = allTotal.plus(casts.castFromDecimal(item.allotmentReleased.total));
    balApp = balApp.plus(casts.castFromDecimal(item.balanceOfAppropriation));
    obPrev = obPrev.plus(casts.castFromDecimal(item.obligations.previousQuarters));
    obThis = obThis.plus(casts.castFromDecimal(item.obligations.thisQuarter));
    obTotal = obTotal.plus(casts.castFromDecimal(item.obligations.total));
    unob = unob.plus(casts.castFromDecimal(item.unobligatedAmount));
    cutObligation = cutObligation.plus(casts.castFromDecimal(item.asCutOffMonth.obligation));
    cutBalance = cutBalance.plus(casts.castFromDecimal(item.asCutOffMonth.balance));
    cutPct = cutPct.plus(casts.castFromDecimal(item.asCutOffMonth.percentage));
    if (item.other.amountAttributed) {
      amtAttributed = amtAttributed.plus(casts.castFromDecimal(item.other.amountAttributed));
    }
    fa1 = fa1.plus(casts.castFromDecimal(item.financialAllocation.Q1));
    fa2 = fa2.plus(casts.castFromDecimal(item.financialAllocation.Q2));
    fa3 = fa3.plus(casts.castFromDecimal(item.financialAllocation.Q3));
    fa4 = fa4.plus(casts.castFromDecimal(item.financialAllocation.Q4));
    faTotal = faTotal.plus(casts.castFromDecimal(item.financialAllocation.total));
    afp1 = afp1.plus(casts.castFromDecimal(item.actualFinancialPerformance.Q1));
    afp2 = afp2.plus(casts.castFromDecimal(item.actualFinancialPerformance.Q2));
    afp3 = afp3.plus(casts.castFromDecimal(item.actualFinancialPerformance.Q3));
    afp4 = afp4.plus(casts.castFromDecimal(item.actualFinancialPerformance.Q4));
    afpTotal = afpTotal.plus(casts.castFromDecimal(item.actualFinancialPerformance.total));
    variance = variance.plus(casts.castFromDecimal(item.variance));
  }

  return {
    proposedBudgetPS: ps.toString(),
    proposedBudgetMOOE: mooe.toString(),
    proposedBudgetFE: fe.toString(),
    proposedBudgetCO: co.toString(),
    proposedBudgetTotal: propTotal.toString(),
    appropriation: { contOrSupplementalAugmentation: appCsa.toString(), current: appCurrent.toString(), total: appTotal.toString() },
    allotmentReleased: { previousQuarters: allPrev.toString(), thisQuarter: allThis.toString(), total: allTotal.toString() },
    balanceOfAppropriation: balApp.toString(),
    obligations: { previousQuarters: obPrev.toString(), thisQuarter: obThis.toString(), total: obTotal.toString() },
    unobligatedAmount: unob.toString(),
    asCutOffMonth: { obligation: cutObligation.toString(), balance: cutBalance.toString(), percentage: cutPct.toString() },
    other: { amountAttributed: amtAttributed.toString() },
    financialAllocation: { Q1: fa1.toString(), Q2: fa2.toString(), Q3: fa3.toString(), Q4: fa4.toString(), total: faTotal.toString() },
    actualFinancialPerformance: { Q1: afp1.toString(), Q2: afp2.toString(), Q3: afp3.toString(), Q4: afp4.toString(), total: afpTotal.toString() },
    variance: variance.toString(),
  };
}

function _computeLbacQuarterlyGroupTotals(items: LbacQuarterlyObject[]): LbacQuarterlyGroupTotals {
  let appCsa = new Decimal(0), appCurrent = new Decimal(0), appTotal = new Decimal(0);
  let cutObligation = new Decimal(0), cutBalance = new Decimal(0);

  for (const item of items) {
    appCsa = appCsa.plus(casts.castFromDecimal(item.appropriation.contOrSupplementalAugmentation));
    appCurrent = appCurrent.plus(casts.castFromDecimal(item.appropriation.current));
    appTotal = appTotal.plus(casts.castFromDecimal(item.appropriation.total));
    cutObligation = cutObligation.plus(casts.castFromDecimal(item.asCutOffMonth.obligation));
    cutBalance = cutBalance.plus(casts.castFromDecimal(item.asCutOffMonth.balance));
  }

  return {
    appropriation: { contOrSupplementalAugmentation: appCsa.toString(), current: appCurrent.toString(), total: appTotal.toString() },
    asCutOffMonth: { obligation: cutObligation.toString(), balance: cutBalance.toString() },
  };
}

function _computeLbacViewerGroupTotals(items: LbacViewerObject[]): LbacViewerGroupTotals {
  let propTotal = new Decimal(0);
  let cutObligation = new Decimal(0), cutBalance = new Decimal(0), cutPct = new Decimal(0);

  for (const item of items) {
    propTotal = propTotal.plus(casts.castFromDecimal(item.proposedBudgetTotal));
    cutObligation = cutObligation.plus(casts.castFromDecimal(item.asCutOffMonth.obligation));
    cutBalance = cutBalance.plus(casts.castFromDecimal(item.asCutOffMonth.balance));
    cutPct = cutPct.plus(casts.castFromDecimal(item.asCutOffMonth.percentage));
  }

  return {
    proposedBudgetTotal: propTotal.toString(),
    asCutOffMonth: {
      obligation: cutObligation.toString(),
      balance: cutBalance.toString(),
      percentage: cutPct.toString(),
    },
  };
}

function _attachGroupTotals(groups: LbacGroupObject[]): void {
  for (const group of groups) {
    const childGroups = group.children.filter((c) => c.type === LbacObjectType.Group) as LbacGroupObject[];
    _attachGroupTotals(childGroups);
    group.totals = _computeLbacGroupTotals(_collectAllItems(group));
  }
}

function _attachQuarterlyGroupTotals(groups: LbacQuarterlyGroupObject[]): void {
  for (const group of groups) {
    const childGroups = group.children.filter((c) => c.type === LbacObjectType.Group) as LbacQuarterlyGroupObject[];
    _attachQuarterlyGroupTotals(childGroups);
    group.totals = _computeLbacQuarterlyGroupTotals(_collectAllQuarterlyItems(group));
  }
}

function _attachViewerGroupTotals(groups: LbacViewerGroupObject[]): void {
  for (const group of groups) {
    const childGroups = group.children.filter((c) => c.type === LbacObjectType.Group) as LbacViewerGroupObject[];
    _attachViewerGroupTotals(childGroups);
    group.totals = _computeLbacViewerGroupTotals(_collectAllViewerItems(group));
  }
}

/**
 * Assembles a nested LbacGroupObject tree from flat lists of groups and items.
 * Root groups are those with parentId = null.
 *
 * @param {LbacGroupRow[]} allGroups - All group rows.
 * @param {Map<string, LbacObject[]>} itemsByGroup - Items keyed by parentId (group id).
 * @returns {LbacGroupObject[]} The root-level group tree.
 */
function _buildGroupTree(
  allGroups: LbacGroupRow[],
  itemsByGroup: Map<string, LbacObject[]>,
): LbacGroupObject[] {
  const groupMap = new Map<string, LbacGroupObject>();

  for (const g of allGroups) {
    groupMap.set(g.id, {
      ..._buildBaseLbacGroupObject(g),
      children: [],
      totals: _zeroLbacGroupTotals(),
    });
  }

  const roots: LbacGroupObject[] = [];

  for (const g of allGroups) {
    const node = groupMap.get(g.id)!;
    const groupItems = itemsByGroup.get(g.id) ?? [];
    node.children.push(...groupItems);

    if (g.parentId === null) {
      roots.push(node);
    } else {
      const parent = groupMap.get(g.parentId);
      if (parent) {
        parent.children.push(node);
      }
    }
  }

  _attachGroupTotals(roots);

  return roots;
}

/**
 * Assembles a nested LbacQuarterlyGroupObject tree from flat lists of groups and quarterly items.
 *
 * @param {LbacGroupRow[]} allGroups - All group rows.
 * @param {Map<string, LbacQuarterlyObject[]>} itemsByGroup - Quarterly items keyed by parentId.
 * @returns {LbacQuarterlyGroupObject[]} The root-level group tree.
 */
function _buildQuarterlyGroupTree(
  allGroups: LbacGroupRow[],
  itemsByGroup: Map<string, LbacQuarterlyObject[]>,
): LbacQuarterlyGroupObject[] {
  const groupMap = new Map<string, LbacQuarterlyGroupObject>();

  for (const g of allGroups) {
    groupMap.set(g.id, {
      ..._buildBaseLbacGroupObject(g),
      children: [],
      totals: _zeroLbacQuarterlyGroupTotals(),
    });
  }

  const roots: LbacQuarterlyGroupObject[] = [];

  for (const g of allGroups) {
    const node = groupMap.get(g.id)!;
    const groupItems = itemsByGroup.get(g.id) ?? [];
    node.children.push(...groupItems);

    if (g.parentId === null) {
      roots.push(node);
    } else {
      const parent = groupMap.get(g.parentId);
      if (parent) {
        parent.children.push(node);
      }
    }
  }

  _attachQuarterlyGroupTotals(roots);

  return roots;
}

/**
 * Assembles a nested LbacViewerGroupObject tree from flat lists of groups and viewer items.
 *
 * @param {LbacGroupRow[]} allGroups - All group rows.
 * @param {Map<string, LbacViewerObject[]>} itemsByGroup - Viewer items keyed by parentId (group id).
 * @returns {LbacViewerGroupObject[]} The root-level group tree.
 */
function _buildViewerGroupTree(
  allGroups: LbacGroupRow[],
  itemsByGroup: Map<string, LbacViewerObject[]>,
): LbacViewerGroupObject[] {
  const groupMap = new Map<string, LbacViewerGroupObject>();

  for (const g of allGroups) {
    groupMap.set(g.id, {
      ..._buildBaseLbacGroupObject(g),
      children: [],
      totals: _zeroLbacViewerGroupTotals(),
    });
  }

  const roots: LbacViewerGroupObject[] = [];

  for (const g of allGroups) {
    const node = groupMap.get(g.id)!;
    const groupItems = itemsByGroup.get(g.id) ?? [];
    node.children.push(...groupItems);

    if (g.parentId === null) {
      roots.push(node);
    } else {
      const parent = groupMap.get(g.parentId);
      if (parent) {
        parent.children.push(node);
      }
    }
  }

  _attachViewerGroupTotals(roots);

  return roots;
}

/**
 * Recursively collects all descendant group IDs for the given group ID.
 *
 * @param {string} groupId - The root group ID to start from.
 * @param {LbacGroupRow[]} allGroups - All group rows.
 * @returns {string[]} List of descendant group IDs (not including the root itself).
 */
function _collectDescendantGroupIds(groupId: string, allGroups: LbacGroupRow[]): string[] {
  const result: string[] = [];
  const queue = [groupId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = allGroups.filter((g) => g.parentId === current);
    for (const child of children) {
      result.push(child.id);
      queue.push(child.id);
    }
  }
  return result;
}

function _mapLbacTemplate(item: TemplateBucketItem): LbacTemplateInfo {
  return {
    id: item.id,
    templateType: item.templateType,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

async function _getLbacTemplateSlot(
  identifier: string,
  type: LbacTemplateType,
): Promise<Result<LbacTemplateInfo | null>> {
  const result = await templateBucket.get({ identifier, type });
  if (result instanceof Success) {
    return new Success(_mapLbacTemplate(result.value));
  }
  if (result.type === ErrorCodes.ResourceNotFound) {
    return new Success(null);
  }
  return result;
}

async function _fetchLbacTemplatesBundle(identifier: string): Promise<Result<LbacTemplatesBundle>> {
  const headerResult = await _getLbacTemplateSlot(identifier, "header");
  if (headerResult instanceof Failure) return headerResult;

  const footerResult = await _getLbacTemplateSlot(identifier, "footer");
  if (footerResult instanceof Failure) return footerResult;

  return new Success({
    header: headerResult.value,
    footer: footerResult.value,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function _resolveTemplateValue(cellValue: any): unknown {
  if (cellValue === null || cellValue === undefined) return cellValue;

  if (typeof cellValue === "object") {
    if ("error" in cellValue) return null;
    if ("formula" in cellValue || "sharedFormula" in cellValue) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (cellValue as any).result;
      if (result !== null && result !== undefined && typeof result === "object" && "error" in result) {
        return null;
      }
      return result ?? null;
    }
  }

  return cellValue;
}

function _offsetMergeRange(range: string, rowOffset: number): string | null {
  const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(range);
  if (!m) return null;
  return `${m[1]}${parseInt(m[2]) + rowOffset}:${m[3]}${parseInt(m[4]) + rowOffset}`;
}

async function _copyTemplateRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  srcWorkbook: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  destWorksheet: any,
  startRow: number,
): Promise<number> {
  const srcWs = srcWorkbook.getWorksheet(1);
  if (!srcWs) return startRow;

  const rowOffset = startRow - 1;
  let currentRow = startRow;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  srcWs.eachRow({ includeEmpty: true }, (row: any) => {
    const destRow = destWorksheet.getRow(currentRow);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    row.eachCell({ includeEmpty: true }, (cell: any, colNum: number) => {
      if (cell.type === _MERGE_CELL_TYPE) return;

      const destCell = destRow.getCell(colNum);
      destCell.value = _resolveTemplateValue(cell.value);
      if (cell.font) destCell.font = cell.font;
      if (cell.fill) destCell.fill = cell.fill;
      if (cell.border) destCell.border = cell.border;
      if (cell.alignment) destCell.alignment = cell.alignment;
      if (cell.numFmt) destCell.numFmt = cell.numFmt;
    });
    if (row.height) destRow.height = row.height;
    destRow.commit();
    currentRow++;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const merges: string[] = (srcWs.model as any)?.mergeCells ?? [];
  for (const range of merges) {
    const adjusted = _offsetMergeRange(range, rowOffset);
    if (!adjusted) continue;
    try {
      destWorksheet.mergeCells(adjusted);
    } catch {
      // Ignore overlapping or invalid ranges
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const destWorkbook = destWorksheet.workbook as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const srcImages: any[] = srcWs.getImages();
  for (const img of srcImages) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const imgModel = img.model as any;
    if (imgModel.type !== "image") continue;

    const srcImageData = srcWorkbook.getImage(imgModel.imageId);
    if (!srcImageData) continue;

    const newImageId = destWorkbook.addImage(srcImageData);

    const srcRange = imgModel.range;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adjustedRange: any = {
      tl: {
        nativeCol: srcRange.tl.nativeCol,
        nativeColOff: srcRange.tl.nativeColOff,
        nativeRow: srcRange.tl.nativeRow + rowOffset,
        nativeRowOff: srcRange.tl.nativeRowOff,
      },
      editAs: srcRange.editAs,
    };
    if (srcRange.br) {
      adjustedRange.br = {
        nativeCol: srcRange.br.nativeCol,
        nativeColOff: srcRange.br.nativeColOff,
        nativeRow: srcRange.br.nativeRow + rowOffset,
        nativeRowOff: srcRange.br.nativeRowOff,
      };
    }
    if (srcRange.ext) adjustedRange.ext = srcRange.ext;
    if (srcRange.hyperlinks) adjustedRange.hyperlinks = srcRange.hyperlinks;

    destWorksheet.addImage(newImageId, adjustedRange);
  }

  return currentRow;
}


function _argbHex(color: string): string {
  const hex = color.replace("#", "");
  return `FF${hex.toUpperCase()}`;
}

function _fillArgb(hexColor: string) {
  return { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: _argbHex(hexColor) } };
}

function _applyHeaderMerges(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ws: any,
  headerStartRow: number,
  merges: import("@/lib/lbac/export-layout").HeaderMergeRange[],
) {
  for (const m of merges) {
    const row = headerStartRow + (m.row - 1);
    if (m.startCol === m.endCol) continue;
    try {
      ws.mergeCells(row, m.startCol, row, m.endCol);
    } catch {
      // ignore invalid merges when columns are filtered
    }
  }
}

function _writeLbacHeaderRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ws: any,
  row: number,
  layout: { row1: string[]; row2: string[]; merges: import("@/lib/lbac/export-layout").HeaderMergeRange[] },
) {
  const r1 = ws.getRow(row);
  layout.row1.forEach((label, idx) => {
    const cell = r1.getCell(idx + 1);
    cell.value = label;
    cell.font = { bold: true, size: 10, name: "Arial Narrow" };
    cell.fill = _HEADER_FILL;
    cell.border = _THIN_BORDER;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  r1.height = 22;
  r1.commit();

  const r2 = ws.getRow(row + 1);
  layout.row2.forEach((label, idx) => {
    const cell = r2.getCell(idx + 1);
    cell.value = label;
    cell.font = { bold: true, size: 10, name: "Arial Narrow" };
    cell.fill = _HEADER_FILL;
    cell.border = _THIN_BORDER;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  r2.height = 22;
  r2.commit();

  _applyHeaderMerges(ws, row, layout.merges);
}

function _writeLbacDataRow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ws: any,
  row: number,
  columns: readonly LbacMainExportColDef[] | readonly LbacQuarterlyExportColDef[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  values: any[],
  style: {
    fill?: { type: "pattern"; pattern: "solid"; fgColor: { argb: string } };
    font?: object;
    bold?: boolean;
  },
) {
  const wsRow = ws.getRow(row);
  const mfoIdx = columns.findIndex(c => c.key === "mfoPpa");

  values.forEach((value, idx) => {
    const colDef = columns[idx];
    const cell = wsRow.getCell(idx + 1);
    cell.value = value === "" ? null : value;
    cell.border = _THIN_BORDER;
    cell.font = {
      size: 10,
      name: "Arial Narrow",
      bold: style.bold ?? false,
      color: style.font && "color" in style.font ? style.font.color : undefined,
    };
    if (style.fill) cell.fill = style.fill;
    cell.alignment = {
      vertical: "middle",
      horizontal: colDef?.numeric ? "right" : "left",
      wrapText: colDef?.key === "mfoPpa" || !colDef?.numeric,
    };
    if (colDef?.numeric) {
      cell.numFmt = colDef.key === "cutOffPercentage" ? _NUM_FMT_PCT : _NUM_FMT_AMOUNT;
    }
  });

  if (style.fill && mfoIdx >= 0) {
    for (let c = 0; c < columns.length; c++) {
      if (c !== mfoIdx) {
        wsRow.getCell(c + 1).fill = style.fill;
      }
    }
  }

  wsRow.commit();
}

function _mainRowValues(
  flatRow: LbacMainExportFlatRow,
  columns: readonly LbacMainExportColDef[],
): (string | number)[] {
  return columns.map(col => getMainDataCellValue(flatRow, col.key));
}

function _quarterlyRowValues(
  flatRow: LbacQuarterlyExportFlatRow,
  columns: readonly LbacQuarterlyExportColDef[],
): (string | number)[] {
  return columns.map(col => getQuarterlyCellValue(flatRow, col.key));
}

async function _buildLbacExcelBuffer(
  tree: LbacGroupObject[],
  year: number,
  _quarter: number,
  columnKeys: LbacMainExportColumnKey[],
  headerTemplatePath: string | null,
  footerTemplatePath: string | null,
): Promise<Buffer> {
  const { Workbook } = await import("@cj-tech-master/excelts");
  const columns = resolveMainExportColumns(columnKeys);
  const headerLayout = buildMainDataHeaderLayout(year, columns);

  const wb = new Workbook();
  const ws = wb.addWorksheet("LBAC");

  columns.forEach((col, idx) => {
    const width = col.key === "mfoPpa" || col.key.includes("majorFinal") || col.key.includes("performance")
      || col.key === "remarks" || col.key === "otherRemarks" || col.key === "priorYearAccomplishments"
      || col.key === "physicalTargets" || col.key.startsWith("qr")
      ? 28
      : 14;
    ws.getColumn(idx + 1).width = width;
  });

  let row = 1;

  if (headerTemplatePath) {
    const headerWb = new Workbook();
    await headerWb.xlsx.readFile(headerTemplatePath);
    row = await _copyTemplateRows(headerWb, ws, row);
  }

  const headerRow = row;
  _writeLbacHeaderRows(ws, row, headerLayout);
  row += 2;

  const flatRows = flattenLbacMainForExport(tree as unknown as import("@/lib/http/client/responses").LbacGroupResponse[]);
  for (const flatRow of flatRows) {
    if (flatRow.kind === "group") {
      const fill = _fillArgb(flatRow.depth === 0 ? LBAC_GROUP_DEPTH_ROOT_COLOR : LBAC_GROUP_DEPTH_CHILD_COLOR);
      const values = _mainRowValues(flatRow, columns);
      _writeLbacDataRow(ws, row, columns, values, {
        fill,
        bold: true,
        font: { color: { argb: "FFFFFFFF" } },
      });
    } else if (flatRow.kind === "group-total") {
      const fill = _fillArgb(flatRow.isRoot ? LBAC_TOTAL_ROOT_COLOR : LBAC_TOTAL_CHILD_COLOR);
      const values = _mainRowValues(flatRow, columns);
      _writeLbacDataRow(ws, row, columns, values, { fill, bold: true });
    } else {
      const values = _mainRowValues(flatRow, columns);
      _writeLbacDataRow(ws, row, columns, values, {});
    }
    row++;
  }

  if (footerTemplatePath) {
    const footerWb = new Workbook();
    await footerWb.xlsx.readFile(footerTemplatePath);
    await _copyTemplateRows(footerWb, ws, row);
  }

  ws.views = [{ state: "frozen", ySplit: headerRow + 1, xSplit: 0 }];

  const rawBuffer = await wb.xlsx.writeBuffer();
  if (Buffer.isBuffer(rawBuffer)) return rawBuffer;
  return Buffer.from(rawBuffer as unknown as Uint8Array);
}

async function _buildLbacQuarterlyExcelBuffer(
  tree: LbacQuarterlyGroupObject[],
  year: number,
  _quarter: number,
  columnKeys: LbacQuarterlyExportColumnKey[],
  headerTemplatePath: string | null,
  footerTemplatePath: string | null,
): Promise<Buffer> {
  const { Workbook } = await import("@cj-tech-master/excelts");
  const columns = resolveQuarterlyExportColumns(columnKeys);
  const headerLayout = buildQuarterlyHeaderLayout(year, columns);

  const wb = new Workbook();
  const ws = wb.addWorksheet("LBAC Quarterly");

  columns.forEach((col, idx) => {
    const width = col.key === "mfoPpa" || col.key === "priorYearAccomplishments" || col.key === "remarks"
      || col.key === "targetForBudgetYear" || col.key.startsWith("phys") || col.key.startsWith("actual")
      ? 28
      : 14;
    ws.getColumn(idx + 1).width = width;
  });

  let row = 1;

  if (headerTemplatePath) {
    const headerWb = new Workbook();
    await headerWb.xlsx.readFile(headerTemplatePath);
    row = await _copyTemplateRows(headerWb, ws, row);
  }

  const headerRow = row;
  _writeLbacHeaderRows(ws, row, headerLayout);
  row += 2;

  const flatRows = flattenLbacQuarterlyForExport(
    tree as unknown as import("@/lib/http/client/responses").LbacQuarterlyGroupResponse[],
  );
  for (const flatRow of flatRows) {
    if (flatRow.kind === "group") {
      const fill = _fillArgb(flatRow.depth === 0 ? LBAC_GROUP_DEPTH_ROOT_COLOR : LBAC_GROUP_DEPTH_CHILD_COLOR);
      const values = _quarterlyRowValues(flatRow, columns);
      _writeLbacDataRow(ws, row, columns, values, {
        fill,
        bold: true,
        font: { color: { argb: "FFFFFFFF" } },
      });
    } else if (flatRow.kind === "group-total") {
      const fill = _fillArgb(flatRow.isRoot ? LBAC_TOTAL_ROOT_COLOR : LBAC_TOTAL_CHILD_COLOR);
      const values = _quarterlyRowValues(flatRow, columns);
      _writeLbacDataRow(ws, row, columns, values, { fill, bold: true });
    } else {
      const values = _quarterlyRowValues(flatRow, columns);
      _writeLbacDataRow(ws, row, columns, values, {});
    }
    row++;
  }

  if (footerTemplatePath) {
    const footerWb = new Workbook();
    await footerWb.xlsx.readFile(footerTemplatePath);
    await _copyTemplateRows(footerWb, ws, row);
  }

  ws.views = [{ state: "frozen", ySplit: headerRow + 1, xSplit: 0 }];

  const rawBuffer = await wb.xlsx.writeBuffer();
  if (Buffer.isBuffer(rawBuffer)) return rawBuffer;
  return Buffer.from(rawBuffer as unknown as Uint8Array);
}

function _writeCollPerfTitleRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ws: any,
  startRow: number,
  year: number,
  quarter: number,
  colCount: number,
): number {
  const formRow = ws.getRow(startRow);
  const formCell = formRow.getCell(1);
  formCell.value = "LBac Form No. 1";
  formCell.font = { italic: true, size: 10, name: "Arial Narrow" };
  formRow.commit();

  const titleRow = ws.getRow(startRow + 1);
  const titleCell = titleRow.getCell(1);
  titleCell.value = "QUARTERLY REPORT OF RECEIPTS";
  titleCell.font = { bold: true, size: 14, name: "Arial Narrow" };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  if (colCount > 1) {
    try {
      ws.mergeCells(startRow + 1, 1, startRow + 1, colCount);
    } catch {
      // ignore invalid merge
    }
  }
  titleRow.height = 24;
  titleRow.commit();

  const subtitleRow = ws.getRow(startRow + 2);
  const subtitleCell = subtitleRow.getCell(1);
  subtitleCell.value = `FOR THE QUARTER ENDING ${quarterEndingLabel(year, quarter).toUpperCase()}`;
  subtitleCell.font = { bold: true, size: 11, name: "Arial Narrow" };
  subtitleCell.alignment = { horizontal: "center", vertical: "middle" };
  if (colCount > 1) {
    try {
      ws.mergeCells(startRow + 2, 1, startRow + 2, colCount);
    } catch {
      // ignore invalid merge
    }
  }
  subtitleRow.height = 20;
  subtitleRow.commit();

  return startRow + 3;
}

function _writeCollPerfHeaderRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ws: any,
  row: number,
  layout: {
    row1: string[];
    row2: string[];
    row3: string[];
    merges: import("@/lib/lbac/export-layout").HeaderMergeRange[];
  },
) {
  const writeRow = (rowIndex: number, labels: string[], height: number) => {
    const wsRow = ws.getRow(rowIndex);
    labels.forEach((label, idx) => {
      const cell = wsRow.getCell(idx + 1);
      cell.value = label;
      cell.font = { bold: true, size: 10, name: "Arial Narrow" };
      cell.fill = _HEADER_FILL;
      cell.border = _THIN_BORDER;
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    });
    wsRow.height = height;
    wsRow.commit();
  };

  writeRow(row, layout.row1, 22);
  writeRow(row + 1, layout.row2, 22);
  writeRow(row + 2, layout.row3, 18);
  _applyHeaderMerges(ws, row, layout.merges);
}

function _writeCollPerfDataRow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ws: any,
  row: number,
  columns: readonly CollPerfExportColDef[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  values: any[],
  quarter: number,
  style: {
    fill?: { type: "pattern"; pattern: "solid"; fgColor: { argb: string } };
    font?: object;
    bold?: boolean;
    depth?: number;
  },
) {
  const wsRow = ws.getRow(row);
  const particularsIdx = columns.findIndex(c => c.key === "particulars");

  values.forEach((value, idx) => {
    const colDef = columns[idx];
    const cell = wsRow.getCell(idx + 1);
    cell.value = value === "" ? null : value;
    cell.border = _THIN_BORDER;
    cell.font = {
      size: 10,
      name: "Arial Narrow",
      bold: style.bold ?? false,
      color: style.font && "color" in style.font ? style.font.color : undefined,
    };
    if (style.fill) cell.fill = style.fill;
    const isParticulars = colDef?.key === "particulars";
    cell.alignment = {
      vertical: "middle",
      horizontal: colDef?.numeric ? "right" : "left",
      wrapText: isParticulars || !colDef?.numeric,
      indent: isParticulars && style.depth !== undefined ? style.depth : undefined,
    };
    if (colDef?.numeric) {
      cell.numFmt = colDef.key === "variancePercent" ? _NUM_FMT_PCT : _NUM_FMT_AMOUNT;
    }
  });

  if (style.fill && particularsIdx >= 0) {
    for (let c = 0; c < columns.length; c++) {
      if (c !== particularsIdx) {
        wsRow.getCell(c + 1).fill = style.fill;
      }
    }
  }

  void quarter;
  wsRow.commit();
}

function _collPerfRowValues(
  flatRow: CollPerfExportFlatRow,
  columns: readonly CollPerfExportColDef[],
  quarter: number,
): (string | number)[] {
  return columns.map(col => getCollPerfCellValue(flatRow, col.key, quarter));
}

async function _buildCollPerfExcelBuffer(
  tree: CollPerfGroupObject[],
  year: number,
  quarter: number,
  columnKeys: CollPerfExportColumnKey[],
  footerTemplatePath: string | null,
): Promise<Buffer> {
  const { Workbook } = await import("@cj-tech-master/excelts");
  const columns = resolveCollPerfExportColumns(columnKeys);
  const headerLayout = buildCollPerfHeaderLayout(quarter, columns);

  const wb = new Workbook();
  const ws = wb.addWorksheet("Collection Performance");

  columns.forEach((col, idx) => {
    const width = col.key === "particulars" || col.key === "remarks" ? 36 : 16;
    ws.getColumn(idx + 1).width = width;
  });

  let row = 1;
  row = _writeCollPerfTitleRows(ws, row, year, quarter, columns.length);

  const headerRow = row;
  _writeCollPerfHeaderRows(ws, row, headerLayout);
  row += 3;

  const flatRows = flattenCollPerfForExport(
    tree as unknown as import("@/lib/http/client/responses").CollPerfGroupResponse[],
  );

  for (const flatRow of flatRows) {
    if (flatRow.kind === "group") {
      const fill = _fillArgb(
        flatRow.depth === 0 ? COLL_PERF_GROUP_DEPTH_ROOT_COLOR : COLL_PERF_GROUP_DEPTH_CHILD_COLOR,
      );
      const values = _collPerfRowValues(flatRow, columns, quarter);
      _writeCollPerfDataRow(ws, row, columns, values, quarter, {
        fill,
        bold: true,
        font: { color: { argb: "FFFFFFFF" } },
        depth: flatRow.depth,
      });
    } else if (flatRow.kind === "group-total") {
      const fill = _fillArgb(collPerfTotalRowColor(flatRow.depth, flatRow.isRoot));
      const values = _collPerfRowValues(flatRow, columns, quarter);
      _writeCollPerfDataRow(ws, row, columns, values, quarter, {
        fill,
        bold: true,
        depth: flatRow.depth,
      });
    } else {
      const values = _collPerfRowValues(flatRow, columns, quarter);
      _writeCollPerfDataRow(ws, row, columns, values, quarter, {
        depth: flatRow.depth,
      });
    }
    row++;
  }

  if (footerTemplatePath) {
    const footerWb = new Workbook();
    await footerWb.xlsx.readFile(footerTemplatePath);
    await _copyTemplateRows(footerWb, ws, row);
  }

  ws.views = [{ state: "frozen", ySplit: headerRow + 2, xSplit: 0 }];

  const rawBuffer = await wb.xlsx.writeBuffer();
  if (Buffer.isBuffer(rawBuffer)) return rawBuffer;
  return Buffer.from(rawBuffer as unknown as Uint8Array);
}

/**
 * Returns the current calendar year in UTC+8 for collection performance views.
 *
 * @function getCollPerfCurrentYear
 * @returns {number} The current year in UTC+8.
 */
function getCollPerfCurrentYear(): number {
  return DateTime.now().setZone("UTC+8").year;
}

/**
 * Maps a calendar month (1–12) to its fiscal quarter (1–4) in UTC+8.
 *
 * @function monthToQuarter
 * @param {number} month - Month number (1–12).
 * @returns {number} Quarter number (1–4).
 */
function monthToQuarter(month: number): number {
  return Math.ceil(month / 3);
}

/**
 * Computes quarterly totals, total collection, performance percentage, and excess/deficit
 * from monthly rows for the current UTC+8 year.
 *
 * @function buildCollPerfDerived
 * @param {string} incomeTarget - Income target as a decimal string.
 * @param {CollPerfMonthlyDataItem[]} monthlyRows - Monthly rows for the current year, sorted by month.
 * @returns {Pick<CollPerfData, "quarterlyData" | "totalCollection" | "collectionPerformance" | "excessOrDeficit">} Derived financial fields.
 */
function buildCollPerfDerived(
  incomeTarget: string,
  monthlyRows: CollPerfMonthlyDataItem[],
): Pick<CollPerfData, "quarterlyData" | "totalCollection" | "collectionPerformance" | "excessOrDeficit"> {
  const sumQuarter = (quarter: number) =>
    monthlyRows
      .filter((m) => m.quarter === quarter)
      .reduce((acc, m) => acc.plus(casts.castFromDecimal(m.value)), new Decimal(0))
      .toString();

  const totalCollection = monthlyRows
    .reduce((acc, m) => acc.plus(casts.castFromDecimal(m.value)), new Decimal(0))
    .toString();

  const targetDec = casts.castFromDecimal(incomeTarget);
  const totalDec = casts.castFromDecimal(totalCollection);
  const collectionPerformance = targetDec.isZero()
    ? "0"
    : totalDec.div(targetDec).mul(100).toString();
  const excessOrDeficit = totalDec.minus(targetDec).toString();

  return {
    quarterlyData: {
      q1: sumQuarter(1),
      q2: sumQuarter(2),
      q3: sumQuarter(3),
      q4: sumQuarter(4),
    },
    totalCollection,
    collectionPerformance,
    excessOrDeficit,
  };
}

/**
 * Builds a fully computed collection performance item from a data row and its monthly rows.
 *
 * @function buildCollPerfItemObject
 * @param {CollPerfDataRow} row - The data row from the database.
 * @param {CollPerfMonthlyRow[]} monthlyRows - Monthly rows for this item (current year only).
 * @returns {CollPerfItemObject} The item with derived quarterly and performance fields.
 */
/**
 * Strips the discriminant type field from a collection performance item object.
 *
 * @function toCollPerfData
 * @param {CollPerfItemObject} item - Full item object including type discriminant.
 * @returns {CollPerfData} Item payload without the type field.
 */
function toCollPerfData(item: CollPerfItemObject): CollPerfData {
  return {
    id: item.id,
    particulars: item.particulars,
    accountCode: item.accountCode,
    incomeTarget: item.incomeTarget,
    monthlyData: item.monthlyData,
    quarterlyData: item.quarterlyData,
    totalCollection: item.totalCollection,
    collectionPerformance: item.collectionPerformance,
    excessOrDeficit: item.excessOrDeficit,
  };
}

function buildCollPerfItemObject(
  row: CollPerfDataRow,
  monthlyRows: CollPerfMonthlyRow[],
): CollPerfItemObject {
  const currentYear = getCollPerfCurrentYear();
  const monthlyData: CollPerfMonthlyDataItem[] = monthlyRows
    .filter((m) => m.year === currentYear)
    .map((m) => ({
      id: m.id,
      month: m.month,
      year: m.year,
      quarter: m.quarter,
      value: m.value,
    }))
    .sort((a, b) => a.month - b.month);

  const derived = buildCollPerfDerived(row.incomeTarget, monthlyData);

  return {
    type: CollPerfObjectType.Item,
    id: row.id,
    particulars: row.particulars,
    accountCode: row.accountCode,
    incomeTarget: row.incomeTarget,
    monthlyData,
    ...derived,
  };
}

/**
 * Assembles a nested collection performance group tree from flat group and item lists.
 *
 * @function buildCollPerfTree
 * @param {CollPerfGroupRow[]} allGroups - All group rows.
 * @param {Map<string, CollPerfItemObject[]>} itemsByGroup - Items keyed by group id.
 * @returns {CollPerfGroupObject[]} Root-level group nodes.
 */
function _zeroCollPerfGroupTotals(currentYear: number): CollPerfGroupTotals {
  const z = "0";
  const monthlyData: CollPerfMonthlyDataItem[] = [];
  for (let month = 1; month <= 12; month++) {
    monthlyData.push({
      id: "",
      month,
      year: currentYear,
      quarter: monthToQuarter(month),
      value: z,
    });
  }
  return {
    incomeTarget: z,
    monthlyData,
    quarterlyData: { q1: z, q2: z, q3: z, q4: z },
    totalCollection: z,
    collectionPerformance: z,
    excessOrDeficit: z,
  };
}

function _collectAllCollPerfItems(group: CollPerfGroupObject): CollPerfItemObject[] {
  const items: CollPerfItemObject[] = [];
  for (const child of group.children) {
    if (child.type === CollPerfObjectType.Item) {
      items.push(child);
    } else {
      items.push(..._collectAllCollPerfItems(child));
    }
  }
  return items;
}

/**
 * Sums numeric collection performance fields across all items in a subtree.
 * Text fields (particulars, accountCode) are omitted. Performance percentage and
 * excess/deficit are recomputed from aggregated income target and total collection.
 *
 * @function _computeCollPerfGroupTotals
 * @param {CollPerfItemObject[]} items - All items under a group (including nested groups).
 * @param {number} currentYear - Calendar year for monthly aggregation (UTC+8).
 * @returns {CollPerfGroupTotals} Rolled-up numeric totals for the group.
 */
function _computeCollPerfGroupTotals(items: CollPerfItemObject[], currentYear: number): CollPerfGroupTotals {
  let incomeTarget = new Decimal(0);
  const monthlyByMonth = new Map<number, Decimal>();
  for (let month = 1; month <= 12; month++) {
    monthlyByMonth.set(month, new Decimal(0));
  }

  for (const item of items) {
    incomeTarget = incomeTarget.plus(casts.castFromDecimal(item.incomeTarget));
    for (const md of item.monthlyData) {
      if (md.year === currentYear) {
        const prev = monthlyByMonth.get(md.month) ?? new Decimal(0);
        monthlyByMonth.set(md.month, prev.plus(casts.castFromDecimal(md.value)));
      }
    }
  }

  const monthlyData: CollPerfMonthlyDataItem[] = [];
  for (let month = 1; month <= 12; month++) {
    monthlyData.push({
      id: "",
      month,
      year: currentYear,
      quarter: monthToQuarter(month),
      value: (monthlyByMonth.get(month) ?? new Decimal(0)).toString(),
    });
  }

  const derived = buildCollPerfDerived(incomeTarget.toString(), monthlyData);

  return {
    incomeTarget: incomeTarget.toString(),
    monthlyData,
    ...derived,
  };
}

function _attachCollPerfGroupTotals(groups: CollPerfGroupObject[], currentYear: number): void {
  for (const group of groups) {
    const childGroups = group.children.filter((c) => c.type === CollPerfObjectType.Group) as CollPerfGroupObject[];
    _attachCollPerfGroupTotals(childGroups, currentYear);
    group.totals = _computeCollPerfGroupTotals(_collectAllCollPerfItems(group), currentYear);
  }
}

function buildCollPerfTree(
  allGroups: CollPerfGroupRow[],
  itemsByGroup: Map<string, CollPerfItemObject[]>,
): CollPerfGroupObject[] {
  const currentYear = getCollPerfCurrentYear();
  const groupMap = new Map<string, CollPerfGroupObject>();

  for (const g of allGroups) {
    groupMap.set(g.id, {
      type: CollPerfObjectType.Group,
      id: g.id,
      name: g.name,
      children: [],
      totals: _zeroCollPerfGroupTotals(currentYear),
    });
  }

  const roots: CollPerfGroupObject[] = [];

  for (const g of allGroups) {
    const node = groupMap.get(g.id)!;
    const groupItems = itemsByGroup.get(g.id) ?? [];
    node.children.push(...groupItems);

    if (g.parentId === null) {
      roots.push(node);
    } else {
      const parent = groupMap.get(g.parentId);
      if (parent) {
        parent.children.push(node);
      }
    }
  }

  _attachCollPerfGroupTotals(roots, currentYear);

  return roots;
}

/**
 * Fetches all collection performance group rows ordered by name.
 *
 * @async
 * @function fetchCollPerfGroups
 * @returns {Promise<CollPerfGroupRow[]>} All group rows.
 */
async function fetchCollPerfGroups(): Promise<CollPerfGroupRow[]> {
  return db
    .select({
      id: lbacCollectionPerformanceGroup.id,
      name: lbacCollectionPerformanceGroup.name,
      parentId: lbacCollectionPerformanceGroup.parentId,
    })
    .from(lbacCollectionPerformanceGroup)
    .orderBy(asc(lbacCollectionPerformanceGroup.name));
}

/**
 * Collects descendant group IDs for a given parent group (breadth-first).
 *
 * @function collectCollPerfDescendantGroupIds
 * @param {string} groupId - The parent group id.
 * @param {CollPerfGroupRow[]} allGroups - All group rows.
 * @returns {string[]} Descendant group ids (does not include groupId).
 */
function collectCollPerfDescendantGroupIds(groupId: string, allGroups: CollPerfGroupRow[]): string[] {
  const result: string[] = [];
  const queue = [groupId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = allGroups.filter((g) => g.parentId === current);
    for (const child of children) {
      result.push(child.id);
      queue.push(child.id);
    }
  }
  return result;
}

/**
 * Upserts monthly collection performance rows for a data item.
 * Existing rows matching month and year are updated; others are inserted.
 *
 * @async
 * @function upsertCollPerfMonthlyData
 * @param {string} dataId - The parent data item id.
 * @param {CreateCollPerfDataPayload["monthlyData"]} monthlyData - Monthly entries to upsert.
 * @returns {Promise<void>}
 */
async function upsertCollPerfMonthlyData(
  dataId: string,
  monthlyData: NonNullable<CreateCollPerfDataPayload["monthlyData"]>,
): Promise<void> {
  for (const entry of monthlyData) {
    const quarter = monthToQuarter(entry.month);
    const [existing] = await db
      .select({ id: lbacCollectionPerformanceMonthlyData.id })
      .from(lbacCollectionPerformanceMonthlyData)
      .where(
        and(
          eq(lbacCollectionPerformanceMonthlyData.dataId, dataId),
          eq(lbacCollectionPerformanceMonthlyData.month, entry.month),
          eq(lbacCollectionPerformanceMonthlyData.year, entry.year),
        ),
      )
      .limit(1);

    if (existing) {
      await db
        .update(lbacCollectionPerformanceMonthlyData)
        .set({
          value: casts.castToDecimal(entry.value),
          quarter,
        })
        .where(eq(lbacCollectionPerformanceMonthlyData.id, existing.id));
    } else {
      await db.insert(lbacCollectionPerformanceMonthlyData).values({
        dataId,
        month: entry.month,
        year: entry.year,
        quarter,
        value: casts.castToDecimal(entry.value),
      });
    }
  }
}

/**
 * Loads a single collection performance item with derived fields.
 *
 * @async
 * @function fetchCollPerfItemById
 * @param {string} id - The data item id.
 * @returns {Promise<CollPerfItemObject | null>} The item or null if not found.
 */
async function fetchCollPerfItemById(id: string): Promise<CollPerfItemObject | null> {
  const [row] = await db
    .select({
      id: lbacCollectionPerformanceData.id,
      particulars: lbacCollectionPerformanceData.particulars,
      accountCode: lbacCollectionPerformanceData.accountCode,
      incomeTarget: lbacCollectionPerformanceData.incomeTarget,
      groupId: lbacCollectionPerformanceData.groupId,
    })
    .from(lbacCollectionPerformanceData)
    .where(eq(lbacCollectionPerformanceData.id, id))
    .limit(1);

  if (!row) {
    return null;
  }

  const currentYear = getCollPerfCurrentYear();
  const monthlyRows = await db
    .select({
      id: lbacCollectionPerformanceMonthlyData.id,
      month: lbacCollectionPerformanceMonthlyData.month,
      year: lbacCollectionPerformanceMonthlyData.year,
      quarter: lbacCollectionPerformanceMonthlyData.quarter,
      value: lbacCollectionPerformanceMonthlyData.value,
      dataId: lbacCollectionPerformanceMonthlyData.dataId,
    })
    .from(lbacCollectionPerformanceMonthlyData)
    .where(
      and(
        eq(lbacCollectionPerformanceMonthlyData.dataId, id),
        eq(lbacCollectionPerformanceMonthlyData.year, currentYear),
      ),
    );

  return buildCollPerfItemObject(
    {
      ...row,
      incomeTarget: String(row.incomeTarget),
    },
    monthlyRows.map((m) => ({ ...m, value: String(m.value) })),
  );
}

export enum LbacObjectType {
  Group = 6767,
  Item = 6768,
}

export type BaseLbacGroupObject = {
  id: string;
  type: LbacObjectType.Group;
  name: string;
  aipRefCode: {
    id: string;
    aipReferenceCode: string;
    description: string;
  } | null;
  implementingUnit: {
    id: string;
    name: string;
  } | null;
};

export type LbacObject = {
  id: string;
  type: LbacObjectType.Item;
  mfoPpa: string;
  majorFinalOutput: string | null;
  performanceOutputIndicator: string | null;
  targetForBudgetYear: string | null;
  proposedBudgetPS: string;
  proposedBudgetMOOE: string;
  proposedBudgetFE: string;
  proposedBudgetCO: string;
  proposedBudgetTotal: string;
  aipRefCode: {
    id: string;
    aipReferenceCode: string;
    description: string;
  } | null;
  implementingUnit: {
    id: string;
    name: string;
  } | null;
  appropriation: {
    contOrSupplementalAugmentation: string;
    current: string;
    total: string;
  };
  allotmentReleased: {
    previousQuarters: string;
    thisQuarter: string;
    total: string;
  };
  balanceOfAppropriation: string;
  obligations: {
    previousQuarters: string;
    thisQuarter: string;
    total: string;
  };
  unobligatedAmount: string;
  remarks: string | null;
  asCutOffMonth: {
    obligation: string;
    balance: string;
    percentage: string;
  };
  other: {
    gadable: boolean;
    tagging: string | null;
    amountAttributed: string | null;
    expenseCode: {
      id: string;
      accountName: string;
      accountCode: string | null;
    } | null;
    saaob: {
      id: string;
      name: string;
      accountCode: string | null;
    } | null;
    priorYearAccomplishments: string | null;
    physicalTargets: string | null;
    remarks: string | null;
  };
  financialAllocation: {
    Q1: string;
    Q2: string;
    Q3: string;
    Q4: string;
    total: string;
  };
  actualFinancialPerformance: {
    Q1: string;
    Q2: string;
    Q3: string;
    Q4: string;
    total: string;
  };
  variance: string;
  quarterlyReport: {
    physicalTargets: {
      Q1: string | null;
      Q2: string | null;
      Q3: string | null;
      Q4: string | null;
      total: string | null;
    };
    actualPhysicalPerformance: {
      Q1: string | null;
      Q2: string | null;
      Q3: string | null;
      Q4: string | null;
      total: string | null;
    };
    variance: string | null;
    accomplishment: string | null;
    remarks: string | null;
  };
};

export type LbacGroupObject = {
  children: Array<LbacGroupObject | LbacObject>;
  totals: LbacGroupTotals;
} & BaseLbacGroupObject;

export type LbacViewerObject = {
  id: string;
  type: LbacObjectType.Item;
  aipRefCode: {
    id: string;
    aipReferenceCode: string;
    description: string;
  } | null;
  mfoPpa: string;
  implementingUnit: {
    id: string;
    name: string;
  } | null;
  proposedBudgetTotal: string;
  asCutOffMonth: {
    obligation: string;
    balance: string;
    percentage: string;
  };
  other: {
    expenseCode: {
      id: string;
      accountName: string;
      accountCode: string | null;
    } | null;
  };
};

export type LbacViewerGroupTotals = {
  proposedBudgetTotal: string;
  asCutOffMonth: {
    obligation: string;
    balance: string;
    percentage: string;
  };
};

export type LbacViewerGroupObject = {
  children: Array<LbacViewerGroupObject | LbacViewerObject>;
  totals: LbacViewerGroupTotals;
} & BaseLbacGroupObject;

export type LbacQuarterlyObject = {
  id: string;
  type: LbacObjectType.Item;
  mfoPpa: string;
  aipRefCode: {
    id: string;
    aipReferenceCode: string;
    description: string;
  } | null;
  implementingUnit: {
    id: string;
    name: string;
  } | null;
  appropriation: {
    contOrSupplementalAugmentation: string;
    current: string;
    total: string;
  };
  asCutOffMonth: {
    obligation: string;
    balance: string;
  };
  priorYearAccomplishments: string | null;
  physicalTargets: {
    Q1: string | null;
    Q2: string | null;
    Q3: string | null;
    Q4: string | null;
    total: string | null;
  };
  actualPhysicalPerformance: {
    Q1: string | null;
    Q2: string | null;
    Q3: string | null;
    Q4: string | null;
    total: string | null;
  };
  variance: string | null;
  accomplishment: string | null;
  remarks: string | null;
  targetForBudgetYear: string | null;
};

export type LbacQuarterlyGroupObject = {
  children: Array<LbacQuarterlyGroupObject | LbacQuarterlyObject>;
  totals: LbacQuarterlyGroupTotals;
} & BaseLbacGroupObject;

export type CreateLbacGroupPayload = {
  aipRefCode?: string | null;
  name: string;
  implementingUnitId?: string | null;
};

export type CreateLbacItemPayload = {
  aipRefCode?: string | null;
  mfoPpa: string;
  majorFinalOutput?: string | null;
  performanceOutputIndicator?: string | null;
  targetForBudgetYear?: string | null;
  proposedBudgetPS?: string;
  proposedBudgetMOOE?: string;
  proposedBudgetFE?: string;
  proposedBudgetCO?: string;
  remarks?: string | null;
  remarksForAllocation?: string | null;
  gadable?: boolean;
  tagging?: string | null;
  amountAttributed?: string | null;
  physicalTargets?: string | null;
  priorYearAccomplishments?: string | null;
  remarksForOtherMetadata?: string | null;
  implementingUnitId?: string | null;
  expenseCodeId?: string | null;
  saaobId?: string | null;
};

export type UpdateLbacItemPayload = Partial<CreateLbacItemPayload>;

export type UpdateLbacQuarterlyPayload = Partial<{
  priorYearAccomplishments: string;
  physicalTargetQ1: string;
  physicalTargetQ2: string;
  physicalTargetQ3: string;
  physicalTargetQ4: string;
  physicalTargetTotal: string;
  actualPhysicalPerformanceQ1: string;
  actualPhysicalPerformanceQ2: string;
  actualPhysicalPerformanceQ3: string;
  actualPhysicalPerformanceQ4: string;
  variance: string;
  accomplishmentPercentage: string;
  remarks: string;
  targetForBudgetYear: string;
}>;

export type UpdateLbacGroupPayload = Partial<CreateLbacGroupPayload>;

type LbacGroupRow = {
  id: string;
  name: string;
  parentId: string | null;
  aipRefId: string | null;
  aipReferenceCode: string | null;
  aipDescription: string | null;
  implementingUnitId: string | null;
  implementingUnitName: string | null;
};

type LbacItemRow = {
  id: string;
  mfoPpa: string;
  majorFinalOutput: string | null;
  performanceOutputIndicator: string | null;
  targetForBudgetYear: string | null;
  proposedBudgetPS: string;
  proposedBudgetMOOE: string;
  proposedBudgetFE: string;
  proposedBudgetCO: string;
  remarks: string | null;
  gadable: boolean;
  tagging: string | null;
  amountAttributed: string | null;
  physicalTargets: string | null;
  priorYearAccomplishments: string | null;
  remarksForOtherMetadata: string | null;
  aipRefId: string | null;
  aipReferenceCode: string | null;
  aipDescription: string | null;
  implementingUnitId: string | null;
  implementingUnitName: string | null;
  expenseCodeId: string | null;
  expenseAccountName: string | null;
  expenseAccountCode: string | null;
  saaobId: string | null;
  saaobName: string | null;
  saaobAccountCode: string | null;
  quarterlyReportId: string;
  parentId: string;
};

type QuarterlyReportRow = {
  id: string;
  priorYearAccomplishments: string | null;
  physicalTargetQ1: string | null;
  physicalTargetQ2: string | null;
  physicalTargetQ3: string | null;
  physicalTargetQ4: string | null;
  physicalTargetTotal: string | null;
  actualPhysicalPerformanceQ1: string | null;
  actualPhysicalPerformanceQ2: string | null;
  actualPhysicalPerformanceQ3: string | null;
  actualPhysicalPerformanceQ4: string | null;
  actualPhysicalPerformanceTotal: string | null;
  variance: string | null;
  accomplishmentPercentage: string | null;
  remarks: string | null;
  targetForBudgetYear: string | null;
};

type SupplementalEntry = {
  aipRefId: string;
  amount: string;
  supplementalType: "less" | "add";
  quarter: number;
  year: number;
};

type ObrAipEntry = {
  aipReferenceId: string;
  amount: string;
  quarter: number;
  year: number;
  createdAt: Date;
};

export type LbacGroupTotals = {
  proposedBudgetPS: string;
  proposedBudgetMOOE: string;
  proposedBudgetFE: string;
  proposedBudgetCO: string;
  proposedBudgetTotal: string;
  appropriation: {
    contOrSupplementalAugmentation: string;
    current: string;
    total: string;
  };
  allotmentReleased: {
    previousQuarters: string;
    thisQuarter: string;
    total: string;
  };
  balanceOfAppropriation: string;
  obligations: {
    previousQuarters: string;
    thisQuarter: string;
    total: string;
  };
  unobligatedAmount: string;
  asCutOffMonth: {
    obligation: string;
    balance: string;
    percentage: string;
  };
  other: {
    amountAttributed: string;
  };
  financialAllocation: {
    Q1: string;
    Q2: string;
    Q3: string;
    Q4: string;
    total: string;
  };
  actualFinancialPerformance: {
    Q1: string;
    Q2: string;
    Q3: string;
    Q4: string;
    total: string;
  };
  variance: string;
};

export type LbacQuarterlyGroupTotals = {
  appropriation: {
    contOrSupplementalAugmentation: string;
    current: string;
    total: string;
  };
  asCutOffMonth: {
    obligation: string;
    balance: string;
  };
};

export type LbacSearchResultItem = {
  id: string;
  mfoPpa: string;
  aipRefCode: {
    id: string;
    aipReferenceCode: string;
    description: string;
  } | null;
  other: {
    expenseCode: {
      id: string;
      accountName: string;
      accountCode: string | null;
    } | null;
  };
};

export type LbacSearchGroupItem = {
  id: string;
  name: string;
  children: Array<LbacSearchGroupItem | LbacSearchResultItem>;
};

export type LbacSearchResult = LbacSearchGroupItem[];

export type LbacTemplateType = templateBucket.TemplateType;

export type LbacTemplateInfo = {
  id: string;
  templateType: LbacTemplateType;
  createdAt: string;
  updatedAt: string;
};

export type LbacTemplatesBundle = {
  header: LbacTemplateInfo | null;
  footer: LbacTemplateInfo | null;
};

export type LbacTemplateUploadInput = {
  type: LbacTemplateType;
  file: Buffer;
  filename: string;
};

export interface LbacMainExportOptions {
  year: number;
  quarter: number;
  columns: LbacMainExportColumnKey[];
}

export interface LbacQuarterlyExportOptions {
  year: number;
  quarter: number;
  columns: LbacQuarterlyExportColumnKey[];
}

export interface CollPerfExportOptions {
  year: number;
  quarter: number;
  columns: CollPerfExportColumnKey[];
}

export enum CollPerfObjectType {
  Group = 6780,
  Item = 6781,
}

export type CreateCollPerfDataPayload = {
  particulars: string;
  accountCode?: string | null;
  incomeTarget: string;
  monthlyData?: Array<{
    month: number;
    year: number;
    value: string;
  }>;
};

export type CollPerfMonthlyDataItem = {
  id: string;
  month: number;
  year: number;
  quarter: number;
  value: string;
};

export type CollPerfData = {
  id: string;
  particulars: string;
  accountCode: string | null;
  incomeTarget: string;
  monthlyData: CollPerfMonthlyDataItem[];
  quarterlyData: {
    q1: string;
    q2: string;
    q3: string;
    q4: string;
  };
  totalCollection: string;
  collectionPerformance: string;
  excessOrDeficit: string;
};

export type CollPerfGroupTotals = {
  incomeTarget: string;
  monthlyData: CollPerfMonthlyDataItem[];
  quarterlyData: {
    q1: string;
    q2: string;
    q3: string;
    q4: string;
  };
  totalCollection: string;
  collectionPerformance: string;
  excessOrDeficit: string;
};

export type CollPerfGroupObject = {
  type: CollPerfObjectType.Group;
  id: string;
  name: string;
  children: Array<CollPerfGroupObject | CollPerfItemObject>;
  totals: CollPerfGroupTotals;
};

export type CollPerfItemObject = {
  type: CollPerfObjectType.Item;
} & CollPerfData;

export type CollPerfObject = CollPerfGroupObject | CollPerfItemObject;

type CollPerfGroupRow = {
  id: string;
  name: string;
  parentId: string | null;
};

type CollPerfDataRow = {
  id: string;
  particulars: string;
  accountCode: string | null;
  incomeTarget: string;
  groupId: string;
};

type CollPerfMonthlyRow = {
  id: string;
  month: number;
  year: number;
  quarter: number;
  value: string;
  dataId: string;
};
