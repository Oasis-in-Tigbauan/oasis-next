import { asc, eq, inArray } from "drizzle-orm";
import { DateTime } from "luxon";
import { Decimal } from "decimal.js";

import * as casts from "@/lib/types/casts";
import { db } from "@/lib/db";
import { ErrorCodes, Failure, Result, Success } from "@/lib/one-of";
import {
  aipReferences,
  expenseClasses,
  lbacGroups,
  lbacItems,
  lbacQuarterlyReport,
  obrMainAipReferences,
  obrMainData,
  officeCodes,
  supplemental,
} from "@/lib/db/schema";
import { type User } from "@/lib/accounts";

/**
 * Returns all LBAC items and groups in a nested tree structure, including full financial computation
 * and quarterly report data for each item.
 *
 * @async
 * @function getAllItems
 * @returns {Promise<Result<LbacGroupObject[]>>} A result containing the full LBAC group/item tree on success,
 *                                               or a failure result on error.
 */
export async function getAllItems(): Promise<Result<LbacGroupObject[]>> {
  try {
    const [groups, items] = await Promise.all([_fetchGroups(null), _fetchItems(null)]);

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
      const obj = _buildLbacItemObject(item, reportMap.get(item.quarterlyReportId), supplementals, obrAmounts);
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
 * Returns the office-specific LBAC quarterly report data for the given user's office.
 * Shows partial item information (mfoPpa, appropriation, asCutOffMonth) and full quarterly report.
 * Only items and groups belonging to the user's office are returned.
 *
 * @async
 * @function getAllQuarterlyReports
 * @param {User} user - The authenticated user whose officeId is used to filter the data.
 * @returns {Promise<Result<LbacQuarterlyGroupObject[]>>} A result containing the quarterly report tree on success,
 *                                                        or a failure result on error.
 */
export async function getAllQuarterlyReports(user: User): Promise<Result<LbacQuarterlyGroupObject[]>> {
  try {
    const officeIds = [user.office.id];

    const [groups, items] = await Promise.all([
      _fetchGroups(officeIds),
      _fetchItems(officeIds),
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
      const obj = _buildLbacQuarterlyObject(item, reportMap.get(item.quarterlyReportId), supplementals, obrAmounts);
      const existing = itemsByGroup.get(item.parentId) ?? [];
      existing.push(obj);
      itemsByGroup.set(item.parentId, existing);
    }

    const tree = _buildQuarterlyGroupTree(groups, itemsByGroup);
    return new Success(tree);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Unable to retrieve LBAC quarterly reports.", { userId: user.id }, e);
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
    const [groupRow] = await db.select({ id: lbacGroups.id, officeId: lbacGroups.officeId })
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
        quarterlyReportId: qr.id,
        parentId: groupId,
        authorId: user.id,
        officeId: groupRow.officeId,
      }).returning({ id: lbacItems.id });

      return newItem.id;
    });

    const fetchedItems = await _fetchItems(null).then((all) => all.filter((i) => i.id === newItemId));
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
    const obj = _buildLbacItemObject(item, reports[0], supplementals, obrAmounts);

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
    let officeId = user.office.id;

    if (groupId) {
      const [parentGroup] = await db.select({ id: lbacGroups.id, officeId: lbacGroups.officeId })
        .from(lbacGroups).where(eq(lbacGroups.id, groupId)).limit(1);
      if (!parentGroup) {
        return new Failure(ErrorCodes.ValidationFailure, "The specified parent group does not exist.", { groupId });
      }
      officeId = parentGroup.officeId;
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
      officeId,
      authorId: user.id,
    }).returning({ id: lbacGroups.id });

    const fetchedGroups = await _fetchGroups(null).then((all) =>
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

    if (Object.keys(updateValues).length > 0) {
      await db.update(lbacItems).set(updateValues).where(eq(lbacItems.id, lbacId));
    }

    const updatedItems = await _fetchItems(null).then((all) => all.filter((i) => i.id === lbacId));
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

    const obj = _buildLbacItemObject(updatedItem, reports[0], supplementals, obrAmounts);
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

    const fetchedItems = await _fetchItems(null).then((all) => all.filter((i) => i.id === lbacId));
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

    const obj = _buildLbacQuarterlyObject(fetchedItem, reports[0], supplementals, obrAmounts);
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

    const fetchedGroups = await _fetchGroups(null).then((all) => all.filter((g) => g.id === lbacGroupId));
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
    const allGroups = await _fetchGroups(null);

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
 * Deletes a specific LBAC group. The group must be completely empty — no lbacItems may exist
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
    const allGroups = await _fetchGroups(null);

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

/**
 * Returns the current year in UTC+8.
 */
function _getCurrentYearUtc8(): number {
  return DateTime.now().setZone("UTC+8").year;
}

/**
 * Returns the current quarter (1–4) in UTC+8.
 */
function _getCurrentQuarterUtc8(): number {
  return DateTime.now().setZone("UTC+8").quarter;
}

/**
 * Returns the inclusive start and exclusive end Date boundaries for a given quarter in UTC+8,
 * expressed as UTC Date objects suitable for database timestamp comparisons.
 *
 * @param {number} year - The calendar year.
 * @param {number} quarter - Quarter number (1–4).
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
): Decimal {
  const currentYear = yearFilter ?? _getCurrentYearUtc8();
  const relevant = supplementals.filter(
    (s) =>
      s.aipRefId === aipRefId &&
      s.year === currentYear &&
      (quarterFilter === undefined || s.quarter === quarterFilter),
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
 * @param {number} quarter - The quarter to filter by (1–4).
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
 * @param {string[] | null} officeIds - If provided, filter groups to these office IDs.
 * @returns {Promise<LbacGroupRow[]>} Flat list of group rows.
 */
async function _fetchGroups(officeIds: string[] | null): Promise<LbacGroupRow[]> {
  const query = db
    .select({
      id: lbacGroups.id,
      name: lbacGroups.name,
      parentId: lbacGroups.parentId,
      officeId: lbacGroups.officeId,
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

  if (officeIds !== null) {
    return query.where(inArray(lbacGroups.officeId, officeIds));
  }
  return query;
}

/**
 * Fetches all lbac_items rows with left-joined aipReferences, officeCodes, and expenseClasses.
 *
 * @async
 * @param {string[] | null} officeIds - If provided, filter items to these office IDs.
 * @returns {Promise<LbacItemRow[]>} Flat list of item rows.
 */
async function _fetchItems(officeIds: string[] | null): Promise<LbacItemRow[]> {
  const query = db
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
      quarterlyReportId: lbacItems.quarterlyReportId,
      parentId: lbacItems.parentId,
      officeId: lbacItems.officeId,
    })
    .from(lbacItems)
    .leftJoin(aipReferences, eq(aipReferences.id, lbacItems.aipRefCode))
    .leftJoin(officeCodes, eq(officeCodes.id, lbacItems.implementingUnitId))
    .leftJoin(expenseClasses, eq(expenseClasses.id, lbacItems.expenseCodeId))
    .orderBy(asc(lbacItems.createdAt));

  if (officeIds !== null) {
    return query.where(inArray(lbacItems.officeId, officeIds));
  }
  return query;
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
 * @returns {LbacObject} The fully computed LBAC item object.
 */
function _buildLbacItemObject(
  item: LbacItemRow,
  report: QuarterlyReportRow | undefined,
  supplementals: SupplementalEntry[],
  obrAmounts: ObrAipEntry[],
): LbacObject {
  const currentYear = _getCurrentYearUtc8();
  const currentQuarter = _getCurrentQuarterUtc8();
  const monthStart = _getCurrentMonthStartUtc8();

  // Proposed budget totals
  const ps = casts.castFromDecimal(item.proposedBudgetPS);
  const mooe = casts.castFromDecimal(item.proposedBudgetMOOE);
  const fe = casts.castFromDecimal(item.proposedBudgetFE);
  const co = casts.castFromDecimal(item.proposedBudgetCO);
  const proposedBudgetTotal = ps.plus(mooe).plus(fe).plus(co);

  // Appropriation
  const contOrSupplemental = item.aipRefId
    ? _computeSupplementalAmount(supplementals, item.aipRefId)
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
 * Maps a single lbac_items row into a LbacQuarterlyObject with partial financial fields,
 * suitable for office-level quarterly report access.
 *
 * @param {LbacItemRow} item - The LBAC item row.
 * @param {QuarterlyReportRow | undefined} report - The associated quarterly report.
 * @param {SupplementalEntry[]} supplementals - All relevant supplemental entries.
 * @param {ObrAipEntry[]} obrAmounts - All relevant OBR AIP amount entries.
 * @returns {LbacQuarterlyObject} The LBAC quarterly object.
 */
function _buildLbacQuarterlyObject(
  item: LbacItemRow,
  report: QuarterlyReportRow | undefined,
  supplementals: SupplementalEntry[],
  obrAmounts: ObrAipEntry[],
): LbacQuarterlyObject {
  const monthStart = _getCurrentMonthStartUtc8();

  const ps = casts.castFromDecimal(item.proposedBudgetPS);
  const mooe = casts.castFromDecimal(item.proposedBudgetMOOE);
  const fe = casts.castFromDecimal(item.proposedBudgetFE);
  const co = casts.castFromDecimal(item.proposedBudgetCO);
  const appropriationCurrent = ps.plus(mooe).plus(fe).plus(co);

  const contOrSupplemental = item.aipRefId
    ? _computeSupplementalAmount(supplementals, item.aipRefId)
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
  officeId: string;
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
  quarterlyReportId: string;
  parentId: string;
  officeId: string;
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
